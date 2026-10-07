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
/**
 * Share of the window that must be dry land. Was 0.6 from phase 33 until "begin anywhere" (M15, 2026-10-07), when the owner
 * decided a coastal region should be choosable on the world map (it wasn't: `WorldPicker.canBegin` and `findStartInRegion`
 * both refused anything the atlas classed `ocean`, including a shore whose own pixel sampled wet). A real coast is never
 * 60% dry within one window — measured against the Earth atlas, once `findStartInRegion` could rank a window centred on
 * the administrative line (half in the clicked region, half in its neighbour) by land share, genuine coastal starts came
 * back at 0.39, 0.42, 0.49, 0.59, 0.65, 0.74, 0.88, 0.94 and 1.0 land share; the worst *rejected* crossing candidates sat
 * at 0.10-0.29. 0.35 sits in the gap: under every real coastal find this file measured, over the noise. See
 * `docs/changelog.md` M15 "begin anywhere" for the measurement and `findStartInRegion`'s own comment for why a window is
 * allowed to cross the line at all.
 */
export const MIN_LAND_SHARE = 0.35;

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
 * Whether a region borders dry land: any of the eight regions around it (the same neighbourhood `waterNearby` scans, wrapped
 * in x and clamped at the poles in y) is neither ocean nor ice. M15 "begin anywhere" (2026-10-07): before this, every region
 * the atlas classed `ocean` was refused outright by `WorldPicker.canBegin` and by `findStartInRegion`'s own early exit, which
 * made a literal beach unselectable — the region's *centre* sample landed in water even though its edge was dry. True open
 * ocean (no land in any direction) is still refused; a coastal region, which this tells apart from one, is not.
 */
export function isCoastalRegion(geography: WorldGeography, rx: number, ry: number): boolean {
  const grid = globeGridOf(geography);
  if (!grid || geography.kind === 'legacyIsland') return false;
  const per = grid.perRegion;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const x = ((rx + dx) % grid.regionsWide + grid.regionsWide) % grid.regionsWide;
    const y = ry + dy;
    if (y < 0 || y >= grid.regionsHigh) continue;
    const terrain = worldTerrainOf(geography.profileAt(x * per + per / 2, y * per + per / 2));
    if (terrain && terrain !== 'ocean' && terrain !== 'ice') return true;
  }
  return false;
}

export interface FindStartOptions {
  /**
   * Default true, as every start has required since phase 33. False is the one thing M15 "begin anywhere" adds: the player
   * clicked a place the game could not find water near, and chose "Begin here anyway" over going to the nearest water that
   * could — see `beginOnEarth` in `main.ts`. A window found this way may report 0 fresh tiles; nothing else about it, land
   * share included, is relaxed.
   */
  requireWater?: boolean;
}

/** Measure the first of a short, already-ranked candidate list that passes `accept`, at full resolution. Shared by every
 * pass below so the one real cost here — `measureWindow` — is paid in exactly one place. */
function bestOf(geography: WorldGeography, rx: number, ry: number, span: number, config: LocalWorldConfig,
  candidates: readonly { x: number; y: number }[], accept: (report: WindowReport) => boolean): StartPlace | null {
  for (const c of candidates.slice(0, WINDOWS_MEASURED)) {
    const report = measureWindow(geography, c.x, c.y, span, config);
    if (accept(report)) return { x: c.x, y: c.y, region: { x: rx, y: ry }, report };
  }
  return null;
}

/**
 * Pass 1 of `findStartInRegion`, water-requiring path: the original phase-33 algorithm, untouched, confined to the clicked
 * region's own per-by-per box. Kept exactly as it was — including its candidate order — so every start it already found
 * (and every test pinned to one) is unaffected by the coastal and dry-land work added below it.
 */
function findWateredWithin(geography: WorldGeography, rx: number, ry: number, grid: GlobeGrid, half: number, span: number,
  config: LocalWorldConfig): StartPlace | null {
  const per = grid.perRegion;
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
  return bestOf(geography, rx, ry, span, config, candidates, isStart);
}

/**
 * Pass 1 of `findStartInRegion`, no-water path: the same per-region box, ranked by nearness to the region's own centre
 * instead of by any water count (none is required). That is enough on its own for almost every dry fallback: a region's
 * centre is solid, unremarkable ground far more often than not — measured at a full 1.0 land share for the Sahara region
 * this file's tests use — so the very first candidate usually succeeds and nothing past pass 1 ever runs.
 */
