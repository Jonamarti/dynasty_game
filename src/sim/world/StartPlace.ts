/**
 * Where on a world map a game may begin (M15 phase 33): a window of `span` by `span` comarcas that is **mostly land and has fresh
 * water to drink in it**.
 *
 * The first browser doors into a map (`?world=random`) picked the open temperate country nearest the middle and never asked about
 * water. Local rivers and lakes exist only where the region data marks a source, so most such windows had none, and a band without
 * a drink dies of thirst in days: four generated worlds in a row, all dead. A start is therefore *measured*, not guessed from the
 * regional flags: the local geography is built (the same `createLocalGeography` the simulation will use, about 50 ms a window) and
 * the fresh tiles of its hydrology are counted. A window with fewer than `MIN_FRESH_TILES` is not a start, whoever chose it.
 *
 * Pure and draw-free: the search order is a function of the map and, for a generated world, of its seed (so a seed names a
 * world and different seeds begin in different kinds of country, not always the first temperate meadow to the middle).
 */
import type { WorldGeography } from './WorldGeography.ts';
import { createLocalGeography, type LocalGeographySource } from './LocalGeography.ts';
import { globeGridOf, worldTerrainOf, type GlobeGrid, type WorldTerrain } from './WorldTerrain.ts';
import { WORLD_FEATURE } from './WorldFeatureSeeds.ts';
import type { WorldConfig } from '../core/Config.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';

/**
 * Fresh water tiles a local map must hold to be a start. A comarca is 32 by 32 tiles at the default size, so this is a stretch of
 * river a few comarcas long or a pond, not a puddle: a design assumption, chosen so that every band starts within reach of a drink.
 */
export const MIN_FRESH_TILES = 120;
/** Share of the window that must be dry land: a start in the sea is a start on a beach. */
export const MIN_LAND_SHARE = 0.6;

export type LocalWorldConfig = Pick<WorldConfig, 'width' | 'height' | 'waterLevel' | 'metresPerUnit' | 'wadeDepth' | 'swimDepth'>;

export function localWorldConfig(world: Partial<WorldConfig> = {}): LocalWorldConfig {
  const w = { ...DEFAULT_CONFIG.world, ...world };
  return { width: w.width, height: w.height, waterLevel: w.waterLevel, metresPerUnit: w.metresPerUnit, wadeDepth: w.wadeDepth, swimDepth: w.swimDepth };
}

export interface WindowReport {
  /** Fresh water tiles in the window. */
  readonly fresh: number;
  /** Fraction of tiles above the sea level (a river bed counts as land here: it can be waded). */
  readonly land: number;
}

/** Measure one window by building its local map, as the simulation will. */
export function measureWindow(geography: WorldGeography, x: number, y: number, span: number, config: LocalWorldConfig): WindowReport {
  const grid = globeGridOf(geography);
  if (!grid || geography.kind === 'legacyIsland') throw new RangeError('The classic island has no map to measure');
  const source: LocalGeographySource = createLocalGeography(geography,
    { originX: x - span / 2, originY: y - span / 2, comarcasWide: span, comarcasHigh: span }, config);
  const { kind } = source.hydrology;
  let fresh = 0;
  for (let i = 0; i < kind.length; i++) if (kind[i] === 1) fresh++;
  // Land share from a coarse grid of the sampled terrain (the raw elevation, which is what the world is built from).
  let land = 0, total = 0;
  const step = 8;
  for (let ty = step / 2; ty < config.height; ty += step) for (let tx = step / 2; tx < config.width; tx += step) {
    total++;
    if (source.sample(tx, ty).land) land++;
  }
  return { fresh, land: land / Math.max(1, total) };
}

/** Windows of a region measured at full resolution, best-watered first. */
const WINDOWS_MEASURED = 4;

export const isStart = (report: WindowReport): boolean => report.fresh >= MIN_FRESH_TILES && report.land >= MIN_LAND_SHARE;

export interface StartPlace {
  /** Centre of the window in comarca units (an edge of a comarca when `span` is even). */
  readonly x: number;
  readonly y: number;
  readonly region: { readonly x: number; readonly y: number };
  readonly report: WindowReport;
}

/** What the regional data says about water, for a card on a map. Hearsay of the data, not a promise: `findStartInRegion` measures. */
export function regionWater(geography: WorldGeography, rx: number, ry: number): 'river' | 'lake' | 'none' | null {
  if (geography.kind === 'legacyIsland') return null;
  const grid = globeGridOf(geography)!;
  if (rx < 0 || ry < 0 || rx >= grid.regionsWide || ry >= grid.regionsHigh) return null;
  if (geography.kind === 'earth') {
    const r = geography.map.regions[ry * grid.regionsWide + rx]!;
    if ((r.features & WORLD_FEATURE.river) !== 0) return 'river';
    if ((r.features & WORLD_FEATURE.lake) !== 0) return 'lake';
    return 'none';
  }
  return geography.map.regions[ry * grid.regionsWide + rx]!.riverFlow >= 3.2 ? 'river' : 'none';
}

/** Whether any region of the 3 by 3 around this one has a river or a lake: the cheap filter before measuring windows. */
function waterNearby(geography: WorldGeography, grid: GlobeGrid, rx: number, ry: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = ((rx + dx) % grid.regionsWide + grid.regionsWide) % grid.regionsWide;
    const y = ry + dy;
    if (y < 0 || y >= grid.regionsHigh) continue;
    if (regionWater(geography, x, y) !== 'none') return true;
  }
  return false;
}

