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

export const ENTITY_RECORD_VERSION = 1 as const;

type Primitive = string | number | boolean | null;
type EncodedValue = Primitive | { undefined: true } | { ref: number } | { number: 'Infinity' | '-Infinity' };
type GraphNode =
  | { kind: 'object'; prototype: string; fields: [string, EncodedValue][] }
  | { kind: 'array'; values: EncodedValue[] }
  | { kind: 'map'; entries: [EncodedValue, EncodedValue][] }
  | { kind: 'set'; values: EncodedValue[] }
  | { kind: 'typed'; type: string; values: number[] };
interface Graph { root: EncodedValue; nodes: GraphNode[] }

interface RecordEnvelope { readonly version: 1; readonly lastAdvancedTick: number; readonly graph: Graph }
export interface PersonRecord extends RecordEnvelope { readonly recordType: 'PersonRecord' }
export interface HouseholdRecord extends RecordEnvelope { readonly recordType: 'HouseholdRecord' }
export interface BandRecord extends RecordEnvelope { readonly recordType: 'BandRecord' }

const constructorEntries: [string, Function][] = [
  ['Person', Person], ['Household', Household], ['Inventory', Inventory], ['Beliefs', Beliefs],
  ['PlaceMemory', PlaceMemory], ['SpatialHash', SpatialHash], ['Memory', Memory],
  ['Mood', Mood], ['MacroBalance', MacroBalance], ['SeasonLore', SeasonLore],
];
const prototypes = new Map<string, object>(constructorEntries.map(([tag, ctor]) => [tag, ctor.prototype]));
const prototypeTags = new Map<object, string>([...prototypes].map(([tag, proto]) => [proto, tag]));
const typedArrays = new Map<string, (new (values: Iterable<number>) => ArrayBufferView)>([
  ['Float32Array', Float32Array], ['Float64Array', Float64Array],
  ['Int8Array', Int8Array], ['Uint8Array', Uint8Array], ['Uint8ClampedArray', Uint8ClampedArray],
  ['Int16Array', Int16Array], ['Uint16Array', Uint16Array], ['Int32Array', Int32Array], ['Uint32Array', Uint32Array],
]);

function fail(message: string): never { throw new TypeError(`Invalid entity record: ${message}`); }

function graphFor(root: object): Graph {
  const ids = new Map<object, number>();
  const nodes: GraphNode[] = [];
  const encode = (value: unknown): EncodedValue => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (value === Infinity || value === -Infinity) return { number: value === Infinity ? 'Infinity' : '-Infinity' };
      if (!Number.isFinite(value)) fail('NaN');
      return value;
    }
    if (value === undefined) return { undefined: true };
    if (typeof value !== 'object') fail(`unsupported ${typeof value}`);
    const prior = ids.get(value);
    if (prior !== undefined) return { ref: prior };
    const id = nodes.length;
    ids.set(value, id);
    // Reserve before walking children so cycles and shared aliases survive.
    nodes.push({ kind: 'array', values: [] });
    let node: GraphNode;
    if (Array.isArray(value)) {
      node = { kind: 'array', values: value.map(encode) };
    } else if (value instanceof Map) {
      node = { kind: 'map', entries: [...value].map(([k, v]) => [encode(k), encode(v)]) };
    } else if (value instanceof Set) {
      node = { kind: 'set', values: [...value].map(encode) };
    } else if (ArrayBuffer.isView(value)) {
      if (value instanceof DataView) fail('DataView is unsupported');
      const type = value.constructor.name;
      if (!typedArrays.has(type)) fail(`unsupported typed array ${type}`);
      const values = Array.from(value as unknown as ArrayLike<number>);
      if (!values.every(Number.isFinite)) fail(`non-finite ${type} value`);
      node = { kind: 'typed', type, values };
    } else {
      const proto = Object.getPrototypeOf(value);
      const prototype = proto === Object.prototype ? 'Object' : proto === null ? 'null' : prototypeTags.get(proto);
      if (!prototype) fail(`unregistered class ${value.constructor?.name ?? '<unknown>'}`);
      const fields: [string, EncodedValue][] = [];
      for (const key of Object.keys(value)) {
        const field = (value as Record<string, unknown>)[key];
        // This callback closes over the original Person. It is rebound to the hydrated owner below.
        if (value instanceof Beliefs && key === 'onNewBelief' && typeof field === 'function') continue;
        fields.push([key, encode(field)]);
      }
      node = { kind: 'object', prototype, fields };
    }
    nodes[id] = node;
    return { ref: id };
  };
  return { root: encode(root), nodes };
}

