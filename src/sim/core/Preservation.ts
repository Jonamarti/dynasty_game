import type { World } from './World.ts';

/** Salt pans draw from water beside their footprint, not an invisible inventory.
 * Classic islands deliberately let people drink their sea; salt work retains
 * its maritime provenance without changing that older drinking contract. */
export function saltSourceNear(world: World, x: number, y: number, width: number, height: number): boolean {
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
    for (const [ox, oy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const tx = x + dx + ox, ty = y + dy + oy;
      if (world.inBounds(tx, ty) && world.isWater(tx, ty) && (!world.waterKind || world.isSaltWater(tx, ty))) return true;
    }
  }
  return false;
}
