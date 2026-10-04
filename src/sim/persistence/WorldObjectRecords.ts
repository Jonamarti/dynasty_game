/** Detached snapshots of the entities placed in the world. No Simulation load. */
import type { Simulation } from '../core/Simulation.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { Building, isEarthwork, isField, isTrap, isHerd, isHeap } from '../entities/Building.ts';
import { Crop } from '../entities/Field.ts';
import { Tree } from '../entities/Tree.ts';
import { ItemPile } from '../entities/ItemPile.ts';
import { Corpse } from '../entities/Corpse.ts';
import { Animal } from '../entities/Animal.ts';
import { Inscription } from '../entities/Inscription.ts';
import { Person } from '../entities/Person.ts';
import { Household } from '../entities/Household.ts';
import { Inventory } from '../entities/Item.ts';
import { Beliefs } from '../ai/Beliefs.ts';
import { PlaceMemory } from '../social/PlaceMemory.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { Memory } from '../social/Memory.ts';
import { Mood } from '../core/Mood.ts';
import { MacroBalance } from '../core/Macros.ts';
import { SeasonLore } from '../knowledge/SeasonLore.ts';
import { fromObjectGraph, registerGraphPrototype, toObjectGraph, type ObjectGraph } from './GraphRecords.ts';

export const WORLD_OBJECT_RECORD_VERSION = 1 as const;
const classes: [string, Function][] = [
  ['ResourceNode', ResourceNode], ['Building', Building], ['Crop', Crop], ['Tree', Tree],
  ['ItemPile', ItemPile], ['Corpse', Corpse], ['Animal', Animal], ['Inscription', Inscription],
  ['Person', Person], ['Household', Household], ['Inventory', Inventory], ['Beliefs', Beliefs],
  ['PlaceMemory', PlaceMemory], ['SpatialHash', SpatialHash], ['Memory', Memory], ['Mood', Mood],
  ['MacroBalance', MacroBalance], ['SeasonLore', SeasonLore],
];
for (const [tag, ctor] of classes) registerGraphPrototype(tag, ctor);

interface WorldObjects {
  nodes: ResourceNode[]; nodesById: Map<number, ResourceNode>;
  buildings: Building[]; buildingsById: Map<number, Building>;
  trees: Tree[]; treesById: Map<number, Tree>;
  piles: ItemPile[]; pilesById: Map<number, ItemPile>;
  corpses: Corpse[]; corpsesById: Map<number, Corpse>;
  animals: Animal[]; animalsById: Map<number, Animal>;
  inscriptions: Inscription[]; inscriptionsById: Map<number, Inscription>;
}
export interface WorldObjectRecord {
  readonly recordType: 'WorldObjectRecord';
  readonly version: 1;
  readonly lastAdvancedTick: number;
  readonly graph: ObjectGraph;
}
export interface WorldObjectState extends WorldObjects { readonly lastAdvancedTick: number }

function invalid(message: string): never { throw new TypeError(`Invalid world object record: ${message}`); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid('unknown or missing fields');
}
function validTick(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function unique<T extends { id: number }>(items: T[], kind: string): Map<number, T> {
  const result = new Map<number, T>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || result.has(item.id)) invalid(`duplicate or invalid ${kind} id`);
    result.set(item.id, item);
  }
  return result;
}
function sameIndex<T extends { id: number }>(items: T[], index: Map<number, T>, kind: string): void {
  const expected = unique(items, kind);
  if (!(index instanceof Map) || index.size !== expected.size) invalid(`${kind} array and map disagree`);
  for (const [id, item] of index) {
    if (expected.get(id) !== item) invalid(`${kind} array and map disagree`);
  }
}
function assertPositions<T extends { x: number; y: number }>(items: T[], kind: string): void {
  for (const item of items) if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) invalid(`${kind} has invalid position`);
}
function validate(state: WorldObjects, tick: number): void {
  for (const key of ['nodes', 'buildings', 'trees', 'piles', 'corpses', 'animals', 'inscriptions'] as const) {
    const mapKey = `${key}ById` as const;
    sameIndex(state[key], state[mapKey] as Map<number, any>, key);
    assertPositions(state[key] as any[], key);
  }
  if (state.nodes.some(n => !(n instanceof ResourceNode) || !Number.isFinite(n.amount) || !n.def || n.def.kind !== n.kind)) invalid('invalid resource node');
  if (state.buildings.some(b => !(b instanceof Building) || !b.def || !Number.isSafeInteger(b.ownerBandId) ||
      (isField(b.def) ? !(b.crop instanceof Crop) : b.crop !== null) || !(b.byproductCarry instanceof Map) ||
      !Number.isFinite(b.progress) || !Number.isFinite(b.yieldCarry) ||
      ((isTrap(b.def) || isHerd(b.def) || isHeap(b.def)) && !Number.isFinite(b.yieldCarry)))) invalid('invalid building or nested state');
  // M15 phase 26c: an earthwork's plan and its banked progress travel with it.
  // The tiles are the record of how much was moved, so a malformed one would
  // turn a half-dug ditch into a finished or an impossible one on reload.
  if (state.buildings.some(b => isEarthwork(b.def) || b.def.dig
      ? !Array.isArray(b.earth) || b.earth.some(tile => !tile || !Number.isSafeInteger(tile.x) || !Number.isSafeInteger(tile.y) ||
          (tile.kind !== 'dig' && tile.kind !== 'pile') || !Number.isFinite(tile.goal) || tile.goal <= 0 ||
          !Number.isFinite(tile.progress) || tile.progress < 0 || tile.progress > tile.goal) ||
        ((b.complete && b.earth.some(tile => tile.progress < tile.goal)) ||
          (!isEarthwork(b.def) && b.progress > 0 && b.earth.some(tile => tile.progress < tile.goal)))
      : b.earth !== null && b.earth !== undefined)) invalid('invalid earthwork plan');
  if (state.trees.some(t => !(t instanceof Tree) || !t.def || !Number.isFinite(t.age) || !Number.isFinite(t.chopProgress))) invalid('invalid tree');
  if (state.piles.some(p => !(p instanceof ItemPile) || !(p.contents instanceof Inventory))) invalid('invalid item pile');
  if (state.corpses.some(c => !(c instanceof Corpse) || !c.person || !Number.isSafeInteger(c.person.id) ||
      !validTick(c.diedTick) || c.diedTick > tick)) invalid('invalid corpse');
  if (state.animals.some(a => !(a instanceof Animal) || !a.def || !Number.isFinite(a.health) || !Number.isFinite(a.fed) || !(a.fedBy instanceof Set))) invalid('invalid animal');
  if (state.inscriptions.some(i => !(i instanceof Inscription) || !i.def || !validTick(i.madeTick) || i.madeTick > tick ||
      !Array.isArray(i.techs) || !(i.pending === null || typeof i.pending === 'string'))) invalid('invalid inscription');
  for (const p of state.piles) if (!validTick(p.droppedTick) || p.droppedTick > tick) invalid('pile tick exceeds snapshot tick');
}

