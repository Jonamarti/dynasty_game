/**
 * Defending what is yours: the witness's ladder. M11 phase 15b (owner's note 9).
 *
 * The note: whoever sees somebody use, take or wreck what belongs to their
 * people should be able to do something about it — threaten and then strike
 * an outsider, hold back one of their own, and call for help when the
 * offender is too strong to hold alone. Phase 15a made the offence possible
 * in front of the owners; this is what the owners get to do in return.
 *
 * **Everything starts from having seen it.** The one writer, `noteCaught`, is
 * called from `SocialSystem.emit`'s witness loop, which is the only place in
 * the simulation that knows who was in sight of a deed at the moment it
 * happened. Nobody learns of an offence any other way except by being told —
 * the owner's standing rule — and the one telling this module adds is the
 * caller of `call_for_help` passing on, to whoever answers, who it was.
 *
 * **The rungs arrive one commit at a time** so that each one's effect on the
 * world can be measured alone, the same discipline phase 14 followed. 15b.1
 * wrote who each witness caught and nothing read it; 15b.2 is the outsider's
 * rung — warned off, then struck if they stay — in `Brain`, reusing the `warn`
 * verb and the bookkeeping of phase 14b's defence of the ground.
 *
 * Nothing here draws a random number.
 */
import type { Person } from '../entities/Person.ts';
import type { Building } from '../entities/Building.ts';
import type { EventType } from './Events.ts';
import { telemetry } from '../core/Telemetry.ts';

/**
 * The deeds that give a witness a reason to intervene: the three against
 * property, the note's own list. A blow is not here — violence already has its
 * own answers in revenge, flight and the defence of the ground (phase 14b) —
 * and neither is a killing, whose victim is past defending.
 */
export const INTERVENABLE: ReadonlySet<EventType> = new Set<EventType>(['theft', 'trespass', 'sabotage']);

/**
 * How long a witness goes on holding it against the offender, in ticks: half
 * a day. Long enough to cross a camp, finish a drink and come back to it; short
 * enough that a theft seen at dawn is not a reason to tackle the thief at dusk
 * — by then it is a grudge, and grudges already have `attack`'s revenge route.
 */
export const CAUGHT_MEMORY = 120;

/**
 * How strongly having seen it moves a witness to warn the offender off.
 *
 * Scored as `CAUGHT_WARN × (1 + fear) × (0.5 + aggression)`, so a calm,
 * mild witness offers about 1.5 near the offender — above a day's ordinary
 * work, which is the point. **Measured, not guessed**: at 1.5 × (0.5 + fear),
 * the shape first written, a calm witness offered 0.70 against 0.86 for the
 * tree they were felling, and went on chopping wood three tiles from a
 * stranger they had just watched rob their store. Whoever has just seen it
 * drops what they are doing; how *hard* they then press it is fear's and
 * temper's business, which is what the other two terms are for.
 */
export const CAUGHT_WARN = 1.5;

/**
 * Records that `witness` saw `offender` commit a deed against their people.
 *
 * Whose property it was is the caller's question — `emit` knows the owning
 * band of a building and the band of a victim — so this only asks whether the
 * witness is somebody who would step in at all. A child does not; neither does
 * anybody of the offender's own band watching one of their own rob strangers,
 * which is the caller's `belongs` test and not this function's.
 */
export function noteCaught(witness: Person, offender: Person, type: EventType, tick: number): void {
  if (!INTERVENABLE.has(type)) return;
  if (witness.isChild || !witness.alive || witness.id === offender.id) return;
  witness.caughtId = offender.id;
  witness.caughtTick = tick;
  telemetry.count(witness.bandId === offender.bandId ? 'caught_own' : 'caught_outsider');
}

/** Whom `person` caught in the act and still holds it against, if anyone. */
export function caughtOffender(person: Person, tick: number): number | null {
  if (person.caughtId === null) return null;
  return tick - person.caughtTick <= CAUGHT_MEMORY ? person.caughtId : null;
}

/**
 * Whether `person` is, right now, in the middle of using something that
 * belongs to `bandId` — the ladder's test for "still at it", asked by `Brain`
 * before the strike and by `doWarn` before the offender gives way.
 *
 * `propertyUseNoted` is set only once a foreign use has become a deed and is
 * cleared by `finish` with the rest of the action, so somebody still walking
 * towards the store does not count. `buildingById` is how each caller looks a
 * building up: the scorer has a list, the executor a map.
 */
export function usingPropertyOf(
  person: Person,
  bandId: number,
  buildingById: (id: number) => Building | undefined
): boolean {
  if (person.propertyUseNoted === null || person.targetBuildingId === null) return false;
  return buildingById(person.targetBuildingId)?.ownerBandId === bandId;
}
