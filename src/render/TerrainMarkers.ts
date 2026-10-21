import type { World } from '../sim/core/World.ts';
import { canDigBankMud } from '../sim/core/Earth.ts';

/** Static terrain tiles the player can dig for mud, independent of fog. */
export function mudBankMarkerIndices(world: World): ReadonlySet<number> {
  const result = new Set<number>();
  for (const tile of world.freshShore) {
    if (canDigBankMud(world, tile.x, tile.y)) result.add(world.index(tile.x, tile.y));
  }
  return result;
}

/** Coordinate view for tests and tools that need to inspect the marker set. */
export function mudBankMarkerTiles(world: World): { x: number; y: number }[] {
  return [...mudBankMarkerIndices(world)].map(index => ({
    x: index % world.width,
    y: Math.floor(index / world.width),
  }));
}
