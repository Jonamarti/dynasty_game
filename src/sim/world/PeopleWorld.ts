import { RNG } from '../core/RNG.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { TECHS, type Tech } from '../knowledge/Tech.ts';
import { RealWorldMap } from './RealWorldMap.ts';
import { WORLD_FEATURE } from './WorldFeatureSeeds.ts';
import type { WorldRaster } from './WorldBinary.ts';
import type { WorldBiome } from './WorldMap.ts';
import type { WorldGeography } from './WorldGeography.ts';
import {
  PeopleSim, closeUnderRequires, emptyCohorts, organisationOf, populationOf, AGE_BANDS,
  type People, type PeopleCohorts, type PeopleCulture, type PeopleSimRecord, type SeasonMechanism,
} from './PeopleSim.ts';
import { demography } from './PeopleDemography.ts';
import { measuredRegion, type PeopleRegion } from './PeopleCapacity.ts';
import {
  KnowledgeLedger, LEARN_MU_START, PARTIAL_START, knowledge, regionMaterials,
  type KnowledgeEvent, type KnowledgeLedgerRecord, type KnowledgeRegion, type PeopleClimate,
} from './PeopleKnowledge.ts';
import { storing, trading } from './PeopleEconomy.ts';
import { warring } from './PeopleWar.ts';
import { splitting, type SplitReport } from './PeopleSplit.ts';
import { uniting } from './PeopleUnion.ts';
import { DEFAULT_NORMS, VARIABLE_NORMS, type Norms } from '../social/Events.ts';
import { STRANGER_REGARD_MEAN, STRANGER_REGARD_SPREAD } from '../social/Restraint.ts';

/**
 * The world of peoples: the abstract level-2 population of every habitable region of a world map (M15 phase 32c made the model,
 * phase 33a seeds it in the game). One module serves both callers: the tools (`tools/people-world-model.ts`, the cohort gates and
 * the bench, which seed the real Earth) and `WorldState` (the browser game, which seeds whatever geography the game started on).
 *
 * Everything that is a geographic proxy or a starting value is a **declared assumption**, written down here and in
 * docs/m15_phase32c_peoples.md and m15_phase33_world.md, because nothing measured it:
 *
 * - the Koeppen class of a region (Beck et al., the raster's numbering 1-30) or the biome of a generated map is turned into a
 *   climate (two unit axes) and a productivity factor on what a comarca feeds, the `craft` measured region being the base;
 * - a region lacks `grain` unless the map marks a wild cereal in it, and lacks `flint` unless the map marks flint
 *   (the same two gates `geographicResourceAvailable` applies to the detailed game);
 * - every people starts with the same four techniques (`STARTING_TECHS`).
 * Nobody is handed a technique by region, name or date.
 *
 * **Streams.** Seeding draws from `${seed}:people-world` (how many peoples, how big, how many comarcas) and, in the game, from
 * `${seed}:people-cultures` (each people's norms and regard for strangers). Neither is a fork of `Simulation.rng` and neither
 * touches `spawnRng`, so a world with peoples and one without put every band, tree and herd of the detailed comarca in the
 * same place. The two streams are separate so that adding culture cannot move who is founded where.
 */

export const STARTING_TECHS: readonly Tech[] = ['firemaking', 'cordage', 'plant_lore', 'tracking'];
export const PEOPLES_PER_REGION = [1, 2] as const;
export const FOUNDERS = [24, 48] as const;
/** Contact between two peoples of one region, and of two adjacent regions. Design assumptions ("what if"; nothing measured). */
export const CONTACT_SAME_REGION = 0.5;
export const CONTACT_ADJACENT = 0.2;
/** Free comarcas a region can give to daughters, besides what its peoples already hold. Design assumption. */
export const REGION_GROUND = 10;

/** The game's own clock (`DEFAULT_CONFIG`), so a step here is a step of `Simulation` and the bench costs are per real tick. */
const CLOCK = { ticksPerDay: DEFAULT_CONFIG.time.ticksPerDay, daysPerSeason: DEFAULT_CONFIG.time.daysPerSeason };
export const WORLD_CLOCK = CLOCK;
export const STEPS_PER_SEASON = CLOCK.ticksPerDay * CLOCK.daysPerSeason;

const WILD_CEREALS = WORLD_FEATURE.wildWheat | WORLD_FEATURE.wildBarley | WORLD_FEATURE.wildRice | WORLD_FEATURE.wildMillet | WORLD_FEATURE.wildMaize | WORLD_FEATURE.wildSorghum;

