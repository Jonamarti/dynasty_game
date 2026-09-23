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
 * verb and the bookkeeping of phase 14b's defence of the ground. 15b.3 is the
 * rung for one of the witness's own people: `restrain`, a struggle that ends
 * with the offender held rather than hurt. Holding somebody is also the state
 * phase 15c's binding needs — "several of them bringing one down" — which is
 * why it is a state on the held person and not only an outcome.
 * 15b.4 is the last rung: `call_for_help`, for the witness who cannot hold
 * the offender alone, and `answer_call` for whoever hears it. Phase 15e gives
 * the ladder somebody standing where offences happen: the guard.
 *
 * Phase 15c is what comes after a hold: `bind`, by somebody who knows
 * `cordage` and carries a rope, which it spends. Tied up is a state of its
 * own beside held — it does not need anybody to keep it up, and it outlasts
 * the hold by a long way.
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

/**
 * The struggle before somebody is held, in ticks — a scuffle, not a fight.
 * Well under the ceiling `AGENTS.md` sets for an uninterrupted pull, and
 * checked for interruption every tick anyway, like every wind-up.
 */
export const RESTRAIN_TICKS = 8;

/**
 * How long a won struggle holds somebody, in ticks: a quarter of an hour of
 * the day's two hundred and forty. Long enough to stop what they were doing
 * and for anybody who knows how to bind them to do it (phase 15c); short
 * enough that holding a bandmate is a rebuke, not an imprisonment.
 *
 * The hold is **kept up by the holder**, not set once: every tick of the
 * holder's `restrain` renews it for `HOLD_RENEW` ticks, so a holder who is
 * interrupted, or dies, or is dragged off by thirst lets go within two ticks.
 * A hold that outlived the person doing the holding would be a spell.
 */
export const HOLD_TICKS = 60;
export const HOLD_RENEW = 2;

/**
 * The longest a holder keeps it up while somebody is coming with a rope
 * (phase 15c): three times the ordinary hold, well under the ceiling
 * `AGENTS.md` sets for an uninterrupted pull, and the interruption check
 * still runs every tick of it.
 */
export const HOLD_FOR_ROPE = HOLD_TICKS * 3;

/**
 * How strongly having caught one of their own at it moves a witness to hold
 * them back. The same order as `CAUGHT_WARN`, for the same reason — whoever
 * has just seen it drops what they are doing — with loyalty in place of
 * temper: holding back a bandmate is an act on the band's behalf, and a
 * disloyal witness shrugs.
 */
export const CAUGHT_RESTRAIN = 1.5;

/**
 * The share of the offender's fighting power a witness must be able to bring
 * — themselves plus the bandmates standing by them — before they will try. A
 * witness who cannot hope to hold the offender does not try (phase 15b.4 has
 * them call for help instead); one roughly as strong goes in, because a
 * struggle is not a blow and losing it costs nothing but the attempt.
 */
export const RESTRAIN_NERVE = 0.8;

/**
 * Whether somebody is being held or is tied up right now. Both stop a person
 * thinking and acting; `isBound` tells the second apart.
 */
export function isHeld(person: Person, tick: number): boolean {
  return (person.heldBy !== null && person.heldUntil >= tick) || isBound(person, tick);
}

/** Whether somebody is tied up right now — M11 phase 15c. */
export function isBound(person: Person, tick: number): boolean {
  return person.boundBy !== null && person.boundUntil >= tick;
}

/**
 * Tying somebody up, in ticks, once they are held. Short, and checked for
 * interruption every tick like any wind-up.
 */
export const BIND_TICKS = 12;

/**
 * How long a rope holds somebody, in ticks: a day. They work free of it on
 * their own after that — nobody has to come and untie them, which is a
 * mechanism this phase does not need. Phase 15d is what gives a day tied up a
 * consequence beyond itself: taking them home.
 *
 * A day is about twenty points of thirst for a novice, so a person tied up
 * with water in them comes to no harm from the rope alone, and one tied up
 * already parched is in real danger — which is how it should read.
 */
export const BOUND_TICKS = 240;

/**
 * How strongly somebody with a rope is moved to tie up a person one of their
 * own is holding. Below `CAUGHT_RESTRAIN`: the hold is what matters, and
 * tying comes after it.
 */
export const BIND_HELD = 1.2;

/**
 * A shout, in ticks — long enough for the interruption check to run.
 */
export const CALL_TICKS = 4;

/**
 * How long a call for help is worth answering, in ticks, and how long a
 * caller waits before calling again. A quarter of an hour: a shout is not a
 * summons that stands all afternoon.
 */
export const CALL_MEMORY = 60;

/**
 * How strongly a call moves the person who heard it: the same order as the
 * witness's own rungs, with loyalty for the same reason `restrain` reads it.
 * Scored with `proximityBonus`, so the nearest bandmate is the likeliest to
 * come, which is what a shout in a camp is.
 */
export const ANSWER_CALL = 1.4;

/**
 * How strongly a witness who cannot hold one of their own calls for help.
 * Just under `CAUGHT_RESTRAIN`: a witness who can hold them does that
 * instead, and nothing here needs to compete with it.
 */
export const CALL_FOR_HELP = 1.3;

/**
 * Records that `hearer` heard `caller` call for help. **Not what for**: the
 * owner's rule applied to sound — whoever comes finds out by being told when
 * they arrive (`ActionSystem.doAnswerCall`), not from the shout.
 */
export function noteCall(hearer: Person, caller: Person, tick: number): void {
  if (hearer.isChild || !hearer.alive || hearer.id === caller.id) return;
  hearer.helpCallerId = caller.id;
  hearer.helpCallTick = tick;
}

/** Who `person` heard calling for help and could still answer, if anyone. */
export function helpCaller(person: Person, tick: number): number | null {
  if (person.helpCallerId === null) return null;
  return tick - person.helpCallTick <= CALL_MEMORY ? person.helpCallerId : null;
}

/**
 * How strongly a guard is moved to walk the band's ground, before the job's
 * own lean (`JOB_BIAS_UP`) — the same order as a day's ordinary work, so a
 * guard patrols most of the day and still drinks, eats and talks. Only a
 * guard scores it at all: nobody else has been asked to.
 */
export const PATROL = 0.6;

/**
 * How far out from camp a guard walks, as a share of `TERRITORY_RADIUS`:
 * past the inner third where the defence of the ground (14b) is at full
 * weight, and well inside the edge, so what a guard sees is what the band
 * would call its own.
 */
export const PATROL_REACH = 0.5;

/** Ticks a guard stands and looks at each point of the round. */
export const PATROL_LINGER = 40;

/**
 * Security a guard's warning gives back to each of their own people who see
 * it — "their threat raises the security of their own", M11 phase 15e. A
 * third of what seeing an outsider hurt one of your own takes away
 * (`FEAR_AS_WITNESS`): watching somebody see off a stranger is reassuring,
 * and less so than the harm it answers is frightening.
 */
export const GUARD_REASSURES = 3;

/** One guard for every this many members, at most. */
export const MEMBERS_PER_GUARD = 8;
