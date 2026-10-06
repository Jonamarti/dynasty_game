import { describe, expect, it } from 'vitest';
import { COMPACT_PHASE, CompactScheduler, type CompactEvent } from '../compact/CompactScheduler.ts';

const ev = (id: number, tick: number, phase: CompactEvent['phase'], subjectId: number, kind = 'x'): CompactEvent =>
  ({ id, tick, phase, subjectId, kind, data: { id } });
const events = [
  ev(1, 50, COMPACT_PHASE.work, 9), ev(2, 50, COMPACT_PHASE.arrival, 9), ev(3, 50, COMPACT_PHASE.work, 4),
  ev(4, 10, COMPACT_PHASE.demography, 1), ev(5, 50, COMPACT_PHASE.work, 4), ev(6, 70, COMPACT_PHASE.urgent, 2),
];

describe('compact scheduler', () => {
  it('orders by tick, phase, subject and id, whatever the insertion order', () => {
    const forward = new CompactScheduler(); const backward = new CompactScheduler();
    for (const e of events) forward.schedule(e);
    for (const e of [...events].reverse()) backward.schedule(e);
    const order = forward.drain(100).map(e => e.id);
    expect(order).toEqual([4, 2, 3, 5, 1, 6]);
    expect(backward.drain(100).map(e => e.id)).toEqual(order);
  });

  it('drains in slices without losing or repeating events and refuses to go back in time', () => {
    const s = new CompactScheduler();
    for (const e of events) s.schedule(e);
    const seen = [...s.drain(10), ...s.drain(49), ...s.drain(50), ...s.drain(60), ...s.drain(70)].map(e => e.id);
    expect(seen).toEqual([4, 2, 3, 5, 1, 6]);
    expect(() => s.drain(5)).toThrow();
    expect(() => s.schedule(ev(99, 70, COMPACT_PHASE.work, 1))).toThrow(/behind/);
  });

  it('saves and restores pending events and applied transactions', () => {
    const s = new CompactScheduler();
    for (const e of events) s.schedule(e);
    s.commit(7001);
    s.drain(10);
    const copy = CompactScheduler.fromSnapshot(JSON.parse(JSON.stringify(s.snapshot())), 10);
    expect(copy.snapshot()).toEqual(s.snapshot());
    expect(copy.drain(100).map(e => e.id)).toEqual(s.drain(100).map(e => e.id));
    expect(copy.hasCommitted(7001)).toBe(true);
  });

  it('negative controls: a duplicated event or transfer is refused, a lost event is detectable', () => {
    const s = new CompactScheduler();
    s.schedule(events[0]!);
    expect(() => s.schedule(events[0]!)).toThrow(/duplicate event/);
    expect(s.commit(42)).toBe(true);
    expect(s.commit(42)).toBe(false); // the second application of one transfer is a no-op
    const lossy = CompactScheduler.fromSnapshot({ ...s.snapshot(), pending: [] });
    expect(lossy.size).not.toBe(s.size); // a snapshot that drops events differs from the original
    expect(() => CompactScheduler.fromSnapshot({ ...s.snapshot(), committed: [42, 42] })).toThrow(/duplicate transaction/);
    expect(() => s.schedule({ ...events[1]!, tick: -1 })).toThrow();
  });

  it('cancel removes one event and frees its id', () => {
    const s = new CompactScheduler();
    s.schedule(events[0]!);
    expect(s.cancel(1)).toBe(true);
    expect(s.cancel(1)).toBe(false);
    s.schedule(events[0]!);
    expect(s.size).toBe(1);
  });
});