/** Beck et al. classes 1-30: temperature, wetness (0-1) and productivity of a comarca. Design assumptions. */
const KOPPEN: Readonly<Record<number, readonly [number, number, number]>> = {
  1: [1.0, 1.0, 1.3], 2: [1.0, 0.85, 1.3], 3: [1.0, 0.6, 1.2],
  4: [0.85, 0.05, 0.3], 5: [0.5, 0.05, 0.3], 6: [0.8, 0.25, 0.55], 7: [0.5, 0.25, 0.55],
  8: [0.75, 0.35, 0.9], 9: [0.6, 0.35, 0.9], 10: [0.45, 0.35, 0.8],
  11: [0.75, 0.55, 1.0], 12: [0.6, 0.55, 1.0], 13: [0.45, 0.55, 0.9],
  14: [0.75, 0.7, 1.1], 15: [0.6, 0.7, 1.1], 16: [0.45, 0.7, 1.0],
  17: [0.5, 0.35, 0.7], 18: [0.35, 0.35, 0.7], 19: [0.2, 0.35, 0.5], 20: [0.1, 0.35, 0.4],
  21: [0.5, 0.5, 0.7], 22: [0.35, 0.5, 0.7], 23: [0.2, 0.5, 0.5], 24: [0.1, 0.5, 0.4],
  25: [0.5, 0.65, 0.8], 26: [0.35, 0.65, 0.7], 27: [0.2, 0.65, 0.5], 28: [0.1, 0.65, 0.4],
};
export const isWorldHabitable = (land: boolean, climateClass: number): boolean => land && climateClass in KOPPEN;

/** Productivity of a generated map's biome, on the same scale as `KOPPEN`'s third column. Design assumptions. */
const BIOME_PRODUCTIVITY: Readonly<Partial<Record<WorldBiome, number>>> = {
  tundra: 0.4, boreal_forest: 0.7, temperate_forest: 1.1, grassland: 1.1, steppe: 0.55, desert: 0.3, savanna: 0.9, tropical_forest: 1.3,
};

/** One habitable region, whatever map it came from. */
export interface WorldRegionSeed {
  readonly id: number; readonly x: number; readonly y: number;
  /** The Koeppen class on the Earth, 0 on a generated map. */
  readonly climateClass: number;
  readonly climate: PeopleClimate;
  /** Factor on what a comarca feeds (1 is the measured `craft` region). */
  readonly productivity: number;
  readonly hasGrain: boolean;
  readonly hasFlint: boolean;
}
/** The habitable regions of a map, in id order, with the grid they sit on (longitude wraps). */
export interface WorldRegionGrid {
  readonly regionsWide: number; readonly regionsHigh: number; readonly comarcasPerRegion: number;
  readonly regions: readonly WorldRegionSeed[];
}

export function gridFromRaster(raster: WorldRaster, comarcasPerRegion = 10): WorldRegionGrid {
  const map = new RealWorldMap(raster, comarcasPerRegion);
  const regions: WorldRegionSeed[] = [];
  for (const r of map.regions) {
    if (!isWorldHabitable(r.land, r.climateClass)) continue;
    const [temperature, wetness, productivity] = KOPPEN[r.climateClass]!;
    regions.push({
      id: r.id, x: r.x, y: r.y, climateClass: r.climateClass, climate: { temperature, wetness } as PeopleClimate, productivity,
      hasGrain: (r.features & WILD_CEREALS) !== 0, hasFlint: (r.features & WORLD_FEATURE.flint) !== 0,
    });
  }
  return { regionsWide: map.regionsWide, regionsHigh: map.regionsHigh, comarcasPerRegion: map.comarcasPerRegion, regions };
}

/** The habitable regions of a game's geography, or null for the classic island (it has no map, so nobody lives beyond it). */
export function gridFromGeography(geography: WorldGeography): WorldRegionGrid | null {
  if (geography.kind === 'legacyIsland') return null;
  if (geography.kind === 'earth') return gridFromRaster(geography.map.raster, geography.map.comarcasPerRegion);
  const map = geography.map;
  const regions: WorldRegionSeed[] = [];
  for (const r of map.regions) {
    const productivity = BIOME_PRODUCTIVITY[r.biome];
    if (productivity === undefined || r.elevation <= 0) continue;
    regions.push({
      id: r.id, x: r.x, y: r.y, climateClass: 0,
      climate: { temperature: r.temperature, wetness: r.rainfall } as PeopleClimate, productivity,
      hasGrain: r.resources.includes('wild_grain'), hasFlint: r.resources.includes('flint'),
    });
  }
  return { regionsWide: map.regionsWide, regionsHigh: map.regionsHigh, comarcasPerRegion: Math.round(map.width / map.regionsWide), regions };
}

