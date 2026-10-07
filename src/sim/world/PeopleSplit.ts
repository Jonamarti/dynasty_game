/**
 * Splitting: a people that has outgrown what its organisation holds together sends a daughter people
 * out to new ground. M15 phase 32c, mechanism 6 (the half that divides; uniting by conquest, tribute
 * or alliance waits for war and trade to exist).
 *
 * **What decides it, and what does not.** Only two things: the people's size against the ceiling of its
 * `organisationOf` (derived from the techniques it holds, like the civilisation of phase 38c), and
 * whether the owner can grant new ground. Never a date, a name, a region or an id. A people that cannot
 * split (no room) stays where it is and the capacity curve of `PeopleCapacity` does what it always did.
 *
 * **The ceilings are declared assumptions, not measurements.** The detailed game never ran a band past
 * about forty, so nothing here is calibrated: `ORGANISATION_CEILING` is the usual anthropological rule of
 * thumb (a band of a few dozen, a tribe of a few hundred, a chiefdom of a few thousand, a state bound only
 * by its land) and the departing share and the tie kept with the parent are design values, all exported
 * under their names so a measurement can replace them. The state has no ceiling: it fissions by other causes.
 *
 * **Who goes.** `DAUGHTER_SHARE` of every age/sex cell, drawn binomially from the *parent's* stream
 * (families and settlements leave whole, so the daughter has every age and both sexes in the parent's proportion,
 * which is why a cohort cell is never emptied by choice). It takes the techniques, the culture, the insight the
 * parent had towards techniques it does not yet hold, and the same share of the surplus. Nothing is invented:
 * population, techniques and surplus are conserved exactly (test).
 *
 * **One owner for the tie.** The relation between parent and daughter is the single record of
 * `PeopleSim.relation`, written once at the split: friendly (`SPLIT_STANDING`) and in `SPLIT_CONTACT`
 * contact. Contact is what `PeopleKnowledge` reads to spread techniques, so a daughter drifts apart only slowly.
 */
import { populationOf, organisationOf, type Organisation, type People, type PeopleSeason, type SeasonMechanism } from './PeopleSim.ts';
import { binomial } from './PeopleDemography.ts';
import type { KnowledgeLedger } from './PeopleKnowledge.ts';

/** People a society of this organisation holds together before it divides. Design assumptions, not measured. */
export const ORGANISATION_CEILING: Readonly<Record<Organisation, number>> = { band: 60, tribe: 250, chiefdom: 1200, state: Infinity };
/** Share of every cohort cell that leaves with the daughter. Design value. */
export const DAUGHTER_SHARE = 0.4;
/** A daughter expected to be smaller than this is not viable: the split is not tried rather than sending out a handful. */
export const MIN_DAUGHTER = 8;
/** Standing and contact the two peoples start with. Design values. */
export const SPLIT_STANDING = 60;
export const SPLIT_CONTACT = 0.5;

export interface SplitEnv {
  /**
   * Grant new ground: the people `parent` asks for `wanted` comarcas; the owner answers how many it can have
   * (0 refuses the split) and marks them taken. Required: the model cannot know what is free.
   */
  readonly newGround: (parent: People, wanted: number) => number;
  /** Where the parent's insight into techniques it lacks lives; the daughter inherits it. Optional. */
  readonly ledger?: KnowledgeLedger;
}

export interface SplitReport {
  readonly parentId: number; readonly daughterId: number;
  readonly season: number; readonly seasonOfYear: PeopleSeason;
  readonly moved: number; readonly comarcas: number; readonly parentPopulation: number;
}

/** Whether a people is over what its organisation holds together. Pure: a function of its size and techniques. */
export function overCeiling(people: Pick<People, 'cohorts' | 'techs'>): boolean {
  return populationOf(people) > ORGANISATION_CEILING[organisationOf(people.techs)];
}

export function splitting(env: SplitEnv, report?: (r: SplitReport) => void): SeasonMechanism {
  return ctx => {
    const { people, sim } = ctx;
    if (!overCeiling(people)) return;
    // Viability is judged on the expected size, before any ground is asked for or draw taken: asking for ground
    // and then refusing would leave the owner with comarcas marked taken that nobody settles.
    if (populationOf(people) * DAUGHTER_SHARE < MIN_DAUGHTER) return;
    const wanted = Math.max(1, Math.round(people.comarcas * DAUGHTER_SHARE));
    // Ground before draws: if the owner refuses, no draw is taken, so a people that cannot split is the same as one that never tried.
    const comarcas = Math.min(wanted, Math.max(0, Math.floor(env.newGround(people, wanted))));
    if (comarcas < 1) return;

    const leaving = { male: new Array<number>(people.cohorts.male.length).fill(0), female: new Array<number>(people.cohorts.female.length).fill(0) };
    let moved = 0;
    for (const sex of ['male', 'female'] as const) {
      for (let b = 0; b < people.cohorts[sex].length; b++) {
        const n = binomial(people.cohorts[sex][b]!, DAUGHTER_SHARE, people.rng);
        leaving[sex][b] = n; moved += n;
      }
    }
    for (const sex of ['male', 'female'] as const) for (let b = 0; b < leaving[sex].length; b++) people.cohorts[sex][b]! -= leaving[sex][b]!;

    const share = moved / (moved + populationOf(people));
    const surplus = people.surplus * share;
    people.surplus -= surplus;
    const daughter = sim.found({
      cohorts: leaving, comarcas, techs: people.techs.list(),
      culture: { norms: { ...people.culture.norms }, strangerRegard: people.culture.strangerRegard, traitMeans: { ...people.culture.traitMeans } },
      surplus,
    });
    if (env.ledger) for (const tech of env.ledger.hinted(people.id)) env.ledger.addInsight(daughter.id, tech, env.ledger.insight(people.id, tech));
    const tie = sim.relation(people.id, daughter.id);
    tie.standing = SPLIT_STANDING; tie.contact = SPLIT_CONTACT;
    report?.({ parentId: people.id, daughterId: daughter.id, season: ctx.season, seasonOfYear: ctx.seasonOfYear, moved, comarcas, parentPopulation: populationOf(people) });
  };
}
