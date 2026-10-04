import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { WorldState } from '../world/WorldState.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

const checkpoint = (sim: Simulation) => JSON.parse(JSON.stringify(toCheckpointRecord(sim)));

describe('classic WorldState integration', () => {
  it.each(['band', 'world-root-coast', 'world-root-families'])('preserves the complete classic state and continuation for %s', seed => {
    const config = { seed, world: { width: 48, height: 48, treeDensity: 0.1 },
      population: { bands: 2, peoplePerBand: 4 }, time: { ticksPerDay: 24, startDay: 7 } };
    const reference = new Simulation(config);
    const state = new WorldState(config);
    expect(state.current.ids).toBe(state.ids);
    expect(checkpoint(state.current)).toEqual(checkpoint(reference));
    reference.possessFirst();
    state.current.possessFirst();
    for (let tick = 0; tick < 180; tick++) {
      reference.step();
      state.current.step();
    }
    // Includes all retained RNGs, daily caches, terrain, entities and allocator;
    // checking two populations alone would miss a shifted stream or spawn.
    expect(checkpoint(state.current)).toEqual(checkpoint(reference));
  });

  it('gives rebuilt starts independent allocators and leaves the previous root intact', () => {
    const config = { seed: 'world-root-rebuild', world: { width: 32, height: 32 } };
    const before = new WorldState(config);
    const saved = checkpoint(before.current);
    const rebuilt = new WorldState(config);
    expect(rebuilt.ids).not.toBe(before.ids);
    expect(checkpoint(rebuilt.current)).toEqual(saved);
    rebuilt.current.step();
    expect(checkpoint(before.current)).toEqual(saved);
  });
});
