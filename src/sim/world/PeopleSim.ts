/**
 * `PeopleSim`: level 2, the world that advances at its own pace. M15 phase 32c.
 *
 * A *people* is a whole society seen from far away: its population as cohorts by
 * age and sex (never a counter), the comarcas it occupies (a number), the techniques
 * it holds (a bitset over `TECHS`, with the very same `requires`), its culture
 * (norms, regard for strangers, mean of the traits), the relations it keeps with its
 * neighbours, and a surplus. Nothing here creates `Person` objects: identities are
 * made later, when somebody comes close (docs/m15_simulation_lod.md section 3).
 *
 * **Inert.** Nothing in `Simulation` calls this; it is built from a seed and a clock
 * and driven by whoever owns it. It imports no renderer and no DOM and never calls
 * `Math.random`.
 *
 * ## Determinism, in three rules
 *
 * 1. **Streams are derived, not forked.** Each people's stream comes from
 *    `derivePeopleStream(worldSeed, peopleId)` and so lies outside the fork contract
 *    of `Simulation`'s constructor: adding a people can never shift a draw anywhere
 *    else, and no people's draws depend on how many others exist. Its state is saved
 *    (`PeopleRecord.rng`) so a restored people continues the same sequence.
 * 2. **The seasonal update is spread by step number, never by clock.** A people is
 *    due once per season, on the step `season * stepsPerSeason + offset(id)` where
 *    `offset` is a hash of the world seed and the id. The load is therefore spread
 *    over the whole season instead of landing on one tick, and the schedule is a pure
 *    function of the step counter: it does not read FPS, wall time or how the caller
 *    chopped the run into `advanceTo` calls (test: cutting at any step gives the same
 *    state). Peoples due on the same step run in id order.
 * 3. **A relation has one owner.** Neighbour relations live in `PeopleSim.relations`,
 *    once per unordered pair, with an id; a people does not carry a copy. Updating
 *    "both ends" is writing one record, so a trade or a war cannot be applied twice.
 *
 * Mechanisms (growth, invention, learning) plug in as `SeasonMechanism`s, run in the
 * order they are given. This file is the structure; see `PeopleDemography.ts` and
 * `PeopleKnowledge.ts` for the mechanisms and docs/m15_phase32c_peoples.md for what
 * was measured.
 */
import { RNG, hashString } from '../core/RNG.ts';
import { TECHS, TECH, type Tech } from '../knowledge/Tech.ts';
import { TRAITS, type Trait } from '../entities/Person.ts';
import { DEFAULT_NORMS, type Norms } from '../social/Events.ts';
import { CIVILISATION_NEEDS } from '../social/Polity.ts';

/** Five-year age bands, 0-4 ... 55-59, and 60+ (13 bands). */
export const AGE_BAND_YEARS = 5;
export const AGE_BANDS = 13;
export const SEASONS_PER_YEAR = 4;
export const PEOPLE_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type PeopleSeason = (typeof PEOPLE_SEASONS)[number];

export const PEOPLE_RECORD_VERSION = 1 as const;

/** The stream of one people: derived from the world seed and a stable id, outside `Simulation`'s forks. */
export function derivePeopleStream(worldSeed: string | number, peopleId: number): RNG {
  return new RNG(hashString(`people|${worldSeed}|${peopleId}`));
}

/** Where in its season a people is updated: a hash of seed and id, so it spreads over the steps. */
export function seasonOffset(worldSeed: string | number, peopleId: number, stepsPerSeason: number): number {
  return hashString(`people-phase|${worldSeed}|${peopleId}`) % stepsPerSeason;
}

// ---------------------------------------------------------------------------
// Techniques as a bitset over TECHS
// ---------------------------------------------------------------------------

/** Changes whenever `TECHS` is reordered or grows: a saved bitset is meaningless against another list. */
export const TECH_LIST_HASH = hashString(TECHS.join(','));
const TECH_INDEX: ReadonlyMap<string, number> = new Map(TECHS.map((tech, i) => [tech, i]));

