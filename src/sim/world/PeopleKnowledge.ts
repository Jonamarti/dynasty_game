/**
 * Inventing and learning from neighbours: how a people's techniques grow. M15 phase 32c, mechanism 3.
 *
 * Once per season, for every technique the people does not hold and whose `requires` it does hold (the same
 * tree as the detailed game, enforced by `TechSet.add`), two independent chances, from the people's own stream:
 *
 * **Invention (Kremer).** `p = 1 - exp(-KAPPA * Neff / difficulty)`, where `difficulty` is the technique's own
 * (`TECH[t].difficulty`: "how hard it is to arrive at unaided; the conception roll divides by it") and
 * `Neff = N + sum over neighbours of contact * N_neighbour` is the people's population plus the contacts' it
 * can think with. This is Kremer's result in one line: more people and more contact mean more inventions per
 * candidate. And it applies **only if the region has what the first prototype is made of**
 * (`prototype` keys all in `region.materials`): a people without wild grain does not invent farming, it can only
 * learn it. The one number, `KAPPA`, was measured in the detailed game (`tools/people-discovery.ts invent`).
 *
 * **Learning.** `p = 1 - exp(-MU * sum over neighbours holding it of contact * similarity)`, where `contact` is
 * the `PeopleRelation.contact` the pair keeps (trade, marriage, war and nearness all write into that one number;
 * nothing writes it yet) and `similarity` is how alike the two climates are. No materials are needed to *learn*
 * something: seed, a cutting or a recipe travels. `MU` could only be *bounded* from the detailed game
 * (`tools/people-discovery.ts transfer`, `LEARN_MU_BOUND`), so the caller supplies it, and it is spread over techniques
 * by their own traits (`transmissibility`): the aggregate stays under the bound, and what a technique is decides its share.
 *
 * ## Nothing by script
 *
 * No technique is granted by date, by name or by region: the only inputs are the people's own population,
 * what it already holds, what its region offers, and its contacts. A technique's *difficulty* is data the
 * detailed game already carries, never a schedule. `people-knowledge.test.ts` audits exactly that, and the audit
 * is shown to fail against builds that cheat.
 *
 * Stream discipline: two draws per technique per update, always, in `TECHS` order, whether or not the technique is
 * a candidate, so the stream does not depend on what a people holds. Both chances are judged against the set held
 * at the *start* of the update, so a technique and the one that requires it cannot arrive in the same season.
 * Neighbours are read as they stand when this people's update runs (peoples run in (step, id) order): a
 * technique a neighbour learned earlier in the same season can be learned in it.
 *
 * Not modelled, and so not declared: forgetting (a technique dying with its last practitioner), refinement and
 * practitioners within a people (conocer como pueblo no es que todos sepan practicar); the people holds a bit.
 */
import { TECHS, TECH, tierOf, webOf, type Tech } from '../knowledge/Tech.ts';
import { populationOf, type PeopleSeason, type SeasonMechanism, type People } from './PeopleSim.ts';

/** Climate of a region on two unit axes. The similarity of two is how far apart they sit. */
export interface PeopleClimate { readonly temperature: number; readonly wetness: number }

/** What a region offers a people's invention: the raw materials a first prototype can be made of, and its climate. */
export interface KnowledgeRegion {
  readonly materials: ReadonlySet<string>;
  readonly climate: PeopleClimate;
}

/**
 * Every raw material any prototype asks for. The macro map gates exactly two of them (wild grain, flint:
 * `geographicResourceAvailable`), so a region is "everything" minus what the map says it lacks.
 */
export const ALL_MATERIALS: readonly string[] = [...new Set(TECHS.flatMap(t => Object.keys(TECH[t].prototype)))].sort();

export function regionMaterials(lacking: Iterable<string> = []): ReadonlySet<string> {
  const lack = new Set(lacking);
  return new Set(ALL_MATERIALS.filter(m => !lack.has(m)));
}