function findDryWithin(geography: WorldGeography, rx: number, ry: number, grid: GlobeGrid, half: number, span: number,
  config: LocalWorldConfig): StartPlace | null {
  const per = grid.perRegion;
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let cy = Math.ceil(half); cy <= per - Math.ceil(half); cy += 1) {
    for (let cx = Math.ceil(half); cx <= per - Math.ceil(half); cx += 1) {
      const x = rx * per + cx, y = ry * per + cy;
      if (y - half < 0 || y + half > grid.height) continue;
      candidates.push({ x, y, d: (cx - per / 2) ** 2 + (cy - per / 2) ** 2 });
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  return bestOf(geography, rx, ry, span, config, candidates, report => report.land >= MIN_LAND_SHARE);
}

/** Pixel step of the coarse land grid pass 2 ranks candidates with. Cheap enough to use a fine step regardless of how much
 * area the padded probe below covers — the cost here is the one `createLocalGeography` call, not this loop — and a coarse
 * step (originally tried at 8, `measureWindow`'s own) badly mis-ranked real coastlines: estimates and the real, full
 * resolution `measureWindow` disagreed by up to 0.4 of a land share at step 8, enough to rank a nearly-all-sea window
 * above a genuine coast. Step 2 was measured to agree closely enough that the top few candidates it ranks are reliably
 * the ones that pass. See `MIN_LAND_SHARE`'s comment for the Earth-atlas numbers this produced. */
const CROSSING_PROBE_STEP = 2;

/**
 * Pass 2 of `findStartInRegion`: only reached when the region's own box (pass 1) had nothing — a region that is itself all
 * sea with its shore just the other side of the line, or, on the water-requiring path, a sliver of land whose only river
 * crosses out of it. Widens the search by one window's own half-span into whichever neighbour that turns out to be: enough
 * for a window centred exactly on the administrative line to hold half of each side's ground, which is what a real
 * coastline needs.
 *
 * Measuring every crossing position at full resolution was tried first (see `docs/changelog.md`, M15 "begin anywhere") and
 * cost up to 25 seconds for one region while still returning nothing for some genuine coasts, because a window near enough
 * to the centre to be tried first is not necessarily the one near enough to the coastline to pass. A single padded probe —
 * the same `createLocalGeography` cost as pass 1's own water pass, paid once — plus a summed-area table over its coarse
 * land grid ranks every candidate in the search for free, so only the top few ever reach a real `measureWindow`.
 */
function findAcrossBoundary(geography: WorldGeography, grid: GlobeGrid, rx: number, ry: number, half: number, span: number,
  config: LocalWorldConfig, requireWater: boolean): StartPlace | null {
  const per = grid.perRegion;
  const originX = rx * per - half;
  const originY = Math.max(0, ry * per - half);
  const endY = Math.min(grid.height, ry * per + per + half);
  const comarcasWide = per + 2 * half;
  const comarcasHigh = endY - originY;
  if (comarcasHigh <= 0) return null;
  // The globe wraps in x (`geography.profileAt` already wraps the comarca it is asked for), so a negative `originX` needs no
  // special handling; y is clamped above exactly as every window's own y - half/y + half check already is at the poles.
  const probe = createLocalGeography(geography, { originX, originY, comarcasWide, comarcasHigh }, config);

  const fresh: { x: number; y: number }[] = [];
  if (requireWater) {
    for (let ty = 0; ty < config.height; ty++) for (let tx = 0; tx < config.width; tx++) {
      if (probe.hydrology.kind[ty * config.width + tx] === 1) {
        fresh.push({ x: originX + (tx + 0.5) / config.width * comarcasWide, y: originY + (ty + 0.5) / config.height * comarcasHigh });
      }
    }
    if (fresh.length === 0) return null;
  }

  // Coarse land grid and its summed-area table: `landShareOf` below turns every candidate's land share into one O(1) lookup
  // instead of a fresh local map. See `CROSSING_PROBE_STEP`'s comment for why 2 and not `measureWindow`'s own 8.
  const cols = Math.max(1, Math.floor(config.width / CROSSING_PROBE_STEP));
  const rows = Math.max(1, Math.floor(config.height / CROSSING_PROBE_STEP));
  const land = new Uint8Array(cols * rows);
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const tx = (gx + 0.5) / cols * config.width, ty = (gy + 0.5) / rows * config.height;
    land[gy * cols + gx] = probe.sample(tx, ty).land ? 1 : 0;
  }
  const prefix = new Int32Array((cols + 1) * (rows + 1));
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    prefix[(gy + 1) * (cols + 1) + (gx + 1)] =
      land[gy * cols + gx]! + prefix[gy * (cols + 1) + (gx + 1)]! + prefix[(gy + 1) * (cols + 1) + gx]! - prefix[gy * (cols + 1) + gx]!;
  }
  const landShareOf = (x: number, y: number): number => {
    const gx0 = Math.max(0, Math.min(cols, Math.round((x - half - originX) / comarcasWide * cols)));
    const gx1 = Math.max(0, Math.min(cols, Math.round((x + half - originX) / comarcasWide * cols)));
    const gy0 = Math.max(0, Math.min(rows, Math.round((y - half - originY) / comarcasHigh * rows)));
    const gy1 = Math.max(0, Math.min(rows, Math.round((y + half - originY) / comarcasHigh * rows)));
    if (gx1 <= gx0 || gy1 <= gy0) return 0;
    const sum = prefix[gy1 * (cols + 1) + gx1]! - prefix[gy0 * (cols + 1) + gx1]! - prefix[gy1 * (cols + 1) + gx0]! + prefix[gy0 * (cols + 1) + gx0]!;
    return sum / ((gx1 - gx0) * (gy1 - gy0));
  };

  // Candidate centres now range a half-span past the region's own box on every side (clamped at the poles, wrapped in x by
  // `geography.profileAt` itself), rather than pass 1's "well inside the region" range: this is the one search in the file
  // that is allowed to return a window whose far edge, or even its centre, sits in a neighbouring region.
  const candidates: { x: number; y: number; rank: number; d: number }[] = [];
  for (let cy = -half; cy <= per + half; cy += 1) {
    for (let cx = -half; cx <= per + half; cx += 1) {
      const x = rx * per + cx, y = ry * per + cy;
      if (y - half < 0 || y + half > grid.height) continue;
      const d = (cx - per / 2) ** 2 + (cy - per / 2) ** 2;
      if (requireWater) {
        let water = 0;
        for (const f of fresh) if (Math.abs(f.x - x) <= half && Math.abs(f.y - y) <= half) water++;
        if (water > 0) candidates.push({ x, y, rank: water, d });
      } else {
        candidates.push({ x, y, rank: landShareOf(x, y), d });
      }
    }
  }
  candidates.sort((a, b) => b.rank - a.rank || a.d - b.d || a.y - b.y || a.x - b.x);
  return bestOf(geography, rx, ry, span, config, candidates, requireWater ? isStart : report => report.land >= MIN_LAND_SHARE);
}

