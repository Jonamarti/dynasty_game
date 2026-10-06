/**
 * One owner per person across levels, M15 phase 32b.
 *
 * Moving a person between the detailed level and the compact one *transfers
 * authority*; it never copies (docs/m15_simulation_lod.md §4). This registry is
 * the place that says who owns whom, and it refuses every move that would give a
 * person two owners or none:
 *
 * - demoting someone already compact, or promoting someone already detailed;
 * - promoting an old record or a decoded duplicate (stale `epoch`, or an object
 *   that is not the live compact instance);
 * - promoting a record that has not been brought up to the transition tick;
 * - demoting a person whose action reaches another entity that the compact level
 *   cannot yet resolve (the player, someone held, bound, carried or carrying a
 *   baby, someone mid-interaction). Those are refused with a named reason rather
 *   than silently dropped; the visible-interaction bridge of §4 lifts them later.
 *
 * Inert: nothing in `Simulation` calls it yet.
 */
import type { Person } from '../entities/Person.ts';
import { RNG, type RngSnapshot } from '../core/RNG.ts';
import {
  deriveCompactStream, fromCompactRecord, goalOf, type CompactPerson, type CompactPersonRecord,
} from './CompactPerson.ts';

export type CompactRefusal =
  | 'already_compact' | 'already_detailed' | 'stale_record' | 'not_live' | 'behind_transition_tick'
  | 'dead' | 'player' | 'carried' | 'held_or_bound' | 'carrying_baby' | 'interacting';

export type CompactResult<T> = { ok: true; value: T } | { ok: false; reason: CompactRefusal };

interface Entry {
  owner: 'detailed' | 'compact';
  epoch: number;
  /** The person's compact stream while detailed, so it resumes where it stopped. */
  stream: RngSnapshot | null;
}

export interface CompactAuthoritySnapshot {
  readonly version: 1;
  readonly entries: { id: number; owner: 'detailed' | 'compact'; epoch: number; stream: RngSnapshot | null }[];
}

/** Why this person cannot become compact right now, or null when they can. */
export function demotionBlock(person: Person): CompactRefusal | null {
  if (!person.alive) return 'dead';
  if (person.isPlayer) return 'player';
  if (person.carriedBy !== null) return 'carried';
  if (person.heldBy !== null || person.boundBy !== null || person.captiveOf !== null) return 'held_or_bound';
  if (person.armsTaken > 0) return 'carrying_baby';
  if (person.targetPersonId !== null || person.caughtId !== null || person.fleeFromId !== null) return 'interacting';
  return null;
}

export class CompactAuthority {
  private readonly entries = new Map<number, Entry>();
  private readonly live = new Map<number, CompactPerson>();

  constructor(private readonly worldSeed: string | number) {}

  ownerOf(personId: number): 'detailed' | 'compact' | null { return this.entries.get(personId)?.owner ?? null; }
  epochOf(personId: number): number | null { return this.entries.get(personId)?.epoch ?? null; }
  get compactCount(): number { return this.live.size; }
  compactPerson(personId: number): CompactPerson | undefined { return this.live.get(personId); }

  /** Detailed → compact. The same `Person` instance moves; nothing is cloned. */
  demote(person: Person, tick: number): CompactResult<CompactPerson> {
    const entry = this.entries.get(person.id);
    if (entry?.owner === 'compact') return { ok: false, reason: 'already_compact' };
    const block = demotionBlock(person);
    if (block) return { ok: false, reason: block };
    const epoch = (entry?.epoch ?? 0) + 1;
    const rng = entry?.stream ? RNG.fromSnapshot(entry.stream) : deriveCompactStream(this.worldSeed, person.id);
    const compact: CompactPerson = { person, lastAdvancedTick: tick, rng, goal: goalOf(person, tick), intake: null, epoch };
    this.entries.set(person.id, { owner: 'compact', epoch, stream: null });
    this.live.set(person.id, compact);
    return { ok: true, value: compact };
  }

  /** Compact → detailed. The caller must have advanced the person to `tick` first. */
  promote(compact: CompactPerson, tick: number): CompactResult<Person> {
    const id = compact.person.id;
    const entry = this.entries.get(id);
    if (!entry) return { ok: false, reason: 'not_live' };
    if (entry.owner === 'detailed') return { ok: false, reason: 'already_detailed' };
    if (this.live.get(id) !== compact) return { ok: false, reason: 'not_live' };
    if (compact.epoch !== entry.epoch) return { ok: false, reason: 'stale_record' };
    if (compact.lastAdvancedTick !== tick) return { ok: false, reason: 'behind_transition_tick' };
    this.entries.set(id, { owner: 'detailed', epoch: entry.epoch + 1, stream: compact.rng.snapshot() });
    this.live.delete(id);
    return { ok: true, value: compact.person };
  }

  /**
   * Re-hydrate a compact person from a JSON record (after a save or a reload).
   * Accepted only if nobody holds the person live and the record is the epoch the
   * authority expects; a second adoption of the same record is a duplicate.
   */
  adopt(record: CompactPersonRecord): CompactResult<CompactPerson> {
    const id = record.personId;
    const entry = this.entries.get(id);
    if (this.live.has(id)) return { ok: false, reason: 'already_compact' };
    if (entry && (entry.owner === 'detailed' || entry.epoch !== record.epoch)) return { ok: false, reason: 'stale_record' };
    const compact = fromCompactRecord(record);
    this.entries.set(id, { owner: 'compact', epoch: record.epoch, stream: null });
    this.live.set(id, compact);
    return { ok: true, value: compact };
  }

  snapshot(): CompactAuthoritySnapshot {
    return {
      version: 1,
      entries: [...this.entries].sort((a, b) => a[0] - b[0]).map(([id, e]) => ({ id, owner: e.owner, epoch: e.epoch, stream: e.stream })),
    };
  }
}
