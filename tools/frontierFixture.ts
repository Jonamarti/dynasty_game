/** A synthetic continental slope tests local water semantics, not Earth accuracy. */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { IdSpace } from '../src/sim/core/IdSpace.ts';
import type { DeepPartial, SimConfig } from '../src/sim/core/Config.ts';
import { earthWorldGeography } from '../src/sim/world/WorldGeography.ts';
import { WORLD_FEATURE } from '../src/sim/world/WorldFeatureSeeds.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { hydrationOf } from '../src/sim/core/Macros.ts';

export function frontierGeography() {
  const heights = [100, 85, 70, 55, 40, 25, -10, -20];
  return earthWorldGeography({
    entry: { id: 'frontier-fixture', title: 'Frontier fixture', file: 'fixture.bin',
      seaLevelMeters: 0, recommended: false },
    raster: { width: 8, height: 4, seaLevelMeters: 0,
      elevationMeters: Int16Array.from({ length: 32 }, (_, i) => heights[i % 8]!),
      koppen: Uint8Array.from({ length: 32 }, () => 8),
      features: Uint32Array.from({ length: 32 }, (_, i) => i % 8 < 6 ? WORLD_FEATURE.river : 0) },
  }, 10);
}

export function createFrontier(config: DeepPartial<SimConfig>): Simulation {
  return new Simulation(config, new IdSpace(), { geography: frontierGeography(),
    x: 40, y: 20, comarcasWide: 60, comarcasHigh: 20 });
}

/**
 * A separate, naturally populated continental cohort. Unlike `frontier`, it
 * gives nobody a thirst value, location, order, or completed route: those are
 * all the ordinary spawner and AI. It shares the same measured geography so
 * the short fixture remains available for deterministic mechanism failures.
 */
export function createFrontierCohort(config: DeepPartial<SimConfig>): Simulation {
  return createFrontier(config);
}

interface CohortWalker {
  fromComponent: number | null;
  last: { x: number; y: number };
}
const cohortWalkers = new WeakMap<Simulation, Map<number, CohortWalker>>();
const eatenHydrating = new WeakMap<Simulation, Map<number, Map<string, number>>>();
const cohortFishAmounts = new WeakMap<Simulation, Map<number, number>>();
const saltSeenByCohort = new WeakMap<Simulation, Set<number>>();
const dryComponents = new WeakMap<Simulation, { earthVersion: number; labels: Int32Array }>();

/** Dry-passable components with river and other water treated as barriers. */
function dryComponentLabels(sim: Simulation): Int32Array {
  const cached = dryComponents.get(sim);
  if (cached?.earthVersion === sim.world.earthVersion) return cached.labels;
  const world = sim.world;
  const labels = new Int32Array(world.width * world.height).fill(-1);
  let next = 0;
  const queue: number[] = [];
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
    const start = world.index(x, y);
    if (labels[start] !== -1 || !world.isWalkable(x, y) || world.isWater(x, y) ||
        world.biomeAt(x, y) === 'river') continue;
    labels[start] = next;
    queue.push(start);
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head]!;
      const ax = at % world.width, ay = Math.floor(at / world.width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const bx = ax + dx, by = ay + dy;
        if (!world.inBounds(bx, by) || !world.isWalkable(bx, by) || world.isWater(bx, by) ||
            world.biomeAt(bx, by) === 'river') continue;
        const bi = world.index(bx, by);
        if (labels[bi] !== -1) continue;
        labels[bi] = next;
        queue.push(bi);
      }
    }
    queue.length = 0;
    next++;
  }
  dryComponents.set(sim, { earthVersion: world.earthVersion, labels });
  return labels;
}

/** Read-only per-tick census; it never changes an AI input or consumes RNG. */
export function observeFrontierCohort(sim: Simulation): void {
  let walkers = cohortWalkers.get(sim);
  if (!walkers) { walkers = new Map(); cohortWalkers.set(sim, walkers); }
  let eaten = eatenHydrating.get(sim);
  if (!eaten) { eaten = new Map(); eatenHydrating.set(sim, eaten); }
  let fishAmounts = cohortFishAmounts.get(sim);
  if (!fishAmounts) { fishAmounts = new Map(); cohortFishAmounts.set(sim, fishAmounts); }
  let saltSeen = saltSeenByCohort.get(sim);
  if (!saltSeen) { saltSeen = new Set(); saltSeenByCohort.set(sim, saltSeen); }
  const w = sim.world;
  const components = dryComponentLabels(sim);
  for (const fish of sim.nodes) {
    if (fish.kind !== 'fish') continue;
    const before = fishAmounts.get(fish.id);
    if (before !== undefined && fish.amount < before && w.isFreshWater(fish.x, fish.y)) {
      telemetry.count('frontier_cohort_fresh_fish_taken', before - fish.amount);
    }
    fishAmounts.set(fish.id, fish.amount);
  }
  for (const person of sim.livingPeople()) {
    const x = person.x | 0, y = person.y | 0;
    const river = w.biomeAt(x, y) === 'river' && w.isWadeTile(x, y);
    let track = walkers.get(person.id);
    if (!track) { track = { fromComponent: null, last: { x: person.x, y: person.y } }; walkers.set(person.id, track); }
    if (river) {
      telemetry.count('frontier_cohort_wading_steps');
      if (track.fromComponent === null) {
        track.fromComponent = components[w.index(track.last.x | 0, track.last.y | 0)] ?? -1;
      }
    } else if (track.fromComponent !== null) {
      const endComponent = w.isWater(x, y) ? -1 : components[w.index(x, y)] ?? -1;
      // Distance cannot distinguish a ford from walking along the bank and
      // turning back. Count only when dry movement on opposite components is
      // separated by the observed wadeable river crossing.
      if (track.fromComponent >= 0 && endComponent >= 0 && track.fromComponent !== endComponent) {
        telemetry.count('frontier_cohort_bank_to_bank');
      }
      track.fromComponent = null;
    }
    track.last = { x: person.x, y: person.y };

    // Brain's visible-target rule is distance plus a route in the same land
    // region. Count each NPC once only when it really had that salt candidate.
    if (!person.isPlayer && !saltSeen.has(person.id) &&
        sim.saltShoreHash.findNearest(person.x, person.y, sim.config.sightRadius,
          shore => w.sameRegion(person.x, person.y, shore.x, shore.y))) {
      saltSeen.add(person.id);
      telemetry.count('frontier_cohort_salt_visible_people');
    }

    let priorFoods = eaten.get(person.id);
    if (!priorFoods) { priorFoods = new Map(); eaten.set(person.id, priorFoods); }
    for (const [itemId, total] of person.eatenToday) {
      if (hydrationOf(itemId, true) <= 0) continue;
      const before = priorFoods.get(itemId) ?? 0;
      const consumed = total >= before ? total - before : total;
      if (consumed > 0) telemetry.count('frontier_cohort_hydrating_food_units', consumed);
      priorFoods.set(itemId, total);
    }
    // Today’s ledger is cleared at the daily boundary. Forget missing keys so
    // the next day’s count starts from zero, including when nobody ate fruit.
    for (const itemId of priorFoods.keys()) {
      if (!person.eatenToday.has(itemId)) priorFoods.set(itemId, 0);
    }
  }
}

