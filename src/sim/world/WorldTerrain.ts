/**
 * What kind of country a comarca is, in the handful of words a globe can use,
 * whichever of the two geographies it came from. M15 phase 31.
 *
 * The random map classifies by biome and the Earth atlas by Köppen climate
 * class; the globe wants one vocabulary and one colour per word. Pure and
 * draw-free, and it answers `null` for the classic island, which has no
 * globe: the honest answer to "what is there?" is that nothing is known.
 */
import type { WorldGeography, WorldGeographyProfile } from './WorldGeography.ts';
import { COMARCAS_PER_REGION } from './WorldMap.ts';
import { WORLD_FEATURE } from './WorldFeatureSeeds.ts';

export const WORLD_TERRAINS = [
  'ocean', 'lake', 'ice', 'tundra', 'boreal_forest', 'temperate_forest',
  'grassland', 'steppe', 'desert', 'savanna', 'tropical_forest',
] as const;
export type WorldTerrain = (typeof WORLD_TERRAINS)[number];

/** Beck et al. Köppen-Geiger class (1-30) to the globe's vocabulary. */
function terrainOfKoppen(koppen: number): WorldTerrain {
  if (koppen === 1 || koppen === 2) return 'tropical_forest';
  if (koppen === 3) return 'savanna';
  if (koppen === 4 || koppen === 5) return 'desert';
  if (koppen === 6 || koppen === 7) return 'steppe';
  if (koppen >= 8 && koppen <= 16) return 'temperate_forest';
  if (koppen >= 17 && koppen <= 28) return 'boreal_forest';
  if (koppen === 29) return 'tundra';
  if (koppen === 30) return 'ice';
  // Unclassified land: the atlas says nothing, so the globe says nothing more
  // than "open country".
  return 'grassland';
}

export function worldTerrainOf(profile: WorldGeographyProfile): WorldTerrain | null {
  if (profile.kind === 'legacyIsland') return null;
  if (profile.kind === 'random') return profile.biome;
  if (profile.water === 'salt') return 'ocean';
  // `water === 'fresh'` also fires for a comarca a river merely passes
  // through (RealWorldMap.ts sets it from river-or-lake features alike), so
  // reading it alone painted almost every forested region of the globe blue.
  // Only an actual lake feature makes the comarca itself a body of water;
  // a river still leaves the surrounding biome in charge of the colour.
  if (profile.water === 'fresh' && (profile.features & WORLD_FEATURE.lake) !== 0) return 'lake';
  return terrainOfKoppen(profile.climateClass);
}

/** The globe's grid: regions across and down, and how many comarcas a region holds a side. */
export interface GlobeGrid {
  regionsWide: number;
  regionsHigh: number;
  perRegion: number;
  /** Comarcas across and down the whole globe. */
  width: number;
  height: number;
}

export function globeGridOf(geography: WorldGeography): GlobeGrid | null {
  if (geography.kind === 'legacyIsland') return null;
  const map = geography.map;
  const perRegion = geography.kind === 'random' ? COMARCAS_PER_REGION : geography.map.comarcasPerRegion;
  return { regionsWide: map.regionsWide, regionsHigh: map.regionsHigh, perRegion, width: map.width, height: map.height };
}

const HOMELANDS: readonly WorldTerrain[] = ['temperate_forest', 'grassland', 'steppe'];

/**
 * Where a populated world on this globe begins: the first region, searched from
 * the middle of the map outward in a fixed order, that is open temperate country
 * with dry land in every region around it, so a local map of `span` comarcas
 * fits wholly on land. Pure, draw-free and the same on every run, which is what
 * lets `?world=random&seed=...` name a world. Null if the globe has no such place.
 *
 * Coordinates are in comarca units: `x`/`y` is the centre of the local map, and
 * with an even `span` it falls on a comarca edge, as `GeographicStart` wants.
 */
export function findGlobeStart(geography: WorldGeography, span: number): { x: number; y: number } | null {
  const grid = globeGridOf(geography);
  if (!grid) return null;
  const terrainOfRegion = (rx: number, ry: number): WorldTerrain | null => {
    const wrapped = ((rx % grid.regionsWide) + grid.regionsWide) % grid.regionsWide;
    if (ry < 0 || ry >= grid.regionsHigh) return null;
    return worldTerrainOf(geography.profileAt(
      wrapped * grid.perRegion + grid.perRegion / 2, ry * grid.perRegion + grid.perRegion / 2));
  };
  const cx = Math.floor(grid.regionsWide / 2), cy = Math.floor(grid.regionsHigh / 2);
  const order: { rx: number; ry: number; d: number }[] = [];
  for (let ry = 1; ry < grid.regionsHigh - 1; ry++) {
    for (let rx = 0; rx < grid.regionsWide; rx++) {
      order.push({ rx, ry, d: (rx - cx) ** 2 + (ry - cy) ** 2 });
    }
  }
  order.sort((a, b) => a.d - b.d || a.ry - b.ry || a.rx - b.rx);
  for (const { rx, ry } of order) {
    const here = terrainOfRegion(rx, ry);
    if (!here || !HOMELANDS.includes(here)) continue;
    let dry = true;
    for (let dy = -1; dy <= 1 && dry; dy++) for (let dx = -1; dx <= 1 && dry; dx++) {
      const around = terrainOfRegion(rx + dx, ry + dy);
      if (!around || around === 'ocean' || around === 'lake' || around === 'ice') dry = false;
    }
    if (!dry) continue;
    const x = rx * grid.perRegion + grid.perRegion / 2;
    const y = ry * grid.perRegion + grid.perRegion / 2;
    // The local map must fit inside the globe and clear of the poles.
    if (y - span / 2 < 0 || y + span / 2 > grid.height) continue;
    return { x, y };
  }
  return null;
}
