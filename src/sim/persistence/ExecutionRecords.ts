/** Inert execution checkpoints for one live Simulation's clock and RNG bank.
 * This does not restore or register any simulation state. */
import type { Simulation } from '../core/Simulation.ts';
import { RNG, type RngSnapshot } from '../core/RNG.ts';
import { TimeManager, type TimeSnapshot } from '../core/TimeManager.ts';

export const EXECUTION_RECORD_VERSION = 1 as const;

/** Stable paths are a seed contract: new live streams require an appended path and a versioned review. */
export const EXECUTION_STREAM_PATHS = [
  'simulation.rng',
  'simulation.aiRng',
  'simulation.actionRng',
  'simulation.commandRng',
  'simulation.choiceRng',
  'simulation.hearthRng',
  'simulation.lifeRng',
  'simulation.forestRng',
  'simulation.knowledgeRng',
  'simulation.wildlifeRng',
  'simulation.recordRng',
  'simulation.healthRng',
  'simulation.ecologyRng',
  'simulation.edgeRng',
  'simulation.movementSystem.rng',
] as const;
export type ExecutionStreamPath = (typeof EXECUTION_STREAM_PATHS)[number];

export type ExecutionStreamRef = { readonly [P in ExecutionStreamPath]: ExecutionStreamPath };

export interface ExecutionRecord {
  readonly recordType: 'ExecutionRecord';
  readonly version: 1;
  readonly lastAdvancedTick: number;
  readonly time: TimeSnapshot;
  /** One state per canonical stream identity. If paths alias, only the canonical key appears here. */
  readonly streams: Partial<Record<ExecutionStreamPath, RngSnapshot>>;
  /** Exact stable path to canonical stream mapping; hydration reuses the same RNG object for aliases. */
  readonly streamRefs: ExecutionStreamRef;
}

export interface ExecutionState {
  readonly lastAdvancedTick: number;
  readonly time: TimeManager;
  readonly streamsByPath: Map<ExecutionStreamPath, RNG>;
  readonly streamsById: Map<ExecutionStreamPath, RNG>;
}

function invalid(reason: string): never { throw new TypeError(`Invalid execution record: ${reason}`); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid('unknown or missing fields');
}
function pathParts(path: ExecutionStreamPath): { root: 'rng' | 'movement'; field?: string } {
  if (path === 'simulation.rng') return { root: 'rng' };
  if (path === 'simulation.movementSystem.rng') return { root: 'movement' };
  return { root: 'rng', field: path.slice('simulation.'.length) };
}
function streamAt(simulation: Simulation, path: ExecutionStreamPath): RNG {
  const sim = simulation as unknown as Record<string, unknown>;
  const parts = pathParts(path);
  let value: unknown;
  if (parts.root === 'movement') {
    const movement = sim.movementSystem;
    if (!object(movement)) invalid(`missing source ${path}`);
    value = movement.rng;
  } else if (!parts.field) value = sim.rng;
  else value = sim[parts.field];
  if (!(value instanceof RNG)) invalid(`missing or invalid source ${path}`);
  return value;
}
function canonicalTargets(value: unknown): { refs: ExecutionStreamRef; canonicalPaths: ExecutionStreamPath[] } | null {
  if (!object(value)) return null;
  try { exact(value, EXECUTION_STREAM_PATHS); } catch { return null; }
  const pathSet = new Set<string>(EXECUTION_STREAM_PATHS);
  const rank = new Map<string, number>(EXECUTION_STREAM_PATHS.map((path, index) => [path, index]));
  const refs = value as unknown as ExecutionStreamRef;
  for (const path of EXECUTION_STREAM_PATHS) {
    const canonical = refs[path];
    if (typeof canonical !== 'string' || !pathSet.has(canonical) || refs[canonical as ExecutionStreamPath] !== canonical ||
        rank.get(canonical)! > rank.get(path)!) return null;
  }
  const canonicalPaths = EXECUTION_STREAM_PATHS.filter(path => refs[path] === path);
  if (new Set(EXECUTION_STREAM_PATHS.map(path => refs[path])).size !== canonicalPaths.length) return null;
  return { refs, canonicalPaths };
}

/** Capture clock and every retained random stream without advancing either. */
export function toExecutionRecord(simulation: Simulation): ExecutionRecord {
  const tick = simulation.time.tick;
  if (!Number.isSafeInteger(tick) || tick < 0) invalid('source clock tick');
  const byIdentity = new Map<RNG, ExecutionStreamPath>();
  const streams: Partial<Record<ExecutionStreamPath, RngSnapshot>> = {};
  const refs = {} as Record<ExecutionStreamPath, ExecutionStreamPath>;
  for (const path of EXECUTION_STREAM_PATHS) {
    const stream = streamAt(simulation, path);
    const canonical = byIdentity.get(stream);
    if (canonical) refs[path] = canonical;
    else {
      byIdentity.set(stream, path);
      refs[path] = path;
      streams[path] = stream.snapshot();
    }
  }
  const time = simulation.time.snapshot();
  if (time.tick !== tick) invalid('clock changed while capturing');
  return {
    recordType: 'ExecutionRecord', version: EXECUTION_RECORD_VERSION,
    lastAdvancedTick: tick, time, streams, streamRefs: refs,
  };
}

/** Validate the complete v1 bank before making independent, canonical RNG objects. */
export function fromExecutionRecord(record: unknown): ExecutionState {
  if (!object(record)) invalid('expected object');
  exact(record, ['recordType', 'version', 'lastAdvancedTick', 'time', 'streams', 'streamRefs']);
  if (record.recordType !== 'ExecutionRecord' || record.version !== EXECUTION_RECORD_VERSION ||
      !Number.isSafeInteger(record.lastAdvancedTick) || (record.lastAdvancedTick as number) < 0) invalid('expected ExecutionRecord v1');
  const refs = canonicalTargets(record.streamRefs);
  if (!refs) invalid('stream path aliases do not match v1');
  if (!object(record.streams)) invalid('invalid stream state bank');
  exact(record.streams, refs.canonicalPaths);

  const time = TimeManager.fromSnapshot(record.time);
  if (time.tick !== record.lastAdvancedTick) invalid('clock tick does not match record tick');

  const streamsById = new Map<ExecutionStreamPath, RNG>();
  for (const path of refs.canonicalPaths) {
    const state = record.streams[path];
    if (!object(state)) invalid(`missing stream state ${path}`);
    streamsById.set(path, RNG.fromSnapshot(state));
  }
  const streamsByPath = new Map<ExecutionStreamPath, RNG>();
  for (const path of EXECUTION_STREAM_PATHS) {
    const canonical = refs.refs[path];
    const stream = streamsById.get(canonical);
    if (!stream) invalid(`stream path ${path} references missing canonical state ${canonical}`);
    streamsByPath.set(path, stream);
  }
  return { lastAdvancedTick: record.lastAdvancedTick as number, time, streamsByPath, streamsById };
}
