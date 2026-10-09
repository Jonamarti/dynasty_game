/**
 * Detached, versioned snapshots of abandoned geographic comarcas.
 *
 * A ledger owns records only; it does not own people or running simulations.
 * The existing terrain and object codecs remain the source of truth for the
 * detailed state, and hydration returns a fresh graph every time.
 */
import type { WorldState } from '../world/WorldState.ts';
import type { WorldGeography } from '../world/WorldGeography.ts';
import { COMARCAS_PER_REGION } from '../world/WorldMap.ts';
import type { Person } from '../entities/Person.ts';
import type { World } from '../core/World.ts';
import { toWorldTerrainRecord, fromWorldTerrainRecord, type WorldTerrainRecord } from './WorldRecords.ts';
import { toWorldObjectRecord, fromWorldObjectRecord, type WorldObjectRecord, type WorldObjectState } from './WorldObjectRecords.ts';

export type ComarcaIdentity =
  | { readonly kind: 'random'; readonly seed: string; readonly regionsWide: number; readonly regionsHigh: number; readonly cx: number; readonly cy: number }
  | { readonly kind: 'earth'; readonly mapId: string; readonly rasterWidth: number; readonly rasterHeight: number;
      readonly seaLevelMeters: number; readonly comarcasPerRegion: number; readonly cx: number; readonly cy: number };

export interface TileLedgerEntry {
  readonly recordType: 'TileLedgerEntry';
  readonly version: 1;
  readonly identity: ComarcaIdentity;
  readonly revision: number;
  readonly lastAdvancedTick: number;
  readonly lastAdvancedDay: number;
  readonly terrain: WorldTerrainRecord;
  readonly objects: WorldObjectRecord;
}

export interface TileLedgerRecord {
  readonly recordType: 'TileLedger';
  readonly version: 1;
  readonly entries: readonly TileLedgerEntry[];
}

export interface TileLedgerHydratedState {
  readonly identity: ComarcaIdentity;
  readonly lastAdvancedTick: number;
  readonly lastAdvancedDay: number;
  readonly world: World;
  readonly objects: WorldObjectState;
}

function invalid(reason: string): never { throw new TypeError(`Invalid TileLedger: ${reason}`); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid('unknown or missing fields');
}
function integer(value: unknown, field: string, min = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < min) invalid(field);
  return value as number;
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function identityKey(identity: ComarcaIdentity): string { return JSON.stringify(identity); }

export function comarcaIdentityAt(geography: WorldGeography, cx: number, cy: number): ComarcaIdentity {
  if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cy) || cx < 0 || cy < 0) invalid('comarca coordinates');
  if (geography.kind === 'random') {
    if (cx >= geography.map.width || cy >= geography.map.height) invalid('comarca outside random geography');
    return { kind: 'random', seed: geography.map.seed, regionsWide: geography.map.regionsWide,
      regionsHigh: geography.map.regionsHigh, cx, cy };
  }
  if (geography.kind === 'earth') {
    if (cx >= geography.map.width || cy >= geography.map.height) invalid('comarca outside Earth geography');
    return { kind: 'earth', mapId: geography.entry.id, rasterWidth: geography.map.raster.width,
      rasterHeight: geography.map.raster.height, seaLevelMeters: geography.map.raster.seaLevelMeters,
      comarcasPerRegion: geography.map.comarcasPerRegion, cx, cy };
  }
  return invalid('classic island has no global comarca identity');
}