/** 1 for the same climate, falling to 0 for opposite corners. */
export function climateSimilarity(a: PeopleClimate, b: PeopleClimate): number {
  return Math.max(0, 1 - Math.hypot(a.temperature - b.temperature, a.wetness - b.wetness) / Math.SQRT2);
}

/** Whether a region has what a technique's first prototype is made of. */
export function feasibleIn(tech: Tech, region: KnowledgeRegion): boolean {
  return Object.keys(TECH[tech].prototype).every(material => region.materials.has(material));
}

/**
 * Measured: invention events per person-season per unit of 1/difficulty, in the detailed default world from
 * founders who know nothing (docs/m15_phase32c_peoples.md section 3).
 */
export const KREMER_KAPPA = 4.714e-4;
/**
 * **An upper bound, not an estimate.** Learning events per open candidate-season at full contact (the two bands of
 * the default world) and the same climate: `firemaking`, given to one band, reached the other band in 0 of 85
 * candidate-seasons over 5 seeds (95 % upper bound 3.69 / 85 = 0.043). The other gift, `plant_lore`, reached it in 5
 * of 5 seeds in 2-8 seasons, but the same technique is invented independently in 2-5 seasons in every one of the
 * three single-band-start seeds of the invention measurement, so that transfer cannot be told from invention. The
 * two techniques differ by more than 5x, so no single `mu` is supported by the data. Hence `KnowledgeEnv.mu` has no
 * default: whoever drives learning has to say what they believe, and this is the ceiling they have to stay under
 * until a per-technique transmissibility is measured (docs/m15_phase32c_peoples.md, owner's question).
 */
export const LEARN_MU_BOUND = 0.043;

/**
 * What about a technique makes it travel between peoples, read **only from its own row in `TECHS`** (never from its
 * name, never from where or when it is held). The detailed game already says each of these in its own data:
 *
 * - `seenInUse`: a *practice* with `practisedBy` actions is done in the open every day (foraging, tending, hunting),
 *   so whoever lives beside it watches it without anybody choosing to show it (`KnowledgeSystem.tryObserve`).
 * - `craft`: a recipe or a variant of its gate, which "is passed on in ordinary small talk as well as in a lesson"
 *   (`Tech.ts`, `TechTier`).
 *
 * - `weapon`: a node of (or the gate of) the `arms` web. It is made to be used on somebody, so the people it is used
 *   against does not only see it, it *suffers* it (`KnowledgeExposure`, `how: 'suffered'`), and what is suffered is
 *   studied: what it is made of, how it is held, where it bites.
 *
 * A device that is none of these (a thing one makes at a hearth and has to be shown how) has none of them: it travels
 * only by being taught, which is the least contagious case.
 */
export interface TechTraits { readonly seenInUse: boolean; readonly craft: boolean; readonly weapon: boolean }
export function traitsOf(tech: Tech): TechTraits {
  const def = TECH[tech];
  return {
    seenInUse: (def.practisedBy?.length ?? 0) > 0,
    craft: tierOf(tech) === 'craft',
    weapon: webOf(tech) === 'arms' || def.opens === 'arms',
  };
}

/**
 * Relative weights of those traits. **Design assumptions, not measurements**: the detailed game offers two data
 * points about transfer between bands and neither fits a coefficient (a device that needs a lesson, 0 of 85
 * candidate-seasons, bound 0.043; a visible practice, 5 of 5 seeds but not distinguishable from independent invention,
 * see docs/m15_phase32c_peoples.md section 3). They fix only the *order* (the lesson-only device is the least contagious
 * and a visible practice more so) and so only the order is claimed. Everything is relative to the floor of 1, which
 * is what any contact carries (a seed, a cutting, a described recipe).
 */
export const TRANSMISSIBILITY_WEIGHTS = { floor: 1, seenInUse: 3, craft: 2 } as const;

