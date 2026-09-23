/**
 * Fear: who is afraid, and of whom. M11 phase 14 (owner's note 7).
 *
 * The note, whole: with little fear people talk to strangers and range far
 * from home; with a lot, they keep to their own ground, will not talk to
 * outsiders, huddle with their own and may attack whoever comes in. Hatred
 * between groups is to grow out of *concrete incidents*, segregation out of
 * that, and raiding out of what a band lacks at home. And everything by the
 * owner's standing rule: nobody fears what they have not seen or been told.
 *
 * Two layers, deliberately kept apart:
 *
 * - **General fear** is `Person.mood.security`, the channel M9.6 phase 4a
 *   built for exactly this ("recent harm, threats, strangers in camp") and
 *   left without a single writer. Low security is fear. It decays toward the
 *   temperament baseline with the rest of the mood (`decayMood`), so a band
 *   that stops being hurt stops being frightened — the thing the constant
 *   out-group term phase 7 removed could never do.
 * - **Fear of somebody** is `Relationship.dread`, fed only by what that person
 *   did to *you*. It is not part of `opinion`: the bully is hated *and*
 *   feared, and "do I want to hurt them" and "do I want to be near them" are
 *   different questions that different verbs ask.
 *
 * **Phase 14a was inert.** It wrote both and nothing read either; the
 * readers arrive one commit at a time in 14b so that each one's effect on the
 * world can be measured alone. Each says which reader it is where it reads.
 *
 * Nothing here draws a random number. The sighting pass is a pure function of
 * where people stand, which is why it may run on `Simulation`'s own cadence
 * without a stream of its own.
 */
import type { Person } from '../entities/Person.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { RelationshipGraph } from './Relationships.ts';
import type { EventType, SocialEvent } from './Events.ts';
import { telemetry } from '../core/Telemetry.ts';

/**
 * How frightening each deed is, relative to a beating. Only deeds that put a
 * person or their goods in danger frighten anybody; a gift or a slander does
 * not make anyone afraid to walk home.
 *
 * Theft is the lightest: it takes, it does not hurt. A killing is the heaviest
 * for whoever sees or hears of one — its victim is past being afraid.
 */
export const FEARED: Partial<Record<EventType, number>> = {
  assault: 1,
  murder: 1.4,
  threaten: 0.7,
  theft: 0.4,
};

/**
 * Security lost by the victim of a feared deed, per unit of `FEARED` at full
 * magnitude. A quarter of the scale: one beating takes a person from calm to
 * wary, two from wary to afraid, and `decayMood` brings them back in about a
 * fortnight if nothing else happens.
 */
export const FEAR_AS_VICTIM = 25;

/**
 * Security lost by somebody who *sees* an outsider do it to one of their own
 * band. Less than being the victim, more than hearing of it — the same order
 * `absorb` already weighs opinion in, victim ×3 against a witness.
 */
export const FEAR_AS_WITNESS = 10;

/**
 * A feared deed arriving as a story, per unit of the teller's confidence.
 * `HEARSAY_WEIGHT`'s own share of a witness, so a rumour frightens exactly as
 * much less than sight as it offends less than sight.
 */
export const FEAR_BY_HEARSAY = 10 * 0.45;

/**
 * Dread of the person who did it, felt by their victim only, per unit of
 * `FEARED` at full magnitude. On `Relationship.dread`'s 0-100 scale: one
 * beating is a person you step around, three are somebody you flee from.
 */
export const DREAD_AS_VICTIM = 30;

/**
 * Security lost for each outsider seen standing inside one's own band's
 * territory, per sighting pass. Slight, and cumulative on purpose: the note's
 * segregation is meant to *grow*, and one stranger crossing the meadow once
 * should be forgotten by the next day.
 *
 * Measured down from four times this before anything read it. At 0.6 a pass,
 * with territories forty tiles wide on islands where three camps sit closer
 * than that, `craft`'s whole population averaged −72 security from strangers
 * merely being about: ambient fear, which is the opposite of the note's
 * fear that *grows out of incidents*. Here a stranger always in view is worth
 * a steady ten or so points of wariness; a beating is still worth twenty-five
 * at a stroke.
 */
export const FEAR_PER_INTRUDER = 0.15;

/** The most one sighting pass can take off anybody, however crowded the view. */
export const FEAR_PER_PASS_CAP = 0.6;

/**
 * Where on a band's ground a stranger is alarming at full weight: the inner
 * third, around the camp itself. Further out a stranger counts for
 * `OUTER_WEIGHT` of that — they are on your land, but they are not at your
 * door. The whole radius still goes into `Sightings`: whether a band *knows*
 * somebody was there is a different question from how much it frightened
 * anybody.
 */
export const INNER_SHARE = 1 / 3;
export const OUTER_WEIGHT = 0.3;

