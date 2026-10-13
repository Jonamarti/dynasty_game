/**
 * Level-1 (compact) event scheduler, M15 phase 32b.
 *
 * Every level shares the game clock, so compact events are ordered by the
 * simulation tick and, for ties, by a stable key — never by insertion order,
 * wall-clock time or frame rate (docs/m15_simulation_lod.md §5). Two schedulers
 * fed the same events in any order drain them identically.
 *
 * It also carries the **transaction ledger** that makes "update both ends of a
 * relation without doing it twice" checkable: a transfer, a death or a tribute
 * has a stable id and `commit()` refuses the second application of the same id.
 *
 * Pure data and no RNG: nothing here may import the renderer or touch the DOM,
 * and nothing here draws a number. The state is JSON so it can sit in a save.
 */

/** Lower `phase` runs first inside one tick: arrivals and urgencies must be
 * resolved before the ordinary work that the same tick contains. */
export const COMPACT_PHASE = { urgent: 0, arrival: 1, work: 2, demography: 3 } as const;
export type CompactPhase = (typeof COMPACT_PHASE)[keyof typeof COMPACT_PHASE];

export interface CompactEvent {
  /** Unique across the world's compact events; the idempotency key. */
  readonly id: number;
  readonly tick: number;
  readonly phase: CompactPhase;
  /** The person (or band) the event belongs to: the stable tie-break after phase. */
  readonly subjectId: number;
  /** A short machine name: `food_exhausted`, `build_done`, `birth`, `arrival`... */
  readonly kind: string;
  /** JSON payload only. */
  readonly data: Readonly<Record<string, unknown>>;
}

export interface CompactSchedulerSnapshot {
  readonly version: 1;
  readonly pending: CompactEvent[];
  readonly committed: number[];
}

export function compareCompactEvents(a: CompactEvent, b: CompactEvent): number {
  return a.tick - b.tick || a.phase - b.phase || a.subjectId - b.subjectId || a.id - b.id;
}

function fail(message: string): never { throw new TypeError(`Invalid compact scheduler: ${message}`); }

/** JSON.stringify silently drops undefined object fields and changes non-finite
 * numbers to null. Reject those payloads instead of persisting a different event. */
function cloneJsonValue(value: unknown, ancestors: WeakSet<object>, path: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${path} must be a finite JSON number`);
    return value;
  }
  if (typeof value !== 'object') fail(`${path} is not a JSON value`);
  if (ancestors.has(value)) fail(`${path} contains a cycle`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) fail(`${path} has a non-JSON array prototype`);
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== value.length + 1 || ownKeys[ownKeys.length - 1] !== 'length') fail(`${path} has non-JSON array properties`);
      const copy: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(`${path}[${i}] is missing or is not data`);
        copy.push(cloneJsonValue(descriptor.value, ancestors, `${path}[${i}]`));
      }
      return copy;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail(`${path} has a non-JSON object prototype`);
    const copy: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') fail(`${path} has a non-JSON key`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(`${path}.${key} is not JSON data`);
      Object.defineProperty(copy, key, { value: cloneJsonValue(descriptor.value, ancestors, `${path}.${key}`), enumerable: true, writable: true, configurable: true });
    }
    return copy;
  } finally {
    ancestors.delete(value);
  }
}

function cloneJsonData(data: unknown): Readonly<Record<string, unknown>> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('event data must be a JSON object');
  return cloneJsonValue(data, new WeakSet(), 'event data') as Readonly<Record<string, unknown>>;
}

function validEvent(event: CompactEvent): void {
  if (!Number.isSafeInteger(event.id) || event.id < 0) fail('event id');
  if (!Number.isSafeInteger(event.tick) || event.tick < 0) fail('event tick');
  if (!Object.values(COMPACT_PHASE).includes(event.phase)) fail('event phase');
  if (!Number.isSafeInteger(event.subjectId)) fail('event subject');
  if (typeof event.kind !== 'string' || event.kind === '') fail('event kind');
}

export class CompactScheduler {
  /** Kept sorted by `compareCompactEvents`; insertion is a binary search. */
  private pending: CompactEvent[] = [];
  private readonly ids = new Set<number>();
  /** Transaction ids already applied. Never forgotten: a replayed id is a bug. */
  private readonly committed = new Set<number>();
  /** The last tick drained: nothing may be scheduled behind it. */
  private drainedThrough = -1;

  get size(): number { return this.pending.length; }
  get nextTick(): number | null { return this.pending[0]?.tick ?? null; }

  schedule(event: CompactEvent): void {
    validEvent(event);
    if (event.tick <= this.drainedThrough) fail(`event ${event.id} is behind the drained tick ${this.drainedThrough}`);
    if (this.ids.has(event.id)) fail(`duplicate event id ${event.id}`);
    const data = cloneJsonData(event.data);
    let lo = 0, hi = this.pending.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compareCompactEvents(this.pending[mid]!, event) < 0) lo = mid + 1; else hi = mid;
    }
    this.pending.splice(lo, 0, { ...event, data });
    this.ids.add(event.id);
  }

  cancel(id: number): boolean {
    const index = this.pending.findIndex(event => event.id === id);
    if (index < 0) return false;
    this.pending.splice(index, 1);
    this.ids.delete(id);
    return true;
  }

  /** Every pending event of one subject, in order (a copy). */
  forSubject(subjectId: number): CompactEvent[] {
    return this.pending.filter(event => event.subjectId === subjectId);
  }

  /** Remove and return every event due at or before `tick`, in order. */
  drain(tick: number): CompactEvent[] {
    if (!Number.isSafeInteger(tick) || tick < this.drainedThrough) fail('drain tick goes backwards');
    let count = 0;
    while (count < this.pending.length && this.pending[count]!.tick <= tick) count++;
    const due = this.pending.splice(0, count);
    for (const event of due) this.ids.delete(event.id);
    this.drainedThrough = tick;
    return due;
  }

  /** Apply a transaction once. False means it had already been applied. */
  commit(transactionId: number): boolean {
    if (!Number.isSafeInteger(transactionId) || transactionId < 0) fail('transaction id');
    if (this.committed.has(transactionId)) return false;
    this.committed.add(transactionId);
    return true;
  }
  hasCommitted(transactionId: number): boolean { return this.committed.has(transactionId); }

  snapshot(): CompactSchedulerSnapshot {
    return {
      version: 1,
      pending: this.pending.map(event => ({ ...event, data: cloneJsonData(event.data) })),
      committed: [...this.committed].sort((a, b) => a - b),
    };
  }

  static fromSnapshot(snapshot: unknown, drainedThrough = -1): CompactScheduler {
    const raw = snapshot as CompactSchedulerSnapshot;
    if (!raw || typeof raw !== 'object' || raw.version !== 1 || !Array.isArray(raw.pending) || !Array.isArray(raw.committed)) {
      fail('snapshot shape');
    }
    const scheduler = new CompactScheduler();
    scheduler.drainedThrough = drainedThrough;
    for (const event of raw.pending) scheduler.schedule(event);
    for (const id of raw.committed) {
      if (!scheduler.commit(id)) fail(`duplicate transaction id ${id}`);
    }
    return scheduler;
  }
}
