/**
 * Projects a global comarca profile into one detailed local World. Regional
 * water features are only candidate source areas; Hydrology traces local
 * channels from the elevation field instead of turning a flagged region into
 * one broad water body.
 *
 * M15 terrain variety: `RealWorldMap.elevationAt` / `WorldMap`'s per-region
 * relief are bilinear interpolations between region centres tens of comarcas
 * apart, so one local map (four comarcas wide) was a flat tilted plane —
 * straight coastline, no hill or rock tile could ever appear even in the
 * Alps. `addedReliefWorldUnits` layers deterministic fractal noise on top,
 * sampled in GLOBAL comarca coordinates so two adjacent local maps agree
 * exactly at their shared edge (the save system and "leave the comarca"
 * depend on that seam matching). It never reads a Simulation RNG stream —
 * see the module-level `RELIEF_NOISE` below.
 */
import type { WorldConfig } from '../core/Config.ts';
import type { WorldGeography, WorldGeographyProfile } from './WorldGeography.ts';
import { WORLD_FEATURE } from './WorldFeatureSeeds.ts';
import { generateLocalHydrology, type HydrologyResult } from './Hydrology.ts';
import { SimplexNoise } from '../core/Noise.ts';
import { RNG } from '../core/RNG.ts';

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
  // One formula for local-tile-to-global-comarca projection, used by every
  // caller below: profileAtLocal, rawSample and the bulk-array loop used to
  // compute it three slightly different ways, and a drifted copy is exactly
  // how two of them would someday disagree at a map seam.
  const toGlobal = (x: number, y: number): { globalX: number; globalY: number } => ({
    globalX: frozenBounds.originX + x / width * frozenBounds.comarcasWide,
    globalY: frozenBounds.originY + y / height * frozenBounds.comarcasHigh,
  });
  const profileAtLocal = (x: number, y: number) => {
    assertLocalCoordinates(x, y, width, height);
    const { globalX, globalY } = toGlobal(x, y);
    return geography.profileAt(globalX, globalY) as Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>;
  };
  const mappedGeography = geography as MappedGeography;
  const rawSample = (x: number, y: number): LocalTerrainSample => {
    const profile = profileAtLocal(x, y);
    const { globalX, globalY } = toGlobal(x, y);
    // worldElevationAt is also what canonicalRiverAt uses for river-anchor
    // heights: one shared formula means the river surface and the ground it
    // sits in are never computed from two different relief fields.
    const elevation = worldElevationAt(mappedGeography, globalX, globalY, waterLevel, metresPerUnit, profile);
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
  // Region-keyed, not coordinate-keyed: a river anchor queried from different
  // tiles can arrive shifted by a whole world-width (longitude wraps), and
  // worldElevationAt already normalizes that internally, so caching on the
  // region id is what actually dedupes the (now noise-bearing, no longer
  // cheap) height lookup instead of silently missing every time.
  const heightByRegion = new Map<string, number>();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const localX = x + 0.5, localY = y + 0.5;
    const tile = rawSample(localX, localY);
    const profile = tile.profile;
    elevation[index] = tile.elevation;
    moisture[index] = tile.moisture;
    const global = toGlobal(localX, localY);
    globalX[index] = global.globalX;
    globalY[index] = global.globalY;
    if (profile.kind === 'earth') {
      riverCandidates[index] = (profile.features & WORLD_FEATURE.river) !== 0 ? 1 : 0;
      lakeCandidates[index] = (profile.features & WORLD_FEATURE.lake) !== 0 ? 1 : 0;
    } else if (geography.kind === 'random') {
      const region = geography.map.regions[profile.regionY * geography.map.regionsWide + profile.regionX];
      riverCandidates[index] = region && region.riverFlow >= 3.2 ? 1 : 0;
    }
    const path = canonicalRiverAt(geography, profile.regionX, profile.regionY,
      globalX[index]!, globalY[index]!, flowByRegion, distanceByRegion, activeRiverByRegion, heightByRegion,
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

export type MappedGeography = Exclude<WorldGeography, { kind: 'legacyIsland' }>;

function canonicalRiverAt(geography: MappedGeography, regionX: number, regionY: number,
  x: number, y: number, flowCache: Map<string, { x: number; y: number }>,
  distanceCache: Map<string, number>, activeRiverCache: Map<string, boolean>,
  heightCache: Map<string, number>,
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
    //
    // Cached by region id, not by (x0, y0): x0 is re-derived per query tile
    // with a whole-worldWidth shift toward whichever wrapped copy is nearest,
    // and worldElevationAt already normalizes longitude internally (so both
    // shifted copies agree) — keying on the raw coordinate would just miss
    // the cache every time and quietly pay for the fbm call per tile again.
    let sourceHeight = heightCache.get(key);
    if (sourceHeight === undefined) {
      sourceHeight = worldElevationAt(geography, x0, y0, waterLevel, metresPerUnit);
      heightCache.set(key, sourceHeight);
    }
    const targetKey = `${targetX},${targetY}`;
    let targetHeight = heightCache.get(targetKey);
    if (targetHeight === undefined) {
      targetHeight = worldElevationAt(geography, x1, y1, waterLevel, metresPerUnit);
      heightCache.set(targetKey, targetHeight);
    }
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

/**
 * Absolute World-unit elevation at one GLOBAL comarca coordinate: the coarse
 * bilinear sample plus `addedReliefWorldUnits`. `knownProfile` lets a caller
 * that already fetched the profile (rawSample) skip a second `profileAt`
 * lookup; canonicalRiverAt's anchor queries do not have one to hand, so they
 * pay for it, memoized per region in `heightByRegion` above.
 *
 * Exported so a test that needs the undisturbed ground elevation at a global
 * coordinate (for example: "a river's carved bed must sit at or below the
 * ground it was cut into") calls the exact same formula production code
 * uses, instead of keeping a second copy that silently drifts the day this
 * one changes.
 */
export function worldElevationAt(geography: MappedGeography, x: number, y: number,
  waterLevel: number, metresPerUnit: number,
  knownProfile?: Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>): number {
  const profile = knownProfile ?? geography.profileAt(x, y);
  const baseElevation = profile.kind === 'earth'
    ? waterLevel + profile.elevationAboveSeaMeters / metresPerUnit
    : waterLevel + profile.elevation * RANDOM_RELIEF_TO_WORLD_UNITS;
  return baseElevation + addedReliefWorldUnits(geography, profile.regionX, profile.regionY,
    x, y, baseElevation - waterLevel, metresPerUnit);
}

/**
 * Pure, deterministic macro-relief detail noise. Seeded from fixed text, not
 * from a caller's RNG: the map-terrain pipeline (this file, Hydrology.ts) is
 * already RNG-free by design (see the module comment and Hydrology.ts's own
 * "never reads or advances a Simulation RNG stream"), and a world geography
 * value is itself built with no RNG at all (see WorldGeography.ts) — so this
 * has to make its own seed rather than ask Simulation for a fork. One shared
 * module-level instance so every local map in the game samples the same
 * field: two crops of the same region must agree pixel for pixel.
 */
const RELIEF_NOISE = new SimplexNoise(new RNG('local-relief'));

/** Comarca-scale wavelength: a local map is only ~4 comarcas wide, so this
 * needs to vary visibly within that span — much higher frequency than
 * WorldMap's own region-scale continent noise (scale 0.035 per region). */
const LOCAL_RELIEF_NOISE_SCALE = 0.4;

// Amplitude = a small constant base (visible everywhere, so lowlands are not
// perfectly flat either) + a share of height above sea level (alpine terrain
// gets dramatically rougher than a coastal plain) + a share of the region's
// own elevation contrast against its neighbours (an escarpment stays rugged
// even in a lowland region next to one). Two unit systems, because Earth
// relief is carried in metres and random-map relief in its own dimensionless
// scale (see RANDOM_RELIEF_TO_WORLD_UNITS) — the random constants are
// written in that native scale and converted the same way elevation already
// is, rather than guessing an equivalent metre figure.
// Kept deliberately modest: a hand-built fixture (Hydrology's lake-fill test,
// geographic-fishing's inland bowl) can encode a real closed depression as a
// ~50 m-per-ring step across just a few comarcas, entirely by shaping how
// RealWorldMap's bilinear interpolation blends neighbouring region centres
// with NO noise at all. A base amplitude anywhere near that figure reliably
// broke those depressions' monotonic rim during tuning (measured: lake-fill
// and fishing tests both failed with base=40/gradientFactor=0.55). Height
// above sea level is what carries the alpine case instead — at real alpine
// elevations (hundreds to thousands of metres) the height term alone is
// already an order of magnitude past what any of the gentle-terrain fixtures
// exercise, so it does not need help from a big base or gradient term.
const LOCAL_RELIEF_BASE_EARTH_METRES = 12;
const LOCAL_RELIEF_HEIGHT_FACTOR_EARTH = 0.12;
const LOCAL_RELIEF_GRADIENT_FACTOR_EARTH = 0.15;
const LOCAL_RELIEF_BASE_RANDOM_UNITS = 0.01;
const LOCAL_RELIEF_HEIGHT_FACTOR_RANDOM = 0.12;
const LOCAL_RELIEF_GRADIENT_FACTOR_RANDOM = 0.15;
// A region's four-neighbour contrast is sometimes a genuine cliff, but a
// region raster can also hold an isolated, unrealistic step (a hand-built
// test fixture with a 1500 m jump between two neighbouring cells, or one bad
// atlas pixel at a true coastline). The gradient term is capped so one such
// outlier cannot swing added relief into the kilometres — the goal is
// noticeably rougher terrain near a real escarpment, not an earthquake.
const LOCAL_RELIEF_MAX_GRADIENT_EARTH_METRES = 150;
const LOCAL_RELIEF_MAX_GRADIENT_RANDOM_UNITS = 0.12;

/**
 * Elevation to add on top of the coarse bilinear sample, in World units.
 * Shared by `rawSample` (what the player walks on) and `worldElevationAt`'s
 * river-anchor callers (what a river surface is cut below) — a second copy
 * of this formula is exactly the kind of drift that once floated a river
 * surface above its own bank (see the comment at the canonicalRiverAt call
 * site above).
 */
function addedReliefWorldUnits(geography: MappedGeography, regionX: number, regionY: number,
  globalX: number, globalY: number, aboveSeaWorldUnits: number, metresPerUnit: number): number {
  const gradientNative = Math.min(regionReliefGradient(geography, regionX, regionY),
    geography.kind === 'earth' ? LOCAL_RELIEF_MAX_GRADIENT_EARTH_METRES : LOCAL_RELIEF_MAX_GRADIENT_RANDOM_UNITS);
  // Longitude wraps; a query for the same physical point can arrive as x or
  // x + worldWidth (canonicalRiverAt picks whichever is nearest the tile it
  // is rasterizing). Noise is not periodic, so two unwrapped copies of one
  // region would disagree — wrapping here is what keeps the antimeridian a
  // seam instead of a visible fault line, on top of the ordinary local-map
  // seam the global-coordinate sampling already guarantees.
  const wrappedX = positiveMod(globalX, geography.map.width);
  // fbm returns [0, 1]; recenter to [-1, 1] so the terrain can dip as well as
  // rise — a one-sided bump could raise a coast but never carve a bay.
  const signed = RELIEF_NOISE.fbm(wrappedX, globalY, 4, 2, 0.5, LOCAL_RELIEF_NOISE_SCALE) * 2 - 1;
  if (geography.kind === 'earth') {
    const aboveSeaMetres = aboveSeaWorldUnits * metresPerUnit;
    const amplitudeMetres = LOCAL_RELIEF_BASE_EARTH_METRES
      + LOCAL_RELIEF_HEIGHT_FACTOR_EARTH * Math.max(0, aboveSeaMetres)
      + LOCAL_RELIEF_GRADIENT_FACTOR_EARTH * gradientNative;
    return signed * amplitudeMetres / metresPerUnit;
  }
  const aboveSeaUnits = aboveSeaWorldUnits / RANDOM_RELIEF_TO_WORLD_UNITS;
  const amplitudeUnits = LOCAL_RELIEF_BASE_RANDOM_UNITS
    + LOCAL_RELIEF_HEIGHT_FACTOR_RANDOM * Math.max(0, aboveSeaUnits)
    + LOCAL_RELIEF_GRADIENT_FACTOR_RANDOM * gradientNative;
  return signed * amplitudeUnits * RANDOM_RELIEF_TO_WORLD_UNITS;
}

const CARDINAL_OFFSETS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * How rugged this region's own relief reads against its immediate neighbours
 * (its largest single-step neighbour difference), in the kind's native
 * elevation unit. Deliberately the region's own four-neighbour contrast, not
 * a wider average: an escarpment at the edge of an otherwise flat basin must
 * still read as rugged locally, which a basin-wide average would wash out.
 */
function regionReliefGradient(geography: MappedGeography, regionX: number, regionY: number): number {
  const regionsWide = geography.map.regionsWide;
  const regionsHigh = geography.map.regionsHigh;
  const here = regionNativeElevation(geography, regionX, regionY);
  let maxDiff = 0;
  for (const [dx, dy] of CARDINAL_OFFSETS) {
    const ny = regionY + dy;
    if (ny < 0 || ny >= regionsHigh) continue; // no wraparound at the poles
    const nx = positiveMod(regionX + dx, regionsWide);
    maxDiff = Math.max(maxDiff, Math.abs(here - regionNativeElevation(geography, nx, ny)));
  }
  return maxDiff;
}

/** The one line that differs between the two map kinds' region arrays, kept
 * out of regionReliefGradient so that function's neighbour-walk is not
 * duplicated per kind. */
function regionNativeElevation(geography: MappedGeography, regionX: number, regionY: number): number {
  const index = regionY * geography.map.regionsWide + regionX;
  return geography.kind === 'earth'
    ? geography.map.regions[index]!.elevationMeters
    : geography.map.regions[index]!.elevation;
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
