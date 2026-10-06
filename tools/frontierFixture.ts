/** A synthetic continental slope tests local water semantics, not Earth accuracy. */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { IdSpace } from '../src/sim/core/IdSpace.ts';
import type { DeepPartial, SimConfig } from '../src/sim/core/Config.ts';
import { earthWorldGeography } from '../src/sim/world/WorldGeography.ts';
import { WORLD_FEATURE } from '../src/sim/world/WorldFeatureSeeds.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';

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
