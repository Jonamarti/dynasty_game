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
 * (`tools/people-discovery.ts transfer`, `LEARN_MU_BOUND`), so the caller supplies it.
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
import { TECHS, TECH, type Tech } from '../knowledge/Tech.ts';
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

/** Chance this season that a people with effective population `neff` invents a feasible, open technique. */
export function inventionChance(tech: Tech, neff: number, kappa = KREMER_KAPPA): number {
  return 1 - Math.exp(-kappa * neff / TECH[tech].difficulty);
}

/** Chance this season of learning a technique, given the summed `contact x similarity` of the neighbours holding it. */
export function learningChance(exposure: number, mu: number): number {
  return 1 - Math.exp(-mu * exposure);
}

export interface KnowledgeEnv {
  readonly regionOf: (people: People) => KnowledgeRegion;
  readonly kappa?: number;
  /** Learning rate per open candidate-season at full contact and the same climate. Required: no measured value exists (`LEARN_MU_BOUND`). */
  readonly mu: number;
}

/** One technique acquired, for whoever measures (never read by the model). */
export interface KnowledgeEvent {
  readonly peopleId: number; readonly season: number; readonly seasonOfYear: PeopleSeason; readonly tech: Tech;
  readonly how: 'invented' | 'learned';
}

export function knowledge(env: KnowledgeEnv, report?: (e: KnowledgeEvent) => void): SeasonMechanism {
  const kappa = env.kappa ?? KREMER_KAPPA, mu = env.mu;
  return ({ sim, people, season, seasonOfYear }) => {
    const rng = people.rng;
    const region = env.regionOf(people);
    const neighbours = sim.relationsOf(people.id).map(rel => ({ rel, other: sim.peoples.get(rel.a === people.id ? rel.b : rel.a)! }));
    let neff = populationOf(people);
    for (const { rel, other } of neighbours) neff += rel.contact * populationOf(other);
    // Judge every candidate against what is held now; add afterwards.
    const arrivals: { tech: Tech; how: 'invented' | 'learned' }[] = [];
    for (const tech of TECHS) {
      const uInvent = rng.next(), uLearn = rng.next();
      if (people.techs.has(tech) || !people.techs.prerequisitesHeld(tech)) continue;
      const invented = neff > 0 && feasibleIn(tech, region) && uInvent < inventionChance(tech, neff, kappa);
      let exposure = 0;
      for (const { rel, other } of neighbours) {
        if (rel.contact > 0 && other.techs.has(tech)) exposure += rel.contact * climateSimilarity(region.climate, env.regionOf(other).climate);
      }
      const learned = exposure > 0 && uLearn < learningChance(exposure, mu);
      if (invented || learned) arrivals.push({ tech, how: invented ? 'invented' : 'learned' });
    }
    for (const { tech, how } of arrivals) {
      people.techs.add(tech);
      report?.({ peopleId: people.id, season, seasonOfYear, tech, how });
    }
  };
}

