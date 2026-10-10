/** Inert, versioned copies of the tile terrain ledger.
 * Hydration restores the World/Soil prototypes without running either constructor,
 * so saved terrain does not generate a new map, consume RNG or register entities. */
import { World } from '../core/World.ts';
import { Soil } from '../core/Soil.ts';
import { DEFAULT_CONFIG, type WorldConfig } from '../core/Config.ts';

export const WORLD_TERRAIN_RECORD_VERSION = 3 as const;

type NumericArrayKey = 'elevation' | 'offset' | 'prominence' | 'moisture' | 'fertility' |
  'grass' | 'grassCap';
type ByteArrayKey = 'biome' | 'walkable';
type RegionArrayKey = 'region';
type SoilArrayKey = 'texture' | 'organic' | 'nutrient';

export interface WorldTerrainRecord {
  readonly recordType: 'WorldTerrainRecord';
  readonly version: 1 | 2 | 3;
  readonly width: number;
  readonly height: number;
  readonly chunkSize: number;
  readonly chunksX: number;
  readonly chunksY: number;
  readonly earthVersion: number;
  readonly nextRegionId: number;
  readonly config: Record<string, number | boolean>;
  readonly tiles: Record<NumericArrayKey, number[]> & Record<ByteArrayKey, number[]> & { baseWalkable: number[] } & Record<RegionArrayKey, number[]> &
    { readonly waterKind?: number[]; readonly waterSurface?: number[] };
  readonly soil: Record<SoilArrayKey, number[]> & { active: number[] };
  readonly regionSizes: [number, number][];
  readonly shoreTiles: { x: number; y: number }[];
}

const numericKeys: NumericArrayKey[] = ['elevation', 'offset', 'prominence', 'moisture', 'fertility', 'grass', 'grassCap'];
const byteKeys: ByteArrayKey[] = ['biome', 'walkable'];
const soilKeys: SoilArrayKey[] = ['texture', 'organic', 'nutrient'];
const worldOwnKeys = ['config', 'width', 'height', 'chunkSize', 'chunksX', 'chunksY', 'elevation', 'offset', 'earthVersion',
  'prominence', 'moisture', 'fertility', 'biome', 'walkable', 'grass', 'grassCap', 'region', 'regionSizes', 'nextRegionId', 'shoreTiles',
  'baseWalkable', 'houseWallBlocks', 'boatRegions', 'boatVersion', 'logboatRegions', 'logboatVersion', 'swimRegion', 'swimRegionSizes', 'swimRegionsDirty', 'swimRegionEarthVersion', 'soil'];
const soilOwnKeys = ['width', 'fertility', 'texture', 'organic', 'nutrient', 'active'];
const configKeys = Object.keys(DEFAULT_CONFIG.world) as (keyof WorldConfig)[];
const integerConfigKeys = ['width', 'height', 'chunkSize', 'berryBushes', 'flintOutcrops', 'deadwood', 'gameHerds', 'predators',
  'edgeReserve', 'reedBeds', 'clayBanks', 'fishingSpots', 'wildGrainPatches', 'wetTicks'] as const;

