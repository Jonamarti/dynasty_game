/**
 * What a person remembers, and how surely.
 *
 * Memory is bounded and it decays. Both matter: bounded because a hundred
 * people each hoarding a century of events is the one structure in this game
 * that would grow without limit, and decaying because a grudge that never fades
 * makes every society converge on total war.
 *
 * The exception is being the victim. Those memories have a salience floor, so
 * you may forget the argument at the river but you never forget who killed your
 * brother — which is precisely the asymmetry that makes feuds outlive the people
 * who started them.
 */
import type { EventType, SocialEvent } from './Events.ts';
import { DEED_SALIENCE, DEED_WEIGHT } from './Events.ts';

export interface MemoryEntry {
  eventId: number;
  type: EventType;
  actorId: number;
  targetId: number | null;
  tick: number;
  /** 0-1. Governs survival under decay and eagerness to retell. */
  salience: number;
  /** True if witnessed personally, false if heard from someone else. */
  firsthand: boolean;
  /** 0-1. Rumor arrives less certain than sight, and degrades as it spreads. */
  confidence: number;
  /** Who told them, for "I heard it from Velon". Null if witnessed. */
  sourceId: number | null;
}

/** Beyond this, the least salient memories are dropped. */
const CAPACITY = 48;

/** Salience retained per in-game day. */
const DECAY_PER_DAY = 0.94;

/** A victim's memory never falls below this, however long ago it was. */
const VICTIM_FLOOR = 0.35;

export class Memory {
  private entries: MemoryEntry[] = [];
  /** Event ids already held, so the same deed is not learned twice. */
  private known = new Set<number>();

  constructor(private readonly ownerId: number) {}

  has(eventId: number): boolean {
    return this.known.has(eventId);
  }

  get size(): number {
    return this.entries.length;
  }

  all(): readonly MemoryEntry[] {
    return this.entries;
  }

  /** Records a deed. Returns false if it was already known. */
  record(
    event: SocialEvent,
    firsthand: boolean,
    confidence: number,
    sourceId: number | null = null
  ): boolean {
    if (this.known.has(event.id)) return false;

    const base = DEED_SALIENCE[event.type] * (0.5 + event.magnitude * 0.5);
    this.entries.push({
      eventId: event.id,
      type: event.type,
      actorId: event.actorId,
      targetId: event.targetId,
      tick: event.tick,
      salience: Math.min(1, base * (firsthand ? 1 : 0.7)),
      firsthand,
      confidence,
      sourceId,
    });
    this.known.add(event.id);
    this.trim();
    return true;
  }

  /** Ages every memory. Called once per in-game day, not per tick. */
  decay(): void {
    for (const entry of this.entries) {
      entry.salience *= DECAY_PER_DAY;
      if (entry.targetId === this.ownerId && entry.salience < VICTIM_FLOOR) {
        entry.salience = VICTIM_FLOOR;
      }
    }
    // Anything this faint no longer influences anything; dropping it keeps both
    // the array and the id set from growing across a long life.
    const survivors = this.entries.filter(e => e.salience > 0.02);
    if (survivors.length !== this.entries.length) {
      this.entries = survivors;
      this.known = new Set(survivors.map(e => e.eventId));
    }
  }

  private trim(): void {
    if (this.entries.length <= CAPACITY) return;
    this.entries.sort((a, b) => b.salience - a.salience);
    for (const dropped of this.entries.splice(CAPACITY)) {
      this.known.delete(dropped.eventId);
    }
  }

  /**
   * The most tellable thing this person knows that `listener` does not.
   *
   * Gossip is biased toward the salient, which is why scandal travels and
   * pleasantries do not.
   */
  /**
   * The most vivid thing this person is carrying, whoever they are talking to.
   *
   * The listener-blind half of `bestGossipFor`, and it exists for cost rather
   * than for taste. `Brain` wants to ask "is there anybody near me who has not
   * heard my news", which is one question about the teller and then an O(1) set
   * lookup per candidate — where calling `bestGossipFor` per candidate would
   * walk all forty-eight memories per neighbour per think tick, on a scorer
   * that is already the most expensive thing in the loop and in a project where
   * one scenario fails `perf-budget` today.
   *
   * Not filtered by the 0.15 floor `bestGossipFor` applies, because the caller
   * weights by salience anyway and a floor in two places is two places to
   * change it.
   */
  bestStory(): MemoryEntry | null {
    let best: MemoryEntry | null = null;
    for (const entry of this.entries) {
      if (!best || entry.salience > best.salience) best = entry;
    }
    return best;
  }

