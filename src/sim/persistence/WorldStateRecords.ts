/** JSON envelope for a world root: macro geography and placement beside the
 * existing independent Simulation checkpoint. Earth rasters are embedded so a
 * saved world remains usable offline when its atlas asset is unavailable. */
import type { CheckpointRecord } from './CheckpointRecords.ts';
import { toCheckpointRecord } from './CheckpointRecords.ts';
import { Simulation } from '../core/Simulation.ts';
import type { WorldStateGeographicStart } from '../world/WorldState.ts';
import { WorldState } from '../world/WorldState.ts';
import { earthWorldGeography, legacyIslandGeography, randomWorldGeography, type WorldGeography } from '../world/WorldGeography.ts';
import type { WorldMapEntry } from '../world/WorldAtlas.ts';
import type { WorldRaster } from '../world/WorldBinary.ts';

export interface WorldStateRecord {
  readonly recordType: 'WorldStateRecord';
  readonly version: 1;
  readonly geography: GeographyRecord;
  readonly start: null | { readonly x: number; readonly y: number; readonly comarcasWide: number; readonly comarcasHigh: number };
  readonly simulation: CheckpointRecord;
}

type GeographyRecord =
  | { readonly kind: 'legacyIsland' }
  | { readonly kind: 'random'; readonly seed: string; readonly regionsWide: number; readonly regionsHigh: number }
  | { readonly kind: 'earth'; readonly entry: WorldMapEntry; readonly comarcasPerRegion: number; readonly raster: {
      readonly width: number; readonly height: number; readonly elevationMeters: number[];
      readonly koppen: number[]; readonly features: number[]; readonly seaLevelMeters: number;
    } };

function invalid(reason: string): never { throw new TypeError(`Invalid WorldState record: ${reason}`); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid('unknown or missing fields');
}
function integer(value: unknown, min: number, max: number, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid(field);
  return value as number;
}
function finite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(field);
  return value;
}

function geographyRecord(geography: WorldGeography): GeographyRecord {
  if (geography.kind === 'legacyIsland') return { kind: 'legacyIsland' };
  if (geography.kind === 'random') return {
    kind: 'random', seed: geography.map.seed,
    regionsWide: geography.map.regionsWide, regionsHigh: geography.map.regionsHigh,
  };
  const { entry } = geography;
  const raster = geography.map.raster;
  return {
    kind: 'earth',
    entry: { id: entry.id, title: entry.title, file: entry.file, seaLevelMeters: entry.seaLevelMeters, recommended: entry.recommended },
    comarcasPerRegion: geography.map.comarcasPerRegion,
    raster: {
      width: raster.width, height: raster.height,
      elevationMeters: Array.from(raster.elevationMeters), koppen: Array.from(raster.koppen),
      features: Array.from({ length: raster.width * raster.height }, (_, i) => raster.features?.[i] ?? 0),
      seaLevelMeters: raster.seaLevelMeters,
    },
  };
}

