/**
 * A person at level 1 (compact, with identity), M15 phase 32b.
 *
 * A `CompactPerson` is the *same person*, not a summary of them: it owns the one
 * `Person` instance (identity, kin, household, inventory, equipment, wounds,
 * memories, orders and the progress they have banked) and adds only what the
 * compact scheduler needs — the date of the last advance, a derived random
 * stream of its own and a coarse agenda label. Nothing is copied, so nothing can
 * be counted twice; `CompactAuthority` is what guarantees that a person is
 * owned by exactly one level at a time.
 *
 * Inert: no system of `Simulation` calls this yet. See docs/m15_phase32b_compact.md.
 */
import type { Person } from '../entities/Person.ts';
import { RNG, hashString, type RngSnapshot } from '../core/RNG.ts';
import { fromPersonRecord, toPersonRecord, type PersonRecord } from '../persistence/EntityRecords.ts';

export const COMPACT_RECORD_VERSION = 1 as const;

export type CompactGoalKind = 'obtain_food' | 'build' | 'care' | 'travel' | 'idle';
export interface CompactGoal {
  readonly kind: CompactGoalKind;
  /** Tick at which the person entered this agenda (the demotion tick if it was in progress). */
  readonly since: number;
  /** The thing being worked on, as `kind:id` (`building:12`), or null. Progress lives on that thing
   * and in the person's banked work, never in this label. */
  readonly target: string | null;
}

export interface CompactPerson {
  readonly person: Person;
  /** The tick this person has been advanced to. A reader must bring it to `now` first. */
  lastAdvancedTick: number;
  readonly rng: RNG;
  goal: CompactGoal;
  /** Bumped on every transfer between levels; a stale record is refused by its epoch. */
  epoch: number;
}

export interface CompactPersonRecord {
  readonly recordType: 'CompactPersonRecord';
  readonly version: 1;
  readonly personId: number;
  readonly lastAdvancedTick: number;
  readonly epoch: number;
  readonly rng: RngSnapshot;
  readonly goal: CompactGoal;
  readonly person: PersonRecord;
}

/**
 * The compact stream of one person. Derived from the world seed and a stable
 * identity, outside the `Simulation` constructor's fork contract, so creating or
 * dropping compact people never shifts a draw of the detailed world. Once made,
 * its state travels with the person (`CompactAuthority` keeps it across levels):
 * promoting and demoting again continues the stream rather than re-deriving it.
 */
export function deriveCompactStream(worldSeed: string | number, personId: number): RNG {
  return new RNG(hashString(`compact|${worldSeed}|${personId}`));
}

const FOOD_ACTIONS = new Set(['forage', 'hunt', 'reap', 'pick', 'gather', 'sow', 'plant', 'tend', 'bring_food', 'eat']);
const BUILD_ACTIONS = new Set(['build', 'dig', 'craft', 'pile', 'haul', 'chop', 'cut_grass', 'prototype', 'inscribe']);
const CARE_ACTIONS = new Set(['nurse', 'carry_baby', 'carry_baby_home', 'put_down_baby', 'play_with_baby', 'attend']);
const TRAVEL_ACTIONS = new Set(['goto', 'go_home', 'explore', 'wander', 'patrol']);

/** Read what a person is doing as a coarse agenda label. Reads only; never writes the person. */
export function goalOf(person: Person, tick: number): CompactGoal {
  const action = person.order ?? person.action;
  const kind: CompactGoalKind = FOOD_ACTIONS.has(action) ? 'obtain_food' : BUILD_ACTIONS.has(action) ? 'build'
    : CARE_ACTIONS.has(action) ? 'care' : TRAVEL_ACTIONS.has(action) ? 'travel' : 'idle';
  let target: string | null = null;
  if (person.targetBuildingId !== null) target = `building:${person.targetBuildingId}`;
  else if (person.targetNodeId !== null) target = `node:${person.targetNodeId}`;
  else if (person.targetTreeId !== null) target = `tree:${person.targetTreeId}`;
  else if (person.targetAnimalId !== null) target = `animal:${person.targetAnimalId}`;
  else if (person.targetPileId !== null) target = `pile:${person.targetPileId}`;
  return { kind, since: tick, target };
}

export function toCompactRecord(compact: CompactPerson): CompactPersonRecord {
  return {
    recordType: 'CompactPersonRecord', version: COMPACT_RECORD_VERSION, personId: compact.person.id,
    lastAdvancedTick: compact.lastAdvancedTick, epoch: compact.epoch, rng: compact.rng.snapshot(),
    goal: { ...compact.goal }, person: toPersonRecord(compact.person, compact.lastAdvancedTick),
  };
}

function fail(message: string): never { throw new TypeError(`Invalid compact person record: ${message}`); }
const GOAL_KINDS: readonly string[] = ['obtain_food', 'build', 'care', 'travel', 'idle'];

/** Decode a JSON record into an independent compact person. Does not register it with any authority. */
export function fromCompactRecord(record: unknown): CompactPerson {
  const raw = record as Record<string, any> | null;
  if (!raw || typeof raw !== 'object' || raw.recordType !== 'CompactPersonRecord' || raw.version !== COMPACT_RECORD_VERSION) {
    fail('expected CompactPersonRecord v1');
  }
  if (!Number.isSafeInteger(raw.lastAdvancedTick) || raw.lastAdvancedTick < 0) fail('lastAdvancedTick');
  if (!Number.isSafeInteger(raw.epoch) || raw.epoch < 0) fail('epoch');
  const goal = raw.goal;
  if (!goal || !GOAL_KINDS.includes(goal.kind) || !Number.isSafeInteger(goal.since) ||
      !(goal.target === null || typeof goal.target === 'string')) fail('goal');
  const inner = raw.person;
  if (!inner || inner.lastAdvancedTick !== raw.lastAdvancedTick) fail('person record is stamped with another tick');
  const person = fromPersonRecord(inner);
  if (person.id !== raw.personId) fail('personId does not match the person record');
  return {
    person, lastAdvancedTick: raw.lastAdvancedTick, epoch: raw.epoch, rng: RNG.fromSnapshot(raw.rng),
    goal: { kind: goal.kind, since: goal.since, target: goal.target },
  };
}
