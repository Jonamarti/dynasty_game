/** JSON envelope for a world root: macro geography and placement beside the
 * existing independent Simulation checkpoint. Earth rasters are embedded so a
 * saved world remains usable offline when its atlas asset is unavailable. */
import type { CheckpointRecord } from './CheckpointRecords.ts';
import { toCheckpointRecord } from './CheckpointRecords.ts';
import { Simulation } from '../core/Simulation.ts';
import type { WorldStateGeographicStart } from '../world/WorldState.ts';
import { WorldState, assertWorldTileLedger } from '../world/WorldState.ts';
import { earthWorldGeography, legacyIslandGeography, randomWorldGeography, type WorldGeography } from '../world/WorldGeography.ts';
import type { WorldMapEntry } from '../world/WorldAtlas.ts';
import type { WorldRaster } from '../world/WorldBinary.ts';
import type { PeopleWorldRecord } from '../world/PeopleWorld.ts';
import type { ComarcaFrontierRecord } from '../world/ComarcaFrontier.ts';
import { TileLedger, type TileLedgerRecord } from './TileLedger.ts';

export interface WorldStateRecord {
  readonly recordType: 'WorldStateRecord';
  /** v3 adds comarca revisions; v4 adds the persistent frontier; v1/v2 load with an empty book. v1 also lacks peoples. */
  readonly version: 4;
  readonly tileLedger: TileLedgerRecord;
  readonly frontier: ComarcaFrontierRecord;
  readonly geography: GeographyRecord;
  readonly start: null | { readonly x: number; readonly y: number; readonly comarcasWide: number; readonly comarcasHigh: number };
  readonly simulation: CheckpointRecord;
  /** The abstract peoples of every other region (phase 33a); null on the classic island or a world saved without them. */
  readonly peoples: PeopleWorldRecord | null;
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
  assertWorldTileLedger(state.tileLedger, state.geography, state.current);
  const start = state.initialGeographicStart;
  const record: WorldStateRecord = {
    recordType: 'WorldStateRecord', version: 4,
    tileLedger: state.tileLedger.toRecord(),
    frontier: state.frontier.toRecord(),
    geography: geographyRecord(state.geography),
    start: start ? {
      x: start.start.x, y: start.start.y,
      comarcasWide: start.comarcasWide, comarcasHigh: start.comarcasHigh,
    } : null,
    simulation: toCheckpointRecord(state.current),
    peoples: state.peoples ? state.peoples.toRecord() : null,
  };
  return record;
}

/** Restore a detached macro-map and its independent live Simulation checkpoint. */
export function fromWorldStateRecord(input: unknown): WorldState {
  if (!object(input)) invalid('expected object');
  if (input.recordType !== 'WorldStateRecord' || (input.version !== 1 && input.version !== 2 && input.version !== 3 && input.version !== 4)) invalid('expected WorldStateRecord v1, v2, v3 or v4');
  exact(input, input.version === 1
    ? ['recordType', 'version', 'geography', 'start', 'simulation']
    : input.version === 2
      ? ['recordType', 'version', 'geography', 'start', 'simulation', 'peoples']
      : input.version === 3
        ? ['recordType', 'version', 'geography', 'start', 'simulation', 'peoples', 'tileLedger']
        : ['recordType', 'version', 'geography', 'start', 'simulation', 'peoples', 'tileLedger', 'frontier']);
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
  const peoples = input.version === 1 ? null : input.peoples;
  const tileLedger = input.version >= 3 ? TileLedger.fromRecord(input.tileLedger) : new TileLedger();
  if (peoples !== null && !object(peoples)) invalid('peoples');
  if (peoples !== null && start === null) invalid('peoples need a map to stand on');
  return WorldState.fromRestored(current, geography, start, peoples as PeopleWorldRecord | null, tileLedger, input.version === 4 ? input.frontier as ComarcaFrontierRecord : undefined);
}
