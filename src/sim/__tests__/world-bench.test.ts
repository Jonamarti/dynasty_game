import { describe, expect, it } from 'vitest';
import {
  advanceBenchSeason,
  benchSummary,
  benchTicksPerYear,
  createBenchWorld,
  isBenchHabitableLand,
  perfBudgetStepMicroseconds,
  runBenchYears,
} from '../../../tools/world-bench-model.ts';
import type { WorldRaster } from '../world/WorldBinary.ts';

function raster(): WorldRaster {
  return {
    width: 4,
    height: 3,
    elevationMeters: new Int16Array([
      100, 100, 100, 100,
      100, -100, 100, 100,
      100, 100, 100, 100,
    ]),
    koppen: new Uint8Array([
      1, 28, 29, 0,
      2, 2, 30, 8,
      3, 17, 28, 29,
    ]),
    seaLevelMeters: 0,
  };
}

describe('phase 29d world benchmark fixture', () => {
  it('uses a documented classified-land filter and the game season clock', () => {
    expect(isBenchHabitableLand(true, 1)).toBe(true);
    expect(isBenchHabitableLand(true, 28)).toBe(true);
    expect(isBenchHabitableLand(true, 29)).toBe(false);
    expect(isBenchHabitableLand(true, 0)).toBe(false);
    expect(isBenchHabitableLand(false, 1)).toBe(false);
    expect(benchTicksPerYear()).toBe(9_600);
    expect(perfBudgetStepMicroseconds(31)).toBe(596);
  });

  it('seeds a reproducible level-two-shaped workload and executes its operation loops', () => {
    const first = createBenchWorld(raster(), 'fixture-seed');
    const second = createBenchWorld(raster(), 'fixture-seed');
    expect(first.eligibleRegions).toBe(7);
    expect(first.people).toEqual(second.people);
    expect(first.people.every(person => person.techWords.length > 0 && person.neighbors.length <= 6)).toBe(true);

    const populationBefore = first.people.map(person => person.population);
    advanceBenchSeason(first);
    expect(first.seasons).toBe(1);
    expect(first.candidateChecks).toBeGreaterThan(0);
    expect(first.neighborChecks).toBeGreaterThan(0);
    expect(first.tradeChecks).toBeGreaterThan(0);
    expect(first.conflictChecks).toBe(first.neighborChecks);
    // This phase measures the workload shape; it does not claim game rules.
    expect(first.people.map(person => person.population)).toEqual(populationBefore);
    expect(first.people.some((person, i) => person.rngState.some((word, j) => word !== second.people[i]!.rngState[j]))).toBe(true);

    runBenchYears(second, 1);
    const third = createBenchWorld(raster(), 'fixture-seed');
    runBenchYears(third, 1);
    expect(benchSummary(second)).toEqual(benchSummary(third));
    expect(second.seasons).toBe(4);
  });

  it('rejects an atlas with no eligible workload', () => {
    const empty = raster();
    empty.koppen.fill(29);
    expect(() => createBenchWorld(empty, 'empty')).toThrow('no classified non-polar land');
  });

  it('connects longitude across the seam but never connects opposite poles', () => {
    const source = raster();
    source.elevationMeters.fill(100);
    source.koppen.fill(8);
    const world = createBenchWorld(source, 'topology');
    for (const person of world.people) {
      expect(new Set(person.neighbors).size).toBe(person.neighbors.length);
      expect(person.neighbors).not.toContain(person.id);
      const row = Math.floor(person.regionId / source.width);
      for (const id of person.neighbors) {
        const neighborRow = Math.floor(world.people[id]!.regionId / source.width);
        expect(Math.abs(row - neighborRow)).toBeLessThanOrEqual(1);
      }
    }
    expect(world.people.some(person => person.regionId % source.width === 0 &&
      person.neighbors.some(id => world.people[id]!.regionId % source.width === source.width - 1)))
      .toBe(true);
  });

  it('continues the same streams and counters after a JSON checkpoint between years', () => {
    const continuous = createBenchWorld(raster(), 'continuation');
    runBenchYears(continuous, 2);
    const interrupted = createBenchWorld(raster(), 'continuation');
    runBenchYears(interrupted, 1);
    const resumed = JSON.parse(JSON.stringify(interrupted));
    runBenchYears(resumed, 1);
    expect(resumed).toEqual(continuous);
  });
});
