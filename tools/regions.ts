/**
 * M15 26f: independently flood-fill the final world and audit the incremental
 * regions. Labels may change when a bridge is cut, so compare partitions with
 * a bijection, not raw ids. Checking only sizes misses equally sized islands
 * accidentally merged under one id, or a stale id pointing at another island.
 * Harness-only: the O(tiles) recompute must never run in Simulation.step().
 */
import type { World } from '../src/sim/core/World.ts';

type Partition = Pick<World, 'width'> & {
  walkable: Uint8Array;
  region: Int32Array;
  regionSizes: ReadonlyMap<number, number>;
};

function auditPartition(
  width: number,
  length: number,
  passable: (x: number, y: number, index: number) => boolean,
  actual: Int32Array,
  actualSizes: ReadonlyMap<number, number>,
): { ok: boolean; components: number; tileErrors: number; sizeErrors: number } {
  const labels = new Int32Array(length).fill(-1);
  let components = 0;
  for (let start = 0; start < labels.length; start++) {
    const sx = start % width, sy = Math.floor(start / width);
    if (!passable(sx, sy, start) || labels[start] !== -1) continue;
    const id = components++;
    const stack = [start];
    labels[start] = id;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % width, y = Math.floor(i / width);
      for (const next of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1, y + 1 < Math.ceil(length / width) ? i + width : -1]) {
        if (next < 0 || next >= labels.length || labels[next] !== -1 ||
            !passable(next % width, Math.floor(next / width), next)) continue;
        labels[next] = id;
        stack.push(next);
      }
    }
  }

  const forward = new Map<number, number>();
  const backward = new Map<number, number>();
  const sizes = new Map<number, number>();
  let tileErrors = 0;
  for (let i = 0; i < labels.length; i++) {
    const full = labels[i]!;
    const incremental = actual[i]!;
    if (full === -1) {
      if (incremental !== -1) tileErrors++;
      continue;
    }
    if (incremental < 0) { tileErrors++; continue; }
    sizes.set(incremental, (sizes.get(incremental) ?? 0) + 1);
    if ((forward.has(full) && forward.get(full) !== incremental) ||
        (backward.has(incremental) && backward.get(incremental) !== full)) tileErrors++;
    forward.set(full, incremental);
    backward.set(incremental, full);
  }
  let sizeErrors = 0;
  for (const id of new Set([...sizes.keys(), ...actualSizes.keys()])) {
    if (sizes.get(id) !== actualSizes.get(id)) sizeErrors++;
  }
  return { ok: tileErrors === 0 && sizeErrors === 0, components, tileErrors, sizeErrors };
}

export function auditRegions(world: Partition): {
  ok: boolean; components: number; tileErrors: number; sizeErrors: number;
} {
  return auditPartition(world.width, world.walkable.length,
    (_x, _y, index) => world.walkable[index] === 1,
    world.region, world.regionSizes);
}

/** Independently recompute the mixed land-and-swimmable-water graph. */
export function auditSwimRegions(world: Pick<World,
  'width' | 'height' | 'walkable' | 'isSwimTile' | 'swimRegion' | 'swimRegionSizes' | 'swimRegionAt'>): {
  ok: boolean; components: number; tileErrors: number; sizeErrors: number;
} {
  // Swim labels are lazy because terrain edits are rare; ask the public getter
  // once so the arrays below describe the current world, then independently
  // flood-fill without asking World to repair or compare the partition.
  world.swimRegionAt(0, 0);
  return auditPartition(world.width, world.walkable.length,
    (x, y, index) => world.walkable[index] === 1 || world.isSwimTile(x, y),
    world.swimRegion, world.swimRegionSizes);
}
