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

  it('runs the filter only for candidates that can improve the current nearest', () => {
    const nearest = { id: 1, x: 1, y: 0 };
    const tied = { id: 2, x: -1, y: 0 };
    const farther = { id: 3, x: 3, y: 0 };
    const hash = new SpatialHash<Point>(8);
    hash.rebuild([nearest, tied, farther]);
    const checked: number[] = [];

    const found = hash.findNearest(0, 0, 8, point => {
      checked.push(point.id);
      return true;
    });

    // The two nearest points tie, so the existing cell and insertion order
    // still chooses the first one. Neither the tie nor the farther point can
    // improve it, and therefore neither needs the caller's predicate.
    expect(found).toBe(nearest);
    expect(checked).toEqual([nearest.id]);
  });

  it('continues past a closer candidate rejected by the filter', () => {
    const rejected = { id: 1, x: 1, y: 0 };
    const accepted = { id: 2, x: 3, y: 0 };
    const farther = { id: 3, x: 5, y: 0 };
    const hash = new SpatialHash<Point>(8);
    hash.rebuild([rejected, accepted, farther]);
    const checked: number[] = [];

    const found = hash.findNearest(0, 0, 8, point => {
      checked.push(point.id);
      return point.id !== rejected.id;
    });

    expect(found).toBe(accepted);
    expect(checked).toEqual([rejected.id, accepted.id]);
  });

  it('matches independent nearest searches when predicates share a traversal', () => {
    const rng = new RNG('nearest-many');
    const points = makePoints(800, 160, rng);
    // Pin candidates on cell edges and at the origin so ring/cutoff boundaries
    // are exercised alongside seeded ordinary positions.
    points.push({ id: 800, x: 8, y: 0 }, { id: 801, x: 16, y: 0 },
      { id: 802, x: -8, y: 0 }, { id: 803, x: 0, y: 0 });
    const hash = new SpatialHash<Point>(8);
    hash.rebuild(points);
    const filters = [
      (point: Point) => point.id % 2 === 0,
      (point: Point) => point.id % 3 === 1,
      (point: Point) => point.x < 0,
      () => false,
    ];

    for (let trial = 0; trial < 120; trial++) {
      const x = trial < 4 ? 0 : rng.range(-10, 170);
      const y = trial < 4 ? 0 : rng.range(-10, 170);
      const radius = trial < 4 ? [8, 16, 24, 32][trial]! : rng.range(1, 50);
      const grouped = hash.findNearestMany(x, y, radius, filters);
      for (let i = 0; i < filters.length; i++) {
        const single = hash.findNearest(x, y, radius, filters[i]);
        const exhaustive = bruteNearest(points.filter(filters[i]!), x, y, radius);
        expect(grouped[i]?.id ?? null).toBe(single?.id ?? null);
        if (exhaustive === null) expect(grouped[i]).toBeNull();
        else {
          expect(grouped[i]).not.toBeNull();
          const actual = (grouped[i]!.x - x) ** 2 + (grouped[i]!.y - y) ** 2;
          const expected = (exhaustive.x - x) ** 2 + (exhaustive.y - y) ** 2;
          expect(actual).toBeCloseTo(expected, 10);
        }
      }
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

  it('removes an updated record from its old cell', () => {
    const old = { id: 1, x: 1, y: 1 };
    const nearby = { id: 2, x: 3, y: 1 };
    const hash = new SpatialHash<Point>(8);
    hash.insert(old);
    hash.insert(nearby);
    expect(hash.remove(old)).toBe(true);
    expect(hash.findNearest(1, 1, 8)?.id).toBe(nearby.id);
    expect(hash.remove(old)).toBe(false);
  });
});
