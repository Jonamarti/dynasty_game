/**
 * News a person can carry between comarcas. M15 phase 36a.
 *
 * This is deliberately person-owned state, not a world bulletin board. A story
 * enters only from firsthand Memory, or from an explicit handoff at a contact
 * that can carry people between places. No comarca is told anything merely
 * because it exists in the same world.
 */
import type { Memory } from './Memory.ts';
import type { SocialEvent } from './Events.ts';

export type NewsChannel = 'conversation' | 'traveller' | 'spouse' | 'captive' | 'trader';

export interface WorldNewsEntry {
  /** Origin and event id together remain unique across independently run comarcas. */
  key: string;
  eventId: number;
  type: 'theft';
  actorId: number;
  targetId: number | null;
  victimBandId: number | null;
  originCx: number;
  originCy: number;
  occurredTick: number;
  learnedTick: number;
  /** True only on the first person who witnessed the deed. */
  firsthand: boolean;
  /** Direct observation is certain; each spoken handoff lowers confidence. */
  confidence: number;
  sourceId: number | null;
  channel: NewsChannel | null;
}

const CAPACITY = 48;
const RETELL_CONFIDENCE = 0.7;
const MIN_CONFIDENCE = 0.08;

function validCell(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value < 65536;
}

function eventKey(eventId: number, cx: number, cy: number): string {
  return cy + ':' + cx + ':' + eventId;
}

function validTick(tick: number): boolean {
  return Number.isSafeInteger(tick) && tick >= 0;
}

/** A bounded, serializable collection of stories held by one person. */
export class WorldNews {
  private readonly stories = new Map<string, WorldNewsEntry>();

  get size(): number { return this.stories.size; }

  has(eventId: number, originCx: number, originCy: number): boolean {
    return this.stories.has(eventKey(eventId, originCx, originCy));
  }

  entries(): IterableIterator<WorldNewsEntry> { return this.stories.values(); }

  /**
   * Record a witnessed theft only when this person's existing deed memory proves
   * it was firsthand. That keeps this transport layer from inventing witnesses.
   */
  witnessTheft(event: SocialEvent, memory: Memory, originCx: number, originCy: number): boolean {
    if (event.type !== 'theft' || !validCell(originCx) || !validCell(originCy) ||
        !Number.isSafeInteger(event.id) || event.id < 0 || !validTick(event.tick)) return false;
    const proof = memory.all().find(entry => entry.eventId === event.id);
    if (!proof || proof.type !== 'theft' || !proof.firsthand || proof.actorId !== event.actorId ||
        proof.targetId !== event.targetId || proof.victimBandId !== event.victimBandId || proof.tick !== event.tick) return false;
    const key = eventKey(event.id, originCx, originCy);
    if (this.stories.has(key)) return false;
    this.insert({
      key, eventId: event.id, type: 'theft', actorId: event.actorId,
      targetId: event.targetId, victimBandId: event.victimBandId,
      originCx, originCy, occurredTick: event.tick, learnedTick: event.tick,
      firsthand: true, confidence: 1, sourceId: null, channel: null,
    });
    return true;
  }

  /** Carry only the story selected by an actual telling, never the teller's whole ledger. */
  tellEventTo(
    listener: WorldNews, tellerId: number, eventId: number,
    originCx: number, originCy: number, channel: NewsChannel, atTick: number
  ): boolean {
    if (listener === this || !validCell(originCx) || !validCell(originCy) ||
        !Number.isSafeInteger(tellerId) || tellerId < 0 || !Number.isSafeInteger(eventId) || eventId < 0 ||
        !validTick(atTick)) return false;
    const key = eventKey(eventId, originCx, originCy);
    const story = this.stories.get(key);
    if (!story || listener.stories.has(key) || atTick < story.occurredTick ||
        story.confidence * RETELL_CONFIDENCE < MIN_CONFIDENCE) return false;
    listener.insert({
      ...story, learnedTick: atTick, firsthand: false,
      confidence: story.confidence * RETELL_CONFIDENCE,
      sourceId: tellerId, channel,
    });
    return true;
  }

  /**
   * Carry stories over a real contact edge. Caller owns whether the contact
   * occurred; the channel is recorded so travellers, spouses, captives,
   * traders, and ordinary tellers can be audited separately.
   */
  tellTo(listener: WorldNews, tellerId: number, channel: NewsChannel, atTick: number, limit = CAPACITY): number {
    if (listener === this || !Number.isSafeInteger(tellerId) || tellerId < 0 || !validTick(atTick) ||
        !Number.isSafeInteger(limit) || limit <= 0) return 0;
    const candidates = [...this.stories.values()]
      .filter(story => !listener.stories.has(story.key) && story.confidence * RETELL_CONFIDENCE >= MIN_CONFIDENCE &&
        atTick >= story.occurredTick)
      .sort((a, b) => b.occurredTick - a.occurredTick || a.originCy - b.originCy || a.originCx - b.originCx || a.eventId - b.eventId);
    let landed = 0;
    for (const story of candidates.slice(0, limit)) {
      listener.insert({
        ...story, learnedTick: atTick, firsthand: false,
        confidence: story.confidence * RETELL_CONFIDENCE,
        sourceId: tellerId, channel,
      });
      landed++;
    }
    return landed;
  }

  private insert(story: WorldNewsEntry): void {
    this.stories.set(story.key, story);
    while (this.stories.size > CAPACITY) {
      const oldestKey = this.stories.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.stories.delete(oldestKey);
    }
  }
}
