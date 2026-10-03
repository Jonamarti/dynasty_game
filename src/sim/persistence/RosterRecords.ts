/** Coordinated inert snapshots for the current person/household/band roster. */
import type { Simulation, Band } from '../core/Simulation.ts';
import type { Person } from '../entities/Person.ts';
import type { Household } from '../entities/Household.ts';
import { fromBandRecord, fromHouseholdRecord, fromPersonRecord, toBandRecord, toHouseholdRecord, toPersonRecord,
  type BandRecord, type HouseholdRecord, type PersonRecord } from './EntityRecords.ts';
import { fromBandRelationsRecord, fromRelationshipGraphRecord, toBandRelationsRecord, toRelationshipGraphRecord,
  type BandRelationsRecord, type RelationshipGraphRecord } from './SocialRecords.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';
import type { BandRelations } from '../social/BandRelations.ts';

export const ROSTER_RECORD_VERSION = 1 as const;
export interface RosterRecord {
  readonly recordType: 'RosterRecord';
  readonly version: 1;
  readonly lastAdvancedTick: number;
  /** All identities still retained by the simulation, including departed dead. */
  readonly people: PersonRecord[];
  /** Current `Simulation.people` membership and order, including a pending player corpse. */
  readonly activePersonIds: number[];
  readonly households: HouseholdRecord[];
  readonly bands: BandRecord[];
  readonly relationships: RelationshipGraphRecord;
  readonly bandRelations: BandRelationsRecord;
}

export interface RosterState {
  readonly lastAdvancedTick: number;
  /** Every retained identity. `activePeople` is the current Simulation.people slice. */
  readonly people: Person[];
  readonly activePeople: Person[];
  readonly peopleById: Map<number, Person>;
  readonly households: Household[];
  readonly householdsById: Map<number, Household>;
  readonly bands: Band[];
  readonly bandsById: Map<number, Band>;
  readonly relationships: RelationshipGraph;
  readonly bandRelations: BandRelations;
}

function invalid(message: string): never { throw new TypeError(`Invalid roster record: ${message}`); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid('unknown or missing fields');
}
function validTick(tick: unknown): tick is number { return Number.isSafeInteger(tick) && (tick as number) >= 0; }
function uniqueById<T extends { id: number }>(items: T[], kind: string): Map<number, T> {
  const map = new Map<number, T>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.id) || map.has(item.id)) invalid(`duplicate or invalid ${kind} id`);
    map.set(item.id, item);
  }
  return map;
}

function validateRoster(people: Person[], activePersonIds: number[], households: Household[], bands: Band[]): {
  peopleById: Map<number, Person>; householdsById: Map<number, Household>; bandsById: Map<number, Band>;
} {
  const peopleById = uniqueById(people, 'person');
  const householdsById = uniqueById(households, 'household');
  const bandsById = uniqueById(bands, 'band');
  const active = new Set<number>();
  for (const id of activePersonIds) {
    if (!Number.isSafeInteger(id) || active.has(id) || !peopleById.has(id)) invalid('active person reference');
    active.add(id);
  }
  for (const person of people) {
    if (person.alive && !active.has(person.id)) invalid(`living person ${person.id} is missing from active membership`);
    if (!bandsById.has(person.bandId)) invalid(`person ${person.id} references missing band`);
    if (person.householdId !== null && !householdsById.has(person.householdId)) invalid(`person ${person.id} references missing household`);
    // A departed deceased person keeps their householdId as history after
    // settleAffairs removes them from memberIds. Living membership stays reciprocal.
    if (person.alive && person.householdId !== null &&
        !householdsById.get(person.householdId)!.memberIds.includes(person.id)) {
      invalid(`person ${person.id} is missing from household membership`);
    }
  }
  for (const household of households) {
    if (!bandsById.has(household.bandId)) invalid(`household ${household.id} references missing band`);
    const memberIds = new Set<number>();
    for (const memberId of household.memberIds) {
      if (!Number.isSafeInteger(memberId) || memberIds.has(memberId)) invalid(`household ${household.id} has duplicate or invalid member`);
      memberIds.add(memberId);
      const member = peopleById.get(memberId);
      if (!member) invalid(`household ${household.id} references missing member`);
      if (member.householdId !== household.id) invalid(`household ${household.id} membership is not reciprocal`);
    }
  }
  return { peopleById, householdsById, bandsById };
}

