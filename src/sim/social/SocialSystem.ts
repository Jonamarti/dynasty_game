/**
 * Witnessing and gossip: the engine that turns deeds into consequences.
 *
 * One mechanism produces reputation, grudges, feuds, exile and "I heard what
 * you did at the river", and none of those are coded as features:
 *
 *   1. A deed emits an event at a place.
 *   2. Everyone close enough sees it, and judges the actor by *their own*
 *      culture's norms — so the same theft costs a thief dearly among strict
 *      neighbours and almost nothing among tolerant ones.
 *   3. When two people talk, they trade the most striking thing they know that
 *      the other does not. It arrives less certain than sight, and degrades
 *      further with each retelling.
 *
 * Reputation is therefore never stored. What a person thinks of you is derived,
 * locally, from what they saw and what they were told — which is why it can be
 * wrong, and why moving somewhere new genuinely works.
 */
import type { Person } from '../entities/Person.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { RelationshipGraph } from './Relationships.ts';
import type { EventType, Norms, SocialEvent } from './Events.ts';
import { DEED_WEIGHT, VICTIM_MULTIPLIER, describeEvent } from './Events.ts';
import { telemetry } from '../core/Telemetry.ts';

export interface LifeEvent {
  tick: number;
  /** The person's age in days when it happened, so the UI can say "at 21". */
  ageDays: number;
  text: string;
  kind: 'did' | 'suffered' | 'milestone';
}

/** Romance at which both parties are ready to marry. */
const BETROTHAL_AT = 55;

/** Kinship stamped on a marriage, and on a parent-child bond. */
export const KIN_SPOUSE = 55;
export const KIN_PARENT = 60;
export const KIN_SIBLING = 40;

/**
 * First impressions, before anyone has done anything.
 *
 * Three rungs, checked household first, because family outranks band and the
 * flat band/stranger pair could not express that at all. The household rung is
 * what covers in-laws, step-kin and fostered members who have no blood kinship
 * edge — `KIN_PARENT`, `KIN_SIBLING` and `KIN_SPOUSE` stay separate and
 * additive on top of whichever rung applies.
 *
 * Wariness of outsiders is deliberately small. At −14 a stranger started most
 * of the way to the exile threshold before doing anything at all, which made
 * meeting anyone from another band a near-irreversible act.
 */
const HOUSEHOLD_BIAS = 18;
const IN_GROUP_BIAS = 6;
const OUT_GROUP_BIAS = -6;

/** Confidence lost each time a story is passed on. */
const RUMOR_DECAY = 0.75;

/** Opinion weight of a story you were merely told, relative to seeing it. */
const HEARSAY_WEIGHT = 0.45;

/**
 * The standing regard one person owes another before any deed.
 *
 * Household first: a household is a family, and someone married into yours is
 * closer than a neighbour from the same camp whatever the blood says.
 */
export function firstImpression(observer: Person, subject: Person): number {
  if (observer.householdId !== null && observer.householdId === subject.householdId) {
    return HOUSEHOLD_BIAS;
  }
  return observer.bandId === subject.bandId ? IN_GROUP_BIAS : OUT_GROUP_BIAS;
}

/**
 * Writes the kinship edges a new family member implies, in both directions.
 *
 * Shared by birth and by world founding so that a sibling you were born beside
 * and a sibling the world started you with cannot end up with different edges —
 * which is exactly the sort of divergence that produces a family who are
 * strangers to each other for no reason anyone can find.
 *
 * The caller must have pushed `child.id` onto each parent's `childIds` first;
 * that is where the sibling set comes from.
 */
export function linkFamily(
  child: Person,
  parents: (Person | null)[],
  relationships: RelationshipGraph
): void {
  for (const parent of parents) {
    if (!parent) continue;
    relationships.setKinship(parent.id, child.id, KIN_PARENT);
    relationships.setKinship(child.id, parent.id, KIN_PARENT);
    // Siblings, both ways.
    for (const siblingId of parent.childIds) {
      if (siblingId === child.id) continue;
      relationships.setKinship(child.id, siblingId, KIN_SIBLING);
      relationships.setKinship(siblingId, child.id, KIN_SIBLING);
    }
  }
}

