/**
 * Why a band does not fall on its own — the owner's note of 2026-09-24.
 *
 * The note, in their words: tribes began by cooperating, even building the same
 * things, and then turned on each other — on members of their own band, and on
 * their own children. "That is not how it was." Measured on `century` before
 * this module existed: of 1018 blows chosen, **534 were aimed at a child** and
 * 277 at somebody of the attacker's own band, and a fifth of all deaths were
 * murders. The predation route never fired once; every one of those blows was
 * *revenge*, which is to say the grievances were real, and the defect was in
 * what produced them and in what a grievance was allowed to lead to.
 *
 * Three findings, each answered here:
 *
 * 1. **A band judged its own for what they did to strangers.** A man who
 *    wrecked a rival's hut, or a child who slept under a rival's roof, was
 *    held in exactly the contempt a stranger doing it to *us* would earn.
 *    `century` had a boy of ten whose own bandmate had marked him down to -91
 *    for nine sabotages of a *rival's* buildings, and a child with fourteen
 *    trespasses against one. `partiality` below is how much of a deed's weight
 *    an observer actually feels, and for one of ours against one of theirs it
 *    is a quarter — and nothing at all if the stranger had it coming.
 *
 * 2. **Children were answered as adults are.** A child who stole was beaten,
 *    by the same revenge route that answers a grown thief. The owner: "if a
 *    child does something wrong, the members of the tribe correct them, and
 *    the child does not do it again." So a child's deed weighs little with
 *    their own band (`CHILD_LENIENCY`), no blow chosen by `Brain` is ever
 *    aimed at a child, and an adult who sees one of the band's children at
 *    it goes over and *corrects* them — `ActionSystem.doCorrect`, which raises
 *    the child's `conscience`. Conscience is kept for life: a well-raised
 *    child grows into an adult who does not rob their own people.
 *
 * 3. **Half of everybody was eligible to do anything.** Traits are drawn as a
 *    bell curve around 0.5, which is the shape the owner asked for; but the
 *    gates that read them sat at the middle of the curve. The owner's
 *    figure for somebody who robs or attacks their own people is "maybe one in
 *    a hundred", which is the far tail rather than the middle: `IN_GROUP_TAIL`.
 *    Outsiders are different, and the note says so — stealing from another
 *    tribe "depends more on need and on whether they hate each other" — so
 *    nothing here touches a deed against another people.
 *
 * Pure functions of their arguments. Draws nothing, so it cannot move a
 * stream.
 */
import type { Person } from '../entities/Person.ts';
import type { EventType, SocialEvent } from './Events.ts';
import { DEED_WEIGHT } from './Events.ts';

/**
 * Where on the bell curve somebody becomes willing to harm their own people
 * without being driven to it.
 *
 * Traits are drawn `gaussian(0.5, 0.18)`, so 0.9 is about 2.2 standard
 * deviations out: roughly one person in seventy-five, which is the owner's
 * "one in a hundred" and a little over. `inheritTraits` keeps the spread
 * there across generations — see its comment for why it used to narrow.
 */
export const IN_GROUP_TAIL = 0.9;

/**
 * How far into the tail a trait must sit before the licence is whole.
 *
 * **Measured**: the first version ramped linearly from `IN_GROUP_TAIL` to 1,
 * so the few people past the line held a licence of 0.1 or 0.2, which every
 * other term in the scorer then multiplied down to nothing — across twenty
 * `century` seeds not one blow and not one theft landed inside a band. The
 * owner asked for one in a hundred, not none in a thousand. So the ramp is
 * short: somebody clearly in the tail is somebody who really will.
 */
export const TAIL_RAMP = 0.04;

/** How far past `IN_GROUP_TAIL` a trait sits, 0 to 1. Zero for nearly everyone. */
export function tailLicence(trait: number): number {
  return Math.max(0, Math.min(1, (trait - IN_GROUP_TAIL) / TAIL_RAMP));
}

/**
 * Hunger at which somebody will take from their own people whatever their
 * temperament. A starving person robs their neighbour; a hungry one asks.
 * Above `Brain`'s "hungry" (0.5) on purpose — need drives most theft between
 * peoples, and that is left alone; this is only the line inside one.
 */
export const DESPERATE_AT = 0.8;

/**
 * Whether, and how much, `person` is willing to take from or menace one of
 * their own band: the tail of the relevant trait, or desperation, whichever
 * is larger, and then whatever their upbringing left of it.
 *
 * `trait` is `greed` for a theft and `aggression` for a threat or a blow.
 * `hunger` is the 0-1 need, so a well-fed person gets nothing from it.
 */
export function ownPeopleLicence(person: Person, trait: number, hunger: number): number {
  const desperate = Math.max(0, (hunger - DESPERATE_AT) / (1 - DESPERATE_AT));
  return Math.max(tailLicence(trait), desperate) * conscienceBrake(person);
}