function graphState(sim: Simulation): WorldObjects {
  return {
    nodes: sim.nodes, nodesById: sim.nodesById,
    buildings: sim.buildings, buildingsById: sim.buildingsById,
    trees: sim.trees, treesById: sim.treesById,
    piles: sim.piles, pilesById: sim.pilesById,
    corpses: sim.corpses, corpsesById: sim.corpsesById,
    animals: sim.animals, animalsById: sim.animalsById,
    inscriptions: sim.inscriptions, inscriptionsById: sim.inscriptionsById,
  };
}
/** Capture ordered world objects and their canonical identity maps at one tick. */
export function toWorldObjectRecord(sim: Simulation, lastAdvancedTick = sim.time.tick): WorldObjectRecord {
  if (!validTick(lastAdvancedTick) || lastAdvancedTick !== sim.time.tick) invalid('lastAdvancedTick must equal current simulation tick');
  const state = graphState(sim);
  validate(state, lastAdvancedTick);
  if (state.corpses.some(c => sim.peopleById.get(c.person.id) !== c.person)) invalid('corpse person is not the canonical simulation identity');
  return { recordType: 'WorldObjectRecord', version: WORLD_OBJECT_RECORD_VERSION, lastAdvancedTick, graph: toObjectGraph(state) };
}

/** Hydrate detached world entities; optionally rebind corpse references to the roster's canonical people. */
export function fromWorldObjectRecord(input: unknown, peopleById?: ReadonlyMap<number, Person>): WorldObjectState {
  if (!object(input)) invalid('expected WorldObjectRecord v1');
  exact(input, ['recordType', 'version', 'lastAdvancedTick', 'graph']);
  if (input.recordType !== 'WorldObjectRecord' || input.version !== WORLD_OBJECT_RECORD_VERSION || !validTick(input.lastAdvancedTick) || !object(input.graph)) {
    invalid('expected WorldObjectRecord v1');
  }
  const state = fromObjectGraph(input.graph, 'Object', 'world object graph') as unknown as WorldObjects;
  const expectedKeys = ['nodes', 'nodesById', 'buildings', 'buildingsById', 'trees', 'treesById', 'piles', 'pilesById',
    'corpses', 'corpsesById', 'animals', 'animalsById', 'inscriptions', 'inscriptionsById'];
  if (!object(state) || Object.keys(state).length !== expectedKeys.length || expectedKeys.some(key => !Object.hasOwn(state, key))) invalid('unknown or missing world object arrays/maps');
  if (!object(state) || !Array.isArray(state.nodes) || !Array.isArray(state.buildings) || !Array.isArray(state.trees) ||
      !Array.isArray(state.piles) || !Array.isArray(state.corpses) || !Array.isArray(state.animals) || !Array.isArray(state.inscriptions)) invalid('missing entity arrays');
  for (const corpse of state.corpses) {
    if (!(corpse instanceof Corpse) || !corpse.person || !Number.isSafeInteger(corpse.person.id)) invalid('invalid corpse person reference');
    if (peopleById) {
      const person = peopleById.get(corpse.person.id);
      if (!person) invalid(`corpse ${corpse.id} references missing person`);
      Object.defineProperty(corpse, 'person', { value: person, enumerable: true, writable: false, configurable: true });
    }
    if (!peopleById) {
      const person = corpse.person;
      if (person.beliefs instanceof Beliefs) Object.defineProperty(person.beliefs, 'onNewBelief', {
        value: () => person.noteDiscovery(), enumerable: true, writable: true, configurable: true,
      });
    }
  }
  validate(state, input.lastAdvancedTick);
  return { ...state, lastAdvancedTick: input.lastAdvancedTick };
}
