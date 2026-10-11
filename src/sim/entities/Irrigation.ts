/** Small-scale canal irrigation, M15 phase 26e. */
import type { World } from '../core/World.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { Building } from './Building.ts';

/** A working canal gives a modest growth advantage to fields within this reach. */
export const CANAL_IRRIGATION_RADIUS = 3;
/** Initial 26e value; the whole-game agricultural calibration remains open. */
export const IRRIGATED_GROWTH_FACTOR = 1.25;

/**
 * Whether a finished canal supplies freshwater close enough to this field.
 * Candidate buildings come from the spatial hash; only the small canal tile
 * lists are inspected after that, so adding fields does not turn into a world
 * scan. A dry canal is not a water source, and salt water never irrigates.
 */
export function isFieldIrrigated(
  field: Building, world: World, buildingHash: SpatialHash<Building>
): boolean {
  const fieldTiles: { x: number; y: number }[] = [];
  for (let dy = 0; dy < field.def.height; dy++) {
    for (let dx = 0; dx < field.def.width; dx++) {
      fieldTiles.push({ x: field.x + dx, y: field.y + dy });
    }
  }
  // The hash indexes a building at its origin, so include the maximum canal
  // half-length and field half-diagonal when selecting candidate origins.
  const radius = CANAL_IRRIGATION_RADIUS + 3 + Math.hypot(field.def.width, field.def.height) / 2;
  for (const canal of buildingHash.queryRadius(field.centerX, field.centerY, radius)) {
    if (!canal.complete || (canal.def.earthwork?.turnOf ?? canal.def.id) !== 'canal' || !canal.earth) continue;
    for (const water of canal.earth) {
      if (!world.isFreshWater(water.x, water.y)) continue;
      for (const tile of fieldTiles) {
        const dx = water.x - tile.x;
        const dy = water.y - tile.y;
        if (dx * dx + dy * dy <= CANAL_IRRIGATION_RADIUS ** 2) return true;
      }
    }
  }
  return false;
}

/** Season growth delivered to one field, leaving other crops bit-for-bit unchanged. */
export function fieldSeasonGrowth(
  field: Building, seasonGrowth: number, world: World, buildingHash: SpatialHash<Building>
): number {
  return seasonGrowth * (isFieldIrrigated(field, world, buildingHash) ? IRRIGATED_GROWTH_FACTOR : 1);
}
