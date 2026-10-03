/** Small allow-listed object graph codec shared by inert persistence records. */
export type GraphValue = string | number | boolean | null | { undefined: true } | { ref: number } | { number: 'Infinity' | '-Infinity' };
export type ObjectGraphNode =
  | { kind: 'object'; prototype: string; fields: [string, GraphValue][] }
  | { kind: 'array'; values: GraphValue[] }
  | { kind: 'map'; entries: [GraphValue, GraphValue][] }
  | { kind: 'set'; values: GraphValue[] }
  | { kind: 'typed'; type: string; values: number[] };
export interface ObjectGraph { root: GraphValue; nodes: ObjectGraphNode[] }

const constructors = new Map<string, Function>();
const constructorTags = new Map<object, string>();
export function registerGraphPrototype(tag: string, ctor: Function): void {
  const existing = constructors.get(tag);
  if (existing && existing !== ctor) throw new TypeError(`Graph prototype already registered: ${tag}`);
  constructors.set(tag, ctor);
  constructorTags.set(ctor.prototype, tag);
}

const typedArrays = new Map<string, new (values: Iterable<number>) => ArrayBufferView>([
  ['Float32Array', Float32Array], ['Float64Array', Float64Array], ['Int8Array', Int8Array],
  ['Uint8Array', Uint8Array], ['Uint8ClampedArray', Uint8ClampedArray], ['Int16Array', Int16Array],
  ['Uint16Array', Uint16Array], ['Int32Array', Int32Array], ['Uint32Array', Uint32Array],
]);
function invalid(label: string, message: string): never { throw new TypeError(`Invalid ${label}: ${message}`); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[], label: string): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid(label, 'unknown or missing fields');
}
function dense(values: unknown[], valid: (value: unknown) => boolean): boolean {
  for (let i = 0; i < values.length; i++) if (!Object.hasOwn(values, i) || !valid(values[i])) return false;
  return true;
}

export function toObjectGraph(root: object): ObjectGraph {
  const ids = new Map<object, number>();
  const nodes: ObjectGraphNode[] = [];
  const encode = (value: unknown): GraphValue => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (value === Infinity || value === -Infinity) return { number: value === Infinity ? 'Infinity' : '-Infinity' };
      if (!Number.isFinite(value)) invalid('object graph', 'NaN');
      return value;
    }
    if (value === undefined) return { undefined: true };
    if (typeof value !== 'object') invalid('object graph', `unsupported ${typeof value}`);
    const prior = ids.get(value);
    if (prior !== undefined) return { ref: prior };
    const id = nodes.length;
    ids.set(value, id);
    nodes.push({ kind: 'array', values: [] });
    let node: ObjectGraphNode;
    if (Array.isArray(value)) node = { kind: 'array', values: value.map(encode) };
    else if (value instanceof Map) node = { kind: 'map', entries: [...value].map(([k, v]) => [encode(k), encode(v)]) };
    else if (value instanceof Set) node = { kind: 'set', values: [...value].map(encode) };
    else if (ArrayBuffer.isView(value)) {
      if (value instanceof DataView) invalid('object graph', 'DataView is unsupported');
      const type = value.constructor.name;
      if (!typedArrays.has(type)) invalid('object graph', `unsupported typed array ${type}`);
      const values = Array.from(value as unknown as ArrayLike<number>);
      if (!values.every(Number.isFinite)) invalid('object graph', `non-finite ${type} value`);
      node = { kind: 'typed', type, values };
    } else {
      const proto = Object.getPrototypeOf(value);
      const prototype = proto === Object.prototype ? 'Object' : proto === null ? 'null' : constructorTags.get(proto);
      if (!prototype) invalid('object graph', `unregistered class ${value.constructor?.name ?? '<unknown>'}`);
      const fields: [string, GraphValue][] = [];
      for (const key of Object.keys(value)) {
        const field = (value as Record<string, unknown>)[key];
        // Beliefs' callback closes over a live person; hydrate it against the new owner.
        if (prototype === 'Beliefs' && key === 'onNewBelief' && typeof field === 'function') continue;
        fields.push([key, encode(field)]);
      }
      node = { kind: 'object', prototype, fields };
    }
    nodes[id] = node;
    return { ref: id };
  };
  return { root: encode(root), nodes };
}

