/**
 * Projects a global comarca profile into one detailed local World. Regional
 * water features are only candidate source areas; Hydrology traces local
 * channels from the elevation field instead of turning a flagged region into
 * one broad water body.
 */
import type { WorldConfig } from '../core/Config.ts';
import type { WorldGeography, WorldGeographyProfile } from './WorldGeography.ts';
import { WORLD_FEATURE } from './WorldFeatureSeeds.ts';
import { generateLocalHydrology, type HydrologyResult } from './Hydrology.ts';

export interface LocalGeographyBounds {
  /** Global comarca coordinate of the local map's north-west corner. */
  originX: number;
  originY: number;
  /** Continuous comarca dimensions covered by this detailed local map. */
  comarcasWide: number;
  comarcasHigh: number;
}

export interface LocalTerrainSample {
  /** Unmodified regional/geographic source data for provenance and resources. */
  profile: Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>;
  /** Height in World elevation units; config.waterLevel denotes sea level. */
  elevation: number;
  /** Coarse regional wetness mapped to [0, 1], not local rainfall. */
  moisture: number;
  /** Derived from continuous elevation, never from a regional land/water flag. */
  land: boolean;
}

export interface LocalGeographySource {
  readonly kind: 'random' | 'earth';
  readonly bounds: Readonly<LocalGeographyBounds>;
  /** Local tile coordinates (0..width, 0..height) to continuous global profile. */
  profileAtLocal(x: number, y: number): Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>;
  sample(x: number, y: number): LocalTerrainSample;
  /** Natural freshwater at a local tile; surface is absolute World elevation. */
  hydrologyAt(x: number, y: number): { kind: 'fresh'; surface: number } | null;
  /** Generated centerline courses, for generation checks and map inspection. */
  readonly hydrology: HydrologyResult;
}

/**
 * The random world map's relief is dimensionless. One relief unit becomes
 * 1.8 World elevation units: enough for local water/beach/hill bands while
 * keeping its explicitly normalized source scale separate from Earth metres.
 */
export const RANDOM_RELIEF_TO_WORLD_UNITS = 1.8;

