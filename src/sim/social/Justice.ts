/**
 * The chief as judge — M12 phase 2b.
 *
 * The plan: "a victim can take the grievance to the chief (knowledge by
 * testimony, the owner's rule). The chief decides: compensation, public shame,
 * or exile. The first use of authority for something other than sending
 * people to work, and the seed of the written law M13 wants for
 * civilisation." Widened, by the owner's choice, to wrongs across a band
 * line: there a chief cannot order the culprit, and takes it up instead with
 * the culprit's own people, whose chief judges their own.
 *
 * **Every step is somebody telling somebody.** The chief knows of a wrong
 * because the one wronged came and said so (`complain`); another people's
 * chief knows because the first chief said so to one of theirs (`parley`) and
 * that person carried it home (`complain` again, with the demand in place of
 * a grievance). Nobody learns a case any other way — the owner's standing
 * rule, and the same one `Investigation.ts` holds a killing to.
 *
 * What a verdict *does* is `Simulation.hearComplaint`'s: it orders, shames
 * and moves standing, which are the simulation's business. This module only
 * decides, from what the judge knows and feels, and draws nothing.
 */
import type { Person } from '../entities/Person.ts';
import type { Debt } from './Amends.ts';
import type { RelationshipGraph } from './Relationships.ts';

/** A wrong a chief has been told of. */
export interface Case {
  plaintiffId: number;
  plaintiffBandId: number;
  accusedId: number;
  accusedBandId: number;
  kind: Debt['kind'];
  tick: number;
}

/**
 * How long a wrong is left for the culprit to put right before the one
 * wronged goes to the chief, in ticks: half a day. A theft is not taken to
 * the chief on the spot — there is a moment for the thief to think better of
 * it (`make_amends`, phase 2a) — but nor does anybody wait a season.
 */
export const COMPLAIN_AFTER = 120;

/** `complain`'s score before proximity; weighed by tradition and by how much it still rankles. */
export const COMPLAIN = 0.8;

/** Ticks to put a grievance to the chief once there. A little longer than a warning. */
export const COMPLAIN_TICKS = 14;

/** `parley`'s score before proximity; a chief puts a demand to another people when one of theirs is at hand. */
export const PARLEY = 0.7;

/** Ticks to put a demand to somebody of another people. */
export const PARLEY_TICKS = 16;

/**
 * How much more a chief must favour the accused than the one wronged before
 * they will not hear it, in opinion points (kinship counted at half). A chief
 * who dismisses his brother's theft is the oldest story of power there is,
 * and the plaintiff does not forget it (`DISMISSED_GRUDGE`).
 */
export const PARTIAL_AT = 25;

/** What being turned away by one's own chief costs the chief, in the plaintiff's eyes. */
export const DISMISSED_GRUDGE = 10;

/**
 * What a public shaming takes from the household of the shamed, in renown —
 * about what a theft costs it (`DEED_WEIGHT.theft` is 14 at full magnitude),
 * so being shamed for one is being known for it twice over. Renown is read
 * relative to the band's average (`Authority`, `BandSystem.chooseChief`), so
 * this is a household falling behind its neighbours, which is the point:
 * phase 2's gate asks for renown to diverge.
 */
export const SHAME_RENOWN = 12;

/** What a refused demand costs the two peoples' standing — a little under a stolen armful's worth, twenty times over. */
export const REFUSED_STANDING = 4;

/** How the judge leans between two people: positive toward the accused. */
export function favour(judge: Person, accused: Person, plaintiff: Person, rels: RelationshipGraph): number {
  const toward = (other: Person) =>
    rels.opinion(judge.id, other.id) + rels.kinship(judge.id, other.id) * 0.5;
  return toward(accused) - toward(plaintiff);
}

export type OwnVerdict = 'order' | 'shame' | 'dismiss' | 'exile';

/**
 * A chief judging a wrong between two of their own people.
 *
 * Dismissed if the chief leans far enough toward the accused. Otherwise amends
 * are ordered when the accused could pay them — the order is still theirs to
 * refuse (`Simulation.command`), and a refusal is shamed in its place — and
 * shamed outright when they could not.
 */
export function judgeOwn(
  chief: Person, plaintiff: Person, accused: Person, rels: RelationshipGraph, canPay: boolean
): OwnVerdict {
  if (favour(chief, accused, plaintiff, rels) > PARTIAL_AT) return 'dismiss';
  return canPay ? 'order' : 'shame';
}

export type DemandVerdict = 'order' | 'shame' | 'refuse';

/**
 * How far a chief must be moved to answer another people's demand: the
 * middle of `answerWeight`'s range, so that a chief of a people with an
 * ordinary regard for strangers, on ordinary terms with the people asking,
 * answers it — and one who thinks strangers fair game, or is at odds with
 * them, or thinks the world of the accused, does not.
 */
export const ANSWER_AT = 0.5;

/**
 * A chief answering another people's demand against one of their own.
 *
 * Three things move them. Their people's regard for strangers (phase 2d):
 * among a people that thinks a stranger fair game, a demand for a stranger's
 * goods is a joke. How the two peoples stand: nobody pays the people they are
 * at war with, and everybody pays the one they are courting. And how they
 * feel about the accused, whom a chief is disposed to protect. Past
 * `ANSWER_AT`, amends are ordered if the accused could pay and the accused
 * shamed if not; short of it, the demand is refused, and the peoples' standing
 * pays for it.
 */
export function answerDemand(
  chief: Person, accused: Person, strangerRegard: number, standing: number,
  rels: RelationshipGraph, canPay: boolean
): DemandVerdict {
  const weight = answerWeight(chief, accused, strangerRegard, standing, rels);
  if (weight < ANSWER_AT) return 'refuse';
  return canPay ? 'order' : 'shame';
}

/**
 * How warmly a chief regards any one of their own people before they would
 * go out of their way to shield them, in opinion points. **Measured**: the
 * mean opinion inside a band on `century` is about 43 — founders who know
 * each other (phase 1) and years of living together — and the first version
 * counted all of it as protectiveness, so every chief shielded every member
 * and nine demands in ten were refused. Only regard *past* the ordinary is a
 * chief taking somebody's side.
 */
export const ORDINARY_REGARD = 40;

/** `answerDemand`'s reckoning, alone, for the tests and `npm run why`. */
export function answerWeight(
  chief: Person, accused: Person, strangerRegard: number, standing: number, rels: RelationshipGraph
): number {
  const protect = Math.max(0,
    rels.opinion(chief.id, accused.id) + rels.kinship(chief.id, accused.id) * 0.5 - ORDINARY_REGARD) / 100;
  return strangerRegard + standing / 200 + (chief.traits.tradition - 0.5) * 0.4 - protect * 0.5;
}
