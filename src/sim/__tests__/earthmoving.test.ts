/**
 * Moving earth (M15 phase 26a) and the region repair it rests on (16a).
 *
 * The invariant that protects the whole block: after any sequence of tiles
 * being blocked and unblocked, the incrementally repaired `region` array draws
 * the same partition of the island as a flood fill from nothing. The labels
 * may differ; which tiles share one may not.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../core/World.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';

const world = (seed = 'earth') =>
  new World({ ...DEFAULT_CONFIG.world, width: 64, height: 64 }, new RNG(seed));

/** The partition a full recompute would give, as a canonical label per tile. */
function recompute(w: World): { labels: Int32Array; sizes: Map<number, number> } {
  const labels = new Int32Array(w.walkable.length).fill(-1);
  const sizes = new Map<number, number>();
  let next = 0;
  for (let s = 0; s < labels.length; s++) {
    if (w.walkable[s] !== 1 || labels[s] !== -1) continue;
    const id = next++;
    const stack = [s];
    labels[s] = id;
    let n = 0;
    while (stack.length > 0) {
      const i = stack.pop()!;
      n++;
      const x = i % w.width;
      const around = [
        x > 0 ? i - 1 : -1, x < w.width - 1 ? i + 1 : -1,
        i - w.width, i + w.width,
      ];
      for (const j of around) {
        if (j < 0 || j >= labels.length || w.walkable[j] !== 1 || labels[j] !== -1) continue;
        labels[j] = id;
        stack.push(j);
      }
    }
    sizes.set(id, n);
  }
  return { labels, sizes };
}

/** True when two labellings group the tiles identically. */
function samePartition(a: Int32Array, b: Int32Array): boolean {
  const ab = new Map<number, number>();
  const ba = new Map<number, number>();
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if ((x === -1) !== (y === -1)) return false;
    if (x === -1) continue;
    if (ab.has(x) && ab.get(x) !== y) return false;
    if (ba.has(y) && ba.get(y) !== x) return false;
    ab.set(x, y);
    ba.set(y, x);
  }
  return true;
}

function expectTrue(w: World): void {
  const full = recompute(w);
  expect(samePartition(w.region, full.labels)).toBe(true);
  // The size table agrees too, with no entry for a region that is gone.
  const sizes = [...w.regionSizes.values()].sort((p, q) => p - q);
  expect(sizes).toEqual([...full.sizes.values()].sort((p, q) => p - q));
}

describe('World.setWalkable keeps the landmass labels true', () => {
  it('matches a full recompute after hundreds of seeded blocks and unblocks', () => {
    for (const seed of ['a', 'b', 'c']) {
      const w = world(seed);
      const rng = new RNG('walls-' + seed);
      expectTrue(w);
      for (let step = 0; step < 400; step++) {
        const x = rng.int(0, w.width - 1);
        const y = rng.int(0, w.height - 1);
        w.setWalkable(x, y, !w.isWalkable(x, y));
        if (step % 25 === 0) expectTrue(w);
      }
      expectTrue(w);
    }
  });

  it('cuts a land bridge in two and joins it again', () => {
    const w = world('bridge');
    // A walled line across the island's widest land.
    const row = 32;
    const before = w.regionAt(32, 32);
    expect(before).not.toBe(-1);
    for (let x = 0; x < w.width; x++) w.setWalkable(x, row, false);
    expectTrue(w);
    for (let x = 0; x < w.width; x++) w.setWalkable(x, row, w.biomeAt(x, row) !== 'water' && w.biomeAt(x, row) !== 'rock');
    expectTrue(w);
  });

  it('makes a lone tile its own region and removes it when blocked again', () => {
    const w = world('lone');
    // Find an unwalkable tile whose four neighbours are all unwalkable.
    let found = -1;
    for (let i = 65; i < w.walkable.length - 65; i++) {
      const x = i % w.width;
      if (x === 0 || x === w.width - 1) continue;
      if (w.walkable[i] === 0 && w.walkable[i - 1] === 0 && w.walkable[i + 1] === 0 &&
          w.walkable[i - w.width] === 0 && w.walkable[i + w.width] === 0) { found = i; break; }
    }
    expect(found).toBeGreaterThan(0);
    const x = found % w.width;
    const y = (found - x) / w.width;
    const regions = w.regionSizes.size;
    w.setWalkable(x, y, true);
    expect(w.regionSizes.size).toBe(regions + 1);
    expect(w.regionSizes.get(w.regionAt(x, y))).toBe(1);
    w.setWalkable(x, y, false);
    expect(w.regionSizes.size).toBe(regions);
    expectTrue(w);
  });
});

describe('World.dig and World.pile', () => {
  const grassTile = (w: World) => {
    for (let i = 0; i < w.biome.length; i++) {
      const x = i % w.width;
      const y = (i - x) / w.width;
      if (w.biomeAt(x, y) === 'grass' && x > 8 && y > 8 && x < w.width - 8 && y < w.height - 8) return { x, y };
    }
    throw new Error('no grass');
  };

  it('lowers the height, and piling puts it back', () => {
    const w = world();
    const { x, y } = grassTile(w);
    const h0 = w.heightAt(x, y);
    w.dig(x, y, 0.002);
    expect(w.heightAt(x, y)).toBeCloseTo(h0 - 0.002, 6);
    expect(w.depthDug(x, y)).toBeCloseTo(0.002, 6);
    expect(w.isWalkable(x, y)).toBe(true);
    w.pile(x, y, 0.002);
    expect(w.heightAt(x, y)).toBeCloseTo(h0, 6);
  });

  it('leaves a world nobody has dug exactly as it was', () => {
    const a = world('same');
    const b = world('same');
    const { x, y } = grassTile(a);
    a.dig(x, y, 0.001);
    a.pile(x, y, 0.001);
    expect(Array.from(a.walkable)).toEqual(Array.from(b.walkable));
    expect(a.offset[a.index(x, y)]).toBeCloseTo(0, 9);
  });

  it('blocks a tile dug past pitDepth and frees it when it is filled', () => {
    const w = world();
    const { x, y } = grassTile(w);
    w.dig(x, y, DEFAULT_CONFIG.world.pitDepth * 1.5);
    expect(w.isWalkable(x, y)).toBe(false);
    expect(w.regionAt(x, y)).toBe(-1);
    expectTrue(w);
    w.pile(x, y, DEFAULT_CONFIG.world.pitDepth);
    expect(w.isWalkable(x, y)).toBe(true);
    expectTrue(w);
  });

  it('never makes water or rock walkable by piling on it', () => {
    const w = world();
    let wx = -1, wy = -1;
    for (let i = 0; i < w.biome.length; i++) {
      const x = i % w.width;
      const y = (i - x) / w.width;
      if (w.biomeAt(x, y) === 'water') { wx = x; wy = y; break; }
    }
    w.pile(wx, wy, 0.05);
    expect(w.isWalkable(wx, wy)).toBe(false);
  });

  it('raises the sight bonus of a mound and drops it again when levelled', () => {
    const w = world();
    const { x, y } = grassTile(w);
    const flat = w.sightBonusAt(x, y);
    w.pile(x, y, 0.03);
    expect(w.sightBonusAt(x, y)).toBeGreaterThan(flat);
    w.dig(x, y, 0.03);
    expect(w.sightBonusAt(x, y)).toBeCloseTo(flat, 6);
  });
});
