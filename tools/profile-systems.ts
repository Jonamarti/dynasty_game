/** Profile the current all-detailed simulation by subsystem in a real browser.
 * Wrappers live only in the profiling page. Timings are observations, not gates.
 */
import { chromium, type Page } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = join(root, 'artifacts/verification', `m15-systems-${stamp}`);
mkdirSync(out, { recursive: true });
const steps = Number(process.env.PROFILE_STEPS ?? 480);
if (!Number.isInteger(steps) || steps < 240) throw new Error('PROFILE_STEPS must be an integer >= 240 to include the daily passes');

type Mode = 'unprofiled' | 'profiled';
const setup = async (page: Page, url: string, wanted: number, mode: Mode) => {
  // Let main's initial frame initialize the debug handle, then stop the loop.
  // Calling that frame asynchronously with near-zero delta starts at tick 0.
  await page.addInitScript(() => {
    let started = false;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      if (!started) {
        started = true;
        setTimeout(() => callback(performance.now()), 0);
      }
      return 0;
    }) as typeof requestAnimationFrame;
  });
  await page.goto(`${url}?seed=profile-4&defaults=1&skipIntro=1&profileHumans=${wanted}`);
  await page.waitForFunction(() => !!(window as any).__dynasty?.sim, undefined, { polling: 100 });
  return page.evaluate(async ({ wantedCount, runMode, stepCount }) => {
    const d = (window as any).__dynasty;
    const sim = d.sim;
    const live = (values: any[]) => values.filter((value: any) => value.alive);

    // Serialize mutable simulation state with stable object keys and explicit
    // cycle references. This is a no-op comparison between fresh, same-seed
    // worlds; it also captures all RNG streams without drawing from them.
    const encode = (value: any, seen = new WeakMap<object, string>(), path = '$'): any => {
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
      if (typeof value === 'undefined') return null;
      if (typeof value === 'function') return undefined;
      if (typeof value !== 'object') return String(value);
      const prior = seen.get(value);
      if (prior) return { $ref: prior };
      seen.set(value, path);
      if (ArrayBuffer.isView(value)) return Array.from(value as any);
      if (Array.isArray(value)) return value.map((entry, index) => encode(entry, seen, `${path}[${index}]`));
      if (value instanceof Map) return Array.from(value.entries(), ([key, entry], index) => [encode(key, seen, `${path}.k${index}`), encode(entry, seen, `${path}.v${index}`)]);
      if (value instanceof Set) return Array.from(value.values(), (entry, index) => encode(entry, seen, `${path}.s${index}`));
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(value).sort()) {
        const encoded = encode(value[key], seen, `${path}.${key}`);
        if (encoded !== undefined) result[key] = encoded;
      }
      return result;
    };
    const fingerprint = async () => {
      // Includes world arrays, stores, relationships, fields/traps, mutable
      // system state and every RNG (including the root stream). Functions are
      // omitted, so installing the profiling wrappers cannot affect the hash.
      const bytes = new TextEncoder().encode(JSON.stringify(encode(sim)));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    };
    const stateBefore = await fingerprint();
    const center = sim.player;
    const effectiveSight = center ? sim.sightOf(center) : 0;
    const rendererSight = sim.config.sightRadius;
    const distance = (person: any) => center ? Math.hypot(person.x - center.x, person.y - center.y) : Infinity;
    const initial = {
      humans: live(sim.people).length,
      animals: live(sim.animals).length,
      tick: sim.time.tick,
      ticksPerDay: sim.config.time.ticksPerDay,
      requestedSteps: stepCount,
      focusId: center?.id ?? null,
      focusBandId: center?.bandId ?? null,
      effectiveSightRadius: effectiveSight,
      rendererSightRadius: rendererSight,
      humansInEffectiveVision: live(sim.people).filter((person: any) => distance(person) <= effectiveSight).length,
      humansOutsideEffectiveVision: live(sim.people).filter((person: any) => distance(person) > effectiveSight).length,
      humansInRendererRadius: live(sim.people).filter((person: any) => distance(person) <= rendererSight).length,
      animalsInEffectiveVision: live(sim.animals).filter((animal: any) => center && Math.hypot(animal.x - center.x, animal.y - center.y) <= effectiveSight).length,
      animalsOutsideEffectiveVision: live(sim.animals).filter((animal: any) => !center || Math.hypot(animal.x - center.x, animal.y - center.y) > effectiveSight).length,
      totalHumans: live(sim.people).length,
      totalAnimals: live(sim.animals).length,
    };
    if (initial.humans !== wantedCount) throw new Error(`Founding families made ${initial.humans}, expected ${wantedCount}`);
    if (initial.tick !== 0) throw new Error(`Expected frozen presentation at initial tick 0, found ${initial.tick}`);
    const controlPerson = sim.player;
    const originalHunger = controlPerson.needs.hunger;
    controlPerson.needs.hunger = originalHunger + 0.000001;
    const changedStateDetected = (await fingerprint()) !== stateBefore;
    controlPerson.needs.hunger = originalHunger;
    const personRestoreMatches = (await fingerprint()) === stateBefore;
    const rootRng = sim.rng;
    const rootRngState = rootRng?.getState?.();
    if (rootRngState) rootRng.nextUint32();
    const rngDrawDetected = rootRngState ? (await fingerprint()) !== stateBefore : false;
    if (rootRngState) rootRng.setState(rootRngState);
    const rngRestoreMatches = (await fingerprint()) === stateBefore;
    if (!changedStateDetected || !personRestoreMatches || !rngDrawDetected || !rngRestoreMatches) {
      throw new Error('State fingerprint negative control failed');
    }
    (initial as any).fingerprintNegativeControl = {
      changedPersonHungerDetected: changedStateDetected, personRestorationExact: personRestoreMatches,
      rootRngDrawDetected: rngDrawDetected, rngRestorationExact: rngRestoreMatches,
    };

    const accum = new Map<string, { values: number[]; calls: number }>();
    const wrap = (owner: any, method: string, group: string, required = true) => {
      if (!owner || typeof owner[method] !== 'function') {
        if (required) throw new Error(`Required profile target is missing: ${group}`);
        return;
      }
      const original = owner[method];
      owner[method] = function(this: any, ...args: any[]) {
        const start = performance.now();
        const subject = (group === 'Brain.think' || group === 'Action.execute') ? args[0] : null;
        const focus = subject ? sim.player : null;
        const remote = subject && focus
          ? Math.hypot(subject.x - focus.x, subject.y - focus.y) > sim.sightOf(focus)
          : null;
        try { return original.apply(this, args); }
        finally {
          const elapsed = performance.now() - start;
          const entry = accum.get(group) ?? { values: [], calls: 0 };
          entry.values.push(elapsed);
          entry.calls++;
          accum.set(group, entry);
          if (remote !== null) {
            const label = `${group} ${remote ? 'outside' : 'within'} effective vision`;
            const bucket = accum.get(label) ?? { values: [], calls: 0 };
            bucket.values.push(elapsed);
            bucket.calls++;
            accum.set(label, bucket);
          }
        }
      };
    };
    if (runMode === 'profiled') {
      const prop = (name: string) => sim[name];
      wrap(sim, 'step', 'Simulation.step (inclusive total)');
      for (const [property, method, group] of [
        ['wildlifeSystem', 'update', 'Wildlife.update'], ['wildlifeSystem', 'daily', 'Wildlife.daily'],
        ['needsSystem', 'update', 'Needs.update'], ['forestSystem', 'daily', 'Forest.daily'],
        ['bandSystem', 'daily', 'Bands.daily'], ['knowledgeSystem', 'daily', 'Knowledge.daily'],
        ['lifeSystem', 'daily', 'Life.daily'], ['social', 'workingAlongside', 'Social.workingAlongside'],
        ['social', 'dailyUpkeep', 'Social.dailyUpkeep'], ['brain', 'think', 'Brain.think'],
        ['brain', 'score', 'Brain.score'], ['actionSystem', 'execute', 'Action.execute'],
      ]) wrap(prop(property), method, group);
      for (const method of ['edgeTraffic', 'shareTheHearth', 'refreshRecords', 'spoilFood', 'workTraps',
        'growCrops', 'workHeaps', 'workHerds', 'woundsOfTheDay', 'findBodies', 'rebuildHashes']) {
        wrap(sim, method, `Simulation.${method}`, false);
      }
      const movement = prop('movementSystem');
      const proto = movement && Object.getPrototypeOf(movement);
      if (proto) for (const method of Object.getOwnPropertyNames(proto)) {
        if (method !== 'constructor' && typeof movement[method] === 'function') wrap(movement, method, `Movement.${method}`, false);
      }
    }

    const wallStart = performance.now();
    for (let i = 0; i < stepCount; i++) sim.step();
    const elapsedMs = performance.now() - wallStart;
    const stateAfter = await fingerprint();
    const summary = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return { calls: values.length, totalMs: values.reduce((sum, value) => sum + value, 0),
        meanMs: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
        medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
        p95Ms: sorted[Math.floor(sorted.length * .95)] ?? 0,
        maxMs: sorted.at(-1) ?? 0 };
    };
    const timings = Object.fromEntries(Array.from(accum.entries()).map(([key, value]) => [key, summary(value.values)]));
    return {
      mode: runMode, requestedHumans: wantedCount, initial, endingTick: sim.time.tick,
      completedSteps: sim.time.tick - initial.tick, elapsedMs,
      meanStepMs: elapsedMs / stepCount,
      callsPerTick: timings['Action.execute']?.calls ? timings['Action.execute'].calls / stepCount : null,
      timings, stateBefore, stateAfter,
    };
  }, { wantedCount: wanted, runMode: mode, stepCount: steps });
};