/** Capture one coherent tick without advancing it or serializing the world. */
export function toRosterRecord(sim: Simulation, lastAdvancedTick = sim.time.tick): RosterRecord {
  if (!validTick(lastAdvancedTick) || lastAdvancedTick !== sim.time.tick) invalid('lastAdvancedTick must equal the current simulation tick');
  const people = [...sim.peopleById.values()];
  const activePersonIds = sim.people.map(person => person.id);
  const households = [...sim.householdsById.values()];
  const bands = [...sim.bands];
  // Catch a stale active array/index rather than writing a roster that could
  // appear valid after its one-object-per-id aliases have already diverged.
  const maps = validateRoster(people, activePersonIds, households, bands);
  uniqueById(sim.households, 'simulation household');
  if ([...sim.peopleById].some(([id, person]) => id !== person.id) ||
      [...sim.householdsById].some(([id, household]) => id !== household.id) ||
      sim.people.some(person => maps.peopleById.get(person.id) !== person) ||
      sim.households.length !== maps.householdsById.size ||
      sim.households.some(household => maps.householdsById.get(household.id) !== household)) {
    invalid('simulation arrays and identity maps disagree');
  }
  return {
    recordType: 'RosterRecord', version: ROSTER_RECORD_VERSION, lastAdvancedTick,
    people: people.map(person => toPersonRecord(person, lastAdvancedTick)),
    activePersonIds,
    households: households.map(household => toHouseholdRecord(household, lastAdvancedTick)),
    bands: bands.map(band => toBandRecord(band, lastAdvancedTick)),
    relationships: toRelationshipGraphRecord(sim.relationships),
    bandRelations: toBandRelationsRecord(sim.bandRelations),
  };
}

/** Validate and hydrate detached objects; nothing is registered with a Simulation. */
export function fromRosterRecord(input: unknown): RosterState {
  if (!object(input)) invalid('expected RosterRecord');
  exact(input, ['recordType', 'version', 'lastAdvancedTick', 'people', 'activePersonIds', 'households', 'bands', 'relationships', 'bandRelations']);
  if (input.recordType !== 'RosterRecord' || input.version !== ROSTER_RECORD_VERSION || !validTick(input.lastAdvancedTick) ||
      !Array.isArray(input.people) || !Array.isArray(input.activePersonIds) ||
      !Array.isArray(input.households) || !Array.isArray(input.bands)) invalid('expected RosterRecord v1');
  const tick = input.lastAdvancedTick;
  const checkTicks = (records: unknown[], kind: string): void => {
    for (const record of records) {
      if (!object(record) || record.lastAdvancedTick !== tick) invalid(`${kind} tick does not match roster tick`);
    }
  };
  checkTicks(input.people, 'person'); checkTicks(input.households, 'household'); checkTicks(input.bands, 'band');
  const people = input.people.map(fromPersonRecord);
  const households = input.households.map(fromHouseholdRecord);
  const bands = input.bands.map(fromBandRecord);
  const activePersonIds = input.activePersonIds as number[];
  const maps = validateRoster(people, activePersonIds, households, bands);
  const relationships = fromRelationshipGraphRecord(input.relationships);
  const bandRelations = fromBandRelationsRecord(input.bandRelations);
  return {
    lastAdvancedTick: tick,
    people, activePeople: activePersonIds.map(id => maps.peopleById.get(id)!), peopleById: maps.peopleById,
    households, householdsById: maps.householdsById,
    bands, bandsById: maps.bandsById,
    relationships, bandRelations,
  };
}