function validateIdentity(input: unknown): ComarcaIdentity {
  if (!object(input) || typeof input.kind !== 'string') invalid('identity');
  if (input.kind === 'random') {
    exact(input, ['kind', 'seed', 'regionsWide', 'regionsHigh', 'cx', 'cy']);
    if (typeof input.seed !== 'string' || input.seed.length === 0) invalid('random geography seed');
    const regionsWide = integer(input.regionsWide, 'regionsWide', 2);
    const regionsHigh = integer(input.regionsHigh, 'regionsHigh', 2);
    const cx = integer(input.cx, 'cx');
    const cy = integer(input.cy, 'cy');
    if (regionsWide > 512 || regionsHigh > 512 || cx >= regionsWide * COMARCAS_PER_REGION || cy >= regionsHigh * COMARCAS_PER_REGION) invalid('random comarca out of bounds');
    return { kind: 'random', seed: input.seed, regionsWide, regionsHigh, cx, cy };
  }
  if (input.kind === 'earth') {
    exact(input, ['kind', 'mapId', 'rasterWidth', 'rasterHeight', 'seaLevelMeters', 'comarcasPerRegion', 'cx', 'cy']);
    if (typeof input.mapId !== 'string' || !/^[a-z0-9-]+$/.test(input.mapId)) invalid('Earth map id');
    const rasterWidth = integer(input.rasterWidth, 'rasterWidth', 2);
    const rasterHeight = integer(input.rasterHeight, 'rasterHeight', 2);
    const comarcasPerRegion = integer(input.comarcasPerRegion, 'comarcasPerRegion', 1);
    const seaLevelMeters = input.seaLevelMeters;
    if (!Number.isSafeInteger(seaLevelMeters)) invalid('seaLevelMeters');
    const cx = integer(input.cx, 'cx');
    const cy = integer(input.cy, 'cy');
    if (rasterWidth > 255 || rasterHeight > 255 || comarcasPerRegion > 1000 || cx >= rasterWidth * comarcasPerRegion || cy >= rasterHeight * comarcasPerRegion) invalid('Earth comarca out of bounds');
    return { kind: 'earth', mapId: input.mapId, rasterWidth, rasterHeight, seaLevelMeters: seaLevelMeters as number,
      comarcasPerRegion, cx, cy };
  }
  return invalid('unsupported geography kind');
}

function parseEntry(input: unknown): TileLedgerEntry {
  if (!object(input)) invalid('entry');
  exact(input, ['recordType', 'version', 'identity', 'revision', 'lastAdvancedTick', 'lastAdvancedDay', 'terrain', 'objects']);
  if (input.recordType !== 'TileLedgerEntry' || input.version !== 1) invalid('expected TileLedgerEntry v1');
  const identity = validateIdentity(input.identity);
  const revision = integer(input.revision, 'revision', 1);
  const lastAdvancedTick = integer(input.lastAdvancedTick, 'lastAdvancedTick');
  const lastAdvancedDay = integer(input.lastAdvancedDay, 'lastAdvancedDay');
  if (!object(input.terrain) || !object(input.objects) || input.objects.lastAdvancedTick !== lastAdvancedTick) invalid('record tick mismatch');
  const terrain = clone(input.terrain) as unknown as WorldTerrainRecord;
  const objects = clone(input.objects) as unknown as WorldObjectRecord;
  const world = fromWorldTerrainRecord(terrain);
  const hydratedObjects = fromWorldObjectRecord(objects);
  for (const kind of ['nodes', 'buildings', 'trees', 'piles', 'corpses', 'animals', 'inscriptions'] as const) {
    for (const item of hydratedObjects[kind]) {
      if (item.x < 0 || item.y < 0 || item.x >= world.width || item.y >= world.height) invalid(`${kind} outside terrain`);
    }
  }
  return { recordType: 'TileLedgerEntry', version: 1, identity, revision, lastAdvancedTick, lastAdvancedDay, terrain, objects };
}

/** A JSON ledger indexed by the source geography and global comarca coordinate. */
export class TileLedger {
  private readonly entriesByKey = new Map<string, TileLedgerEntry>();