let nextEventId = 1;

export function resetEventIds(): void {
  nextEventId = 1;
}

export class SocialSystem {
  /** Recent events, newest last, for the UI feed. Bounded. */
  readonly recent: SocialEvent[] = [];
  private readonly recentCap = 200;

  /**
   * Called when two people marry, so the simulation can merge their households.
   * A hook rather than a direct call, because households are the simulation's
   * business and this module knows only about people and what they feel.
   */
  onMarriage: ((a: Person, b: Person) => void) | null = null;

  constructor(
    private readonly relationships: RelationshipGraph,
    private readonly normsByBand: Map<number, Norms>
  ) {}

  private normsFor(person: Person): Norms | null {
    return this.normsByBand.get(person.bandId) ?? null;
  }

  /**
   * Emits a deed and resolves who saw it.
   *
   * `peopleById` is needed because witnesses judge the actor, and the victim
   * must be judged as a victim rather than as a bystander.
   */
  emit(
    type: EventType,
    actor: Person,
    target: Person | null,
    magnitude: number,
    tick: number,
    peopleHash: SpatialHash<Person>,
    sightRadius: number
  ): SocialEvent {
    const event: SocialEvent = {
      id: nextEventId++,
      type,
      actorId: actor.id,
      targetId: target?.id ?? null,
      x: actor.x,
      y: actor.y,
      tick,
      magnitude: Math.max(0, Math.min(1, magnitude)),
    };

    telemetry.count('event_' + type);

    const description = describeEvent(type, actor.name, target?.name ?? null);
    actor.chronicle.push({ tick, ageDays: actor.age, text: description, kind: 'did' });
    if (target) {
      target.chronicle.push({ tick, ageDays: target.age, text: description, kind: 'suffered' });
    }

    // The victim always knows, however dark it was and whoever else was looking.
    if (target) this.absorb(target, event, actor, true, 1, null);

    let witnesses = 0;
    for (const bystander of peopleHash.queryRadius(actor.x, actor.y, sightRadius)) {
      if (!bystander.alive) continue;
      if (bystander.id === actor.id || bystander.id === target?.id) continue;
      this.absorb(bystander, event, actor, true, 1, null);
      witnesses++;
    }
    if (witnesses > 0) telemetry.count('witnessed', witnesses);
    else telemetry.count('unwitnessed');

    this.recent.push(event);
    if (this.recent.length > this.recentCap) this.recent.shift();
    return event;
  }

  /**
   * One person takes a deed on board: remembers it, and revises their opinion
   * of whoever did it.
   */
  private absorb(
    observer: Person,
    event: SocialEvent,
    actor: Person,
    firsthand: boolean,
    confidence: number,
    sourceId: number | null
  ): void {
    if (!observer.memory.record(event, firsthand, confidence, sourceId)) return;
    if (observer.id === actor.id) return;
    this.introduce(observer, actor);

    const norms = this.normsFor(observer);
    const tolerance = norms ? norms[event.type] : 1;
    const victimFactor = event.targetId === observer.id ? VICTIM_MULTIPLIER : 1;
    const hearsayFactor = firsthand ? 1 : HEARSAY_WEIGHT;

    const delta =
      DEED_WEIGHT[event.type] *
      tolerance *
      (0.5 + event.magnitude * 0.5) *
      victimFactor *
      hearsayFactor *
      confidence;

    this.relationships.addDeed(observer.id, actor.id, delta, event.tick);
  }

  /**
   * Two people talk: they grow familiar, and each passes on the most striking
   * thing they know that the other does not.
   */
  converse(
    a: Person,
    b: Person,
    tick: number,
    peopleById: Map<number, Person>
  ): void {
    this.introduce(a, b);
    this.introduce(b, a);

    // Familiarity grows more slowly across a band boundary: it takes longer to
    // warm to a stranger than to someone you grew up beside.
    const sameBand = a.bandId === b.bandId;
    const warmth = sameBand ? 3.5 : 1.5;
    this.relationships.addFamiliarity(a.id, b.id, warmth, tick);
    this.relationships.addFamiliarity(b.id, a.id, warmth, tick);
    a.needs.company = 0;
    b.needs.company = 0;
    telemetry.count('conversation');

    this.gossip(a, b, peopleById);
    this.gossip(b, a, peopleById);
  }

