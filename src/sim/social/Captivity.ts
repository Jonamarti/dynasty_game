/**
 * Captivity. M11 phase 15d — the old phase 11d, folded into phase 15 because
 * the owner's note 9 gave it a second source.
 *
 * **What a captive is.** A person taken by another band and made to live and
 * work among them. Mechanically, a member of the captor band — `bandId` is
 * theirs — which is what makes the forced labour cost nothing new to write:
 * everything a member gathers goes into that band's stores, they shelter
 * under its roofs, its chief can put them to work, and the witness's ladder
 * treats them as one of its own. What marks them out is `captiveOf` (the band
 * holding them) and `captiveFrom` (the band they were taken from), and what
 * they are denied: they are never chief, never called to a war party, never
 * cast out or leave in a huff, and their household stays the one they were
 * taken from, so they head no house among their captors.
 *
 * **Two ways in, from the first day, both through a rope.** A person tied up
 * (`bind`, phase 15c) by somebody of another band becomes that band's
 * captive: an outsider caught at the owners' store and held down, or — the
 * raid's source — a defenceless member of a people this one is at odds with,
 * held and tied by somebody who carried a rope for it.
 *
 * **One way out: not being watched.** The exact mirror of `mayUse`: property
 * is protected by attention, not permission, and so is a prisoner. A captive
 * with nobody of the captor band in sight slips away; one with a captor
 * watching does not try. Once away they are an outcast walking home, and home
 * takes them back through the door phase 5f built — `considerAdoption` —
 * which returns them to the household they were taken from rather than
 * founding a new one.
 *
 * Nothing here draws a random number.
 */
import type { Person } from '../entities/Person.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';

/** Whether somebody is being held captive right now. */
export function isCaptive(person: Person): boolean {
  return person.captiveOf !== null && person.bandId === person.captiveOf;
}

/**
 * Whether somebody is an escaped captive still on the way home — an outcast
 * who remembers where they were taken from.
 */
export function isEscapee(person: Person): boolean {
  return person.captiveOf === null && person.captiveFrom !== null;
}

/**
 * The nearest member of the captor band who could see this captive slip
 * away, or null if nobody is watching. Other captives do not count: nobody
 * guards a prisoner on behalf of the people who took them both.
 */
export function captorWatching(
  captive: Person, peopleHash: SpatialHash<Person>, sightRadius: number
): Person | null {
  return peopleHash.findNearest(captive.x, captive.y, sightRadius, other =>
    other.alive && other.id !== captive.id && other.bandId === captive.bandId &&
    other.captiveOf === null && !other.isChild);
}

/**
 * How strongly an unwatched captive is moved to slip away. Above a day's
 * work, because it is the one thing on a captive's mind; scaled down by fear
 * in `Brain`, because a cowed prisoner does not run.
 */
export const ESCAPE = 1.6;

/**
 * How strongly an escapee keeps walking home. The same order, so the walk is
 * picked back up after every drink it is broken off for.
 */
export const ESCAPE_HOME = 1.4;

/**
 * How close to their old camp an escapee has to come before they stop and
 * wait to be taken back. Inside `ADOPTION_RADIUS` (30), which is how far a
 * band looks for somebody to take in.
 */
export const HOME_REACHED = 18;

/**
 * How strongly somebody with a rope is moved to take a defenceless member of
 * a people they are at odds with, as a multiple of what the predation route
 * would offer to beat them. Above one: with a rope in hand a captive is worth
 * more than a beating, and choosing capture over the blow is what keeps this
 * route from adding to the killing.
 */
export const CAPTURE_OVER_PREDATION = 1.3;

/**
 * How strongly a raider with a rope is moved to take somebody of the people
 * they came to raid — the raid's own way into captivity, which does not wait
 * for a defenceless victim the way `CAPTURE_OVER_PREDATION` does: a raider
 * takes whoever the party can overpower between them. The same order as the
 * witness's hold (`CAUGHT_RESTRAIN`), so on enemy ground it is the thing on a
 * raider's mind.
 *
 * **Measured, and the reason it exists**: with captives coming only through
 * predation, `captives-are-taken` failed on `lean`, `millers` and `feasts` —
 * capture inherited predation's rarity by construction, and the organised
 * raid the plan names as captivity's first source had no path to it at all.
 */
export const RAID_CAPTURE = 1.4;
