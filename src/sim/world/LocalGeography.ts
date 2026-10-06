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
  const riverDistance = new Float64Array(count);
  riverDistance.fill(Number.NaN);
  const riverSurface = new Float32Array(count);
  riverSurface.fill(Number.NaN);
  const globalX = new Float64Array(count);
  const globalY = new Float64Array(count);
  const flowByRegion = new Map<string, { x: number; y: number }>();
  const distanceByRegion = new Map<string, number>();
  const activeRiverByRegion = new Map<string, boolean>();
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
    const path = canonicalRiverAt(geography, profile.regionX, profile.regionY,
      globalX[index]!, globalY[index]!, flowByRegion, distanceByRegion, activeRiverByRegion,
      waterLevel, metresPerUnit);
    if (path) {
      const tileRadius = Math.hypot(frozenBounds.comarcasWide / width, frozenBounds.comarcasHigh / height) / 2;
      riverCandidates[index] = path.distance <= tileRadius + 1e-9 ? 1 : 0;
      if (riverCandidates[index]) {
      flowX[index] = path.flow.x;
      flowY[index] = path.flow.y;
      riverDistance[index] = path.distanceToOutlet;
      // The cut sits below both the coarse route grade and this tile's ground;
      // regional anchors can otherwise leave a short perched bank on relief.
      riverSurface[index] = Math.min(path.surface, elevation[index]!);
      }
    } else {
      riverCandidates[index] = 0;
    }
  }
  // Region features seed one global downstream graph. Rasterizing each tile
  // against that graph avoids patch-local source selection and ford resets.
  const riverCorridor = riverCandidates.slice();
  const hydrology = generateLocalHydrology({
    width, height, elevation, moisture, riverCandidates, riverCorridor, lakeCandidates, globalX, globalY,
    riverDistance, riverSurface,
    flowX, flowY, waterLevel, wadeDepth: config.wadeDepth, swimDepth: config.swimDepth,
    fordInterval: 9 * (frozenBounds.comarcasWide / width + frozenBounds.comarcasHigh / height) / 2,
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

interface CanonicalRiverSample {
  flow: { x: number; y: number };
  distance: number;
  distanceToOutlet: number;
  surface: number;
  sourceKey: string;
}

type MappedGeography = Exclude<WorldGeography, { kind: 'legacyIsland' }>;

function canonicalRiverAt(geography: MappedGeography, regionX: number, regionY: number,
  x: number, y: number, flowCache: Map<string, { x: number; y: number }>,
  distanceCache: Map<string, number>, activeRiverCache: Map<string, boolean>,
  waterLevel: number, metresPerUnit: number): CanonicalRiverSample | null {
  const regionSize = geography.kind === 'earth'
    ? geography.map.comarcasPerRegion
    : geography.map.width / geography.map.regionsWide;
  const regionsWide = geography.kind === 'earth' ? geography.map.regionsWide : geography.map.regionsWide;
  const regionsHigh = geography.kind === 'earth' ? geography.map.regionsHigh : geography.map.regionsHigh;
  const worldWidth = regionsWide * regionSize;
  let best: CanonicalRiverSample | null = null;
  // A bend is the shared vertex of two directed macro segments. Looking at the
  // surrounding region segments means both maps either side of a comarca seam
  // rasterize that same vertex, even when the river turns there.
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const sy = regionY + dy;
    if (sy < 0 || sy >= regionsHigh) continue;
    const sx = positiveMod(regionX + dx, regionsWide);
    const key = `${sx},${sy}`;
    let flow = flowCache.get(key);
    if (!flow) {
      const source = geography.profileAt((sx + 0.5) * regionSize, (sy + 0.5) * regionSize);
      flow = macroFlowDirection(geography, source);
      flowCache.set(key, flow);
    }
    if (!flow.x && !flow.y) continue;
    if (!isRiverNetworkRegion(geography, sx, sy, regionSize, flowCache, activeRiverCache)) continue;
    const sourceAnchor = riverAnchor(sx, sy, regionSize);
    const targetX = positiveMod(sx + flow.x, regionsWide);
    const targetY = sy + flow.y;
    if (targetY < 0 || targetY >= regionsHigh) continue;
    const targetAnchor = riverAnchor(targetX, targetY, regionSize);
    let x0 = sourceAnchor.x;
    x0 += Math.round((x - x0) / worldWidth) * worldWidth;
    const y0 = sourceAnchor.y;
    let x1 = targetAnchor.x;
    x1 += Math.round((x0 + flow.x * regionSize - x1) / worldWidth) * worldWidth;
    const y1 = targetAnchor.y;
    // Surface anchors use the same jittered nodes as the polyline. Sampling
    // region centres here made rivers float above the interpolated ground when
    // an anchor shifted downhill inside a steep macro cell.
    const sourceHeight = worldElevationAt(geography, x0, y0, waterLevel, metresPerUnit);
    const targetHeight = worldElevationAt(geography, x1, y1, waterLevel, metresPerUnit);
    const vx = x1 - x0, vy = y1 - y0;
    const lengthSquared = vx * vx + vy * vy;
    const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / lengthSquared));
    const px = x0 + t * vx, py = y0 + t * vy;
    const distance = Math.hypot(x - px, y - py);
    const distanceToOutlet = distanceFromOutlet(geography, sx, sy, regionSize, flowCache, distanceCache) - t * Math.sqrt(lengthSquared);
    const surface = sourceHeight + (targetHeight - sourceHeight) * t;
    // The drainage graph, not the control-point jitter, determines which
    // neighboring tile is downstream. Jitter bends the shared centreline but
    // never makes a flat valley climb toward an arbitrary local grid edge.
    const tangent = flow;
    if (!best || distance < best.distance - 1e-9 ||
        (Math.abs(distance - best.distance) <= 1e-9 && key < best.sourceKey)) {
      best = { flow: tangent, distance, distanceToOutlet, surface, sourceKey: key };
    }
  }
  return best;
}

