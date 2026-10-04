/** One detached checkpoint, never a second running owner of the saved world.
 * The live loader will have to rebind systems and rebuild spatial indexes; a
 * normal Simulation constructor cannot do that without generating another seed. */
import type { Simulation } from '../core/Simulation.ts';
import { DEFAULT_CONFIG, type SimConfig } from '../core/Config.ts';
import { IdSpace, type IdSpaceSnapshot, type IdKind } from '../core/IdSpace.ts';
import { TECH } from '../knowledge/Tech.ts';
import { toRosterRecord, fromRosterRecord, type RosterRecord, type RosterState } from './RosterRecords.ts';
import { toExecutionRecord, fromExecutionRecord, type ExecutionRecord, type ExecutionState } from './ExecutionRecords.ts';
import { toWorldTerrainRecord, fromWorldTerrainRecord, type WorldTerrainRecord } from './WorldRecords.ts';
import { toWorldObjectRecord, fromWorldObjectRecord, type WorldObjectRecord, type WorldObjectState } from './WorldObjectRecords.ts';
import { toLedgerRecord, fromLedgerRecord, type LedgerRecord, type LedgerState } from './LedgerRecords.ts';
import type { World } from '../core/World.ts';

export interface CheckpointRecord {
  readonly recordType: 'CheckpointRecord';
  readonly version: 1;
  readonly lastAdvancedTick: number;
  readonly config: SimConfig;
  readonly ids: IdSpaceSnapshot;
  readonly roster: RosterRecord;
  readonly execution: ExecutionRecord;
  readonly terrain: WorldTerrainRecord;
  readonly objects: WorldObjectRecord;
  readonly ledgers: LedgerRecord;
}
export interface CheckpointState {
  readonly lastAdvancedTick: number;
  readonly config: SimConfig;
  readonly ids: IdSpace;
  readonly roster: RosterState;
  readonly execution: ExecutionState;
  readonly world: World;
  readonly objects: WorldObjectState;
  readonly ledgers: LedgerState;
}
function invalid(reason: string): never { throw new TypeError(`Invalid checkpoint record: ${reason}`); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid('unknown or missing fields');
}

/** Require the complete configuration rather than silently applying today's
 * defaults to an old checkpoint and changing its rules on the next tick. */
function copyConfig(input: unknown): SimConfig {
  const visit = (value: unknown, template: unknown, path: string): unknown => {
    if (path === 'config.seed') {
      if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) invalid(path);
      return value;
    }
    if (Array.isArray(template)) {
      if (!Array.isArray(value)) invalid(path);
      for (let index = 0; index < value.length; index++) {
        if (!Object.hasOwn(value, index) || typeof value[index] !== 'string' || !Object.hasOwn(TECH, value[index])) invalid(path);
      }
      return [...value];
    }
    if (object(template)) {
      if (!object(value)) invalid(path);
      exact(value, Object.keys(template));
      return Object.fromEntries(Object.keys(template).map(key => [key, visit(value[key], template[key], `${path}.${key}`)]));
    }
    if (typeof template === 'boolean') {
      if (typeof value !== 'boolean') invalid(path);
    } else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) invalid(path);
    return value;
  };
  const config = visit(input, DEFAULT_CONFIG, 'config') as SimConfig;
  for (const value of [config.thinkInterval, config.time.ticksPerDay, config.time.daysPerSeason,
    config.time.maxTicksPerFrame, config.world.width, config.world.height, config.world.chunkSize]) {
    if (!Number.isSafeInteger(value) || value <= 0) invalid('invalid scheduling or dimension configuration');
  }
  return config;
}