/**
 * What one correction adds to a child's `conscience`, and how hard a full
 * conscience holds a person back. One correction more than halves the appetite;
 * a second all but ends it — "and the child does not do it again".
 */
export const CORRECTION_STEP = 0.6;
export const CONSCIENCE_HOLD = 0.95;

/** Multiplier on anything predatory: 1 for somebody never corrected. */
export function conscienceBrake(person: Person): number {
  return 1 - Math.min(1, person.conscience) * CONSCIENCE_HOLD;
}

/**
 * How long `correct` takes once the adult has reached the child, in ticks. A
 * few words and a hand on the shoulder: about as long as a warning.
 */
export const CORRECT_TICKS = 6;

/**
 * `correct`'s score: above ordinary work, below anything a need is shouting
 * for — a parent stops what they are doing to deal with it, but not while
 * dying of thirst. Scaled by loyalty in `Brain`, like every other rung of the
 * witness's ladder.
 */
export const CORRECT = 1.4;

/** How long an adult remembers a child's misdeed as something to deal with. */
export const MISCHIEF_MEMORY = 240;

/**
 * `witness` saw `child` do `type`: if the child is one of their own people and
 * the deed was a wrong, it is theirs to deal with. The owner's rule holds —
 * only somebody who saw it, or was the one wronged, ever learns of it here.
 */
export function noteMischief(witness: Person, child: Person, type: EventType, tick: number): void {
  if (!child.isChild || witness.isChild || !witness.alive || witness.id === child.id) return;
  if (witness.bandId !== child.bandId || DEED_WEIGHT[type] >= 0) return;
  witness.mischiefId = child.id;
  witness.mischiefTick = tick;
}

/** The child `person` means to correct, if they still remember why. */
export function mischiefChild(person: Person, tick: number): number | null {
  if (person.mischiefId === null) return null;
  return tick - person.mischiefTick <= MISCHIEF_MEMORY ? person.mischiefId : null;
}

/**
 * How much of a child's misdeed their own band holds against them. A child who
 * steals is corrected; they do not become an enemy for it. Not zero — the
 * owner's note is that the tribe *notices*, and something must remain for the
 * victim to be annoyed about.
 */
export const CHILD_LENIENCY = 0.15;

/** A child of another people is still a child. */
export const FOREIGN_CHILD_LENIENCY = 0.5;

/**
 * How much of a harm one of ours did to one of theirs weighs with us. Not zero:
 * a bandmate who beats a stranger for nothing is somebody to be a little wary
 * of. But nowhere near what the same blow would cost them if it landed on us.
 */
export const OUR_OWN_AGAINST_OUTSIDERS = 0.25;

/** The deeds after which a stranger "had it coming" when one of ours answers. */
const WRONGS: ReadonlySet<EventType> = new Set<EventType>([
  'theft', 'trespass', 'sabotage', 'assault', 'murder', 'threaten',
]);

/**
 * How much of a deed's weight `observer` feels, 0 to 1 — `SocialSystem.absorb`
 * multiplies its delta by this, for harmful deeds only. Kindness is felt in
 * full whoever does it.
 *
 * `victimBandId` is the band the deed was done against: the target's, or the
 * owner's for a deed against a building. Null when nobody's.
 */
export function partiality(
  observer: Person, actor: Person, event: SocialEvent
): number {
  if (DEED_WEIGHT[event.type] >= 0) return 1;
  // Whoever it was done to always feels it in full; the victim's own view is
  // the one thing no loyalty softens. A child who robs you is still a child
  // (below), but you are not a bystander.
  if (event.targetId === observer.id) {
    return actor.isChild && actor.bandId === observer.bandId ? CHILD_LENIENCY * 3 : 1;
  }
  let weight = 1;
  if (actor.isChild) {
    weight *= actor.bandId === observer.bandId ? CHILD_LENIENCY : FOREIGN_CHILD_LENIENCY;
  }
  const victimBandId = event.victimBandId;
  if (actor.bandId === observer.bandId && victimBandId !== null && victimBandId !== observer.bandId) {
    // One of ours, against one of theirs. The owner's note 5: nobody of the
    // band should think less of somebody for going after a stranger who was
    // wrecking the band's buildings, attacking its people or robbing them.
    if (event.targetId !== null && hadItComing(observer, event.targetId)) return 0;
    weight *= OUR_OWN_AGAINST_OUTSIDERS;
  }
  return weight;
}

/**
 * Whether `observer` knows `subjectId` to have wronged `observer`'s own people.
 * Read off their own memory — seen or told, the owner's rule — so a band that
 * never heard of the theft still sees an unprovoked beating.
 */
export function hadItComing(observer: Person, subjectId: number): boolean {
  for (const memory of observer.memory.all()) {
    if (memory.actorId !== subjectId || !WRONGS.has(memory.type)) continue;
    if (memory.victimBandId === observer.bandId) return true;
  }
  return false;
}
