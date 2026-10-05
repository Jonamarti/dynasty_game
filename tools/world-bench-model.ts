import { RNG } from '../src/sim/core/RNG.ts';
import { DEFAULT_CONFIG } from '../src/sim/core/Config.ts';
import { TECH, TECHS } from '../src/sim/knowledge/Tech.ts';
import { RealWorldMap } from '../src/sim/world/RealWorldMap.ts';
import type { WorldRaster } from '../src/sim/world/WorldBinary.ts';

/**
 * Benchmark-only record shape for the not-yet-implemented level-two world.
 * These records are a workload fixture, not PeopleSim or a game save format.
 */
export interface BenchPeople {
  id: number;
  regionId: number;
  rngState: [number, number, number, number];
  climateClass: number;
  population: number;
  occupiedComarcas: number;
  subsistence: [number, number, number, number];
  techWords: number[];
  culture: [number, number, number, number];
  organization: number;
  neighbors: number[];
  relations: number[];
  tradeRoutes: number[];
  warFatigue: number;
  surplus: number;
  store: number;
}

export interface BenchWorld {
  seed: string;
  mapWidth: number;
  mapHeight: number;
  people: BenchPeople[];
  seasons: number;
  eligibleRegions: number;
  candidateChecks: number;
  neighborChecks: number;
  tradeChecks: number;
  conflictChecks: number;
  checksum?: number;
}

export const BENCH_DEFAULTS = {
  years: 200,
  minimumPeoplePerRegion: 1,
  maximumPeoplePerRegion: 4,
  // The phase-29 baseline was measured in `sim:check`'s band scenario.
  perfBudgetPeakPeople: 31,
} as const;

const WORDS = Math.ceil(TECHS.length / 32);
const STARTING_TECHS = ['firemaking', 'cordage', 'plant_lore', 'tracking'] as const;

/** Only classified non-polar land is included; this is a stable workload proxy. */
export function isBenchHabitableLand(land: boolean, climateClass: number): boolean {
  return land && climateClass >= 1 && climateClass <= 28;
}

export function createBenchWorld(
  raster: WorldRaster,
  seed = 'm15-world-bench',
  minimumPeoplePerRegion = BENCH_DEFAULTS.minimumPeoplePerRegion,
  maximumPeoplePerRegion = BENCH_DEFAULTS.maximumPeoplePerRegion,
): BenchWorld {
  if (!Number.isInteger(minimumPeoplePerRegion) || minimumPeoplePerRegion < 1 ||
      !Number.isInteger(maximumPeoplePerRegion) || maximumPeoplePerRegion < minimumPeoplePerRegion) {
    throw new RangeError('People per region must be positive ordered integers');
  }
  const map = new RealWorldMap(raster);
  const eligible = map.regions.filter(region => isBenchHabitableLand(region.land, region.climateClass));
  if (eligible.length === 0) throw new RangeError('Earth benchmark has no classified non-polar land regions');
  const people: BenchPeople[] = [];
  const idsByRegion = new Map<number, number[]>();

  for (const region of eligible) {
    const rng = new RNG(`${seed}:region:${region.id}`);
    const count = rng.int(minimumPeoplePerRegion, maximumPeoplePerRegion);
    const inRegion: number[] = [];
    for (let i = 0; i < count; i++) {
      const id = people.length;
      const techWords = Array<number>(WORDS).fill(0);
      for (const tech of STARTING_TECHS) setTech(techWords, tech);
      people.push({
        id,
        regionId: region.id,
        rngState: rng.getState(),
        climateClass: region.climateClass,
        population: rng.int(700, 2_100),
        occupiedComarcas: rng.int(1, 4),
        subsistence: normalizeFour(rng.next(), rng.next(), rng.next(), rng.next()),
        techWords,
        culture: [rng.next(), rng.next(), rng.next(), rng.next()],
        organization: rng.int(0, 2),
        neighbors: [],
        relations: [],
        tradeRoutes: [],
        warFatigue: 0,
        surplus: rng.int(0, 500),
        store: rng.int(100, 2_000),
      });
      inRegion.push(id);
    }
    idsByRegion.set(region.id, inRegion);
  }

  const width = map.regionsWide;
  const height = map.regionsHigh;
  for (const person of people) {
    const regionX = person.regionId % width;
    const regionY = Math.floor(person.regionId / width);
    const adjacentRegionIds = [
      [regionX - 1, regionY], [regionX + 1, regionY],
      [regionX, regionY - 1], [regionX, regionY + 1],
    ].flatMap(([x, y]) => {
      if (y! < 0 || y! >= height) return [];
      return [y! * width + ((x! + width) % width)];
    });
    const candidateIds = [
      ...(idsByRegion.get(person.regionId) ?? []).filter(id => id !== person.id),
      ...adjacentRegionIds.flatMap(id => idsByRegion.get(id) ?? []),
    ];
    person.neighbors = [...new Set(candidateIds)].slice(0, 6);
    person.relations = person.neighbors.map(id => {
      const rng = new RNG(`${seed}:relation:${Math.min(person.id, id)}:${Math.max(person.id, id)}`);
      return rng.next() * 2 - 1;
    });
    person.tradeRoutes = person.neighbors.filter((_, index) => index % 2 === 0).slice(0, 3);
  }

  return {
    seed,
    mapWidth: width,
    mapHeight: height,
    people,
    seasons: 0,
    eligibleRegions: eligible.length,
    candidateChecks: 0,
    neighborChecks: 0,
    tradeChecks: 0,
    conflictChecks: 0,
  };
}

