/**
 * Uniting: two peoples become one. M15 phase 32c, the half of mechanism 6 that joins (the half that divides is `PeopleSplit`).
 *
 * Two roads, the two the plan names that this model has the means for:
 *
 * - **Tribute that became membership.** A `tributary` relation that has lasted `ASSIMILATION_SEASONS` (about twenty years) between peoples
 *   that really touch (`ASSIMILATION_CONTACT`) may end with the vassal absorbed into the overlord (`ASSIMILATION_RATE` a season).
 * - **Alliance.** Two peoples not at war whose standing is `ALLIANCE_STANDING` or more and whose contact is `ALLIANCE_CONTACT` or more
 *   may become one (`ALLIANCE_RATE` a season). The larger absorbs the smaller (a tie goes to the lower id: a tie-break
 *   between equals, not a decision).
 *
 * **Both are refused if the merged people would at once be over the ceiling of its organisation** (`ORGANISATION_CEILING` of the techniques the
 * union would hold): that is the very condition under which `splitting` would divide it again, and without this guard a daughter
 * would rejoin its parent within years of leaving. A union therefore only happens where one society really can hold it.
 *
 * `PeopleSim.absorb` does the arithmetic and owns every consequence (population, comarcas, surplus, techniques, culture, relations).
 * Here the insight of the absorbed people towards techniques the host still lacks is kept (the higher of the two). One transaction per
 * relation and season (`transactionId` kind 4), and the mechanism stops as soon as it has merged: the updating people, or its
 * partner, may no longer exist.
 *
 * **Every rate is a design assumption, not a measurement**; exported by name. No technique, name, region or date decides anything.
 */
import { TechSet, closeUnderRequires, populationOf, organisationOf, type People, type PeopleRelation, type SeasonMechanism } from './PeopleSim.ts';
import { ORGANISATION_CEILING } from './PeopleSplit.ts';
import { transactionId } from './PeopleEconomy.ts';
import type { KnowledgeLedger } from './PeopleKnowledge.ts';

/** Seasons a tribute must have lasted before the vassal can be absorbed: 80 seasons, twenty years. */
export const ASSIMILATION_SEASONS = 80;
export const ASSIMILATION_CONTACT = 0.5;
export const ASSIMILATION_RATE = 0.05;
export const ALLIANCE_STANDING = 90;
export const ALLIANCE_CONTACT = 0.9;
export const ALLIANCE_RATE = 0.03;

export interface UnionEnv { readonly ledger?: KnowledgeLedger }
export interface UnionEvent {
  readonly kind: 'assimilated' | 'allied'; readonly relationId: number; readonly season: number;
  readonly hostId: number; readonly absorbedId: number; readonly population: number;
}

/** Whether `a` and `b` as one people would stay under the ceiling of the organisation their joint techniques make. */
export function unionFits(a: People, b: People): boolean {
  const joint = new TechSet(closeUnderRequires([...a.techs.list(), ...b.techs.list()]));
  return populationOf(a) + populationOf(b) <= ORGANISATION_CEILING[organisationOf(joint)];
}

export function uniting(env: UnionEnv = {}, report?: (e: UnionEvent) => void): SeasonMechanism {
  return ({ people, sim, season, step }) => {
    for (const rel of sim.relationsOf(people.id)) {
      const other = sim.peoples.get(rel.a === people.id ? rel.b : rel.a)!;
      const choice = chooseUnion(rel, people, other, step, sim.stepsPerSeason);
      if (!choice) continue;
      if (!unionFits(people, other)) continue;
      if (!sim.commit(transactionId(rel, season, 4), season)) continue;
      if (people.rng.next() >= choice.rate) continue;
      const [host, gone] = choice.host === people.id ? [people, other] : [other, people];
      if (env.ledger) {
        for (const tech of env.ledger.hinted(gone.id)) {
          const extra = env.ledger.insight(gone.id, tech) - env.ledger.insight(host.id, tech);
          if (extra > 0) env.ledger.addInsight(host.id, tech, extra);
        }
      }
      const population = populationOf(host) + populationOf(gone);
      sim.absorb(gone.id, host.id);
      report?.({ kind: choice.kind, relationId: rel.id, season, hostId: host.id, absorbedId: gone.id, population });
      return;   // one of the two is gone or changed: the update of this people is over
    }
  };
}

function chooseUnion(rel: PeopleRelation, x: People, y: People, step: number, stepsPerSeason: number):
    { kind: 'assimilated' | 'allied'; host: number; rate: number } | null {
  if (rel.stance === 'tributary' && rel.overlord !== null) {
    const seasons = (step - (rel.since ?? step)) / stepsPerSeason;
    if (seasons >= ASSIMILATION_SEASONS && rel.contact >= ASSIMILATION_CONTACT) return { kind: 'assimilated', host: rel.overlord, rate: ASSIMILATION_RATE };
    return null;
  }
  if (rel.stance !== 'war' && rel.standing >= ALLIANCE_STANDING && rel.contact >= ALLIANCE_CONTACT) {
    const px = populationOf(x), py = populationOf(y);
    const host = px > py ? x : py > px ? y : (x.id - y.id < 0 ? x : y);
    return { kind: 'allied', host: host.id, rate: ALLIANCE_RATE };
  }
  return null;
}