/**
 * The best window for a start inside, or at the very edge of, one region.
 *
 * Tries the region's own per-by-per box first (`findWateredWithin`/`findDryWithin`, depending on `options.requireWater`) —
 * exactly the phase-33 search, so a start found there never reports a region other than the one asked for. Only if that box
 * has nothing does it widen by half a window's span into whichever neighbour the coastline or the water turns out to be
 * (`findAcrossBoundary`): M15 "begin anywhere" (2026-10-07) needed this for a coastal region, which the owner decided should
 * be choosable even though it is classed `ocean` and may be nothing but sea on its own side of the line.
 *
 * True open ocean (`isCoastalRegion` false) is refused before either pass runs, exactly as before. Null means neither pass
 * found a start; `findNearestStart` is the one that looks further afield, and says so.
 */
export function findStartInRegion(geography: WorldGeography, rx: number, ry: number, span: number, config: LocalWorldConfig,
  options: FindStartOptions = {}): StartPlace | null {
  const requireWater = options.requireWater !== false;
  const grid = globeGridOf(geography);
  if (!grid || geography.kind === 'legacyIsland') return null;
  if (rx < 0 || ry < 0 || rx >= grid.regionsWide || ry >= grid.regionsHigh) return null;
  const per = grid.perRegion;
  const half = span / 2;
  const centreTerrain = worldTerrainOf(geography.profileAt(rx * per + per / 2, ry * per + per / 2));
  if (centreTerrain === 'ocean' && !isCoastalRegion(geography, rx, ry)) return null;

  const inBounds = requireWater
    ? findWateredWithin(geography, rx, ry, grid, half, span, config)
    : findDryWithin(geography, rx, ry, grid, half, span, config);
  if (inBounds) return inBounds;

  return findAcrossBoundary(geography, grid, rx, ry, half, span, config, requireWater);
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