export function fromObjectGraph(input: unknown, expectedRootPrototype: string, label = 'object graph'): object {
  if (!record(input)) invalid(label, 'malformed graph');
  exact(input, ['root', 'nodes'], label);
  if (!Array.isArray(input.nodes) || !dense(input.nodes, record)) invalid(label, 'malformed graph nodes');
  const graph = input as unknown as ObjectGraph;
  const allocated: object[] = graph.nodes.map((node, i) => {
    if (!record(node) || typeof node.kind !== 'string') invalid(label, `invalid node ${i}`);
    switch (node.kind) {
      case 'array': exact(node, ['kind', 'values'], label); if (!Array.isArray(node.values)) invalid(label, `invalid array node ${i}`); return [];
      case 'map': exact(node, ['kind', 'entries'], label); if (!Array.isArray(node.entries) || !dense(node.entries, v => Array.isArray(v) && v.length === 2 && Object.hasOwn(v, 0) && Object.hasOwn(v, 1))) invalid(label, `invalid map node ${i}`); return new Map();
      case 'set': exact(node, ['kind', 'values'], label); if (!Array.isArray(node.values)) invalid(label, `invalid set node ${i}`); return new Set();
      case 'typed': {
        exact(node, ['kind', 'type', 'values'], label);
        const ctor = typedArrays.get(String(node.type));
        if (!ctor || !Array.isArray(node.values) || !dense(node.values, v => typeof v === 'number' && Number.isFinite(v))) invalid(label, `invalid typed node ${i}`);
        const typed = new ctor(node.values as number[]);
        if (Array.from(typed as unknown as ArrayLike<number>).some((v, j) => !Object.is(v, node.values[j]))) invalid(label, `unrepresentable typed node ${i}`);
        return typed;
      }
      case 'object': {
        exact(node, ['kind', 'prototype', 'fields'], label);
        if (!Array.isArray(node.fields) || !dense(node.fields, v => Array.isArray(v) && v.length === 2 && Object.hasOwn(v, 0) && Object.hasOwn(v, 1))) invalid(label, `invalid object node ${i}`);
        const ctor = constructors.get(String(node.prototype));
        const proto = node.prototype === 'Object' ? Object.prototype : node.prototype === 'null' ? null : ctor?.prototype;
        if (proto === undefined) invalid(label, `unknown prototype ${String(node.prototype)}`);
        return Object.create(proto) as object;
      }
      default: return invalid(label, 'unknown node kind');
    }
  });
  const decode = (value: unknown): unknown => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) invalid(label, 'non-finite number'); return value; }
    if (!record(value)) invalid(label, 'malformed value');
    if (value.undefined === true && Object.keys(value).length === 1) return undefined;
    if ((value.number === 'Infinity' || value.number === '-Infinity') && Object.keys(value).length === 1) return value.number === 'Infinity' ? Infinity : -Infinity;
    if (Number.isSafeInteger(value.ref) && (value.ref as number) >= 0 && Object.keys(value).length === 1) {
      const item = allocated[value.ref as number];
      if (!item) invalid(label, `dangling reference ${String(value.ref)}`);
      return item;
    }
    return invalid(label, 'malformed reference');
  };
  graph.nodes.forEach((node, i) => {
    const target = allocated[i] as any;
    if (node.kind === 'array') {
      if (!dense(node.values, () => true)) invalid(label, `sparse array node ${i}`);
      target.push(...node.values.map(decode));
    }
    else if (node.kind === 'map') for (const entry of node.entries) {
      if (!Array.isArray(entry) || entry.length !== 2) invalid(label, `invalid map entry ${i}`);
      const key = decode(entry[0]);
      if (target.has(key)) invalid(label, `duplicate map key in node ${i}`);
      target.set(key, decode(entry[1]));
    } else if (node.kind === 'set') {
      if (!dense(node.values, () => true)) invalid(label, `sparse set node ${i}`);
      for (const value of node.values) {
        const item = decode(value);
        if (target.has(item)) invalid(label, `duplicate set value in node ${i}`);
        target.add(item);
      }
    }
    else if (node.kind === 'object') {
      const seen = new Set<string>();
      for (const field of node.fields) {
        if (!Array.isArray(field) || field.length !== 2 || typeof field[0] !== 'string' || seen.has(field[0])) invalid(label, `invalid field in node ${i}`);
        seen.add(field[0]);
        Object.defineProperty(target, field[0], { value: decode(field[1]), enumerable: true, writable: true, configurable: true });
      }
    }
  });
  const root = decode(graph.root);
  const expected = expectedRootPrototype === 'Object' ? Object.prototype : constructors.get(expectedRootPrototype)?.prototype;
  if (typeof root !== 'object' || root === null || Object.getPrototypeOf(root) !== expected) invalid(label, `root must be ${expectedRootPrototype}`);
  return root;
}
