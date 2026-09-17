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
import { SKILLS, type Person } from '../entities/Person.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { RelationshipGraph } from './Relationships.ts';
import type { EventType, Norms, SocialEvent } from './Events.ts';
import { DEED_WEIGHT, VICTIM_MULTIPLIER, describeEvent } from './Events.ts';
import type { ConversationMode } from './Conversation.ts';
import { CONVERSATION_MODES, crossBand } from './Conversation.ts';
import { WORK_ACTIONS } from '../entities/Job.ts';
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

/**
 * What a night under one roof is worth, and how many people it can be worth it
 * with.
 *
 * Set against the conversation rungs rather than in isolation: at 2.5 a
 * fortnight of sharing a hut carries two people from strangers to the rung
 * where they ask what each other are like, which is about right for people who
 * have never once sat down together, and nowhere near what a fortnight of
 * evenings would do.
 */
const HEARTH_WARMTH = 2.5;
const HEARTH_REACH = 3;

/**
 * How near two people have to be to be working *together* rather than merely in
 * the same clearing, and what an hour of it is worth.
 *
 * O2: `Person.action` is a single string, so "foraging and talking" has nowhere
 * to live and two people picking the same bush could not say a word to each
 * other. This is the cheapest honest shape for it — a periodic pass, on the
 * model of `KnowledgeSystem.tryObserve`, that touches neither one's action.
 *
 * Deliberately far below a conversation. A day's work beside somebody is worth
 * about what one greeting is worth, and it answers loneliness slowly rather
 * than settling it: if working near people were as good as talking to them,
 * nobody would ever choose `talk` again and the gossip channel would close —
 * which is the failure the first tuning of the conversation rungs produced by a
 * different route.
 *
 * **It was made again here, and the relief is what made it.** At 0.06 the six
 * passes of a working day took nearly a third off a person's loneliness, which
 * is more than it rises in a day; conversations in the `tiny` scenario fell by
 * two thirds, from 35 to 12, and `rumor-propagates` went to zero because ten of
 * the twelve survivors were greetings and a greeting carries no news. At 0.03 a
 * day of working side by side slows loneliness by something like a third
 * without ever answering it, which is the shape O2 asked for: company you did
 * not have to stop working for, and no substitute for sitting down with
 * somebody.
 *
 * No draw is taken here. The pass runs on a fixed cadence and pairs people in
 * index order, so it adds nothing to any RNG stream and the fork order is
 * untouched.
 */