export interface WorldRegionInfo {
  readonly id: number; readonly x: number; readonly y: number; readonly climateClass: number;
  readonly knowledge: KnowledgeRegion; readonly food: PeopleRegion; readonly hasGrain: boolean;
  readonly productivity: number;
}

export interface PeopleWorldStats {
  readonly peoples: number; readonly population: number; readonly techCounts: number[]; readonly states: number;
  readonly farming: { readonly total: number; readonly inGrainlessRegion: number; readonly inventedInGrainRegion: number; readonly learned: number };
  readonly splits: number; readonly merges: number; readonly wars: number;
}

export interface PeopleWorldOptions {
  /** Turn off the union mechanism (the cohort tool's `--no-union`). */
  union?: boolean;
  contact?: { same: number; adjacent: number };
  /**
   * The game's seeding (phase 33a): density from what each region can feed, and a culture of its own for every people. Off, the
   * seeding is the cohort gates' (a flat 24-48 founders, one or two peoples, neutral culture), which `world:cohort` and
   * `world:bench` measured.
   */
  game?: boolean;
  /** Regions nobody is seeded in and no daughter settles: the player's own region is held by the detailed level. */
  reserved?: ReadonlySet<number>;
  /** Keep every knowledge event for `stats()`. The tools do; the game does not (it would grow for the whole life of a save). */
  trackEvents?: boolean;
}

export interface PeopleWorldRecord {
  readonly recordType: 'PeopleWorldRecord';
  readonly version: 1;
  readonly sim: PeopleSimRecord;
  readonly ledger: KnowledgeLedgerRecord;
  /** `[peopleId, regionId]`, by people id. */
  readonly regionOfPeople: [number, number][];
  readonly splits: number; readonly merges: number; readonly wars: number;
}

/**
 * How many people and how many peoples a region of this productivity takes in the game's seeding. A desert holds one small
 * people; a river valley two large ones. The ranges are the cohort gates' (`PEOPLES_PER_REGION`, `FOUNDERS`) scaled by what a
 * comarca there feeds: design assumptions, anchored on the measured capacity curve only in that productivity is the factor on
 * its rations.
 */
export function densityOf(productivity: number): { peoples: readonly [number, number]; founders: readonly [number, number] } {
  const share = Math.max(0, Math.min(1, productivity / 1.3));
  return {
    peoples: [1, share >= 0.75 ? 2 : 1],
    founders: [Math.round(FOUNDERS[0] * (0.5 + 0.5 * share)), Math.round(FOUNDERS[1] * (0.5 + 0.5 * share))],
  };
}

/** A culture of its own, from its own stream: the same bell curves the detailed bands are drawn from. */
export function drawCulture(rng: RNG): Pick<PeopleCulture, 'norms' | 'strangerRegard'> {
  const norms: Norms = { ...DEFAULT_NORMS };
  for (const variable of VARIABLE_NORMS) norms[variable.type] = rng.range(variable.min, variable.max);
  const strangerRegard = Math.max(0.02, Math.min(0.98, rng.gaussian(STRANGER_REGARD_MEAN, STRANGER_REGARD_SPREAD)));
  return { norms, strangerRegard };
}

export class PeopleWorld {
  readonly sim: PeopleSim;
  readonly regions = new Map<number, WorldRegionInfo>();
  readonly regionOfPeople = new Map<number, number>();
  readonly knowledgeEvents: KnowledgeEvent[] = [];
  splits = 0; merges = 0; wars = 0;
  private readonly adjacent = new Map<number, number[]>();
  private readonly ledger: KnowledgeLedger;
  private pendingRegion = -1;
  private readonly contactSame: number;
  private readonly contactAdjacent: number;
  private readonly reserved: ReadonlySet<number>;
  private readonly trackEvents: boolean;

