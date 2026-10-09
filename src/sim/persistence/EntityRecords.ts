/** Versioned, inert snapshots used by the later compact simulation tier.
 * These records do not move authority or advance a person. */
import { Person } from '../entities/Person.ts';
import { Household } from '../entities/Household.ts';
import type { Band } from '../core/Simulation.ts';
import { Inventory } from '../entities/Item.ts';
import { Beliefs } from '../ai/Beliefs.ts';
import { PlaceMemory } from '../social/PlaceMemory.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { Memory } from '../social/Memory.ts';
import { Mood } from '../core/Mood.ts';
import { MacroBalance } from '../core/Macros.ts';
import { SeasonLore } from '../knowledge/SeasonLore.ts';
import { WorldKnowledge } from '../social/WorldKnowledge.ts';
import { WorldNews } from '../social/WorldNews.ts';
import { fromObjectGraph, registerGraphPrototype, toObjectGraph, type ObjectGraph } from './GraphRecords.ts';
import { COMMITMENT_DRIVES } from '../ai/Commitment.ts';

export const ENTITY_RECORD_VERSION = 1 as const;

interface RecordEnvelope { readonly version: 1; readonly lastAdvancedTick: number; readonly graph: ObjectGraph }
export interface PersonRecord extends RecordEnvelope { readonly recordType: 'PersonRecord' }
export interface HouseholdRecord extends RecordEnvelope { readonly recordType: 'HouseholdRecord' }
export interface BandRecord extends RecordEnvelope { readonly recordType: 'BandRecord' }

const constructorEntries: [string, Function][] = [
  ['Person', Person], ['Household', Household], ['Inventory', Inventory], ['Beliefs', Beliefs],
  ['PlaceMemory', PlaceMemory], ['SpatialHash', SpatialHash], ['Memory', Memory],
  ['Mood', Mood], ['MacroBalance', MacroBalance], ['SeasonLore', SeasonLore], ['WorldKnowledge', WorldKnowledge], ['WorldNews', WorldNews],
];
for (const [tag, ctor] of constructorEntries) registerGraphPrototype(tag, ctor);

function fail(message: string): never { throw new TypeError(`Invalid entity record: ${message}`); }

type RecordByType = { PersonRecord: PersonRecord; HouseholdRecord: HouseholdRecord; BandRecord: BandRecord };
function recordFor<T extends keyof RecordByType>(type: T, value: object, lastAdvancedTick: number): RecordByType[T] {
  if (!Number.isSafeInteger(lastAdvancedTick) || lastAdvancedTick < 0) fail('lastAdvancedTick must be a non-negative safe integer');
  return { recordType: type, version: ENTITY_RECORD_VERSION, lastAdvancedTick, graph: toObjectGraph(value) } as RecordByType[T];
}