const ELBOW_ROOM = 2.5;
const ALONGSIDE_WARMTH = 0.6;
const ALONGSIDE_RELIEF = 0.03;

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
  /** Scratch for `workingAlongside`'s query. Reused; never read across calls. */
  private readonly nearby: Person[] = [];
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
      witnesses: 0,
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
    // M11 phase 3b: the count lives on the event too, so the UI can say "no
    // one saw that" about a deed of the player's own character.
    event.witnesses = witnesses;

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
   *
   * What *kind* of conversation is the caller's to decide, because the rung is
   * chosen when the conversation starts and the cost is paid over the ticks
   * that follow — see `Conversation.ts`. Re-deriving it here, at the end,
   * would let a relationship that moved in between be settled at a price
   * nobody agreed to, which is the same defect `doDiscuss` had when it
   * re-picked its idea every tick.
   *
   * The parameter is deliberately required rather than defaulted: a caller
   * that forgets it should not quietly get somebody else's idea of an ordinary
   * chat.
   */
  converse(
    a: Person,
    b: Person,
    tick: number,
    peopleById: Map<number, Person>,
    mode: ConversationMode
  ): void {
    const def = CONVERSATION_MODES[mode];
    this.settle(a, b, tick, def.warmth, def.relief, def.relief);
    telemetry.count('conversation');
    telemetry.count('conversation_' + mode);

    // News travels down the long conversations. A greeting carries none at
    // all, which is the mechanical difference that makes the dear rungs worth
    // their price: gossip is the only channel a deed reaches anyone who did
    // not see it, and `next-steps.md` §0 names transmission as the bottleneck.
    for (let i = 0; i < def.stories; i++) {
      this.gossip(a, b, peopleById);
      this.gossip(b, a, peopleById);
    }
  }

  /**
   * The social residue of time spent in somebody's company: they know each
   * other a little better, and neither is quite as alone as they were.
   *
   * Shared, because until M9 phase 4 a conversation was the *only* thing in
   * the game that had this effect. Two people could spend a season arguing a
   * design out or a whole afternoon on a lesson and come away exactly as
   * distant as they began, which is the note the owner wrote down: discussing
   * and teaching should build a relationship. One definition rather than three,
   * for the reason `moveToward` and `linkFamily` are one definition — the
   * copies drift, and the drift surfaces months later as an unaccountable
   * difference between two things that ought to feel the same.
   *
   * The relief is given per side rather than once. What a technical
   * conversation answers depends on who is having it — see `meetingOfMinds` —
   * and the conversation rungs, where it answers the same for both, pass the
   * same figure twice.
   */
  settle(
    a: Person, b: Person, tick: number,
    warmth: number, reliefA: number, reliefB: number
  ): void {
    this.introduce(a, b);
    this.introduce(b, a);

    // Familiarity grows more slowly across a band boundary: it takes longer to
    // warm to a stranger than to someone you grew up beside.
    const sameBand = a.bandId === b.bandId;
    const gained = crossBand(warmth, sameBand);
    this.relationships.addFamiliarity(a.id, b.id, gained, tick);
    this.relationships.addFamiliarity(b.id, a.id, gained, tick);

    // Only the longest conversation answers loneliness outright. A nod across
    // the camp is worth something and is not worth a whole evening, and until
    // the rungs landed every conversation in the game cleared `company` to
    // zero — which is why a band could be sociable and lonely at the same time
    // without the difference ever showing up in a need.
    a.needs.company = Math.max(0, a.needs.company * (1 - reliefA));
    b.needs.company = Math.max(0, b.needs.company * (1 - reliefB));
  }

  /**
   * People working within arm's reach of each other, and the hour of talk that
   * goes with it.
   *
   * Runs on a cadence rather than every tick, for the reason `dailyUpkeep`
   * does: the answer changes slowly and the query is the expensive part.
   *
   * Familiarity is settled once per pair and loneliness once per person. Both
   * halves of a pair find each other in the same pass — `settle` is symmetric,
   * so the canonical ordering is what stops a day's work counting double — and
   * somebody in the middle of a work party should not be four times less lonely
   * than somebody with one companion, because the company of one other person
   * is most of what company is.
   *
   * `hunt` is in `WORK_ACTIONS` and stays there. Two hunters within two and a
   * half tiles of each other really are working side by side; a chase puts
   * them further apart than that on its own, without a rule about it.
   */
  workingAlongside(people: Person[], peopleHash: SpatialHash<Person>, tick: number): void {
    for (const person of people) {
      // Cleared for everybody, not only for workers: somebody who has stopped
      // working has stopped learning from whoever they were standing next to,
      // and a stale mentor would go on teaching them from across the island.
      person.alongside.fill(0);
      if (!person.alive || !WORK_ACTIONS.has(person.action)) continue;
      let alongside = 0;
      // Into the same array every time. `queryRadius` takes one for exactly
      // this reason, and this is the only query in the game that runs once per
      // living person: on the `crowded` scenario a fresh array per call was
      // worth about 4% of the whole step to the garbage collector.
      for (const other of peopleHash.queryRadius(
        person.x, person.y, ELBOW_ROOM, this.nearby)) {
        if (!other.alive || other.id === person.id) continue;
        if (!WORK_ACTIONS.has(other.action)) continue;
        alongside++;
        // O3: the best hand nearby, per skill. `practice` reads it and scales
        // the gain by the gap, so a beginner beside a master learns faster and
        // two equals are worth nothing extra to each other.
        for (let i = 0; i < SKILLS.length; i++) {
          const theirs = other.skills[SKILLS[i]!];
          if (theirs > person.alongside[i]!) person.alongside[i] = theirs;
        }
        if (other.id > person.id) {
          this.settle(person, other, tick, ALONGSIDE_WARMTH, 0, 0);
          telemetry.count('worked_alongside');
        }
      }
      if (alongside > 0) {
        person.needs.company = Math.max(0, person.needs.company * (1 - ALONGSIDE_RELIEF));
      }
    }
  }

  /**
   * A night under the same roof.
   *
   * Note 8, and the quietest of the four things this phase does. Every bond in
   * the game was made by somebody deciding to make it — walking over, spending
   * the ticks, having the conversation — and the most ordinary closeness there
   * is came of nothing anybody decided: you sleep beside the same people every
   * night and after a season you know them. Without it a household could share
   * a hut for a year and remain, as far as the relationship graph was
   * concerned, three strangers who happened to be indoors at the same time.
   *
   * No loneliness is answered, which is why it routes through `settle` with
   * both reliefs at zero rather than being a fourth way to spend `company`.
   * Sleeping in company is not the same as being in company, and a band that
   * could answer its loneliness by going to bed would stop talking.
   *
   * **Capped, and the cap is the interesting part.** One night is worth the
   * same to the two in a windbreak as to the twelve in a longhouse, so each
   * sleeper takes at most `HEARTH_REACH` nights' worth of warmth from any one
   * night: past that the amount per pair tapers. A longhouse should be a warm
   * place to live, not a machine for making everybody close to everybody.
   *
   * Who slept where is the caller's business — this module knows about people
   * and what they feel, and nothing about buildings.
   */
  hearth(sleepers: Person[], tick: number): void {
    if (sleepers.length < 2) return;
    const share = Math.min(1, HEARTH_REACH / (sleepers.length - 1));
    const warmth = HEARTH_WARMTH * share;
    for (let i = 0; i < sleepers.length; i++) {
      for (let j = i + 1; j < sleepers.length; j++) {
        this.settle(sleepers[i]!, sleepers[j]!, tick, warmth, 0, 0);
      }
    }
    telemetry.count('shared_a_roof', sleepers.length);
    telemetry.count('hearths');
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
      // A retelling through `absorb`, never an event `recent` will surface:
      // nobody *saw* this happen, they only heard it, and the count belongs to
      // the original deed. Leaving it 0 keeps the "no witnesses" statement
      // true for a story told after the fact.
      witnesses: 0,
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