function invalid(reason: string): never { throw new TypeError(`Invalid world terrain record: ${reason}`); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid('unknown or missing fields');
}
function safeDimension(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function copyValues(values: ArrayLike<number>): number[] { return Array.from(values); }
function assertOwnKeys(value: object, keys: string[], kind: string): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some(key => !Object.hasOwn(value, key)) || actual.some(key => !keys.includes(key))) {
    invalid(`${kind} state shape changed; update the v1 codec`);
  }
}
function validDenseNumbers(value: unknown, length: number, exactFloat32: boolean): value is number[] {
  if (!Array.isArray(value) || value.length !== length) return false;
  for (let i = 0; i < length; i++) {
    if (!Object.hasOwn(value, i)) return false;
    const item: unknown = value[i];
    if (typeof item !== 'number' || !Number.isFinite(item)) return false;
    if (exactFloat32 && (!Number.isFinite(Math.fround(item)) || Math.fround(item) !== item)) return false;
  }
  return true;
}
function validateConfig(config: unknown, width: number, height: number, chunkSize: number): asserts config is Record<keyof WorldConfig, number | boolean> {
  if (!object(config)) invalid('invalid world config');
  exact(config, configKeys as string[]);
  for (const key of configKeys) {
    const value = config[key as string];
    const expected = DEFAULT_CONFIG.world[key];
    if (typeof value !== typeof expected || (typeof value === 'number' && !Number.isFinite(value))) invalid(`invalid world config field ${String(key)}`);
  }
  if (config.width !== width || config.height !== height || config.chunkSize !== chunkSize) invalid('world config dimensions disagree with envelope');
  for (const key of integerConfigKeys) {
    if (!Number.isSafeInteger(config[key]) || (config[key] as number) <
        (key === 'width' || key === 'height' || key === 'chunkSize' || key === 'wetTicks' ? 1 : 0)) {
      invalid(`invalid world config range ${key}`);
    }
  }
  for (const key of ['waterLevel', 'metresPerUnit', 'slopeCost', 'heightSight', 'pitDepth', 'edgeEntryChance', 'treeDensity', 'regrowthRate', 'resourceScale'] as const) {
    const value = config[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) invalid(`invalid world config range ${key}`);
    if (key === 'metresPerUnit' || key === 'pitDepth') { if (value <= 0) invalid(`invalid world config range ${key}`); }
    else if (key === 'edgeEntryChance' || key === 'treeDensity') { if (value < 0 || value > 1) invalid(`invalid world config range ${key}`); }
    else if (key !== 'waterLevel' && value < 0) invalid(`invalid world config range ${key}`);
  }
  const wadeDepth = config.wadeDepth;
  const swimDepth = config.swimDepth;
  const drownAt = config.drownAt;
  if (typeof wadeDepth !== 'number' || typeof swimDepth !== 'number' ||
      wadeDepth <= 0 || swimDepth <= wadeDepth) invalid('invalid world water depth thresholds');
  if (typeof drownAt !== 'number' || drownAt < 0 || drownAt > 100) invalid('invalid world config range drownAt');
}

/** Capture all tile and soil state, including caches/counters that affect later terrain edits. */
export function toWorldTerrainRecord(world: World): WorldTerrainRecord {
  const hasHydrology = world.waterKind !== undefined || world.waterSurface !== undefined;
  assertOwnKeys(world, hasHydrology ? [...worldOwnKeys, 'waterKind', 'waterSurface'] : worldOwnKeys, 'World');
  assertOwnKeys(world.soil, soilOwnKeys, 'Soil');
  const soilInternals = world.soil as unknown as { fertility: Float32Array };
  if (soilInternals.fertility !== world.fertility) invalid('Soil fertility alias diverges from World fertility');
  const internals = world as unknown as { config: Record<string, unknown>; nextRegionId: number };
  const config: Record<string, number | boolean> = {};
  for (const [key, value] of Object.entries(internals.config)) {
    if (typeof value !== 'number' && typeof value !== 'boolean') invalid(`unsupported config value ${key}`);
    if (typeof value === 'number' && !Number.isFinite(value)) invalid(`non-finite config value ${key}`);
    config[key] = value;
  }
  validateConfig(config, world.width, world.height, world.chunkSize);
  const tiles = {} as WorldTerrainRecord['tiles'];
  for (const key of numericKeys) tiles[key] = copyValues(world[key]);
  for (const key of byteKeys) tiles[key] = copyValues(world[key]);
  tiles.baseWalkable = copyValues(world.baseWalkable);
  tiles.region = copyValues(world.region);
  if (hasHydrology) {
    if (!world.waterKind || !world.waterSurface || world.waterKind.length !== world.biome.length || world.waterSurface.length !== world.biome.length) invalid('incomplete local hydrology arrays');
    (tiles as Record<string, number[]>).waterKind = copyValues(world.waterKind);
    (tiles as Record<string, number[]>).waterSurface = copyValues(world.waterSurface);
  }
  return {
    recordType: 'WorldTerrainRecord', version: WORLD_TERRAIN_RECORD_VERSION,
    width: world.width, height: world.height, chunkSize: world.chunkSize,
    chunksX: world.chunksX, chunksY: world.chunksY, earthVersion: world.earthVersion,
    nextRegionId: internals.nextRegionId, config,
    tiles,
    soil: {
      texture: copyValues(world.soil.texture), organic: copyValues(world.soil.organic),
      nutrient: copyValues(world.soil.nutrient), active: [...world.soil.active],
    },
    regionSizes: [...world.regionSizes].map(([id, size]) => [id, size]),
    shoreTiles: world.shoreTiles.map(({ x, y }) => ({ x, y })),
  };
}