export function toPersonRecord(person: Person, lastAdvancedTick: number): PersonRecord {
  return recordFor('PersonRecord', person, lastAdvancedTick);
}
export function toHouseholdRecord(household: Household, lastAdvancedTick: number): HouseholdRecord {
  return recordFor('HouseholdRecord', household, lastAdvancedTick);
}
export function toBandRecord(band: Band, lastAdvancedTick: number): BandRecord {
  return recordFor('BandRecord', band, lastAdvancedTick);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function decodeGraph(record: unknown, expectedType: string, expectedRoot: string): object {
  if (!isObject(record) || record.recordType !== expectedType || record.version !== ENTITY_RECORD_VERSION ||
      !Number.isSafeInteger(record.lastAdvancedTick) || (record.lastAdvancedTick as number) < 0 ||
      !isObject(record.graph) || !Array.isArray(record.graph.nodes)) fail(`expected ${expectedType} v${ENTITY_RECORD_VERSION}`);
  const result = fromObjectGraph(record.graph, expectedRoot, 'entity graph');
  const expectedPrototype = expectedRoot === 'Object' ? Object.prototype : constructorEntries.find(([tag]) => tag === expectedRoot)?.[1].prototype;
  if (typeof result !== 'object' || result === null || Object.getPrototypeOf(result) !== expectedPrototype) {
    fail(`root must be ${expectedRoot}`);
  }
  if (expectedRoot === 'Person') {
    const person = result as Record<string, unknown>;
    if (!Number.isSafeInteger(person.id) || typeof person.name !== 'string' ||
        typeof person.bandId !== 'number' || !Number.isFinite(person.bandId) ||
        typeof person.age !== 'number' || !Number.isFinite(person.age) ||
        !(person.inventory instanceof Inventory) || !(person.beliefs instanceof Beliefs) ||
        !(person.placeMemory instanceof PlaceMemory) || !(person.needs && typeof person.needs === 'object') ||
        !(person.skills && typeof person.skills === 'object') || !(person.traits && typeof person.traits === 'object') ||
        !(person.alongside instanceof Float32Array)) fail('Person is missing required state or has an invalid id');
  } else if (expectedRoot === 'Household') {
    const household = result as Record<string, unknown>;
    if (!Number.isSafeInteger(household.id) || typeof household.name !== 'string' ||
        !Array.isArray(household.memberIds) || !(household.feud instanceof Map) ||
        !(household.feudSuspects instanceof Map)) fail('Household is missing required state or has an invalid id');
  } else if (expectedRoot === 'Object') {
    const band = result as Record<string, unknown>;
    if (!Number.isSafeInteger(band.id) || typeof band.name !== 'string' ||
        typeof band.homeX !== 'number' || !Number.isFinite(band.homeX) ||
        typeof band.homeY !== 'number' || !Number.isFinite(band.homeY) ||
        !band.norms || typeof band.norms !== 'object' || typeof band.strangerRegard !== 'number' ||
        !(band.chiefId === null || Number.isSafeInteger(band.chiefId)) ||
        !(band.chiefSince === null || typeof band.chiefSince === 'number')) fail('Band is missing required state or has an invalid id');
  }
  return result;
}

export function fromPersonRecord(record: unknown): Person {
  const person = decodeGraph(record, 'PersonRecord', 'Person') as Person;
  // Person records predate this optional state. Only a genuinely absent field
  // migrates to empty; malformed present values are rejected rather than hidden.
  const personState = person as unknown as Record<string, unknown>;
  if (!Object.hasOwn(personState, 'commitment')) person.commitment = null;
  else if (person.commitment !== null) {
    const commitment = person.commitment as unknown;
    if (!isObject(commitment) || Object.keys(commitment).length !== 4 ||
        !['action', 'drive', 'baselinePressure', 'goal'].every(key => Object.hasOwn(commitment, key)) ||
        typeof commitment.action !== 'string' || commitment.action.length === 0 ||
        !(commitment.drive === null || COMMITMENT_DRIVES.includes(commitment.drive as any)) ||
        typeof commitment.baselinePressure !== 'number' || !Number.isFinite(commitment.baselinePressure) || commitment.baselinePressure < 0 ||
        typeof commitment.goal !== 'string' || commitment.goal.length === 0) fail('Person commitment is malformed');
  }
  if (!Object.hasOwn(personState, 'transportAnimalId')) person.transportAnimalId = null;
  else if (!(person.transportAnimalId === null || Number.isSafeInteger(person.transportAnimalId) && person.transportAnimalId > 0)) fail('Person transport animal id is malformed');
  if (!Object.hasOwn(personState, 'transportMode')) person.transportMode = null;
  else if (!(person.transportMode === null || person.transportMode === 'pack' || person.transportMode === 'riding')) fail('Person transport mode is malformed');
  if (!Object.hasOwn(personState, 'transportCapacity')) person.transportCapacity = 0;
  else if (typeof person.transportCapacity !== 'number' || !Number.isFinite(person.transportCapacity) || person.transportCapacity < 0) fail('Person transport capacity is malformed');
  if (!Object.hasOwn(personState, 'transportAutoClaim')) person.transportAutoClaim = true;
  else if (typeof person.transportAutoClaim !== 'boolean') fail('Person transport auto-claim setting is malformed');
  // The belief hook is executable behaviour, so it is rebound deliberately instead of serialized.
  Object.defineProperty((person.beliefs as any), 'onNewBelief', {
    value: () => person.noteDiscovery(), enumerable: true, writable: true, configurable: true,
  });
  return person;
}
export function fromHouseholdRecord(record: unknown): Household {
  return decodeGraph(record, 'HouseholdRecord', 'Household') as Household;
}
export function fromBandRecord(record: unknown): Band {
  return decodeGraph(record, 'BandRecord', 'Object') as unknown as Band;
}
