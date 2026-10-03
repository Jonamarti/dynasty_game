import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { fromExecutionRecord, toExecutionRecord, EXECUTION_STREAM_PATHS } from '../persistence/ExecutionRecords.ts';

function simulation(): Simulation {
  return new Simulation({
    seed: 'phase28-execution-ledger',
    world: { width: 64, height: 64, treeDensity: 0.01, gameHerds: 2, predators: 1 },
    population: { bands: 2, peoplePerBand: 4 },
  });
}

/** Independent object-graph walk: the expected persistence inventory lives in the test, not the codec. */
function discoverRngs(root: unknown): Set<RNG> {
  const seen = new Set<object>();
  const found = new Set<RNG>();
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || seen.has(value)) return;
    if (value instanceof RNG) { found.add(value); return; }
    if (ArrayBuffer.isView(value)) return;
    seen.add(value);
    if (value instanceof Map) {
      for (const [key, item] of value) { visit(key); visit(item); }
      return;
    }
    if (value instanceof Set) { for (const item of value) visit(item); return; }
    for (const key of Object.keys(value)) visit((value as Record<string, unknown>)[key]);
  };
  visit(root);
  return found;
}

function rngAt(sim: Simulation, path: string): RNG {
  if (path === 'simulation.movementSystem.rng') {
    return (sim as unknown as { movementSystem: { rng: RNG } }).movementSystem.rng;
  }
  return (sim as unknown as Record<string, RNG>)[path.slice('simulation.'.length)]!;
}

describe('ExecutionRecord', () => {
  it('captures every retained Simulation RNG and clock without draws, then continues each stream after JSON', () => {
    const sim = simulation();
    for (let i = 0; i < 80; i++) sim.step();
    const sourceStreams = discoverRngs(sim);
    const sourceStates = EXECUTION_STREAM_PATHS.map(path => rngAt(sim, path).getState());
    const sourceTick = sim.time.tick;
    expect(sourceStreams.size).toBe(EXECUTION_STREAM_PATHS.length);

    const record = toExecutionRecord(sim);
    expect(sim.time.tick).toBe(sourceTick);
    expect(EXECUTION_STREAM_PATHS.map(path => rngAt(sim, path).getState())).toEqual(sourceStates);
    const wire = JSON.parse(JSON.stringify(record));
    const restored = fromExecutionRecord(wire);
    expect(restored.lastAdvancedTick).toBe(sourceTick);
    expect(restored.time.snapshot()).toEqual(record.time);
    expect(restored.streamsByPath.size).toBe(EXECUTION_STREAM_PATHS.length);
    expect(new Set(restored.streamsByPath.values()).size).toBe(sourceStreams.size);
    expect([...restored.streamsByPath.values()].some(stream => sourceStreams.has(stream))).toBe(false);
    for (const path of EXECUTION_STREAM_PATHS) {
      const source = rngAt(sim, path);
      const copy = restored.streamsByPath.get(path)!;
      expect(copy).toBeInstanceOf(RNG);
      expect(copy).not.toBe(source);
      for (let i = 0; i < 256; i++) expect(copy.nextUint32()).toBe(source.nextUint32());
    }
    expect([...restored.streamsByPath.keys()]).toEqual([...EXECUTION_STREAM_PATHS]);
  });

  it('rejects missing or unexpected paths, alias changes, clock mismatch, and malformed source banks', () => {
    const sim = simulation();
    const valid = JSON.parse(JSON.stringify(toExecutionRecord(sim)));
    expect(() => fromExecutionRecord({ ...valid, version: 2 })).toThrow(/v1/);
    expect(() => fromExecutionRecord({ ...valid, extra: true })).toThrow(/unknown or missing/);
    const missingState = structuredClone(valid);
    delete missingState.streams['simulation.recordRng'];
    expect(() => fromExecutionRecord(missingState)).toThrow(/unknown or missing/);
    const danglingAlias = structuredClone(valid);
    danglingAlias.streamRefs['simulation.movementSystem.rng'] = 'stale';
    expect(() => fromExecutionRecord(danglingAlias)).toThrow(/aliases do not match/);
    const mismatchedTick = structuredClone(valid);
    mismatchedTick.lastAdvancedTick++;
    expect(() => fromExecutionRecord(mismatchedTick)).toThrow(/clock tick does not match/);
    const invalidRng = structuredClone(valid);
    invalidRng.streams['simulation.rng'].words = [0, 0, 0, 0];
    expect(() => fromExecutionRecord(invalidRng)).toThrow(/RNG checkpoint/);
    expect(() => fromExecutionRecord({ ...valid, streamRefs: { ...valid.streamRefs, stale: 'simulation.rng' } }))
      .toThrow(/aliases do not match/);

    const missingSource = simulation();
    (missingSource as unknown as Record<string, unknown>).recordRng = undefined;
    expect(() => toExecutionRecord(missingSource)).toThrow(/missing or invalid source/);
    const sharedSource = simulation();
    const internals = sharedSource as unknown as Record<string, unknown>;
    internals.actionRng = internals.aiRng;
    const sharedRecord = JSON.parse(JSON.stringify(toExecutionRecord(sharedSource)));
    expect(sharedRecord.streamRefs['simulation.actionRng']).toBe('simulation.aiRng');
    expect(Object.hasOwn(sharedRecord.streams, 'simulation.actionRng')).toBe(false);
    const sharedHydrated = fromExecutionRecord(sharedRecord);
    expect(sharedHydrated.streamsByPath.get('simulation.actionRng'))
      .toBe(sharedHydrated.streamsByPath.get('simulation.aiRng'));
  });

  it('hydrates streams independently from both the Simulation and mutable record arrays', () => {
    const sim = simulation();
    const wire = JSON.parse(JSON.stringify(toExecutionRecord(sim)));
    const restored = fromExecutionRecord(wire);
    const firstPath = EXECUTION_STREAM_PATHS[0];
    const hydrated = restored.streamsByPath.get(firstPath)!;
    const before = hydrated.getState();
    wire.streams[firstPath].words[0] ^= 1;
    expect(hydrated.getState()).toEqual(before);
    hydrated.nextUint32();
    expect(rngAt(sim, firstPath).getState()).not.toEqual(hydrated.getState());
  });
});