export interface TechSetRecord { readonly count: number; readonly hash: number; readonly words: readonly number[] }

/**
 * The techniques a people holds. `add` refuses a technique whose `requires` are not all held:
 * the same prerequisite rule the detailed game uses (`prerequisitesMet`), enforced where the
 * knowledge is written so no mechanism can grant a node out of order.
 */
export class TechSet {
  private readonly words: Uint32Array;
  constructor(initial: Iterable<Tech> = []) {
    this.words = new Uint32Array(Math.ceil(TECHS.length / 32));
    // Founders may be handed a set; it must itself be closed under `requires`, so add in list order
    // until nothing more can be added, and reject what is left over.
    const pending = new Set<Tech>(initial);
    let progress = true;
    while (pending.size > 0 && progress) {
      progress = false;
      for (const tech of TECHS) {
        if (pending.has(tech) && this.prerequisitesHeld(tech)) { this.set(tech); pending.delete(tech); progress = true; }
      }
    }
    if (pending.size > 0) throw new RangeError(`techniques without their prerequisites: ${[...pending].join(', ')}`);
  }

  private set(tech: Tech): void {
    const i = TECH_INDEX.get(tech)!;
    this.words[i >>> 5]! |= (1 << (i & 31)) >>> 0;
  }

  has(tech: Tech): boolean {
    const i = TECH_INDEX.get(tech);
    return i !== undefined && (this.words[i >>> 5]! & (1 << (i & 31))) !== 0;
  }

  prerequisitesHeld(tech: Tech): boolean {
    return TECH[tech].requires.every(required => this.has(required));
  }

  /** Learn a technique. Refuses (throws) when a prerequisite is missing; returns false if already known. */
  add(tech: Tech): boolean {
    if (!this.prerequisitesHeld(tech)) {
      throw new RangeError(`${tech} requires ${TECH[tech].requires.filter(r => !this.has(r)).join(', ')}`);
    }
    if (this.has(tech)) return false;
    this.set(tech);
    return true;
  }

  get size(): number {
    let n = 0;
    for (const word of this.words) { let w = word; while (w) { n += w & 1; w >>>= 1; } }
    return n;
  }

  list(): Tech[] { return TECHS.filter(tech => this.has(tech)); }
  clone(): TechSet { return new TechSet(this.list()); }

  toRecord(): TechSetRecord { return { count: TECHS.length, hash: TECH_LIST_HASH, words: [...this.words] }; }

  static fromRecord(record: TechSetRecord): TechSet {
    if (record.count !== TECHS.length || record.hash !== TECH_LIST_HASH ||
        record.words.length !== Math.ceil(TECHS.length / 32)) {
      throw new RangeError('technique set was saved against a different TECHS list');
    }
    const set = new TechSet();
    record.words.forEach((word, i) => {
      if (!Number.isInteger(word) || word < 0 || word > 0xffffffff) throw new RangeError('bad technique word');
      set.words[i] = word;
    });
    // A saved set must still be closed under `requires`.
    for (const tech of set.list()) {
      if (!set.prerequisitesHeld(tech)) throw new RangeError(`saved technique ${tech} lacks its prerequisites`);
    }
    return set;
  }
}

// ---------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------

export interface PeopleCohorts { male: number[]; female: number[] }

export interface PeopleCulture {
  norms: Norms;
  /** 0-1, the same quantity as `Band.strangerRegard`. */
  strangerRegard: number;
  /** Mean of each trait over the people, in the same units as `Person.traits`. */
  traitMeans: Record<Trait, number>;
}