/** Relative ease of contagion of one technique: `floor` plus what its traits add. Always at least the floor, so no node is untransmittable. */
export function transmissibility(tech: Tech): number {
  const w = TRANSMISSIBILITY_WEIGHTS, tr = traitsOf(tech);
  return w.floor + (tr.seenInUse ? w.seenInUse : 0) + (tr.craft ? w.craft : 0);
}

/** The mean transmissibility over the table: what turns a relative weight into a rate for a given aggregate `mu`. */
export const MEAN_TRANSMISSIBILITY = TECHS.reduce((sum, t) => sum + transmissibility(t), 0) / TECHS.length;

/**
 * **The aggregate MU a world starts from where nothing more is measured**: half the measured ceiling. A named, visible
 * starting value (not a hidden default inside `knowledge()`), strictly below `LEARN_MU_BOUND`, never described as an
 * estimate. The owner's decision (2026-10-06): peoples must be able to stay technologically apart, so whole-technique
 * diffusion is kept small.
 */
export const LEARN_MU_START = LEARN_MU_BOUND / 2;

/** Whole-technique learning rate of one technique: the aggregate spread over the table in proportion to transmissibility, so the table-wide mean is `mu`. */
export function learnRate(tech: Tech, mu: number): number {
  return mu * transmissibility(tech) / MEAN_TRANSMISSIBILITY;
}

/**
 * Chance this season that a people with effective population `neff` invents a feasible, open technique. `ease` is
 * how much easier a hint has made it (1 for none): the same as dividing the technique's difficulty by it.
 */
export function inventionChance(tech: Tech, neff: number, kappa = KREMER_KAPPA, ease = 1): number {
  return 1 - Math.exp(-kappa * neff * ease / TECH[tech].difficulty);
}

/**
 * **Partial learning: what contact leaves behind short of the whole technique.** A people that sees a technique
 * practised, or suffers it (a weapon used against it), does not copy it. It accumulates *insight* in [0, 1) towards it,
 * which does two things and nothing else:
 *
 * - it is a **hint**: invention is `1 + hintGain x insight` times easier (the difficulty is divided by it), so a
 *   people that has seen a technique finds its own way to it faster than one that has not, without being given it;
 * - at 1 it is the technique (`how: 'completed'`), provided the people holds its `requires` (no skipped rung).
 *
 * Every number here is a **design assumption**, not a measurement: the detailed game has no partial-learning
 * quantity to measure (a person either has a technology or has an idea of it, `KnowledgeSystem`; there is no
 * band-level progress). They are small on purpose (owner decision 2026-10-06: diffusion must not be large, so that
 * a people can stay ahead of another): at full contact a technique of average transmissibility takes 50 seasons
 * (12 years) to complete by sight alone.
 */
export interface PartialLearning {
  /** Insight gained per open season at full contact and the same climate, for a technique of average transmissibility. */
  readonly rate: number;
  /** How much each unit of insight eases invention. */
  readonly hintGain: number;
  /** How many times faster a weapon suffered is taken in than the same technique merely seen. */
  readonly sufferedWeapon: number;
}
export const PARTIAL_START: PartialLearning = { rate: 0.02, hintGain: 4, sufferedWeapon: 3 };

/** Insight gained from one unit of exposure to a technique: the technique's own share, and the weapon bonus if it was suffered. */
export function insightGain(tech: Tech, how: 'witnessed' | 'suffered', partial: PartialLearning): number {
  const bonus = how === 'suffered' && traitsOf(tech).weapon ? partial.sufferedWeapon : 1;
  return partial.rate * bonus * transmissibility(tech) / MEAN_TRANSMISSIBILITY;
}

/**
 * **An explicit input to the model: a people was exposed to a technique that is not its own.** Contact between
 * neighbours produces these by itself (every season, from `PeopleRelation.contact`); this is how an event that is
 * not a standing relation gets in: a weapon used on them in a raid or a war (`suffered`), a delegation shown
 * a craft (`witnessed`). Nothing in `PeopleSim` makes war yet; whoever does will `post` here.
 *
 * `id` is the **transaction**: the same id is counted once, however many times it is posted (a raid reported by
 * both sides, a replayed log), and `post` says whether it counted. The poster guarantees that the other party held
 * the technique and that it was used where `peopleId` could see or feel it; the model does not check that.
 * `intensity` is in [0, 1]: how much of a season's exposure it was.
 */
