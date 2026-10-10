import type { Building } from '../entities/Building.ts';
import type { SpatialHash } from './SpatialHash.ts';

/** A measured source, independent of presentation and of any observer's knowledge. */
export interface LightSource { readonly x: number; readonly y: number; readonly radius: number; readonly strength: number }
export const HEARTH_LIGHT_RADIUS = 4;

/** A completed hearth is the existing tended-fire model; roofs are not fires. */
export function hearthLight(building: Building): LightSource | null {
  return building.complete && !building.ruined && building.def.id === 'hearth'
    ? { x: building.centerX, y: building.centerY, radius: HEARTH_LIGHT_RADIUS, strength: 1 }
    : null;
}

/** Linear falloff; overlapping lights never add up to brighter than daylight. */
export function sourceLightAt(source: LightSource, x: number, y: number): number {
  if (source.radius <= 0) return 0;
  return Math.max(0, Math.min(1, source.strength)) *
    Math.max(0, 1 - Math.hypot(source.x - x, source.y - y) / source.radius);
}

/** Nearby sources come from the same spatial index as the simulation's buildings. */
export function lightAt(x: number, y: number, daylight: number, buildings: SpatialHash<Building>): number {
  let light = Math.max(0, Math.min(1, daylight));
  // Hearths are one tile; the extra tile covers an index anchored on its origin.
  for (const building of buildings.queryRadius(x, y, HEARTH_LIGHT_RADIUS + 1)) {
    const source = hearthLight(building);
    if (source) light = Math.max(light, sourceLightAt(source, x, y));
  }
  return light;
}
