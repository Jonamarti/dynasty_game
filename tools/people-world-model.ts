import { RNG } from '../src/sim/core/RNG.ts';
import { DEFAULT_CONFIG } from '../src/sim/core/Config.ts';
import { TECHS, type Tech } from '../src/sim/knowledge/Tech.ts';
import { RealWorldMap } from '../src/sim/world/RealWorldMap.ts';
import { WORLD_FEATURE } from '../src/sim/world/WorldFeatureSeeds.ts';
import type { WorldRaster } from '../src/sim/world/WorldBinary.ts';
import {
  PeopleSim, closeUnderRequires, emptyCohorts, organisationOf, populationOf, AGE_BANDS,
  type People, type PeopleCohorts, type SeasonMechanism,
} from '../src/sim/world/PeopleSim.ts';
import { demography } from '../src/sim/world/PeopleDemography.ts';
import { measuredRegion, type PeopleRegion } from '../src/sim/world/PeopleCapacity.ts';
import {
  KnowledgeLedger, LEARN_MU_START, PARTIAL_START, knowledge, regionMaterials,
  type KnowledgeEvent, type KnowledgeRegion, type PeopleClimate,
} from '../src/sim/world/PeopleKnowledge.ts';
import { storing, trading } from '../src/sim/world/PeopleEconomy.ts';
import { warring } from '../src/sim/world/PeopleWar.ts';
import { splitting, type SplitReport } from '../src/sim/world/PeopleSplit.ts';
import { uniting } from '../src/sim/world/PeopleUnion.ts';

/**
 * A world of peoples on the real Earth map, for the phase 32c cohort gates and for `world:bench`. This is the *tool-side* seeding;
 * the in-game seeding of the world is phase 33. Everything that is a geographic proxy or a starting value is a **declared
 * assumption**, written down here and in docs/m15_phase32c_peoples.md, because nothing measured it:
 *
 * - the Koeppen class of a region (Beck et al., the raster's numbering 1-30) is turned into a climate (two unit axes) and a
 *   productivity factor on what a comarca feeds, the `craft` measured region being the base (`measuredRegion('craft')`);
 * - a region lacks `grain` unless the map marks a wild cereal in it, and lacks `flint` unless the map marks flint
 *   (the same two gates `geographicResourceAvailable` applies to the detailed game);
 * - every people starts with the same four techniques (`STARTING_TECHS`, the bench's) and 24-48 people over 1-3 comarcas.
 * Nobody is handed a technique by region, name or date.
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

export interface WorldRegionInfo {
  readonly id: number; readonly x: number; readonly y: number; readonly climateClass: number;
  readonly knowledge: KnowledgeRegion; readonly food: PeopleRegion; readonly hasGrain: boolean;
}

export interface PeopleWorldStats {
  readonly peoples: number; readonly population: number; readonly techCounts: number[]; readonly states: number;
  readonly farming: { readonly total: number; readonly inGrainlessRegion: number; readonly inventedInGrainRegion: number; readonly learned: number };
  readonly splits: number; readonly merges: number; readonly wars: number;
}

export class PeopleWorld {
  readonly sim: PeopleSim;
  readonly regions = new Map<number, WorldRegionInfo>();
  readonly regionOfPeople = new Map<number, number>();
  readonly knowledgeEvents: KnowledgeEvent[] = [];
  splits = 0; merges = 0; wars = 0;
  private readonly adjacent = new Map<number, number[]>();
  private pendingRegion = -1;
  private readonly contactSame: number;
  private readonly contactAdjacent: number;

  constructor(raster: WorldRaster, readonly seed: string, mechanisms: { union?: boolean; contact?: { same: number; adjacent: number } } = {}) {
    this.contactSame = mechanisms.contact?.same ?? CONTACT_SAME_REGION;
    this.contactAdjacent = mechanisms.contact?.adjacent ?? CONTACT_ADJACENT;
    const map = new RealWorldMap(raster);
    const rng = new RNG(`${seed}:people-world`);
    const width = map.regionsWide, height = map.regionsHigh;
    const base = measuredRegion('craft');
    for (const r of map.regions) {
      if (!isWorldHabitable(r.land, r.climateClass)) continue;
      const [temperature, wetness, productivity] = KOPPEN[r.climateClass]!;
      const hasGrain = (r.features & WILD_CEREALS) !== 0;
      const lacking = [...(hasGrain ? [] : ['grain']), ...((r.features & WORLD_FEATURE.flint) !== 0 ? [] : ['flint'])];
      const food: PeopleRegion = { rationsPerComarcaDay: Object.fromEntries(
        (Object.entries(base.rationsPerComarcaDay) as [string, number][]).map(([k, v]) => [k, v * productivity])) as PeopleRegion['rationsPerComarcaDay'] };
      this.regions.set(r.id, { id: r.id, x: r.x, y: r.y, climateClass: r.climateClass,
        knowledge: { materials: regionMaterials(lacking), climate: { temperature, wetness } as PeopleClimate }, food, hasGrain });
    }
    for (const id of this.regions.keys()) {
      const x = id % width, y = Math.floor(id / width);
      this.adjacent.set(id, [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
        .filter(([, yy]) => yy! >= 0 && yy! < height).map(([xx, yy]) => yy! * width + ((xx! + width) % width)).filter(n => this.regions.has(n)));
    }

    const ledger = new KnowledgeLedger();
    const regionOf = (p: People) => this.regionOfPeople.get(p.id) ?? [...this.regions.keys()][0]!;
    const mechs: SeasonMechanism[] = [
      storing({ regionOf: p => this.regions.get(regionOf(p))!.food }),
      demography({ regionOf: p => this.regions.get(regionOf(p))!.food }),
      knowledge({ regionOf: p => this.regions.get(regionOf(p))!.knowledge, mu: LEARN_MU_START, partial: PARTIAL_START, ledger }, e => this.knowledgeEvents.push(e)),
      trading(),
      warring({ regionOf: p => this.regions.get(regionOf(p))!.food, ledger }, e => { if (e.kind === 'declared') this.wars++; }),
      splitting({ newGround: (p, wanted) => this.grantGround(p, wanted), ledger }, r => this.onSplit(r)),
      ...(mechanisms.union === false ? [] : [uniting({ ledger }, () => { this.merges++; })]),
    ];
    this.sim = new PeopleSim(seed, CLOCK, mechs);

    for (const info of this.regions.values()) {
      const count = rng.int(PEOPLES_PER_REGION[0], PEOPLES_PER_REGION[1]);
      for (let i = 0; i < count; i++) {
        const people = this.sim.found({
          cohorts: foundingCohorts(rng.int(FOUNDERS[0], FOUNDERS[1])), comarcas: rng.int(1, 3), techs: closeUnderRequires(STARTING_TECHS),
        });
        this.regionOfPeople.set(people.id, info.id);
      }
    }
    for (const p of this.sim.peoples.values()) this.connect(p);
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