export interface KnowledgeExposure {
  readonly id: string;
  readonly peopleId: number;
  readonly tech: Tech;
  readonly how: 'witnessed' | 'suffered';
  readonly intensity: number;
}

export interface KnowledgeLedgerRecord {
  readonly insights: [number, [Tech, number][]][];
  readonly seen: string[];
  readonly pending: [number, KnowledgeExposure[]][];
}

/** What the model keeps about partial learning: each people's insight, and the exposures posted but not yet taken in. */
export class KnowledgeLedger {
  private readonly insights = new Map<number, Map<Tech, number>>();
  private readonly seen = new Set<string>();
  private readonly pending = new Map<number, KnowledgeExposure[]>();

  insight(peopleId: number, tech: Tech): number { return this.insights.get(peopleId)?.get(tech) ?? 0; }
  /** Add insight; returns the new total (not capped here: 1 or more means complete). */
  addInsight(peopleId: number, tech: Tech, amount: number): number {
    let m = this.insights.get(peopleId);
    if (!m) { m = new Map(); this.insights.set(peopleId, m); }
    const total = (m.get(tech) ?? 0) + amount;
    m.set(tech, total);
    return total;
  }
  clear(peopleId: number, tech: Tech): void { this.insights.get(peopleId)?.delete(tech); }
  /** Techniques a people has any insight into, in `TECHS` order. */
  hinted(peopleId: number): Tech[] { const m = this.insights.get(peopleId); return m ? TECHS.filter(t => (m.get(t) ?? 0) > 0) : []; }

  /** Queue an exposure for the exposed people's next update. False if this transaction was already posted. */
  post(e: KnowledgeExposure): boolean {
    if (!(e.intensity >= 0 && e.intensity <= 1)) throw new RangeError(`intensity ${e.intensity} outside [0, 1]`);
    if (this.seen.has(e.id)) return false;
    this.seen.add(e.id);
    const q = this.pending.get(e.peopleId);
    if (q) q.push(e); else this.pending.set(e.peopleId, [e]);
    return true;
  }
  /** Everything the ledger holds, sorted so equal ledgers write equal JSON. A save without it forgets half-learned techniques. */
  snapshot(): KnowledgeLedgerRecord {
    return {
      // A people whose every insight was cleared keeps an empty map; it reads the same as none, so it is not written.
      insights: [...this.insights].sort((a, b) => a[0] - b[0]).filter(([, m]) => m.size > 0)
        .map(([id, m]) => [id, TECHS.filter(t => m.has(t)).map(t => [t, m.get(t)!] as [Tech, number])]),
      seen: [...this.seen].sort(),
      pending: [...this.pending].sort((a, b) => a[0] - b[0]).map(([id, q]) => [id, q.map(e => ({ ...e }))]),
    };
  }
  static fromSnapshot(record: KnowledgeLedgerRecord): KnowledgeLedger {
    const ledger = new KnowledgeLedger();
    for (const [id, list] of record.insights) for (const [tech, v] of list) {
      if (!TECHS.includes(tech)) throw new RangeError(`unknown technique ${String(tech)} in a ledger`);
      ledger.addInsight(id, tech, v);
    }
    for (const s of record.seen) ledger.seen.add(s);
    for (const [id, q] of record.pending) ledger.pending.set(id, q.map(e => ({ ...e })));
    return ledger;
  }

  /** Take (and forget) what is queued for a people, in the order posted. */
  take(peopleId: number): KnowledgeExposure[] {
    const q = this.pending.get(peopleId) ?? [];
    this.pending.delete(peopleId);
    return q;
  }
}

