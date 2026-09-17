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
import { DEED_SALIENCE } from './Events.ts';

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
}
