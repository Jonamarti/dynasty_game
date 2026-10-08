/**
 * Where does a `Simulation.step()` spend its time, by block (M15 step 0, A).
 *
 * `profile:systems` wraps methods in a browser and, at 300 people, could name
 * only about half of the step. This tool runs the same world (`profile-4`, one
 * band of N founders, default difficulty) straight in Node and reads the
 * stopwatch marks `Simulation.step()` makes between its blocks (`StepProbe.ts`),
 * so every nanosecond of a step lands in a named block.
 *
 * Each population is run twice from a fresh world: a control with no hook, and
 * a marked run. Their SHA-256 hashes of the whole simulation (every field, every
 * RNG) must be equal, or the tool exits with an error: an instrument that
 * changed the answer measured a different game. A negative control (nudge one
 * hunger, expect a different hash) proves the hash can fail.
 *
 *   npm run profile:step -- --humans=30,300 --steps=480
 *   npm run profile:step -- --humans=300 --hash=false   (faster, no equality check)
 *
 * `--json=<path>` also writes the numbers. Timings are observations of this
 * host, never pass/fail gates.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { WorldState } from '../src/sim/world/WorldState.ts';
import { configFor } from '../src/sim/core/Difficulty.ts';
import { setStepMark } from '../src/sim/core/StepProbe.ts';
import type { Simulation } from '../src/sim/core/Simulation.ts';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  if (eq < 0) args.set(a.slice(2), 'true'); else args.set(a.slice(2, eq), a.slice(eq + 1));
}
const humansList = (args.get('humans') ?? '30,300').split(',').map(Number);
const steps = Number(args.get('steps') ?? 480);
const wantHash = args.get('hash') !== 'false';
const seed = args.get('seed') ?? 'profile-4';
const jsonOut = args.get('json');
/** `--reps=N`: repeat the unmarked control N times and report the minimum and median (the host is noisy; a single run is not a measurement). */
const reps = Math.max(1, Number(args.get('reps') ?? 1));
/** Extra config applied on top (JSON), so a variant can be measured without a code edit. */
/** `--methods=brain,social`: also wrap every method of those `Simulation` members (inclusive times, calls). */
const methodOwners = (args.get('methods') ?? '').split(',').filter(Boolean);
const extra = args.get('config') ? JSON.parse(args.get('config')!) : {};

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
// Hash in slices of the top-level fields so no single string nears Node's limit.
const fingerprint = (sim: Simulation): string => {
  const hash = createHash('sha256');
  const seen = new WeakMap<object, string>();
  const top = sim as any;
  for (const key of Object.keys(top).sort()) {
    const encoded = encode(top[key], seen, `$.${key}`);
    if (encoded !== undefined) hash.update(key + '=' + JSON.stringify(encoded) + ';');
  }
  return hash.digest('hex');
};

function make(humans: number): Simulation {
  const config = { ...configFor('normal', {}), population: { bands: 1, peoplePerBand: humans }, seed, ...extra };
  const world = new WorldState(config as any);
  const sim = world.current;
  sim.possessFirst();
  return sim;
}

interface Row { label: string; totalMs: number; calls: number }

function run(humans: number, marked: boolean) {
  const sim = make(humans);
  const before = wantHash ? fingerprint(sim) : '';
  const totals = new Map<string, Row>();
  let last = 0;
  if (marked) {
    setStepMark(label => {
      const now = performance.now();
      const row = totals.get(label) ?? { label, totalMs: 0, calls: 0 };
      row.totalMs += now - last; row.calls++;
      totals.set(label, row);
      last = performance.now();
    });
  }
  const methodRows = new Map<string, Row>();
  if (marked) {
    for (const owner of methodOwners) {
      const target = (sim as any)[owner];
      const proto = Object.getPrototypeOf(target);
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor' || typeof target[name] !== 'function') continue;
        const original = target[name];
        const label = `${owner}.${name}`;
        target[name] = function(this: any, ...a: any[]) {
          const s0 = performance.now();
          try { return original.apply(this, a); } finally {
            const row = methodRows.get(label) ?? { label, totalMs: 0, calls: 0 };
            row.totalMs += performance.now() - s0; row.calls++;
            methodRows.set(label, row);
          }
        };
      }
    }
  }
  const stepMs: number[] = [];
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) {
    const s = performance.now();
    last = s;
    sim.step();
    stepMs.push(performance.now() - s);
  }
  const elapsed = performance.now() - t0;
  setStepMark(null);
  const after = wantHash ? fingerprint(sim) : '';
  const living = sim.people.filter(p => p.alive).length;
  return { humans, marked, meanStepMs: elapsed / steps, before, after, rows: [...totals.values()], methodRows: [...methodRows.values()], living, tick: sim.time.tick, stepMs, sim };
}

const out: any[] = [];
for (const humans of humansList) {
  // Warm the JIT on a throwaway world so the first population is not penalised.
  if (humans === humansList[0]) run(Math.min(humans, 30), false);
  const controls = Array.from({ length: reps }, () => run(humans, false));
  const control = controls[0]!;
  const sortedMs = controls.map(c => c.meanStepMs).sort((a, b) => a - b);
  const marked = run(humans, true);
  let negative = 'skipped';
  if (wantHash) {
    const probe = make(humans);
    const h0 = fingerprint(probe);
    probe.player!.needs.hunger += 0.000001;
    negative = fingerprint(probe) !== h0 ? 'detected' : 'FAILED';
    if (negative !== 'detected') throw new Error('hash negative control failed');
    if (control.before !== marked.before || control.after !== marked.after) {
      throw new Error(`marked run changed the state at ${humans} humans: ${control.after} vs ${marked.after}`);
    }
  }
  const totalMarked = marked.rows.reduce((s, r) => s + r.totalMs, 0);
  console.log(`\n=== ${humans} humans, ${steps} steps (living at end: ${control.living}; tick ${control.tick}) ===`);
  console.log(`control min ${sortedMs[0]!.toFixed(3)} median ${sortedMs[Math.floor(sortedMs.length / 2)]!.toFixed(3)} ms/step (${reps} runs)   marked ${marked.meanStepMs.toFixed(3)} ms/step   ` +
    `hash equal: ${wantHash ? 'yes' : 'not checked'}   negative control: ${negative}`);
  console.log(`state hash ${control.after.slice(0, 16)}`);
  console.log('block'.padEnd(40) + 'ms/step'.padStart(10) + '% of step'.padStart(11));
  for (const row of marked.rows.sort((a, b) => b.totalMs - a.totalMs)) {
    console.log(row.label.padEnd(40) + (row.totalMs / steps).toFixed(3).padStart(10) +
      (100 * row.totalMs / totalMarked).toFixed(1).padStart(11));
  }
  if (methodOwners.length) {
    console.log('\nmethod (inclusive; nested calls overlap, do not sum)'.padEnd(40) + 'ms/step'.padStart(10) + 'calls/step'.padStart(12));
    for (const row of marked.methodRows.sort((a, b) => b.totalMs - a.totalMs).slice(0, 40)) {
      console.log(row.label.padEnd(40) + (row.totalMs / steps).toFixed(3).padStart(10) + (row.calls / steps).toFixed(1).padStart(12));
    }
  }
  out.push({ humans, steps, control: sortedMs[0], controlMedian: sortedMs[Math.floor(sortedMs.length / 2)], marked: marked.meanStepMs, hash: control.after,
    rows: marked.rows.map(r => ({ ...r, msPerStep: r.totalMs / steps })) });
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 2));