export function createLocalGeography(
  geography: WorldGeography,
  bounds: LocalGeographyBounds,
  config: Pick<WorldConfig, 'width' | 'height' | 'waterLevel' | 'metresPerUnit' | 'wadeDepth' | 'swimDepth'>,
): LocalGeographySource {
  if (geography.kind === 'legacyIsland') {
    throw new RangeError('Legacy island geography has no global profile to project');
  }
  if (![bounds.originX, bounds.originY, bounds.comarcasWide, bounds.comarcasHigh].every(Number.isFinite) ||
      bounds.comarcasWide <= 0 || bounds.comarcasHigh <= 0) {
    throw new RangeError('Local geography bounds must be finite and have positive dimensions');
  }
  if (!Number.isInteger(config.width) || config.width <= 0 ||
      !Number.isInteger(config.height) || config.height <= 0 ||
      !Number.isFinite(config.waterLevel) || !Number.isFinite(config.metresPerUnit) || config.metresPerUnit <= 0) {
    throw new RangeError('Local geography needs a valid World size, sea level and metres-per-unit scale');
  }

  const frozenBounds = Object.freeze({ ...bounds });
  const width = config.width;
  const height = config.height;
  const waterLevel = config.waterLevel;
  const metresPerUnit = config.metresPerUnit;
  const profileAtLocal = (x: number, y: number) => {
    assertLocalCoordinates(x, y, width, height);
    const globalX = frozenBounds.originX + x / width * frozenBounds.comarcasWide;
    const globalY = frozenBounds.originY + y / height * frozenBounds.comarcasHigh;
    return geography.profileAt(globalX, globalY) as Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>;
  };
  const rawSample = (x: number, y: number): LocalTerrainSample => {
    const profile = profileAtLocal(x, y);
    const elevation = profile.kind === 'earth'
      ? waterLevel + profile.elevationAboveSeaMeters / metresPerUnit
      : waterLevel + profile.elevation * RANDOM_RELIEF_TO_WORLD_UNITS;
    return {
      profile,
      elevation,
      moisture: regionalMoisture(profile),
      // Categorical regional hydrography is too coarse to paint local water.
      land: elevation >= waterLevel,
    };
  };
  const count = width * height;
  const elevation = new Float32Array(count);
  const moisture = new Float32Array(count);
  const riverCandidates = new Uint8Array(count);
  const lakeCandidates = new Uint8Array(count);
  const flowX = new Int8Array(count);
  const flowY = new Int8Array(count);
  const globalX = new Float64Array(count);
  const globalY = new Float64Array(count);
  const riverHeadByRegion = new Map<string, { index: number; elevation: number }>();
  const flowByRegion = new Map<string, { x: number; y: number }>();
  const centerX = (width - 1) / 2, centerY = (height - 1) / 2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const localX = x + 0.5, localY = y + 0.5;
    const tile = rawSample(localX, localY);
    const profile = tile.profile;
    elevation[index] = tile.elevation;
    moisture[index] = tile.moisture;
    globalX[index] = frozenBounds.originX + localX / width * frozenBounds.comarcasWide;
    globalY[index] = frozenBounds.originY + localY / height * frozenBounds.comarcasHigh;
    if (profile.kind === 'earth') {
      riverCandidates[index] = (profile.features & WORLD_FEATURE.river) !== 0 ? 1 : 0;
      lakeCandidates[index] = (profile.features & WORLD_FEATURE.lake) !== 0 ? 1 : 0;
    } else if (geography.kind === 'random') {
      const region = geography.map.regions[profile.regionY * geography.map.regionsWide + profile.regionX];
      riverCandidates[index] = region && region.riverFlow >= 3.2 ? 1 : 0;
    }
    if (riverCandidates[index]) {
      const key = `${profile.regionX},${profile.regionY}`;
      let flow = flowByRegion.get(key);
      if (!flow) {
        flow = macroFlowDirection(geography, profile);
        flowByRegion.set(key, flow);
      }
      const regionSize = geography.kind === 'earth' ? geography.map.comarcasPerRegion : geography.map.width / geography.map.regionsWide;
      const tileRadius = Math.hypot(frozenBounds.comarcasWide / width, frozenBounds.comarcasHigh / height) / 2;
      if ((flow.x === 0 && flow.y === 0) ||
          !nearCanonicalRiver(globalX[index]!, globalY[index]!, profile.regionX, profile.regionY,
            flow, regionSize, tileRadius)) {
        riverCandidates[index] = 0;
      }
      if (!riverCandidates[index]) continue;
      flowX[index] = flow.x;
      flowY[index] = flow.y;
      const previous = riverHeadByRegion.get(key);
      const candidateDistance = (x - centerX) ** 2 + (y - centerY) ** 2;
      const previousX = previous ? previous.index % width : 0;
      const previousY = previous ? Math.floor(previous.index / width) : 0;
      const previousDistance = (previousX - centerX) ** 2 + (previousY - centerY) ** 2;
      if (!previous || elevation[index]! > previous.elevation ||
          (elevation[index] === previous.elevation &&
           (candidateDistance < previousDistance || (candidateDistance === previousDistance && index < previous.index)))) {
        riverHeadByRegion.set(key, { index, elevation: elevation[index]! });
      }
    }
  }
  // Region features cover hundreds of kilometres. At local scale they select
  // one high-side head per touched cell; the traced course, not the flag mask,
  // determines which individual tiles hold fresh water.
  riverCandidates.fill(0);
  for (const head of riverHeadByRegion.values()) riverCandidates[head.index] = 1;
  const hydrology = generateLocalHydrology({
    width, height, elevation, moisture, riverCandidates, lakeCandidates, globalX, globalY,
    flowX, flowY, waterLevel, wadeDepth: config.wadeDepth, swimDepth: config.swimDepth,
  });
  const sample = (x: number, y: number): LocalTerrainSample => {
    const tile = rawSample(x, y);
    const ix = Math.min(width - 1, Math.floor(x));
    const iy = Math.min(height - 1, Math.floor(y));
    const index = iy * width + ix;
    if (hydrology.kind[index] !== 1) return tile;
    const elevation = hydrology.bed[index]!;
    return { ...tile, elevation, land: elevation >= waterLevel };
  };
  const hydrologyAt = (x: number, y: number) => {
    assertLocalCoordinates(x, y, width, height);
    const ix = Math.min(width - 1, Math.floor(x));
    const iy = Math.min(height - 1, Math.floor(y));
    const index = iy * width + ix;
    return hydrology.kind[index] === 1 ? { kind: 'fresh' as const, surface: hydrology.surface[index]! } : null;
  };
  return { kind: geography.kind, bounds: frozenBounds, profileAtLocal, sample, hydrologyAt, hydrology };
}