  /** Capture the currently detailed, exactly-one-comarca root into a detached revision. */
  capture(state: WorldState): TileLedgerEntry {
    if (state.initialGeographicStart === null) invalid('cannot capture a classic island as a global comarca');
    const placement = state.initialGeographicStart;
    if (placement.comarcasWide !== 1 || placement.comarcasHigh !== 1) invalid('capture requires exactly one comarca');
    const x = placement.start.x - 0.5;
    const y = placement.start.y - 0.5;
    if (!Number.isInteger(x) || !Number.isInteger(y)) invalid('local map is not aligned to comarca bounds');
    const identity = comarcaIdentityAt(state.geography, x, y);
    const frame = state.current.worldFrame;
    if (!frame || frame.originX !== x || frame.originY !== y || frame.comarcasWide !== 1 || frame.comarcasHigh !== 1) {
      invalid('current simulation frame does not match comarca placement');
    }
    const sim = state.current;
    const previous = this.entriesByKey.get(identityKey(identity));
    const entry: TileLedgerEntry = {
      recordType: 'TileLedgerEntry', version: 1, identity,
      revision: (previous?.revision ?? 0) + 1,
      lastAdvancedTick: sim.time.tick, lastAdvancedDay: sim.time.day,
      terrain: toWorldTerrainRecord(sim.world), objects: toWorldObjectRecord(sim),
    };
    return this.update(entry);
  }

  /** Ticks and calendar days may stay equal for edits between steps, but neither may run backwards. */
  update(input: TileLedgerEntry): TileLedgerEntry {
    const entry = parseEntry(input);
    const key = identityKey(entry.identity);
    const previous = this.entriesByKey.get(key);
    if (previous && (entry.lastAdvancedTick < previous.lastAdvancedTick || entry.lastAdvancedDay < previous.lastAdvancedDay)) {
      invalid('comarca update moved backwards in time');
    }
    if (previous && entry.revision <= previous.revision) invalid('comarca revision must increase');
    const detached = clone(entry);
    this.entriesByKey.set(key, detached);
    return clone(detached);
  }

  at(identity: ComarcaIdentity): TileLedgerEntry | null {
    const entry = this.entriesByKey.get(identityKey(validateIdentity(identity)));
    return entry ? clone(entry) : null;
  }

  /** Hydrate a fresh terrain/object graph at the exact date requested by the caller. */
  hydrate(identity: ComarcaIdentity, date: { readonly tick: number; readonly day: number },
    canonicalPeople: ReadonlyMap<number, Person>): TileLedgerHydratedState {
    const entry = this.entriesByKey.get(identityKey(validateIdentity(identity)));
    if (!entry) invalid('unknown comarca');
    if (!Number.isSafeInteger(date.tick) || !Number.isSafeInteger(date.day) ||
        date.tick !== entry.lastAdvancedTick || date.day !== entry.lastAdvancedDay) invalid('requested date does not match ledger');
    const world = fromWorldTerrainRecord(clone(entry.terrain));
    const objects = fromWorldObjectRecord(clone(entry.objects), canonicalPeople);
    return { identity: clone(entry.identity), lastAdvancedTick: entry.lastAdvancedTick,
      lastAdvancedDay: entry.lastAdvancedDay, world, objects };
  }

  toRecord(): TileLedgerRecord {
    const entries = [...this.entriesByKey.values()].sort((a, b) => identityKey(a.identity) < identityKey(b.identity) ? -1 : identityKey(a.identity) > identityKey(b.identity) ? 1 : 0)
      .map(entry => clone(entry));
    return { recordType: 'TileLedger', version: 1, entries };
  }

  static fromRecord(input: unknown): TileLedger {
    if (!object(input)) invalid('expected TileLedger v1');
    exact(input, ['recordType', 'version', 'entries']);
    if (input.recordType !== 'TileLedger' || input.version !== 1 || !Array.isArray(input.entries)) invalid('expected TileLedger v1');
    const ledger = new TileLedger();
    for (const raw of input.entries) {
      const entry = parseEntry(raw);
      const key = identityKey(entry.identity);
      if (ledger.entriesByKey.has(key)) invalid('duplicate comarca identity');
      ledger.entriesByKey.set(key, clone(entry));
    }
    return ledger;
  }
}