  /**
   * A courtship visit. Grows romance on both sides, and weds them when both
   * have reached the threshold.
   *
   * Requiring *both* sides is the point: one-sided infatuation is a real state
   * the graph can hold, and it produces its own stories.
   */
  courtship(suitor: Person, courted: Person, charm: number, tick: number): boolean {
    this.introduce(suitor, courted);
    this.introduce(courted, suitor);

    // How warmly they are received governs how much the visit advances things.
    const welcome = Math.max(0, this.relationships.opinion(courted.id, suitor.id)) / 100;
    this.relationships.addRomance(suitor.id, courted.id, charm * 1.5, tick);
    this.relationships.addRomance(courted.id, suitor.id, charm * (0.7 + welcome * 1.2), tick);
    this.relationships.addFamiliarity(suitor.id, courted.id, 2, tick);
    this.relationships.addFamiliarity(courted.id, suitor.id, 2, tick);
    telemetry.count('courtship');

    if (
      this.relationships.romance(suitor.id, courted.id) >= BETROTHAL_AT &&
      this.relationships.romance(courted.id, suitor.id) >= BETROTHAL_AT
    ) {
      this.wed(suitor, courted, tick);
      return true;
    }
    return false;
  }

  /**
   * Takes some of the sting out of a grudge, for the person who acted on it.
   *
   * Only the aggressor's view moves; the victim's opinion is handled by the
   * assault event, and moves sharply the other way.
   */
  dischargeGrudge(aggressorId: number, victimId: number, amount: number, tick: number): void {
    const opinion = this.relationships.opinion(aggressorId, victimId);
    if (opinion >= 0) return;
    this.relationships.addDeed(aggressorId, victimId, Math.min(amount, -opinion), tick);
  }

  /** Marries two people. The household merge is the caller's business. */
  wed(a: Person, b: Person, tick: number): void {
    a.spouseId = b.id;
    b.spouseId = a.id;
    this.relationships.setKinship(a.id, b.id, KIN_SPOUSE);
    this.relationships.setKinship(b.id, a.id, KIN_SPOUSE);
    telemetry.count('marriage');

    const text = a.name + ' and ' + b.name + ' were married';
    a.chronicle.push({ tick, ageDays: a.age, text, kind: 'milestone' });
    b.chronicle.push({ tick, ageDays: b.age, text, kind: 'milestone' });

    this.onMarriage?.(a, b);
  }

  /** Stamps a first impression the first time one person notices another. */
  introduce(observer: Person, subject: Person): void {
    this.relationships.introduce(observer.id, subject.id, firstImpression(observer, subject));
  }

  /** `teller` passes their best story to `listener`. */
  private gossip(teller: Person, listener: Person, peopleById: Map<number, Person>): void {
    const story = teller.memory.bestGossipFor(listener.memory);
    if (!story) return;

    const actor = peopleById.get(story.actorId);
    if (!actor) return;

    const confidence = story.confidence * RUMOR_DECAY;
    if (confidence < 0.15) return;

    const event: SocialEvent = {
      id: story.eventId,
      type: story.type,
      actorId: story.actorId,
      targetId: story.targetId,
      x: teller.x,
      y: teller.y,
      tick: story.tick,
      magnitude: 1,
    };

    const before = listener.memory.size;
    this.absorb(listener, event, actor, false, confidence, teller.id);
    if (listener.memory.size > before) telemetry.count('rumor_spread');
  }

  /**
   * Daily upkeep: age memories and relationships.
   *
   * Deliberately once a day rather than every tick. Decaying 60 people x 48
   * memories every step would be the single most expensive thing in the loop,
   * and nothing in the design can tell the difference.
   */
  dailyUpkeep(people: Person[]): void {
    for (const person of people) person.memory.decay();
    this.relationships.decay();
  }
}