/**
 * Run one seasonal shape pass. Numerical updates are deliberately inert
 * placeholders: this exercises record reads, requirement scans and relation
 * loops without claiming calibrated demography, invention or LOD behavior.
 */
export function advanceBenchSeason(world: BenchWorld): void {
  let candidateChecks = 0;
  let neighborChecks = 0;
  let tradeChecks = 0;
  let conflictChecks = 0;
  let checksum = 0;

  for (const person of world.people) {
    // Keep one deterministic stream per record, as the level-two design
    // requires. The draw is only workload; it does not award an event.
    const rng = RNG.fromSnapshot({ version: 1, words: person.rngState });
    checksum += rng.next();
    person.rngState = rng.getState();

    // Phase 32c's population/capacity operation shape. The bounded result is
    // consumed by a checksum; it is not applied as a population rule.
    const proxyCapacity = person.occupiedComarcas * (500 + person.climateClass * 31);
    checksum += Math.min(person.population, proxyCapacity) * (person.subsistence[0] + person.subsistence[1]);

    // Scan the real technology requirement lists, but do not invent or claim
    // that this fixture models regional resources or conception probabilities.
    for (const tech of TECHS) {
      let eligible = true;
      for (const required of TECH[tech].requires) {
        candidateChecks++;
        if (!hasTech(person.techWords, required)) eligible = false;
      }
      if (eligible) checksum += TECH[tech].difficulty;
    }

    for (let i = 0; i < person.neighbors.length; i++) {
      const neighborId = person.neighbors[i]!;
      const neighbor = world.people[neighborId];
      if (!neighbor) continue;
      neighborChecks++;
      const relation = person.relations[i] ?? 0;
      checksum += relation * (person.culture[0] - neighbor.culture[0]);
      conflictChecks++;
      checksum += Math.max(0, -relation) * person.warFatigue;
    }
    for (const routeId of person.tradeRoutes) {
      const route = world.people[routeId];
      if (!route) continue;
      tradeChecks++;
      checksum += Math.min(person.surplus, route.store) * 0.001;
    }
  }

  // Keep the work observable so an optimizing runtime cannot discard the pass.
  world.seasons++;
  world.candidateChecks += candidateChecks;
  world.neighborChecks += neighborChecks;
  world.tradeChecks += tradeChecks;
  world.conflictChecks += conflictChecks;
  world.checksum = checksum;
}

export function runBenchYears(world: BenchWorld, years: number): void {
  if (!Number.isInteger(years) || years < 1) throw new RangeError('Years must be a positive integer');
  for (let i = 0; i < years * 4; i++) advanceBenchSeason(world);
}

export function benchTicksPerYear(): number {
  return DEFAULT_CONFIG.time.ticksPerDay * DEFAULT_CONFIG.time.daysPerSeason * 4;
}

export function perfBudgetStepMicroseconds(peakPeople: number = BENCH_DEFAULTS.perfBudgetPeakPeople): number {
  if (!Number.isFinite(peakPeople) || peakPeople < 0) throw new RangeError('Peak people must be nonnegative');
  return 100 + 16 * peakPeople;
}

export function toByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function benchSummary(world: BenchWorld) {
  return {
    seed: world.seed,
    years: world.seasons / 4,
    seasonalUpdates: world.seasons,
    eligibleRegions: world.eligibleRegions,
    peoples: world.people.length,
    population: world.people.reduce((sum, person) => sum + person.population, 0),
    candidateChecks: world.candidateChecks,
    neighborChecks: world.neighborChecks,
    tradeChecks: world.tradeChecks,
    conflictChecks: world.conflictChecks,
    checksum: world.checksum ?? 0,
  };
}

function normalizeFour(a: number, b: number, c: number, d: number): [number, number, number, number] {
  const sum = a + b + c + d || 1;
  return [a / sum, b / sum, c / sum, d / sum];
}

function techIndex(tech: string): number { return TECHS.indexOf(tech as (typeof TECHS)[number]); }
function setTech(words: number[], tech: string): void {
  const index = techIndex(tech);
  if (index >= 0) words[index >>> 5] = (words[index >>> 5]! | (1 << (index & 31))) >>> 0;
}
function hasTech(words: readonly number[], tech: string): boolean {
  const index = techIndex(tech);
  return index >= 0 && ((words[index >>> 5]! >>> (index & 31)) & 1) !== 0;
}