/**
 * How organised a people is. **Derived, never stored**, like the civilisation of phase 38c
 * (`civilisationLacks`): it is read from the techniques the people holds, so it can fall back
 * when a technique is lost. The rungs are the game's own: `division_of_labour` is the first
 * rung beyond the band (M9.5 phase 4c), `chiefdom` the second (phase 4d), and a state holds
 * every node of `CIVILISATION_NEEDS` (taxation, army, kingship included). Who reaches them,
 * and when, is not scripted anywhere.
 */
export type Organisation = 'band' | 'tribe' | 'chiefdom' | 'state';
export function organisationOf(techs: TechSet): Organisation {
  if (CIVILISATION_NEEDS.every(need => techs.has(need as Tech))) return 'state';
  if (techs.has('chiefdom')) return 'chiefdom';
  if (techs.has('division_of_labour')) return 'tribe';
  return 'band';
}

export interface People {
  readonly id: number;
  /** Comarcas the people occupies in its region: a number, not a list of tiles. */
  comarcas: number;
  cohorts: PeopleCohorts;
  techs: TechSet;
  culture: PeopleCulture;
  /** Stored food and goods, in rations (a person-day of food). Aggregate; no item list. */
  surplus: number;
  /** The people's own derived stream. Never shared. */
  readonly rng: RNG;
  /** The step on which the next seasonal update is due. */
  nextDue: number;
}

export interface PeopleRelation {
  readonly id: number;
  /** The unordered pair, `a < b`. */
  readonly a: number; readonly b: number;
  /** How the two peoples feel about each other, -100..100: the aggregate `BandRelations` edge. */
  standing: number;
  /** 0..1, how much the two touch (trade, marriage, shared ground). Symmetric by construction. */
  contact: number;
  stance: 'war' | 'peace' | 'tributary' | null;
}

export interface PeopleSpec {
  /** Persons by 5-year band; `male[i]`/`female[i]`, length `AGE_BANDS`. */
  cohorts: PeopleCohorts;
  comarcas: number;
  techs?: Iterable<Tech>;
  culture?: Partial<PeopleCulture>;
  surplus?: number;
}

export const emptyCohorts = (): PeopleCohorts => ({ male: new Array(AGE_BANDS).fill(0), female: new Array(AGE_BANDS).fill(0) });
export function populationOf(people: Pick<People, 'cohorts'>): number {
  let n = 0;
  for (const v of people.cohorts.male) n += v;
  for (const v of people.cohorts.female) n += v;
  return n;
}
export const ageBandOfYears = (years: number): number => Math.max(0, Math.min(AGE_BANDS - 1, Math.floor(years / AGE_BAND_YEARS)));

function neutralCulture(): PeopleCulture {
  return {
    norms: { ...DEFAULT_NORMS }, strangerRegard: 0.5,
    traitMeans: Object.fromEntries(TRAITS.map(t => [t, 0])) as Record<Trait, number>,
  };
}

function checkCohorts(c: PeopleCohorts): void {
  for (const side of [c.male, c.female]) {
    if (side.length !== AGE_BANDS) throw new RangeError(`cohorts need ${AGE_BANDS} age bands`);
    for (const v of side) if (!Number.isInteger(v) || v < 0) throw new RangeError('cohort counts are non-negative integers');
  }
}

export interface PeopleRecord {
  readonly id: number;
  readonly comarcas: number;
  readonly cohorts: PeopleCohorts;
  readonly techs: TechSetRecord;
  readonly culture: PeopleCulture;
  readonly surplus: number;
  readonly rng: ReturnType<RNG['snapshot']>;
  readonly nextDue: number;
}

export interface PeopleSimClock {
  readonly ticksPerDay: number;
  readonly daysPerSeason: number;
}

/** What a mechanism sees when its people's seasonal update comes due. */
export interface SeasonContext {
  readonly sim: PeopleSim;
  readonly people: People;
  /** Seasons since step 0, and the season of the year it falls in. */
  readonly season: number;
  readonly seasonOfYear: PeopleSeason;
  /** The step on which this update is running. */
  readonly step: number;
}
export type SeasonMechanism = (ctx: SeasonContext) => void;