/** Validate first, then hydrate independent arrays and working World/Soil prototypes without constructors. */
export function fromWorldTerrainRecord(record: unknown): World {
  if (!object(record)) invalid('expected object');
  if (record.version !== 1 && record.version !== 2 && record.version !== 3) invalid('expected WorldTerrainRecord v1 through v3');
  exact(record, ['recordType', 'version', 'width', 'height', 'chunkSize', 'chunksX', 'chunksY', 'earthVersion', 'nextRegionId', 'config', 'tiles', 'soil', 'regionSizes', 'shoreTiles']);
  if (record.recordType !== 'WorldTerrainRecord') invalid('expected WorldTerrainRecord');
  if (!safeDimension(record.width) || !safeDimension(record.height) || !safeDimension(record.chunkSize) ||
      record.chunksX !== Math.ceil(record.width / record.chunkSize) || record.chunksY !== Math.ceil(record.height / record.chunkSize) ||
      !Number.isSafeInteger(record.earthVersion) || (record.earthVersion as number) < 0 ||
      !Number.isSafeInteger(record.nextRegionId) || (record.nextRegionId as number) < 0) invalid('invalid dimensions or counters');
  const n = (record.width as number) * (record.height as number);
  if (!Number.isSafeInteger(n) || n > 10_000_000) invalid('tile count out of range');
  validateConfig(record.config, record.width as number, record.height as number, record.chunkSize as number);
  if (!object(record.tiles)) invalid('invalid tile arrays');
  const hasHydrology = record.version === 2 || (record.version === 3 && Object.hasOwn(record.tiles, 'waterKind'));
  exact(record.tiles, [...numericKeys, ...byteKeys, ...(record.version === 3 ? ['baseWalkable'] : []), 'region', ...(hasHydrology ? ['waterKind', 'waterSurface'] : [])]);
  const arrays = new Map<string, Float32Array | Uint8Array | Int32Array>();
  for (const key of [...numericKeys, ...soilKeys]) {
    const raw = key === 'texture' || key === 'organic' || key === 'nutrient' ?
      (object(record.soil) ? record.soil[key] : undefined) : record.tiles[key];
    if (!validDenseNumbers(raw, n, true)) invalid(`invalid ${key} array`);
    if (key === 'moisture' || key === 'fertility' || key === 'grass' || key === 'grassCap' || key === 'texture' || key === 'organic' || key === 'nutrient') {
      const min = key === 'texture' ? 0.25 : 0;
      const max = key === 'texture' ? 0.95 : 1;
      if ((raw as number[]).some(value => value < min || value > max)) invalid(`out-of-range ${key} array`);
    }
    if (key === 'prominence' && (raw as number[]).some(value => value < 0)) invalid('out-of-range prominence array');
    arrays.set(key, new Float32Array(raw as number[]));
  }
  for (const key of byteKeys) {
    const raw = record.tiles[key];
    if (!Array.isArray(raw) || raw.length !== n) invalid(`invalid ${key} array`);
    for (let i = 0; i < n; i++) {
      const value: unknown = Object.hasOwn(raw, i) ? raw[i] : undefined;
      if (!Number.isInteger(value) || (key === 'biome' ? (value as number) < 0 || (value as number) > (record.version >= 2 ? 6 : 5) : value !== 0 && value !== 1)) invalid(`invalid ${key} array`);
    }
    arrays.set(key, new Uint8Array(raw as number[]));
  }
  if (record.version === 3) {
    const base = record.tiles.baseWalkable;
    if (!Array.isArray(base) || base.length !== n) invalid('invalid baseWalkable array');
    for (let i = 0; i < n; i++) {
      const value: unknown = Object.hasOwn(base, i) ? base[i] : undefined;
      if (value !== 0 && value !== 1) invalid('invalid baseWalkable array');
    }
    arrays.set('baseWalkable', new Uint8Array(base));
  } else {
    arrays.set('baseWalkable', new Uint8Array(arrays.get('walkable') as Uint8Array));
  }
  const regionRaw = record.tiles.region;
  if (!Array.isArray(regionRaw) || regionRaw.length !== n) invalid('invalid region array');
  for (let i = 0; i < n; i++) {
    const value: unknown = Object.hasOwn(regionRaw, i) ? regionRaw[i] : undefined;
    if (!Number.isSafeInteger(value) || (value as number) < -1 || (value as number) > 2_147_483_647) invalid('invalid region array');
  }
  arrays.set('region', new Int32Array(regionRaw as number[]));
  if (hasHydrology) {
    const kinds = record.tiles.waterKind;
    const surfaces = record.tiles.waterSurface;
    if (!Array.isArray(kinds) || kinds.length !== n) invalid('invalid water kind array');
    for (let i = 0; i < n; i++) {
      const value: unknown = Object.hasOwn(kinds, i) ? kinds[i] : undefined;
      if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 2) invalid('invalid water kind array');
    }
    if (!validDenseNumbers(surfaces, n, true)) invalid('invalid water surface array');
    const biomeValues = arrays.get('biome') as Uint8Array;
    for (let i = 0; i < n; i++) {
      const waterBiome = biomeValues[i] === 0 || biomeValues[i] === 6;
      if (waterBiome !== (kinds[i] !== 0) || (biomeValues[i] === 6 && kinds[i] !== 1)) invalid('water kind and biome disagree');
      if (kinds[i] === 2 && surfaces[i] !== Math.fround((record.config as Record<string, number>).waterLevel!)) {
        invalid('saltwater surface must match sea level');
      }
    }
    arrays.set('waterKind', new Uint8Array(kinds));
    arrays.set('waterSurface', new Float32Array(surfaces));
  } else {
    for (const value of arrays.get('biome') as Uint8Array) if (value > 5) invalid('river biome requires WorldTerrainRecord v2');
  }
  if (!object(record.soil)) invalid('invalid soil record');
  exact(record.soil, [...soilKeys, 'active']);
  const activeTiles: unknown = record.soil.active;
  if (!Array.isArray(activeTiles)) invalid('invalid active soil tiles');
  for (let i = 0; i < activeTiles.length; i++) {
    if (!Object.hasOwn(activeTiles, i) || !Number.isSafeInteger(activeTiles[i]) || (activeTiles[i] as number) < 0 || (activeTiles[i] as number) >= n) invalid('invalid active soil tiles');
  }
  if (new Set(activeTiles).size !== activeTiles.length) invalid('invalid active soil tiles');

  if (!Array.isArray(record.regionSizes)) invalid('invalid region sizes');
  const sizes = new Map<number, number>();
  for (const entry of record.regionSizes) {
    if (!Array.isArray(entry) || entry.length !== 2 || !Number.isSafeInteger(entry[0]) || entry[0] < 0 ||
        !Number.isSafeInteger(entry[1]) || entry[1] <= 0 || sizes.has(entry[0])) invalid('invalid region size entry');
    sizes.set(entry[0], entry[1]);
  }
  const counted = new Map<number, number>();
  const walkable = arrays.get('walkable') as Uint8Array;
  const baseWalkable = arrays.get('baseWalkable') as Uint8Array;
  const biome = arrays.get('biome') as Uint8Array;
  const regions = arrays.get('region') as Int32Array;
  const elevation = arrays.get('elevation') as Float32Array;
  const offset = arrays.get('offset') as Float32Array;
  const waterConfig = record.config as Record<string, number>;
  for (let i = 0; i < n; i++) {
    const id = regions[i]!;
    const waterDepth = Math.max(0, waterConfig.waterLevel! - elevation[i]! - offset[i]!);
    const depth = hasHydrology && (arrays.get('waterKind') as Uint8Array)[i] === 1
      ? (arrays.get('waterSurface') as Float32Array)[i]! - elevation[i]! - offset[i]!
      : waterDepth;
    if ((walkable[i] === 1) !== (id >= 0) || (walkable[i] === 1 && baseWalkable[i] !== 1) ||
        (biome[i] === 5 && baseWalkable[i] !== 0) ||
        ((biome[i] === 0 || biome[i] === 6) && baseWalkable[i] === 1 && depth >= waterConfig.wadeDepth!)) {
      invalid('walkability and region labels disagree');
    }
    if (id >= 0) counted.set(id, (counted.get(id) ?? 0) + 1);
  }
  if (counted.size !== sizes.size || [...counted].some(([id, size]) => sizes.get(id) !== size) ||
      [...sizes.keys()].some(id => id >= (record.nextRegionId as number))) invalid('region labels and sizes disagree');

  // Recompute components and require a one-to-one mapping to stored labels. Sizes alone
  // cannot detect two disconnected islands carrying the same stale region id.
  const forward = new Map<number, number>();
  const backward = new Map<number, number>();
  const visited = new Uint8Array(n);
  const stack: number[] = [];
  let component = 0;
  for (let start = 0; start < n; start++) {
    if (walkable[start] !== 1 || visited[start] === 1) continue;
    const storedId = regions[start]!;
    stack.length = 0; stack.push(start); visited[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % (record.width as number);
      const neighbors = [x > 0 ? i - 1 : -1, x + 1 < (record.width as number) ? i + 1 : -1,
        i - (record.width as number), i + (record.width as number)];
      for (const next of neighbors) {
        if (next < 0 || next >= n || walkable[next] !== 1 || visited[next] === 1) continue;
        visited[next] = 1;
        if (regions[next] !== storedId) invalid('region labels split a connected component');
        stack.push(next);
      }
    }
    if ((forward.has(component) && forward.get(component) !== storedId) ||
        (backward.has(storedId) && backward.get(storedId) !== component)) invalid('region labels merge disconnected components');
    forward.set(component, storedId); backward.set(storedId, component); component++;
  }
  if (!Array.isArray(record.shoreTiles)) invalid('invalid shore tiles');
  const shores: { x: number; y: number }[] = [];
  const shoreIds = new Set<number>();
  for (const tile of record.shoreTiles) {
    if (!object(tile)) invalid('invalid shore tile');
    exact(tile, ['x', 'y']);
    if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y) || (tile.x as number) < 0 || (tile.x as number) >= (record.width as number) ||
        (tile.y as number) < 0 || (tile.y as number) >= (record.height as number)) invalid('shore tile out of bounds');
    const id = (tile.y as number) * (record.width as number) + (tile.x as number);
    if (shoreIds.has(id)) invalid('duplicate shore tile');
    shoreIds.add(id); shores.push({ x: tile.x as number, y: tile.y as number });
  }
  // `shoreTiles` is built at generation and patched in place by `World.updateShore`
  // (M15 phase 26d) as dug ground floods; preserve the list exactly rather than
  // recomputing it, so a restored world keeps the same order.

  // No constructors run here. Soil's fertility pointer is a deliberate alias to World's array.
  const world = Object.create(World.prototype) as World;
  const mutableWorld = world as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries({
    width: record.width, height: record.height, chunkSize: record.chunkSize,
    chunksX: record.chunksX, chunksY: record.chunksY, earthVersion: record.earthVersion,
    config: { ...record.config }, elevation: arrays.get('elevation'), offset: arrays.get('offset'),
    prominence: arrays.get('prominence'), moisture: arrays.get('moisture'), fertility: arrays.get('fertility'),
    biome: arrays.get('biome'), walkable: arrays.get('walkable'), baseWalkable, houseWallBlocks: new Uint8Array(n), grass: arrays.get('grass'),
    grassCap: arrays.get('grassCap'), region: arrays.get('region'), regionSizes: sizes,
    nextRegionId: record.nextRegionId, shoreTiles: shores,
    // Swimming components are a derived cache. Rebuild lazily after restore:
    // water thresholds are in the validated config, and no random draw or
    // terrain ownership changes during this rebuild.
    boatRegions: undefined, boatVersion: -1, logboatRegions: undefined, logboatVersion: -1,
    swimRegion: new Int32Array(n).fill(-1), swimRegionSizes: new Map<number, number>(),
    swimRegionsDirty: true, swimRegionEarthVersion: -1,
  })) Object.defineProperty(mutableWorld, key, { value, enumerable: true, writable: true, configurable: true });
  if (hasHydrology) {
    Object.defineProperty(mutableWorld, 'waterKind', { value: arrays.get('waterKind'), enumerable: true, writable: true, configurable: true });
    Object.defineProperty(mutableWorld, 'waterSurface', { value: arrays.get('waterSurface'), enumerable: true, writable: true, configurable: true });
  }
  const soil = Object.create(Soil.prototype) as Soil;
  const mutableSoil = soil as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries({
    width: record.width, fertility: mutableWorld.fertility, texture: arrays.get('texture'),
    organic: arrays.get('organic'), nutrient: arrays.get('nutrient'), active: new Set(activeTiles as number[]),
  })) Object.defineProperty(mutableSoil, key, { value, enumerable: true, writable: true, configurable: true });
  Object.defineProperty(mutableWorld, 'soil', { value: soil, enumerable: true, writable: true, configurable: true });
  return world;
}