function parseGeography(input: unknown): WorldGeography {
  if (!object(input) || typeof input.kind !== 'string') invalid('geography');
  if (input.kind === 'legacyIsland') {
    exact(input, ['kind']);
    return legacyIslandGeography();
  }
  if (input.kind === 'random') {
    exact(input, ['kind', 'seed', 'regionsWide', 'regionsHigh']);
    if (typeof input.seed !== 'string') invalid('random seed');
    const regionsWide = integer(input.regionsWide, 2, 512, 'random regionsWide');
    const regionsHigh = integer(input.regionsHigh, 2, 512, 'random regionsHigh');
    if (regionsWide * regionsHigh > 100000) invalid('random map has too many regions');
    return randomWorldGeography(input.seed, { regionsWide, regionsHigh });
  }
  if (input.kind !== 'earth') invalid('geography kind');
  exact(input, ['kind', 'entry', 'comarcasPerRegion', 'raster']);
  if (!object(input.entry)) invalid('Earth entry');
  exact(input.entry, ['id', 'title', 'file', 'seaLevelMeters', 'recommended']);
  const entry = input.entry;
  if (typeof entry.id !== 'string' || !/^[a-z0-9-]+$/.test(entry.id) ||
      typeof entry.title !== 'string' || typeof entry.file !== 'string' || !/^[a-z0-9-]+\.bin$/.test(entry.file) ||
      typeof entry.recommended !== 'boolean') invalid('Earth entry fields');
  const seaLevelMeters = integer(entry.seaLevelMeters, -32768, 32767, 'Earth entry sea level');
  const comarcasPerRegion = integer(input.comarcasPerRegion, 1, 1000, 'comarcasPerRegion');
  if (!object(input.raster)) invalid('Earth raster');
  exact(input.raster, ['width', 'height', 'elevationMeters', 'koppen', 'features', 'seaLevelMeters']);
  const rasterInput = input.raster;
  const width = integer(rasterInput.width, 2, 255, 'Earth raster width');
  const height = integer(rasterInput.height, 2, 255, 'Earth raster height');
  const count = width * height;
  const readArray = (value: unknown, max: number, field: string): number[] => {
    if (!Array.isArray(value) || value.length !== count) invalid(field);
    const result = new Array<number>(count);
    for (let i = 0; i < count; i++) {
      if (!Object.hasOwn(value, i)) invalid(`${field}[${i}]`);
      result[i] = integer(value[i], field === 'elevationMeters' ? -32768 : 0, max, `${field}[${i}]`);
    }
    return result;
  };
  const rasterSea = integer(rasterInput.seaLevelMeters, -32768, 32767, 'Earth raster sea level');
  if (rasterSea !== seaLevelMeters) invalid('Earth entry/raster sea level mismatch');
  const raster: WorldRaster = {
    width, height,
    elevationMeters: Int16Array.from(readArray(rasterInput.elevationMeters, 32767, 'elevationMeters')),
    koppen: Uint8Array.from(readArray(rasterInput.koppen, 255, 'koppen')),
    features: Uint32Array.from(readArray(rasterInput.features, 0xffffffff, 'features')),
    seaLevelMeters: rasterSea,
  };
  const copiedEntry: WorldMapEntry = {
    id: entry.id, title: entry.title, file: entry.file,
    seaLevelMeters, recommended: entry.recommended,
  };
  return earthWorldGeography({ entry: copiedEntry, raster }, comarcasPerRegion);
}

/** Capture independent JSON-safe state without mutating the live root. */
export function toWorldStateRecord(state: WorldState): WorldStateRecord {
  const start = state.initialGeographicStart;
  const record: WorldStateRecord = {
    recordType: 'WorldStateRecord', version: 1,
    geography: geographyRecord(state.geography),
    start: start ? {
      x: start.start.x, y: start.start.y,
      comarcasWide: start.comarcasWide, comarcasHigh: start.comarcasHigh,
    } : null,
    simulation: toCheckpointRecord(state.current),
  };
  return record;
}

/** Restore a detached macro-map and its independent live Simulation checkpoint. */
export function fromWorldStateRecord(input: unknown): WorldState {
  if (!object(input)) invalid('expected object');
  exact(input, ['recordType', 'version', 'geography', 'start', 'simulation']);
  if (input.recordType !== 'WorldStateRecord' || input.version !== 1) invalid('expected WorldStateRecord v1');
  const geography = parseGeography(input.geography);
  let start: WorldStateGeographicStart | null = null;
  if (input.start !== null) {
    if (!object(input.start)) invalid('start');
    exact(input.start, ['x', 'y', 'comarcasWide', 'comarcasHigh']);
    if (geography.kind === 'legacyIsland') invalid('legacy island cannot have macro placement');
    const x = finite(input.start.x, 'start.x');
    const y = finite(input.start.y, 'start.y');
    const comarcasWide = finite(input.start.comarcasWide, 'start.comarcasWide');
    const comarcasHigh = finite(input.start.comarcasHigh, 'start.comarcasHigh');
    if (comarcasWide <= 0 || comarcasHigh <= 0) invalid('start extent');
    const width = geography.map.width;
    const height = geography.map.height;
    if (x < 0 || x >= width || y < 0 || y >= height || y - comarcasHigh / 2 < 0 || y + comarcasHigh / 2 > height) invalid('start outside macro map');
    start = { geography, start: { x, y }, comarcasWide, comarcasHigh };
  } else if (geography.kind !== 'legacyIsland') invalid('geographic map needs a start');
  const current = Simulation.fromCheckpointRecord(input.simulation);
  if (start && (current.config.population.bands !== 0 || current.people.length > 0 || current.bands.length > 0)) {
    invalid('geographic starts cannot restore a populated simulation before freshwater support');
  }
  return WorldState.fromRestored(current, geography, start);
}