  /**
   * The most vivid bad memory and the most vivid good one, found in a single
   * pass over the same entries `bestStory` walks.
   *
   * `bestStory` alone cannot serve `slander`/`praise`: `DEED_SALIENCE` weighs
   * a wrong far above a kindness (0.5-1 against 0.3-0.45) and a victim's own
   * memory of it is floored so it never fades, so the single most-vivid thing
   * almost anybody is carrying is a grievance. Reusing it for both verbs would
   * leave `praise` unreachable for anyone who has ever witnessed anything bad
   * — which in a hundred-person band by the second season is everybody. Kept
   * as one pass rather than two calls filtered by sign, on the same
   * cost-not-taste reasoning `bestStory`'s own comment gives.
   */
  bestSignedStory(): { bad: MemoryEntry | null; good: MemoryEntry | null } {
    let bad: MemoryEntry | null = null;
    let good: MemoryEntry | null = null;
    for (const entry of this.entries) {
      if (DEED_WEIGHT[entry.type] < 0) {
        if (!bad || entry.salience > bad.salience) bad = entry;
      } else {
        if (!good || entry.salience > good.salience) good = entry;
      }
    }
    return { bad, good };
  }

  bestGossipFor(listener: Memory): MemoryEntry | null {
    let best: MemoryEntry | null = null;
    for (const entry of this.entries) {
      if (listener.has(entry.eventId)) continue;
      if (entry.salience < 0.15) continue;
      if (!best || entry.salience > best.salience) best = entry;
    }
    return best;
  }

  /** Everything remembered about one person, most salient first. */
  about(personId: number): MemoryEntry[] {
    return this.entries
      .filter(e => e.actorId === personId || e.targetId === personId)
      .sort((a, b) => b.salience - a.salience);
  }

  /**
   * The best thing this person could say about `subjectId` right now — the
   * sibling of `bestGossipFor`, filtered to one person and one moral sign
   * rather than to whoever the listener has not heard from at all.
   *
   * M11 phase 5c: slander and praise draw their content from here rather than
   * inventing it. `subjectId` is always the *actor* of the remembered deed —
   * gossip is about what somebody *did* — so a person can only be slandered
   * for their own wrongs, never for what was done to them.
   */
  bestStoryAbout(subjectId: number, listener: Memory, sign: 'good' | 'bad'): MemoryEntry | null {
    let best: MemoryEntry | null = null;
    for (const entry of this.entries) {
      if (entry.actorId !== subjectId) continue;
      if (listener.has(entry.eventId)) continue;
      if (entry.salience < 0.15) continue;
      const bad = DEED_WEIGHT[entry.type] < 0;
      if (sign === 'bad' ? !bad : bad) continue;
      if (!best || entry.salience > best.salience) best = entry;
    }
    return best;
  }

  /**
   * Every person this memory could currently slander or praise to `listener`
   * — one entry per subject, whichever of their deeds is most salient.
   *
   * For the radial menu's "gossip about…" submenu, which has to offer a list
   * of *people*, not a list of deeds. `bestStoryAbout` answers "is there
   * still something to say about this one particular person" at the moment
   * the player actually commits to the order; this only has to be honest
   * enough to populate a menu.
   */
  tellableSubjectIds(listener: Memory): { subjectId: number; sign: 'good' | 'bad' }[] {
    const bestPerSubject = new Map<number, MemoryEntry>();
    for (const entry of this.entries) {
      if (listener.has(entry.eventId)) continue;
      if (entry.salience < 0.15) continue;
      const current = bestPerSubject.get(entry.actorId);
      if (!current || entry.salience > current.salience) {
        bestPerSubject.set(entry.actorId, entry);
      }
    }
    return [...bestPerSubject.entries()].map(([subjectId, entry]) => ({
      subjectId,
      sign: DEED_WEIGHT[entry.type] < 0 ? 'bad' as const : 'good' as const,
    }));
  }
}