/** Chance this season of learning a technique, given the summed `contact x similarity` of the neighbours holding it. */
export function learningChance(exposure: number, mu: number): number {
  return 1 - Math.exp(-mu * exposure);
}

export interface KnowledgeEnv {
  readonly regionOf: (people: People) => KnowledgeRegion;
  readonly kappa?: number;
  /**
   * The *aggregate* whole-technique learning rate per open candidate-season at full contact and the same climate,
   * spread over techniques by `learnRate`. Required, so no value hides in here: pass `LEARN_MU_START` (below the
   * measured ceiling `LEARN_MU_BOUND`) unless you are measuring.
   */
  readonly mu: number;
  /** Partial learning (insight and hints); required for the same reason as `mu`: pass `PARTIAL_START` unless measuring. */
  readonly partial: PartialLearning;
  /** Where insight and posted exposures are kept. Omit it and the model keeps a private one nobody can post to. */
  readonly ledger?: KnowledgeLedger;
}

/** One technique acquired, for whoever measures (never read by the model). */
export interface KnowledgeEvent {
  readonly peopleId: number; readonly season: number; readonly seasonOfYear: PeopleSeason; readonly tech: Tech;
  /** `completed`: the insight from sight and suffering filled up. */
  readonly how: 'invented' | 'learned' | 'completed';
}

export function knowledge(env: KnowledgeEnv, report?: (e: KnowledgeEvent) => void): SeasonMechanism {
  const kappa = env.kappa ?? KREMER_KAPPA, mu = env.mu, partial = env.partial, ledger = env.ledger ?? new KnowledgeLedger();
  return ({ sim, people, season, seasonOfYear }) => {
    const rng = people.rng;
    const region = env.regionOf(people);
    const neighbours = sim.relationsOf(people.id).map(rel => ({ rel, other: sim.peoples.get(rel.a === people.id ? rel.b : rel.a)! }));
    let neff = populationOf(people);
    for (const { rel, other } of neighbours) neff += rel.contact * populationOf(other);
    // Exposures posted from outside (a weapon used on this people) are taken in with this season's.
    const posted = new Map<Tech, number>();
    for (const e of ledger.take(people.id)) {
      if (!people.techs.has(e.tech)) posted.set(e.tech, (posted.get(e.tech) ?? 0) + e.intensity * insightGain(e.tech, e.how, partial));
    }
    // Judge every candidate against what is held now (and the insight held now); add afterwards.
    const arrivals: { tech: Tech; how: 'invented' | 'learned' | 'completed' }[] = [];
    for (const tech of TECHS) {
      const uInvent = rng.next(), uLearn = rng.next();
      if (people.techs.has(tech)) { ledger.clear(people.id, tech); continue; }
      let exposure = 0;
      for (const { rel, other } of neighbours) {
        if (rel.contact > 0 && other.techs.has(tech)) exposure += rel.contact * climateSimilarity(region.climate, env.regionOf(other).climate);
      }
      const before = ledger.insight(people.id, tech);
      const gain = exposure * insightGain(tech, 'witnessed', partial) + (posted.get(tech) ?? 0);
      const after = gain > 0 ? ledger.addInsight(people.id, tech, gain) : before;
      if (!people.techs.prerequisitesHeld(tech)) continue;
      const invented = neff > 0 && feasibleIn(tech, region) && uInvent < inventionChance(tech, neff, kappa, 1 + partial.hintGain * Math.min(before, 1));
      const learned = exposure > 0 && uLearn < learningChance(exposure, learnRate(tech, mu));
      const completed = after >= 1;
      if (invented || learned || completed) arrivals.push({ tech, how: invented ? 'invented' : learned ? 'learned' : 'completed' });
    }
    for (const { tech, how } of arrivals) {
      people.techs.add(tech);
      ledger.clear(people.id, tech);
      report?.({ peopleId: people.id, season, seasonOfYear, tech, how });
    }
  };
}