  constructor(readonly grid: WorldRegionGrid, readonly seed: string, options: PeopleWorldOptions = {}, restore?: PeopleWorldRecord) {
    this.contactSame = options.contact?.same ?? CONTACT_SAME_REGION;
    this.contactAdjacent = options.contact?.adjacent ?? CONTACT_ADJACENT;
    this.reserved = options.reserved ?? new Set();
    this.trackEvents = options.trackEvents ?? true;
    const rng = new RNG(`${seed}:people-world`);
    const cultureRng = new RNG(`${seed}:people-cultures`);
    const { regionsWide: width, regionsHigh: height } = grid;
    const base = measuredRegion('craft');
    for (const r of grid.regions) {
      const lacking = [...(r.hasGrain ? [] : ['grain']), ...(r.hasFlint ? [] : ['flint'])];
      const food: PeopleRegion = { rationsPerComarcaDay: Object.fromEntries(
        (Object.entries(base.rationsPerComarcaDay) as [string, number][]).map(([k, v]) => [k, v * r.productivity])) as PeopleRegion['rationsPerComarcaDay'] };
      this.regions.set(r.id, { id: r.id, x: r.x, y: r.y, climateClass: r.climateClass,
        knowledge: { materials: regionMaterials(lacking), climate: r.climate }, food, hasGrain: r.hasGrain, productivity: r.productivity });
    }
    for (const id of this.regions.keys()) {
      const x = id % width, y = Math.floor(id / width);
      this.adjacent.set(id, [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
        .filter(([, yy]) => yy! >= 0 && yy! < height).map(([xx, yy]) => yy! * width + ((xx! + width) % width)).filter(n => this.regions.has(n)));
    }

    this.ledger = restore ? KnowledgeLedger.fromSnapshot(restore.ledger) : new KnowledgeLedger();
    const ledger = this.ledger;
    const regionOf = (p: People) => this.regionOfPeople.get(p.id) ?? [...this.regions.keys()][0]!;
    const record = (e: KnowledgeEvent) => { if (this.trackEvents) this.knowledgeEvents.push(e); };
    const mechs: SeasonMechanism[] = [
      storing({ regionOf: p => this.regions.get(regionOf(p))!.food }),
      demography({ regionOf: p => this.regions.get(regionOf(p))!.food }),
      knowledge({ regionOf: p => this.regions.get(regionOf(p))!.knowledge, mu: LEARN_MU_START, partial: PARTIAL_START, ledger }, record),
      trading(),
      warring({ regionOf: p => this.regions.get(regionOf(p))!.food, ledger }, e => { if (e.kind === 'declared') this.wars++; }),
      splitting({ newGround: (p, wanted) => this.grantGround(p, wanted), ledger }, r => this.onSplit(r)),
      ...(options.union === false ? [] : [uniting({ ledger }, () => { this.merges++; })]),
    ];

    if (restore) {
      if (restore.recordType !== 'PeopleWorldRecord' || restore.version !== 1) throw new RangeError('not a PeopleWorld v1 record');
      this.sim = PeopleSim.fromSnapshot(restore.sim, mechs);
      for (const [peopleId, regionId] of restore.regionOfPeople) {
        if (!this.sim.peoples.has(peopleId) || !this.regions.has(regionId)) throw new RangeError('a people lives in a region the map does not have');
        this.regionOfPeople.set(peopleId, regionId);
      }
      for (const id of this.sim.peoples.keys()) if (!this.regionOfPeople.has(id)) throw new RangeError(`people ${id} has no region`);
      this.splits = restore.splits; this.merges = restore.merges; this.wars = restore.wars;
      return;
    }

    this.sim = new PeopleSim(seed, CLOCK, mechs);
    for (const info of this.regions.values()) {
      if (this.reserved.has(info.id)) continue;
      const density = options.game ? densityOf(info.productivity) : { peoples: PEOPLES_PER_REGION, founders: FOUNDERS };
      const count = rng.int(density.peoples[0], density.peoples[1]);
      for (let i = 0; i < count; i++) {
        const people = this.sim.found({
          cohorts: foundingCohorts(rng.int(density.founders[0], density.founders[1])), comarcas: rng.int(1, 3), techs: closeUnderRequires(STARTING_TECHS),
          ...(options.game ? { culture: this.cultureOf(cultureRng) } : {}),
        });
        this.regionOfPeople.set(people.id, info.id);
      }
    }
    for (const p of this.sim.peoples.values()) this.connect(p);
  }

  /** The bell-curve parts of a culture; the trait means stay at the neutral 0 (nothing has measured a people's temperament). */
  private cultureOf(rng: RNG): Partial<PeopleCulture> {
    const { norms, strangerRegard } = drawCulture(rng);
    return { norms, strangerRegard };
  }

  /** Relations of a people with every other in its region and the adjacent ones, created once. */
  private connect(p: People): void {
    const home = this.regionOfPeople.get(p.id)!;
    const near = new Set([home, ...this.adjacent.get(home)!]);
    for (const q of this.sim.peoples.values()) {
      if (q.id === p.id) continue;
      const there = this.regionOfPeople.get(q.id);
      if (there === undefined || !near.has(there)) continue;
      const rel = this.sim.relation(p.id, q.id);
      if (rel.contact === 0) rel.contact = there === home ? this.contactSame : this.contactAdjacent;
    }
  }

  private occupied(region: number): number {
    let n = 0;
    for (const p of this.sim.peoples.values()) if (this.regionOfPeople.get(p.id) === region) n += p.comarcas;
    return n;
  }

  /** New ground for a daughter: from the parent's region while it has free comarcas, else from an adjacent one. */
  private grantGround(parent: People, wanted: number): number {
    const home = this.regionOfPeople.get(parent.id)!;
    for (const region of [home, ...this.adjacent.get(home)!]) {
      if (this.reserved.has(region)) continue;
      const free = REGION_GROUND - this.occupied(region);
      if (free >= 1) { this.pendingRegion = region; return Math.min(wanted, free); }
    }
    return 0;
  }

  private onSplit(r: SplitReport): void {
    this.splits++;
    this.regionOfPeople.set(r.daughterId, this.pendingRegion);
    this.connect(this.sim.peoples.get(r.daughterId)!);
  }

  advanceYears(years: number): void { this.sim.advanceTo(this.sim.currentStep + years * 4 * STEPS_PER_SEASON); }

  /** Run every seasonal update due up to a game tick (the same clock as `Simulation`). Only forward. */
  advanceTo(tick: number): void { if (tick > this.sim.currentStep) this.sim.advanceTo(tick); }

  /** Everything needed to rebuild this world beside the map it sits on. JSON-safe; the regions come from the geography. */
  toRecord(): PeopleWorldRecord {
    return {
      recordType: 'PeopleWorldRecord', version: 1, sim: this.sim.snapshot(), ledger: this.ledger.snapshot(),
      regionOfPeople: [...this.regionOfPeople].sort((a, b) => a[0] - b[0]),
      splits: this.splits, merges: this.merges, wars: this.wars,
    };
  }

  static fromRecord(grid: WorldRegionGrid, record: PeopleWorldRecord, options: PeopleWorldOptions = {}): PeopleWorld {
    return new PeopleWorld(grid, String(record.sim.seed), options, record);
  }

  stats(): PeopleWorldStats {
    const peoples = [...this.sim.peoples.values()];
    let farming = 0, grainless = 0;
    for (const p of peoples) {
      if (!p.techs.has('farming')) continue;
      farming++;
      if (!this.regions.get(this.regionOfPeople.get(p.id)!)!.hasGrain) grainless++;
    }
    return {
      peoples: peoples.length, population: peoples.reduce((n, p) => n + populationOf(p), 0),
      techCounts: peoples.map(p => p.techs.size),
      states: peoples.filter(p => organisationOf(p.techs) === 'state').length,
      farming: {
        total: farming, inGrainlessRegion: grainless,
        inventedInGrainRegion: this.knowledgeEvents.filter(e => e.tech === 'farming' && e.how === 'invented').length,
        learned: this.knowledgeEvents.filter(e => e.tech === 'farming' && e.how !== 'invented').length,
      },
      splits: this.splits, merges: this.merges, wars: this.wars,
    };
  }
}

/** The region of the map a detailed start sits in (the one the detailed level holds, so peoples are not seeded there). */
export function regionOfStart(grid: WorldRegionGrid, start: { x: number; y: number }): number {
  const x = ((Math.floor(start.x / grid.comarcasPerRegion) % grid.regionsWide) + grid.regionsWide) % grid.regionsWide;
  const y = Math.max(0, Math.min(grid.regionsHigh - 1, Math.floor(start.y / grid.comarcasPerRegion)));
  return y * grid.regionsWide + x;
}

/** A stable age structure (shares of each five-year band), split evenly by sex, summing to exactly `total`. */
export function foundingCohorts(total: number): PeopleCohorts {
  const shares = [0.14, 0.12, 0.11, 0.1, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.02, 0.02];
  const c = emptyCohorts();
  let placed = 0;
  for (let b = 0; b < AGE_BANDS; b++) {
    const n = Math.floor(total * shares[b]!);
    const male = Math.floor(n / 2);
    c.male[b] = male; c.female[b] = n - male; placed += n;
  }
  c.female[4]! += total - placed;
  return c;
}

export const TECH_COUNT = TECHS.length;