function validateState(state: CheckpointState): void {
  const { config, world, execution, ids, roster, objects, ledgers } = state;
  // These records each carry rules needed by their own detached methods. They
  // must agree before a later loader is allowed to join those methods together.
  const terrain = toWorldTerrainRecord(world);
  for (const [key, value] of Object.entries(config.world)) {
    if (terrain.config[key] !== value) invalid(`terrain config mismatch: ${key}`);
  }
  const time = execution.time.snapshot();
  for (const key of Object.keys(config.time) as (keyof SimConfig['time'])[]) {
    if (time.config[key] !== config.time[key]) invalid(`clock config mismatch: ${key}`);
  }
  if (ledgers.lastAdvancedDay !== execution.time.day) invalid('ledger day does not match clock');
  const counters = ids.snapshot();
  const allocations: [IdKind, { id: number }[]][] = [
    ['person', roster.people], ['household', roster.households],
    ['resourceNode', objects.nodes], ['building', objects.buildings], ['tree', objects.trees],
    ['itemPile', objects.piles], ['corpse', objects.corpses], ['animal', objects.animals],
    ['inscription', objects.inscriptions],
  ];
  for (const [kind, entities] of allocations) {
    for (const entity of entities) if (entity.id < 1 || entity.id >= counters.next[kind]) invalid(`allocator does not cover ${kind} ${entity.id}`);
  }
  const bands = new Set(counters.groups.band.occupied);
  for (const band of roster.bands) if (!bands.has(band.id)) invalid(`unreserved band ${band.id}`);
  for (const building of objects.buildings) if (!roster.bandsById.has(building.ownerBandId)) invalid('building owner band is not retained');
  const herds = new Set(counters.groups.herd.occupied);
  for (const animal of objects.animals) if (!herds.has(animal.herdId)) invalid(`unreserved herd ${animal.herdId}`);
  for (const herdId of ledgers.wildlifeOwed.keys()) if (!herds.has(herdId)) invalid(`unreserved historical herd ${herdId}`);
  const eventIds = [...ledgers.feudEvents, ...ledgers.socialRecent.map(event => event.id),
    ...objects.corpses.flatMap(corpse => corpse.foundEventId === null ? [] : [corpse.foundEventId]),
    ...roster.people.flatMap(person => person.memory.all().map(entry => entry.eventId))];
  for (const eventId of eventIds) {
    if (!Number.isSafeInteger(eventId) || eventId < 1 || eventId >= counters.next.socialEvent) invalid('allocator does not cover social event');
  }
  for (const [, entities] of allocations.slice(2)) {
    for (const entity of entities) {
      const positioned = entity as { id: number; x: number; y: number };
      if (!Number.isFinite(positioned.x) || !Number.isFinite(positioned.y) ||
          positioned.x < 0 || positioned.y < 0 || positioned.x >= world.width || positioned.y >= world.height) invalid('world object outside terrain');
    }
  }
  for (const corpse of objects.corpses) {
    if (roster.peopleById.get(corpse.person.id) !== corpse.person || corpse.person.alive) invalid('corpse must reference its canonical deceased person');
  }
  if (ledgers.normsByBand.size !== roster.bands.length || ledgers.strangerRegardByBand.size !== roster.bands.length) invalid('culture ledgers do not cover bands');
  for (const band of roster.bands) {
    const norms = ledgers.normsByBand.get(band.id);
    if (!norms || Object.keys(band.norms).some(key => norms[key as keyof typeof norms] !== band.norms[key as keyof typeof norms]) ||
        ledgers.strangerRegardByBand.get(band.id) !== band.strangerRegard) invalid('band culture disagrees with ledger');
    // Both the band and SocialSystem refer to this same mutable norms object.
    // Joining equal copies would silently break later cultural evolution.
    ledgers.normsByBand.set(band.id, band.norms);
    if ((ledgers.bandSystem.chiefByBand.find(([id]) => id === band.id)?.[1] ?? null) !== band.chiefId) invalid('chief ledger disagrees with band');
  }
  for (const [bandId, chiefId] of ledgers.bandSystem.chiefByBand) {
    if (!roster.bandsById.has(bandId) || !roster.peopleById.has(chiefId)) invalid('chief identity is not retained');
  }
}

/** Capture all components at one tick, with no mutation or authority transfer. */
export function toCheckpointRecord(sim: Simulation): CheckpointRecord {
  const tick = sim.time.tick;
  const normsByBand = (sim as unknown as { normsByBand: Map<number, unknown> }).normsByBand;
  if (sim.bands.some(band => normsByBand.get(band.id) !== band.norms)) invalid('source culture aliases disagree');
  const record: CheckpointRecord = {
    recordType: 'CheckpointRecord', version: 1, lastAdvancedTick: tick,
    config: copyConfig(sim.config), ids: sim.idSnapshot(),
    roster: toRosterRecord(sim), execution: toExecutionRecord(sim),
    terrain: toWorldTerrainRecord(sim.world), objects: toWorldObjectRecord(sim),
    ledgers: toLedgerRecord(sim),
  };
  // Validate the same cross-record contracts on writes and reads. A broken
  // source index must fail here, rather than produce a file that only fails later.
  fromCheckpointRecord(record);
  if (sim.time.tick !== tick) invalid('source tick changed during capture');
  return record;
}

/** Validate and join independent canonical objects; this cannot call step(). */
export function fromCheckpointRecord(input: unknown): CheckpointState {
  if (!object(input)) invalid('expected object');
  exact(input, ['recordType', 'version', 'lastAdvancedTick', 'config', 'ids', 'roster', 'execution', 'terrain', 'objects', 'ledgers']);
  if (input.recordType !== 'CheckpointRecord' || input.version !== 1 ||
      !Number.isSafeInteger(input.lastAdvancedTick) || (input.lastAdvancedTick as number) < 0) invalid('expected CheckpointRecord v1');
  const tick = input.lastAdvancedTick as number;
  for (const key of ['roster', 'execution', 'objects', 'ledgers'] as const) {
    if (!object(input[key]) || input[key].lastAdvancedTick !== tick) invalid(`mixed capture ticks: ${key}`);
  }
  const config = copyConfig(input.config);
  const ids = IdSpace.fromSnapshot(input.ids);
  const roster = fromRosterRecord(input.roster);
  const execution = fromExecutionRecord(input.execution);
  const world = fromWorldTerrainRecord(input.terrain);
  const objects = fromWorldObjectRecord(input.objects, roster.peopleById);
  const state: CheckpointState = {
    lastAdvancedTick: tick, config, ids, roster,
    execution, world, objects,
    ledgers: fromLedgerRecord(input.ledgers, roster.peopleById, objects.buildingsById),
  };
  validateState(state);
  return state;
}