function nearCanonicalRiver(globalX: number, globalY: number, regionX: number, regionY: number,
  flow: { x: number; y: number }, regionSize: number, tileRadius: number): boolean {
  const length = Math.hypot(flow.x, flow.y);
  const normalX = -flow.y / length, normalY = flow.x / length;
  // The cross product stays unchanged as the river advances through adjacent
  // macro cells, so every local patch reconstructs the same corridor. Coarse
  // river flags outside this narrow line never become local water.
  const cross = regionX * flow.y - regionY * flow.x;
  const offset = positiveMod(cross * 73_856_093 + 19_349_663, regionSize) + 0.5 - regionSize / 2;
  const centerX = (regionX + 0.5) * regionSize + normalX * offset;
  const centerY = (regionY + 0.5) * regionSize + normalY * offset;
  const distance = Math.abs((globalX - centerX) * normalX + (globalY - centerY) * normalY);
  return distance <= tileRadius + 1e-9;
}

function positiveMod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function macroFlowDirection(geography: WorldGeography,
  profile: Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>): { x: number; y: number } {
  if (geography.kind === 'random' && profile.kind === 'random') {
    const regionIndex = profile.regionY * geography.map.regionsWide + profile.regionX;
    const edge = geography.map.rivers.filter(river => river.from === regionIndex)
      .sort((a, b) => b.flow - a.flow || a.to - b.to)[0];
    if (edge) {
      const fromX = edge.from % geography.map.regionsWide;
      const fromY = Math.floor(edge.from / geography.map.regionsWide);
      const toX = edge.to % geography.map.regionsWide;
      const toY = Math.floor(edge.to / geography.map.regionsWide);
      return { x: Math.sign(toX - fromX), y: Math.sign(toY - fromY) };
    }
  }
  if (geography.kind === 'earth' && profile.kind === 'earth') {
    const current = geography.map.regions[profile.regionY * geography.map.regionsWide + profile.regionX]!.elevationMeters;
    let bestSlope = 0;
    let bestIndex = Infinity;
    let direction = { x: 0, y: 0 };
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const y = profile.regionY + dy;
      if (y < 0 || y >= geography.map.regionsHigh) continue;
      const x = positiveMod(profile.regionX + dx, geography.map.regionsWide);
      const neighborIndex = y * geography.map.regionsWide + x;
      const neighbor = geography.map.regions[neighborIndex]!;
      const slope = (current - neighbor.elevationMeters) / Math.hypot(dx, dy);
      if (slope > bestSlope || (slope === bestSlope && slope > 0 && neighborIndex < bestIndex)) {
        bestSlope = slope;
        bestIndex = neighborIndex;
        direction = { x: dx, y: dy };
      }
    }
    return { x: Math.sign(direction.x), y: Math.sign(direction.y) };
  }
  return { x: 0, y: 0 };
}

function regionalMoisture(profile: Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>): number {
  if (profile.kind === 'random') {
    switch (profile.biome) {
      case 'ocean': return 0.65;
      case 'ice': return 0.12;
      case 'tundra': return 0.34;
      case 'boreal_forest': return 0.68;
      case 'temperate_forest': return 0.72;
      case 'grassland': return 0.52;
      case 'steppe': return 0.30;
      case 'desert': return 0.08;
      case 'savanna': return 0.47;
      case 'tropical_forest': return 0.88;
    }
  }

  // Beck's IDs 1–30 follow Af, Am, Aw, BWh…EF; the atlas has regional annual
  // climate only, so this is deliberately a broad wetness policy, not local rain.
  const code = profile.climateClass;
  if (code >= 1 && code <= 3) return 0.82; // tropical
  if (code >= 4 && code <= 7) return 0.12; // arid
  if (code >= 8 && code <= 16) return 0.58; // temperate
  if (code >= 17 && code <= 28) return 0.62; // continental
  if (code >= 29 && code <= 30) return 0.42; // polar
  return 0.50; // unclassified; neutral rather than fabricated drought
}

function assertLocalCoordinates(x: number, y: number, width: number, height: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > width || y > height) {
    throw new RangeError('Local geography coordinates must be finite and inside the local World');
  }
}