export interface PeopleSimRecord {
  readonly recordType: 'PeopleSimRecord';
  readonly version: typeof PEOPLE_RECORD_VERSION;
  readonly seed: string | number;
  readonly clock: PeopleSimClock;
  readonly step: number;
  readonly nextPeopleId: number;
  readonly nextRelationId: number;
  readonly peoples: PeopleRecord[];
  readonly relations: PeopleRelation[];
  readonly applied: number[];
}

export class PeopleSim {
  readonly peoples = new Map<number, People>();
  /** One record per unordered pair, keyed `a:b` with `a < b`. The only copy of a relation. */
  readonly relations = new Map<string, PeopleRelation>();
  /** Aggregate transactions already applied (trades, tributes, losses): a repeat is refused. */
  private readonly applied = new Set<number>();
  readonly stepsPerSeason: number;
  private nextPeopleId = 1;
  private nextRelationId = 1;
  private step = 0;

  constructor(
    readonly seed: string | number,
    readonly clock: PeopleSimClock,
    private readonly mechanisms: readonly SeasonMechanism[] = [],
  ) {
    if (!(clock.ticksPerDay >= 1) || !(clock.daysPerSeason >= 1)) throw new RangeError('bad clock');
    this.stepsPerSeason = clock.ticksPerDay * clock.daysPerSeason;
  }

  get currentStep(): number { return this.step; }

  /** Found a people. The id is the next of a counter that is saved, so identity is stable across runs. */
  found(spec: PeopleSpec): People {
    checkCohorts(spec.cohorts);
    if (!Number.isInteger(spec.comarcas) || spec.comarcas < 1) throw new RangeError('a people occupies at least one comarca');
    const id = this.nextPeopleId++;
    const culture = { ...neutralCulture(), ...spec.culture };
    const people: People = {
      id, comarcas: spec.comarcas,
      cohorts: { male: [...spec.cohorts.male], female: [...spec.cohorts.female] },
      techs: new TechSet(spec.techs ?? []), culture,
      surplus: spec.surplus ?? 0,
      rng: derivePeopleStream(this.seed, id),
      nextDue: this.firstDueAfter(id, this.step),
    };
    this.peoples.set(id, people);
    return people;
  }

  /** The first step strictly after `step` whose position in its season is this people's offset. */
  private firstDueAfter(id: number, step: number): number {
    const offset = seasonOffset(this.seed, id, this.stepsPerSeason);
    const season = Math.floor(step / this.stepsPerSeason);
    const due = season * this.stepsPerSeason + offset;
    return due > step ? due : due + this.stepsPerSeason;
  }

  /** The relation between two peoples, created once; both ends read and write this one record. */
  relation(x: number, y: number): PeopleRelation {
    if (x === y) throw new RangeError('a people has no relation with itself');
    if (!this.peoples.has(x) || !this.peoples.has(y)) throw new RangeError('unknown people');
    const a = Math.min(x, y), b = Math.max(x, y);
    const key = `${a}:${b}`;
    let rel = this.relations.get(key);
    if (!rel) { rel = { id: this.nextRelationId++, a, b, standing: 0, contact: 0, stance: null }; this.relations.set(key, rel); }
    return rel;
  }

  /** Mark an aggregate transaction as applied. False on the second call with the same id. */
  commit(transactionId: number): boolean {
    if (this.applied.has(transactionId)) return false;
    this.applied.add(transactionId);
    return true;
  }