interface Crossing {
  personId: number;
  destination: { x: number; y: number };
  entered: boolean;
  finished: boolean;
}
const crossings = new WeakMap<Simulation, Crossing>();

export function setupFrontier(sim: Simulation): void {
  const w = sim.world;
  const adults = sim.livingPeople().filter(p => !p.isChild);
  const traveller = adults[0];
  const thirsty = adults[1];
  if (!traveller || !thirsty || !w.freshShore.length || !w.saltShore.length) {
    throw new Error('frontier needs adults and both freshwater and saltwater shores');
  }
  // Search terrain, never an entity array: a straight ford with dry ground on
  // both banks is an unambiguous observed crossing, unlike a route along a bank.
  let ford: { from: { x: number; y: number }; to: { x: number; y: number } } | null = null;
  outer: for (let y = 2; y < w.height - 2; y++) for (let x = 2; x < w.width - 2; x++) {
    if (w.biomeAt(x, y) !== 'river' || !w.isWadeTile(x, y)) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      let a = 1; let b = 1;
      while (a <= 4 && w.biomeAt(x - a * dx, y - a * dy) === 'river') a++;
      while (b <= 4 && w.biomeAt(x + b * dx, y + b * dy) === 'river') b++;
      if (a > 4 || b > 4) continue;
      const from = { x: x - a * dx + 0.5, y: y - a * dy + 0.5 };
      const to = { x: x + b * dx + 0.5, y: y + b * dy + 0.5 };
      if (w.isWater(from.x, from.y) || w.isWater(to.x, to.y) ||
          !w.isWalkable(from.x, from.y) || !w.isWalkable(to.x, to.y)) continue;
      let shallow = true;
      for (let k = -a + 1; k < b; k++) if (!w.isWadeTile(x + k * dx, y + k * dy)) shallow = false;
      if (shallow) { ford = { from, to }; break outer; }
    }
  }
  if (!ford) throw new Error('frontier needs a generated ford between dry banks');
  for (const person of sim.people) {
    person.needs.hunger = 0; person.needs.thirst = 0; person.needs.fatigue = 0;
    person.needs.cold = 0; person.needs.company = 0;
    if (person !== thirsty && person !== traveller) sim.order(person, 'rest');
  }
  traveller.x = ford.from.x; traveller.y = ford.from.y;
  if (!sim.order(traveller, 'walk', ford.to)) throw new Error('frontier cannot order a ford crossing');
  crossings.set(sim, { personId: traveller.id, destination: ford.to, entered: false, finished: false });
  // The salt coast is a real, nearer opportunity. Freshwater is within sight:
  // turning thirst into an autonomous choice must reject the nearby sea.
  const freshBanks = w.freshShore;
  const salt = w.saltShore.find(t => !w.isFreshShore(t.x, t.y) &&
    freshBanks.every(f => Math.hypot(f.x - t.x, f.y - t.y) >= 5) && freshBanks.some(f =>
    Math.hypot(f.x - t.x, f.y - t.y) < sim.config.sightRadius - 1 &&
    w.sameRegion(t.x, t.y, f.x, f.y)));
  if (!salt) throw new Error('frontier needs freshwater within sight of the salt coast');
  thirsty.isPlayer = false;
  thirsty.x = salt.x + 0.5; thirsty.y = salt.y + 0.5;
  thirsty.forgetPlans(); thirsty.needs.thirst = 80;
  telemetry.count('frontier_salt_opportunity');
  sim.peopleHash.rebuild(sim.livingPeople());
}

export function observeFrontier(sim: Simulation): void {
  const crossing = crossings.get(sim);
  if (!crossing || crossing.finished) return;
  const person = sim.peopleById.get(crossing.personId);
  if (!person?.alive) return;
  if (sim.world.biomeAt(person.x | 0, person.y | 0) === 'river' && sim.world.isWadeTile(person.x, person.y)) {
    crossing.entered = true;
  }
  if (crossing.entered && person.distanceTo(crossing.destination) < 0.65) {
    crossing.finished = true;
    telemetry.count('frontier_ford_crossed');
  }
}
