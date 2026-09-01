/**
 * The spatial hash is checked against brute force.
 *
 * It exists purely as an optimisation, and an optimisation that returns a
 * different answer from the naive version is worse than no optimisation at all
 * — the whole simulation would quietly make decisions on wrong neighbours. So
 * every query here is compared to the exhaustive scan it replaces.
 */
import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../core/SpatialHash.ts';
import { RNG } from '../core/RNG.ts';

interface Point { x: number; y: number; id: number }

function makePoints(count: number, spread: number, rng: RNG): Point[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    x: rng.range(0, spread),
    y: rng.range(0, spread),
  }));
}

function bruteRadius(points: Point[], x: number, y: number, r: number): number[] {
  return points
    .filter(p => (p.x - x) ** 2 + (p.y - y) ** 2 <= r * r)
    .map(p => p.id)
    .sort((a, b) => a - b);
}

function bruteNearest(points: Point[], x: number, y: number, r: number): Point | null {
  let best: Point | null = null;
  let bestD2 = r * r;
  for (const p of points) {
    const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

describe('SpatialHash', () => {
  it('returns exactly what a brute-force radius scan returns', () => {
    const rng = new RNG('radius');
    const points = makePoints(400, 120, rng);
    const hash = new SpatialHash<Point>(8);
    hash.rebuild(points);

    for (let trial = 0; trial < 200; trial++) {
      const x = rng.range(-10, 130);
      const y = rng.range(-10, 130);
      const r = rng.range(1, 30);
      const got = hash.queryRadius(x, y, r).map(p => p.id).sort((a, b) => a - b);
      expect(got).toEqual(bruteRadius(points, x, y, r));
    }
  });

  it('finds the same nearest point a brute-force scan finds', () => {
    const rng = new RNG('nearest');
    const points = makePoints(300, 120, rng);
    const hash = new SpatialHash<Point>(8);
    hash.rebuild(points);

    for (let trial = 0; trial < 200; trial++) {
      const x = rng.range(-10, 130);
      const y = rng.range(-10, 130);
      const r = rng.range(1, 40);
      const got = hash.findNearest(x, y, r);
      const want = bruteNearest(points, x, y, r);
      // Ties are possible in principle; compare distance rather than identity.
      if (want === null) {
        expect(got).toBeNull();
      } else {
        expect(got).not.toBeNull();
        const gotD2 = (got!.x - x) ** 2 + (got!.y - y) ** 2;
        const wantD2 = (want.x - x) ** 2 + (want.y - y) ** 2;
        expect(gotD2).toBeCloseTo(wantD2, 10);
      }
    }
  });

  it('honours the filter when finding the nearest', () => {
    const rng = new RNG('filter');
    const points = makePoints(300, 100, rng);
    const hash = new SpatialHash<Point>(8);
    hash.rebuild(points);

    const evenOnly = (p: Point) => p.id % 2 === 0;
    for (let trial = 0; trial < 100; trial++) {
      const x = rng.range(0, 100);
      const y = rng.range(0, 100);
      const got = hash.findNearest(x, y, 50, evenOnly);
      const want = bruteNearest(points.filter(evenOnly), x, y, 50);
      if (want === null) expect(got).toBeNull();
      else expect(got!.id % 2).toBe(0);
    }
  });

  it('handles negative coordinates without key collisions', () => {
    const hash = new SpatialHash<Point>(8);
    const points: Point[] = [
      { id: 0, x: -100, y: -100 },
      { id: 1, x: 100, y: 100 },
      { id: 2, x: -100, y: 100 },
      { id: 3, x: 100, y: -100 },
    ];
    hash.rebuild(points);
    for (const p of points) {
      const found = hash.queryRadius(p.x, p.y, 1);
      expect(found.map(f => f.id)).toEqual([p.id]);
    }
  });

  it('spreads a uniform population across many buckets', () => {
    const rng = new RNG('spread');
    const hash = new SpatialHash<Point>(8);
    hash.rebuild(makePoints(1000, 200, rng));
    const stats = hash.stats();
    expect(stats.items).toBe(1000);
    expect(stats.cells).toBeGreaterThan(100);
    // The point of the index: no single bucket may hold a large share of the
    // population, or queries degrade back toward the linear scan it replaced.
    expect(stats.maxBucket).toBeLessThan(40);
  });
});