const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const reports: any[] = [];
try {
  for (const humans of [30, 300]) {
    for (const mode of ['unprofiled', 'profiled'] as const) {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const report = await setup(page, server.resolvedUrls!.local[0]!, humans, mode);
        const full = { ...report, browser: browser.version(), seed: 'profile-4', errors,
          measurement: 'Fixed synchronous Simulation.step() calls with requestAnimationFrame disabled. No headless-renderer timing is included. System wrapper durations are inclusive and overlap; do not sum them.' };
        reports.push(full);
        writeFileSync(join(out, `${humans}-${mode}.json`), JSON.stringify(full, null, 2));
        // Hash/state comparisons between same-population runs are included
        // below in the bundle report rather than used as a performance gate.
        console.log(JSON.stringify({ ...full, stateBefore: undefined, stateAfter: undefined }, null, 2));
      } finally { await browser.close(); }
    }
  }
  const comparisons = [30, 300].map(humans => {
    const baseline = reports.find(r => r.requestedHumans === humans && r.mode === 'unprofiled');
    const profiled = reports.find(r => r.requestedHumans === humans && r.mode === 'profiled');
    return { humans, sameStartingState: baseline?.stateBefore === profiled?.stateBefore,
      sameEndingState: baseline?.stateAfter === profiled?.stateAfter,
      baselineTick: baseline?.endingTick, profiledTick: profiled?.endingTick };
  });
  if (comparisons.some(c => !c.sameStartingState || !c.sameEndingState)) {
    throw new Error(`Profiled/unprofiled state equivalence failed: ${JSON.stringify(comparisons)}`);
  }
  const bundle = { timestamp: new Date().toISOString(), steps, seed: 'profile-4', reports, comparisons,
    note: 'Current fully detailed loop only. Founders are generated around one camp; no spatial redistribution, LOD activation, or simulated compact records. Timings depend on host and browser. Method timings include nested work and overlap.' };
  writeFileSync(join(out, 'report.json'), JSON.stringify(bundle, null, 2));
  console.log(`Reports: ${out}`);
  console.log(JSON.stringify({ comparisons }, null, 2));
} finally { await server.close(); }