/**
 * The best window for a start inside one region: of the windows whose centre is on the comarca grid and well inside the region,
 * the best watered that is a start. Null if the region has none. Never moves the player out of the region:
 * `findNearestStart` is the one that does, and says so.
 */
export function findStartInRegion(geography: WorldGeography, rx: number, ry: number, span: number, config: LocalWorldConfig): StartPlace | null {
  const grid = globeGridOf(geography);
  if (!grid || geography.kind === 'legacyIsland') return null;
  if (rx < 0 || ry < 0 || rx >= grid.regionsWide || ry >= grid.regionsHigh) return null;
  const per = grid.perRegion;
  if (worldTerrainOf(geography.profileAt(rx * per + per / 2, ry * per + per / 2)) === 'ocean') return null;
  const half = span / 2;
  // One cheap pass over the whole region says where its water is (the same tile count as a window, so about 50 ms): a region
  // with none is rejected at once, and the windows are ranked by the water the pass saw in them, so only the best few are
  // measured at full resolution. Measuring all of them cost seconds a region.
  const probe = createLocalGeography(geography, { originX: rx * per, originY: ry * per, comarcasWide: per, comarcasHigh: per }, config);
  const fresh: { x: number; y: number }[] = [];
  for (let ty = 0; ty < config.height; ty++) for (let tx = 0; tx < config.width; tx++) {
    if (probe.hydrology.kind[ty * config.width + tx] === 1) {
      fresh.push({ x: rx * per + (tx + 0.5) / config.width * per, y: ry * per + (ty + 0.5) / config.height * per });
    }
  }
  if (fresh.length === 0) return null;
  const candidates: { x: number; y: number; water: number; d: number }[] = [];
  for (let cy = Math.ceil(half); cy <= per - Math.ceil(half); cy += 1) {
    for (let cx = Math.ceil(half); cx <= per - Math.ceil(half); cx += 1) {
      const x = rx * per + cx, y = ry * per + cy;
      // The window must fit inside the globe and clear of the poles.
      if (y - half < 0 || y + half > grid.height) continue;
      let water = 0;
      for (const f of fresh) if (Math.abs(f.x - x) <= half && Math.abs(f.y - y) <= half) water++;
      if (water > 0) candidates.push({ x, y, water, d: (cx - per / 2) ** 2 + (cy - per / 2) ** 2 });
    }
  }
  candidates.sort((a, b) => b.water - a.water || a.d - b.d || a.y - b.y || a.x - b.x);
  for (const c of candidates.slice(0, WINDOWS_MEASURED)) {
    const report = measureWindow(geography, c.x, c.y, span, config);
    if (isStart(report)) return { x: c.x, y: c.y, region: { x: rx, y: ry }, report };
  }
  return null;
}

/** The start nearest a region: itself first, then the rings around it up to `radius` regions. Null if there is none that close. */
export function findNearestStart(geography: WorldGeography, rx: number, ry: number, span: number, config: LocalWorldConfig,
  radius = 2): StartPlace | null {
  const grid = globeGridOf(geography);
  if (!grid) return null;
  for (let ring = 0; ring <= radius; ring++) {
    const cells: { x: number; y: number; d: number }[] = [];
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const y = ry + dy;
      if (y < 0 || y >= grid.regionsHigh) continue;
      cells.push({ x: ((rx + dx) % grid.regionsWide + grid.regionsWide) % grid.regionsWide, y, d: dx * dx + dy * dy });
    }
    cells.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
    for (const cell of cells) {
      if (!waterNearby(geography, grid, cell.x, cell.y) && regionWater(geography, cell.x, cell.y) === 'none') continue;
      const found = findStartInRegion(geography, cell.x, cell.y, span, config);
      if (found) return found;
    }
  }
  return null;
}

/** Country a generated world may begin in: anything a band can live off, never the sea, the ice, the bare desert or the tundra. */
const START_TERRAINS: readonly WorldTerrain[] = ['temperate_forest', 'grassland', 'steppe', 'boreal_forest', 'savanna', 'tropical_forest'];

function seedNumber(seed: string | number): number {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Where a generated world begins. Regions of start-worthy country are listed in a fixed order; the seed picks where in that list
 * to start looking, and the first with a measured start (fresh water, mostly land) wins. So the same seed always names the same
 * place, different seeds begin in different places and kinds of country, and no start ever lacks water.
 */
export function findWateredGlobeStart(geography: WorldGeography, span: number, config: LocalWorldConfig, seed: string | number): StartPlace | null {
  const grid = globeGridOf(geography);
  if (!grid) return null;
  const per = grid.perRegion;
  const regions: { x: number; y: number }[] = [];
  for (let ry = 1; ry < grid.regionsHigh - 1; ry++) for (let rx = 0; rx < grid.regionsWide; rx++) {
    const terrain = worldTerrainOf(geography.profileAt(rx * per + per / 2, ry * per + per / 2));
    if (terrain && START_TERRAINS.includes(terrain) && regionWater(geography, rx, ry) !== 'none') regions.push({ x: rx, y: ry });
  }
  if (regions.length === 0) return null;
  const first = seedNumber(seed) % regions.length;
  for (let i = 0; i < regions.length; i++) {
    const r = regions[(first + i) % regions.length]!;
    const found = findStartInRegion(geography, r.x, r.y, span, config);
    if (found) return found;
  }
  return null;
}