type RecordByType = { PersonRecord: PersonRecord; HouseholdRecord: HouseholdRecord; BandRecord: BandRecord };
function recordFor<T extends keyof RecordByType>(type: T, value: object, lastAdvancedTick: number): RecordByType[T] {
  if (!Number.isSafeInteger(lastAdvancedTick) || lastAdvancedTick < 0) fail('lastAdvancedTick must be a non-negative safe integer');
  return { recordType: type, version: ENTITY_RECORD_VERSION, lastAdvancedTick, graph: graphFor(value) } as RecordByType[T];
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
  const graph = record.graph as unknown as Graph;
  const allocated: object[] = graph.nodes.map((node, i) => {
    if (!isObject(node) || typeof node.kind !== 'string') fail(`invalid node ${i}`);
    switch (node.kind) {
      case 'array': if (!Array.isArray(node.values)) fail(`invalid array node ${i}`); return [];
      case 'map': if (!Array.isArray(node.entries)) fail(`invalid map node ${i}`); return new Map();
      case 'set': if (!Array.isArray(node.values)) fail(`invalid set node ${i}`); return new Set();
      case 'typed': {
        const ctor = typedArrays.get(String(node.type));
        if (!ctor || !Array.isArray(node.values) || !node.values.every(Number.isFinite)) fail(`invalid typed node ${i}`);
        return new ctor(node.values as number[]);
      }
      case 'object': {
        if (!Array.isArray(node.fields)) fail(`invalid object node ${i}`);
        const proto = node.prototype === 'Object' ? Object.prototype : node.prototype === 'null' ? null : prototypes.get(String(node.prototype));
        if (proto === undefined) fail(`unknown prototype ${String(node.prototype)}`);
        return Object.create(proto) as object;
      }
      default: return fail('unknown node kind');
    }
  });
  const decode = (value: unknown): unknown => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail('non-finite number'); return value; }
    if (!isObject(value)) fail('malformed value');
    if (value.undefined === true && Object.keys(value).length === 1) return undefined;
    if ((value.number === 'Infinity' || value.number === '-Infinity') && Object.keys(value).length === 1) {
      return value.number === 'Infinity' ? Infinity : -Infinity;
    }
    if (Number.isInteger(value.ref) && Object.keys(value).length === 1) {
      const item = allocated[value.ref as number];
      if (!item) fail(`dangling reference ${String(value.ref)}`);
      return item;
    }
    return fail('malformed reference');
  };
  graph.nodes.forEach((raw, i) => {
    const node = raw as GraphNode;
    const target = allocated[i] as any;
    if (node.kind === 'array') target.push(...node.values.map(decode));
    else if (node.kind === 'map') for (const entry of node.entries) {
      if (!Array.isArray(entry) || entry.length !== 2) fail(`invalid map entry ${i}`);
      target.set(decode(entry[0]), decode(entry[1]));
    }
    else if (node.kind === 'set') for (const value of node.values) target.add(decode(value));
    else if (node.kind === 'object') {
      const seen = new Set<string>();
      for (const field of node.fields) {
        if (!Array.isArray(field) || field.length !== 2 || typeof field[0] !== 'string' || seen.has(field[0])) fail(`invalid field in node ${i}`);
        seen.add(field[0]);
        Object.defineProperty(target, field[0], { value: decode(field[1]), enumerable: true, writable: true, configurable: true });
      }
    }
  });
  const result = decode(graph.root);
  const expectedPrototype = expectedRoot === 'Object' ? Object.prototype : prototypes.get(expectedRoot);
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