/**
 * How often, in ticks, people look up and notice who is on their ground.
 *
 * `Simulation`'s daily block runs at midnight, when everybody who has a roof
 * is under it and nobody is watching the meadow, so a once-a-day pass there
 * would have measured who sleeps where. Six passes a day spread over the
 * waking hours are cheap — one spatial query per living person — and see the
 * day the way the people in it do.
 */
export const SIGHTING_EVERY = 40;

/** How long a band remembers that an outsider was seen on its ground. */
export const SIGHTING_MEMORY_TICKS = 240;

/**
 * Takes a feared deed on board: the victim loses security and gains dread of
 * whoever did it; somebody who saw or was told of an outsider doing it to one
 * of their own band loses security. Called from `SocialSystem.absorb` once
 * the observer has actually recorded the deed — a story they already knew is
 * not news, and a second hearing of it frightens nobody further.
 *
 * `targetBandId` is the victim's band, or null for a deed with no person on
 * the receiving end.
 */
export function frighten(
  observer: Person,
  event: SocialEvent,
  actor: Person,
  firsthand: boolean,
  confidence: number,
  targetBandId: number | null,
  relationships: RelationshipGraph
): void {
  const weight = FEARED[event.type];
  if (weight === undefined) return;
  const scale = weight * (0.5 + event.magnitude * 0.5);

  if (event.targetId === observer.id) {
    observer.mood.add('security', -FEAR_AS_VICTIM * scale, event.type, event.tick);
    relationships.addDread(observer.id, actor.id, DREAD_AS_VICTIM * scale);
    telemetry.count('security_as_victim');
    telemetry.count('dread_as_victim');
    return;
  }

  // Only an outsider harming one of your own frightens a bystander. A brawl
  // inside the band is a quarrel between neighbours; a stranger beating your
  // cousin is a reason to stay close to home.
  if (actor.bandId === observer.bandId) return;
  if (targetBandId === null || targetBandId !== observer.bandId) return;

  if (firsthand) {
    observer.mood.add('security', -FEAR_AS_WITNESS * scale, event.type, event.tick);
    telemetry.count('security_as_witness');
  } else {
    observer.mood.add('security', -FEAR_BY_HEARSAY * scale * confidence, event.type, event.tick);
    telemetry.count('security_by_hearsay');
  }
}

// ---------------------------------------------------------------------------
// Readers (14b)
// ---------------------------------------------------------------------------

/**
 * How afraid somebody is, 0-1, off `mood.security`: nothing at or above zero,
 * all of it at `FEAR_FULL` below. The one reading every behaviour below takes,
 * so "afraid" means the same thing to the scorer, the conversation and the
 * face.
 *
 * Zero rather than the temperament baseline as the floor of fear: a quick
 * temper settles a little below zero (`moodBaseline`), and that resting
 * wariness is meant to show — a hot-headed band is a little more closed to
 * strangers than a placid one before anything has happened to either.
 */
export const FEAR_FULL = 60;

export function fearOf(person: Person): number {
  return Math.max(0, Math.min(1, -person.mood.security / FEAR_FULL));
}

/**
 * How open two people from different bands are to each other, -1 to 1: the
 * mean of their two securities over `OPENNESS_SPAN`. Positive when both are at
 * ease, negative when either is frightened enough to drag the pair down.
 */
export const OPENNESS_SPAN = 50;

export function opennessOf(a: Person, b: Person): number {
  return Math.max(-1, Math.min(1, (a.mood.security + b.mood.security) / 2 / OPENNESS_SPAN));
}

/**
 * How far from home a frightened person will go to work, M11 phase 14b's
 * second reader. No limit below `RANGE_ONSET` of fear; from there the reach
 * falls from `RANGE_WIDE` tiles to `RANGE_FLOOR` at full fear.
 *
 * A filter, not a coefficient, and that is the plan's point: proximity
 * dominates the scorer, and a gentle pull toward home would lose to the
 * nearest bush every time. The floor is the risk the plan names — a band
 * afraid of everything that can reach nothing starves at home — so it sits at
 * a little over a sight radius and a half, enough ground around any camp to
 * feed it in a season that feeds anybody.
 */
export const RANGE_ONSET = 0.25;
export const RANGE_WIDE = 48;
export const RANGE_FLOOR = 20;

export function homeRange(person: Person): number {
  const fear = fearOf(person);
  if (fear < RANGE_ONSET) return Infinity;
  const t = (fear - RANGE_ONSET) / (1 - RANGE_ONSET);
  return RANGE_WIDE + (RANGE_FLOOR - RANGE_WIDE) * t;
}

