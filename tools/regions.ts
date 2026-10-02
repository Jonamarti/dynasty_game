/**
 * M15 26f: independently flood-fill the final world and audit the incremental
 * regions. Labels may change when a bridge is cut, so compare partitions with
 * a bijection, not raw ids. Checking only sizes misses equally sized islands
 * accidentally merged under one id, or a stale id pointing at another island.
 * Harness-only: the O(tiles) recompute must never run in Simulation.step().
 */
import type { World } from '../src/sim/core/World.ts';

export function auditRegions(world: Pick<World, 'width' | 'walkable' | 'region' | 'regionSizes'>): {
  ok: boolean; components: number; tileErrors: number; sizeErrors: number;
} {
  const labels = new Int32Array(world.walkable.length).fill(-1);
  let components = 0;
  for (let start = 0; start < labels.length; start++) {
    if (world.walkable[start] !== 1 || labels[start] !== -1) continue;
    const id = components++;
    const stack = [start];
    labels[start] = id;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % world.width;
      for (const next of [x > 0 ? i - 1 : -1, x < world.width - 1 ? i + 1 : -1,
        i - world.width, i + world.width]) {
        if (next < 0 || next >= labels.length || world.walkable[next] !== 1 || labels[next] !== -1) continue;
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
    const incremental = world.region[i]!;
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
  for (const id of new Set([...sizes.keys(), ...world.regionSizes.keys()])) {
    if (sizes.get(id) !== world.regionSizes.get(id)) sizeErrors++;
  }
  return { ok: tileErrors === 0 && sizeErrors === 0, components, tileErrors, sizeErrors };
}
