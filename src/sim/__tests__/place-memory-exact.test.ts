/**
 * The M15 step 0 speed-ups to `PlaceMemory` must change nothing it remembers.
 *
 * `observePlaces` was 45 % of a step with 300 people in one camp, almost all of
 * it `PlaceMemory.remember` evicting and re-inserting the 48 people it can hold.
 * The fix removed redundant work (allocations, Map writes that change nothing)
 * and kept every operation that is observable. "Observable" includes the order
 * of the cells inside the spatial hashes, because `findNearest` breaks ties by
 * walking them and a save writes them out. So this test runs the real class and
 * a frozen copy of the old one through the same random operations and compares
 * every private field, in order, after each one.
 */
import { describe, expect, it } from 'vitest';
import { PlaceMemory } from '../social/PlaceMemory.ts';
import { PlaceMemoryReference } from './reference/PlaceMemoryReference.ts';
import { RNG } from '../core/RNG.ts';

/** Every own field, Maps and Sets in iteration order, hashes cell by cell. */
function snapshot(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[cycle]';
  seen.add(value);
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
  if (Array.isArray(value)) return value.map(entry => snapshot(entry, seen));
  if (value instanceof Map) return ['Map', [...value.entries()].map(([k, v]) => [k, snapshot(v, seen)])];
  if (value instanceof Set) return ['Set', [...value.values()].map(v => snapshot(v, seen))];
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) out[key] = snapshot((value as Record<string, unknown>)[key], seen);
  seen.delete(value);
  return out;
}

const KINDS = ['resource:berries', 'resource:flint', 'tree', 'water', 'herd:deer', 'person', 'person', 'person'];

function drive(seed: string, cap: number, size: number, steps: number): void {
  const rng = new RNG(seed);
  const fresh = new PlaceMemory(size, size, cap);
  const old = new PlaceMemoryReference(size, size, cap);
  let day = 1;
  for (let i = 0; i < steps; i++) {
    const pick = rng.next();
    if (rng.next() < 0.05) day += rng.int(0, 2);
    const kind = KINDS[rng.int(0, KINDS.length - 1)]!;
    // Coordinates drift over a few cells so the same cell is revisited, the
    // case the "nothing changed" shortcut and the in-place replacement serve.
    const x = Math.round(rng.next() * (size - 1) * 4) / 4;
    const y = Math.round(rng.next() * (size - 1) * 4) / 4;
    if (pick < 0.7) {
      const amount = rng.int(0, 2) as 0 | 1 | 2;
      const source = rng.next() < 0.8 ? 'seen' as const : 'told' as const;
      const visual = kind === 'person'
        ? { type: 'person' as const, id: rng.int(1, 3 * cap), sex: 'male' as const, age: 'adult' as const, bandId: rng.int(0, 2) }
        : undefined;
      const when = rng.next() < 0.1 ? Math.max(1, day - rng.int(1, 5)) : day;
      fresh.remember(kind, x, y, when, amount, source, visual);
      old.remember(kind, x, y, when, amount, source, visual);
    } else if (pick < 0.85) {
      const amount = rng.int(0, 2) as 0 | 1 | 2;
      expect(fresh.updateAt(kind, x, y, amount)).toBe(old.updateAt(kind, x, y, amount));
    } else if (pick < 0.95) {
      fresh.observe(x, y, 5, day);
      old.observe(x, y, 5, day);
    } else if (pick < 0.98) {
      // The comarca changing size or the cap changing re-keys and trims.
      const nextCap = Math.max(1, cap - rng.int(0, 2));
      fresh.configure(size, size, nextCap);
      old.configure(size, size, nextCap);
    } else {
      expect(fresh.nearestAny(x, y, 12)).toEqual(old.nearestAny(x, y, 12));
      expect(fresh.nearest(kind, x, y)).toEqual(old.nearest(kind, x, y));
    }
    // Compare after every operation, not at the end: a divergence that heals
    // itself by the end is still a divergence.
    if (i % 7 === 0 || i === steps - 1) {
      expect(snapshot(fresh), `operation ${i} (seed ${seed}, cap ${cap})`).toEqual(snapshot(old));
    }
  }
  expect(snapshot(fresh)).toEqual(snapshot(old));
}

describe('PlaceMemory speed-ups are exact', () => {
  it('matches the frozen reference through thousands of random operations', () => {
    for (const [seed, cap, size] of [['a', 4, 48], ['b', 6, 64], ['c', 48, 64], ['d', 2, 32], ['e', 9, 80]] as const) {
      drive(seed, cap, size, 1500);
    }
  });

  it('can fail: a memory that forgets a different place is detected', () => {
    // The negative control the comparison needs: two memories given different
    // histories must not snapshot equal, or the test above proves nothing.
    const a = new PlaceMemory(32, 32, 2);
    const b = new PlaceMemoryReference(32, 32, 2);
    a.remember('tree', 1, 1, 1, 2);
    b.remember('tree', 1, 1, 1, 2);
    a.remember('tree', 9, 1, 2, 2);
    b.remember('tree', 9, 1, 3, 2);
    expect(snapshot(a)).not.toEqual(snapshot(b));
  });
});