function riverAnchor(regionX: number, regionY: number, regionSize: number): { x: number; y: number } {
  // One coordinate-hashed control point per macro cell lets incoming and
  // outgoing segments meet exactly at a bend while keeping the route away
  // from arbitrary map boundaries. Its displacement is bounded to the cell.
  const hash = stableHash(regionX, regionY);
  const jitterX = ((hash & 0xffff) / 0xffff - 0.5) * 0.64;
  const jitterY = (((hash >>> 16) & 0xffff) / 0xffff - 0.5) * 0.64;
  return { x: (regionX + 0.5 + jitterX) * regionSize, y: (regionY + 0.5 + jitterY) * regionSize };
}

function distanceFromOutlet(geography: MappedGeography, x: number, y: number, regionSize: number,
  flowCache: Map<string, { x: number; y: number }>, cache: Map<string, number>,
  visiting = new Set<string>()): number {
  const key = `${x},${y}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  if (visiting.has(key)) return 0; // random atlas edges are validated, this also bounds corrupt cycles
  visiting.add(key);
  let flow = flowCache.get(key);
  if (!flow) {
    const source = geography.profileAt((x + 0.5) * regionSize, (y + 0.5) * regionSize);
    flow = macroFlowDirection(geography, source);
    flowCache.set(key, flow);
  }
  let distance = 0;
  if (flow.x || flow.y) {
    const regionsWide = geography.kind === 'earth' ? geography.map.regionsWide : geography.map.regionsWide;
    const regionsHigh = geography.kind === 'earth' ? geography.map.regionsHigh : geography.map.regionsHigh;
    const ny = y + flow.y;
    if (ny >= 0 && ny < regionsHigh) {
      const nx = positiveMod(x + flow.x, regionsWide);
      distance = riverSegmentLength(x, y, flow.x, flow.y, regionsWide, regionSize) +
        distanceFromOutlet(geography, nx, ny, regionSize, flowCache, cache, visiting);
    }
  }
  visiting.delete(key);
  cache.set(key, distance);
  return distance;
}

function riverSegmentLength(x: number, y: number, dx: number, dy: number,
  regionsWide: number, regionSize: number): number {
  const from = riverAnchor(x, y, regionSize);
  const to = riverAnchor(positiveMod(x + dx, regionsWide), y + dy, regionSize);
  let targetX = to.x;
  targetX += Math.round((from.x + dx * regionSize - targetX) / (regionsWide * regionSize)) * regionsWide * regionSize;
  return Math.hypot(targetX - from.x, to.y - from.y);
}

function isRiverRegion(geography: MappedGeography,
  profile: Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>): boolean {
  if (profile.kind === 'earth') return (profile.features & WORLD_FEATURE.river) !== 0;
  const region = geography.kind === 'random'
    ? geography.map.regions[profile.regionY * geography.map.regionsWide + profile.regionX]
    : undefined;
  return !!region && region.riverFlow >= 3.2;
}

function isRiverNetworkRegion(geography: MappedGeography, x: number, y: number, regionSize: number,
  flowCache: Map<string, { x: number; y: number }>, cache: Map<string, boolean>,
  visiting = new Set<string>()): boolean {
  const key = `${x},${y}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  const profile = geography.profileAt((x + 0.5) * regionSize, (y + 0.5) * regionSize);
  if (isRiverRegion(geography, profile)) {
    cache.set(key, true);
    return true;
  }
  if (visiting.has(key)) return false;
  visiting.add(key);
  const regionsWide = geography.map.regionsWide;
  const regionsHigh = geography.map.regionsHigh;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const uy = y - dy;
    if (uy < 0 || uy >= regionsHigh) continue;
    const ux = positiveMod(x - dx, regionsWide);
    const upstreamKey = `${ux},${uy}`;
    let upstreamFlow = flowCache.get(upstreamKey);
    if (!upstreamFlow) {
      const upstreamProfile = geography.profileAt((ux + 0.5) * regionSize, (uy + 0.5) * regionSize);
      upstreamFlow = macroFlowDirection(geography, upstreamProfile);
      flowCache.set(upstreamKey, upstreamFlow);
    }
    if (upstreamFlow.x !== dx || upstreamFlow.y !== dy) continue;
    if (isRiverNetworkRegion(geography, ux, uy, regionSize, flowCache, cache, visiting)) {
      visiting.delete(key);
      cache.set(key, true);
      return true;
    }
  }
  visiting.delete(key);
  cache.set(key, false);
  return false;
}

function positiveMod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function stableHash(x: number, y: number): number {
  let hash = Math.imul(Math.round(x * 4096) ^ 0x9e3779b9, 0x85ebca6b);
  hash = Math.imul(hash ^ Math.round(y * 4096), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function worldElevationAt(geography: MappedGeography, x: number, y: number,
  waterLevel: number, metresPerUnit: number): number {
  const profile = geography.profileAt(x, y);
  return profile.kind === 'earth'
    ? waterLevel + profile.elevationAboveSeaMeters / metresPerUnit
    : waterLevel + profile.elevation * RANDOM_RELIEF_TO_WORLD_UNITS;
}

function macroFlowDirection(geography: MappedGeography,
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
    const region = geography.map.regions[regionIndex]!;
    if (region.downstream >= 0) {
      const toX = region.downstream % geography.map.regionsWide;
      const toY = Math.floor(region.downstream / geography.map.regionsWide);
      const rawDx = toX - profile.regionX;
      const dx = Math.abs(rawDx) > geography.map.regionsWide / 2
        ? rawDx - Math.sign(rawDx) * geography.map.regionsWide : rawDx;
      return { x: Math.sign(dx), y: Math.sign(toY - profile.regionY) };
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