/**
 * How much less a frightened person wants an outsider's company, in opinion's
 * units at full fear. M11 phase 14b's third reader: the note's "with high fear
 * they do not talk to strangers, and keep to their own".
 *
 * **A preference, never a refusal**, and that is a measurement. The first
 * version also refused outsiders outright above 0.6 of fear, and across twenty
 * `lean` seeds cross-band blows rose from 3,964 to 4,696 and murders from 462
 * to 503 against the same commit without it: people who stop talking across a
 * band line stop warming to each other, and grudges fill the gap. The soft
 * half alone measured 4,330 and 459. Segregation is meant to follow from
 * hatred here, not to manufacture it.
 */
export const STRANGER_AVERSION = 40;

/**
 * How far an idle walk is pulled back toward camp, 0-1 of the way, for a
 * frightened person. Nothing until `DRIFT_ONSET` of fear; at full fear an
 * aimless walk is centred four fifths of the way home, which is what "does not
 * leave the territory" looks like for somebody with nothing in particular to
 * do.
 */
export const DRIFT_ONSET = 0.4;
export const DRIFT_MAX = 0.8;

export function homeward(person: Person): number {
  const fear = fearOf(person);
  if (fear <= DRIFT_ONSET) return 0;
  return Math.min(DRIFT_MAX, (fear - DRIFT_ONSET) / (1 - DRIFT_ONSET) * DRIFT_MAX * 1.25);
}

/**
 * Dread at which somebody's mere presence is a reason to get away from them,
 * and how close they have to be. M11 phase 14b's fourth reader. At 35, two
 * beatings from the same hand, or a killing seen by its survivor's family, is
 * enough; one threat is not. Within half a sight radius: a person you dread
 * across the meadow is someone to keep an eye on, not to run from.
 */
export const DREAD_FLEE_AT = 35;
export const DREAD_FLEE_RANGE = 0.5;

/** Where a band lives and how far its ground reaches, for the sighting pass. */
export interface Territory {
  bandId: number;
  homeX: number;
  homeY: number;
}

/**
 * Who has been seen on whose ground: band id → outsider id → the tick they
 * were last seen there. Kept by `Simulation`, written only by `sightIntruders`
 * and read, from 14c, by the territory engine in place of its old omniscient
 * count of every foreigner within range of camp.
 */
export type Sightings = Map<number, Map<number, number>>;

/**
 * One sighting pass: everybody looks around, and an outsider standing inside
 * the looker's own band's territory costs them a little security and is
 * written into the band's sightings.
 *
 * "Their own band's territory" is the looker's, not the intruder's position
 * relative to wherever the looker happens to be: a forager two valleys from
 * home who meets a stranger on the stranger's own ground has trespassed, not
 * been trespassed upon.
 *
 * `radius` is `BandSystem`'s `TERRITORY_RADIUS`; `outcastBandId` is excluded
 * on both sides, since the band of no band has no ground and its members are
 * already everybody's outsiders by other rules.
 */
export function sightIntruders(
  people: readonly Person[],
  peopleHash: SpatialHash<Person>,
  territories: ReadonlyMap<number, Territory>,
  radius: number,
  sightRadius: number,
  tick: number,
  sightings: Sightings,
  outcastBandId: number | undefined,
  scratch: Person[]
): void {
  const radiusSq = radius * radius;
  const innerSq = radiusSq * INNER_SHARE * INNER_SHARE;
  for (const looker of people) {
    if (!looker.alive || looker.bandId === outcastBandId) continue;
    const home = territories.get(looker.bandId);
    if (!home) continue;
    // Weighted: a stranger at the door counts one, one at the edge of the
    // land `OUTER_WEIGHT`. See `INNER_SHARE`.
    let seen = 0;
    scratch.length = 0;
    for (const other of peopleHash.queryRadius(looker.x, looker.y, sightRadius, scratch)) {
      if (!other.alive || other.bandId === looker.bandId || other.bandId === outcastBandId) continue;
      const dx = other.x - home.homeX;
      const dy = other.y - home.homeY;
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) continue;
      seen += distSq <= innerSq ? 1 : OUTER_WEIGHT;
      let seenByBand = sightings.get(looker.bandId);
      if (!seenByBand) {
        seenByBand = new Map();
        sightings.set(looker.bandId, seenByBand);
      }
      seenByBand.set(other.id, tick);
    }
    if (seen === 0) continue;
    const lost = Math.min(FEAR_PER_PASS_CAP, seen * FEAR_PER_INTRUDER);
    looker.mood.add('security', -lost, 'strangers', tick);
    telemetry.count('security_intruder_seen');
  }
  // Forget what is stale, so the map holds a day's worth and no more.
  for (const seenByBand of sightings.values()) {
    for (const [id, when] of seenByBand) {
      if (tick - when > SIGHTING_MEMORY_TICKS) seenByBand.delete(id);
    }
  }
}