  /**
   * Run every seasonal update that falls due up to and including `step`, in (due step, people id)
   * order. Only forward: a step already passed cannot be asked for again. Cutting a run into
   * several calls changes nothing, because the order is a function of the schedule alone.
   */
  advanceTo(step: number): void {
    if (!Number.isInteger(step) || step < this.step) throw new RangeError(`cannot move from step ${this.step} to ${step}`);
    for (;;) {
      let next: People | null = null;
      for (const p of this.peoples.values()) {
        if (p.nextDue > step) continue;
        if (!next || p.nextDue < next.nextDue || (p.nextDue === next.nextDue && p.id < next.id)) next = p;
      }
      if (!next) break;
      const due = next.nextDue;
      const season = Math.floor(due / this.stepsPerSeason);
      const ctx: SeasonContext = { sim: this, people: next, season, seasonOfYear: PEOPLE_SEASONS[season % SEASONS_PER_YEAR]!, step: due };
      for (const mechanism of this.mechanisms) mechanism(ctx);
      next.nextDue = due + this.stepsPerSeason;
    }
    this.step = step;
  }

  // -------------------------------------------------------------------------
  // JSON
  // -------------------------------------------------------------------------

  snapshot(): PeopleSimRecord {
    return {
      recordType: 'PeopleSimRecord', version: PEOPLE_RECORD_VERSION, seed: this.seed,
      clock: { ...this.clock }, step: this.step,
      nextPeopleId: this.nextPeopleId, nextRelationId: this.nextRelationId,
      peoples: [...this.peoples.values()].sort((x, y) => x.id - y.id).map(p => ({
        id: p.id, comarcas: p.comarcas,
        cohorts: { male: [...p.cohorts.male], female: [...p.cohorts.female] },
        techs: p.techs.toRecord(),
        culture: { norms: { ...p.culture.norms }, strangerRegard: p.culture.strangerRegard, traitMeans: { ...p.culture.traitMeans } },
        surplus: p.surplus, rng: p.rng.snapshot(), nextDue: p.nextDue,
      })),
      relations: [...this.relations.values()].sort((x, y) => x.id - y.id).map(r => ({ ...r })),
      applied: [...this.applied].sort((x, y) => x - y),
    };
  }

  static fromSnapshot(raw: unknown, mechanisms: readonly SeasonMechanism[] = []): PeopleSim {
    const r = raw as PeopleSimRecord;
    if (!r || r.recordType !== 'PeopleSimRecord' || r.version !== PEOPLE_RECORD_VERSION) throw new RangeError('not a PeopleSim v1 record');
    if (!Number.isInteger(r.step) || r.step < 0) throw new RangeError('bad step');
    const sim = new PeopleSim(r.seed, r.clock, mechanisms);
    sim.step = r.step; sim.nextPeopleId = r.nextPeopleId; sim.nextRelationId = r.nextRelationId;
    for (const p of r.peoples) {
      checkCohorts(p.cohorts);
      if (sim.peoples.has(p.id) || p.id >= r.nextPeopleId) throw new RangeError(`bad people id ${p.id}`);
      if (p.nextDue <= r.step) throw new RangeError('a people is due at or before the saved step: its update was lost');
      sim.peoples.set(p.id, {
        id: p.id, comarcas: p.comarcas,
        cohorts: { male: [...p.cohorts.male], female: [...p.cohorts.female] },
        techs: TechSet.fromRecord(p.techs),
        culture: { norms: { ...p.culture.norms }, strangerRegard: p.culture.strangerRegard, traitMeans: { ...p.culture.traitMeans } },
        surplus: p.surplus, rng: RNG.fromSnapshot(p.rng), nextDue: p.nextDue,
      });
    }
    for (const rel of r.relations) {
      if (!sim.peoples.has(rel.a) || !sim.peoples.has(rel.b) || rel.a >= rel.b) throw new RangeError('bad relation');
      const key = `${rel.a}:${rel.b}`;
      if (sim.relations.has(key)) throw new RangeError('duplicate relation');
      sim.relations.set(key, { ...rel });
    }
    for (const id of r.applied) {
      if (sim.applied.has(id)) throw new RangeError('duplicate transaction');
      sim.applied.add(id);
    }
    return sim;
  }
}
