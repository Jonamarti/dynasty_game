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
import type { EventType, Norms, SocialEvent } from './Events.ts';
import { DEED_WEIGHT } from './Events.ts';
import { telemetry } from '../core/Telemetry.ts';

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

/**
 * Multiplier on anything predatory: 1 for somebody never corrected.
 *
 * M12 phase 2d: two consciences, not one — what a child was corrected for
 * doing to their own people, and what to strangers. `abroad` picks which a
 * deed answers to. See "Culture" below for why they had to come apart.
 */
export function conscienceBrake(person: Person, abroad = false): number {
  return 1 - Math.min(1, abroad ? person.conscienceAbroad : person.conscience) * CONSCIENCE_HOLD;
}

/**
 * How hard an adult's upbringing holds them back from preying on strangers,
 * M12 phase 2d. Far less than `CONSCIENCE_HOLD`: against another people the
 * owner's note puts need and mutual hatred first, and a well-raised man who is
 * starving still takes from a stranger's pack. What upbringing changes is the
 * rest — the idle theft, the hut wrecked for a grudge.
 */
export const ABROAD_HOLD = 0.6;

/** Multiplier on an adult's predatory verbs against another people. */
export function strangerBrake(person: Person): number {
  return 1 - Math.min(1, person.conscienceAbroad) * ABROAD_HOLD;
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

// ---------------------------------------------------------------------------
// Culture — M12 phase 2d
// ---------------------------------------------------------------------------

/**
 * **Regard for strangers**: how much a people minds a wrong done by one of its
 * own to somebody of another people, 0 to 1. Drawn per band at founding
 * (`Simulation.spawnCulture`, on its own stream), a bell curve like every
 * other trait in this game.
 *
 * The plan's 2d: "a band tolerant of theft from strangers does not correct a
 * child for robbing strangers — so two cultures raise different adults, the
 * germ of the cultural difference the world map will need". Before this every
 * band corrected every child for every wrong against anybody, identically,
 * and judged its own for wronging a stranger by one constant
 * (`OUR_OWN_AGAINST_OUTSIDERS`). Measured on `century` before phase 2d:
 * **no** theft or blow inside a band at all, and about 1,600 sabotages and
 * 340 trespasses of other peoples' buildings *by children* in three runs —
 * the whole of what a band's correcting of its children now meets is
 * conduct toward strangers, and that is exactly where cultures differ.
 *
 * One axis, read in three places: how an adult is judged for it
 * (`partiality`), whether a child is corrected for it (`noteMischief`), and
 * so what kind of adult the child grows into (`conscienceAbroad`,
 * `strangerBrake`).
 */
export const STRANGER_REGARD_MEAN = 0.5;
export const STRANGER_REGARD_SPREAD = 0.2;

/**
 * How gravely a band takes a wrong of `type` against a victim of
 * `victimBandId`, before anybody's temperament: its norm for the deed, times
 * its regard for strangers when the victim was one. The deeds outside
 * `VARIABLE_NORMS` — sabotage, trespass — sit at 1 like everybody's.
 */
export function wrongWeight(
  bandId: number, norms: Norms | undefined, strangerRegard: number,
  type: EventType, victimBandId: number | null
): number {
  const norm = norms ? norms[type] : 1;
  return victimBandId !== null && victimBandId !== bandId ? norm * strangerRegard : norm;
}

/**
 * How gravely a witness must take a child's wrong against a stranger, all
 * told, to go and correct them — the band's weight (`wrongWeight`) times how
 * much this witness holds to the ways of their people, `0.5 + tradition`.
 *
 * At the middle of the curve on purpose, so that the share of such wrongs a
 * people minds moves the whole way along its regard for strangers: about
 * half its adults at 0.5, nearly all at 0.7, almost none below 0.4. **First
 * set at 0.3, and measured to do nothing**: every people above 0.3 minded
 * nearly every wrong, `craft`'s band at 0.37 minded 212 of 215 and its band
 * at 0.71 all 115, and cultures a third of the curve apart raised the same
 * children.
 *
 * Wrongs against one's own people are not weighed here at all — see
 * `noteMischief`.
 */
export const MINDS_AT = 0.5;

/** A band's culture as `noteMischief` reads it. */
export interface Culture {
  norms: Norms | undefined;
  strangerRegard: number;
}

/**
 * `witness` saw `child` do `type`: if the child is one of their own people,
 * the deed was a wrong, and their people's ways say it was one worth
 * correcting, it is theirs to deal with. The owner's rule holds — only
 * somebody who saw it, or was the one wronged, ever learns of it here.
 *
 * `victimBandId` is whose the harm was (`SocialEvent.victimBandId`); it is
 * also which conscience the correction will teach — see `ActionSystem.doCorrect`.
 * `culture` null is the old rule, every wrong minded — kept for callers with
 * no band to read, and for the tests that pin the rule down.
 */
export function noteMischief(
  witness: Person, child: Person, type: EventType, tick: number,
  culture: Culture | null = null, victimBandId: number | null = null
): void {
  if (!child.isChild || witness.isChild || !witness.alive || witness.id === child.id) return;
  if (witness.bandId !== child.bandId || DEED_WEIGHT[type] >= 0) return;
  const abroad = victimBandId !== null && victimBandId !== witness.bandId;
  // Only a wrong against another people is a question of culture. Against
  // one's own it is always minded — the owner's note of 2026-09-24, "the
  // members of the tribe correct them" — and a people that shrugs at theft
  // still does not leave a child robbing its neighbours uncorrected.
  if (abroad) {
    const minded = culture === null ||
      wrongWeight(witness.bandId, culture.norms, culture.strangerRegard, type, victimBandId) *
        (0.5 + witness.traits.tradition) >= MINDS_AT;
    // Per band, so `upbringing-follows-culture` can set each people's share
    // of wrongs minded against its regard for strangers. Counted whether or
    // not a culture was read, so a build that stops reading it shows every
    // people minding everything — and fails the check — rather than n/a.
    telemetry.count('mischief_abroad_seen_b' + witness.bandId);
    if (minded) telemetry.count('mischief_abroad_minded_b' + witness.bandId);
    if (!minded) return;
  }
  witness.mischiefId = child.id;
  witness.mischiefTick = tick;
  witness.mischiefAbroad = abroad;
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
  observer: Person, actor: Person, event: Pick<SocialEvent, 'type' | 'targetId' | 'victimBandId'>,
  strangerRegard = STRANGER_REGARD_MEAN
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
    // M12 phase 2d: a quarter at the middle of the curve, as before; more
    // among a people who think a stranger is owed what a neighbour is, less
    // among one that thinks a stranger is owed nothing.
    weight *= Math.min(1, OUR_OWN_AGAINST_OUTSIDERS * strangerRegard / STRANGER_REGARD_MEAN);
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
