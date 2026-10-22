import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

const config = { seed: 530199218, world: { width: 32, height: 32, gameHerds: 0, predators: 0 },
  population: { bands: 0, peoplePerBand: 0 } };

describe('m16-spring-ground-stable', () => {
  it('keeps the starting spring ground free of a one-day snow flash on days 5, 6 and 7', () => {
    const sim = new Simulation(config);
    const depths = [sim.snowDepth];
    for (let day = 0; day < 2; day++) {
      for (let tick = 0; tick < sim.config.time.ticksPerDay; tick++) sim.step();
      depths.push(sim.snowDepth);
    }
    expect(depths).toEqual([0, 0, 0]);
  });

  it('still accumulates snow during a freezing winter day', () => {
    const sim = new Simulation({ ...config, time: { startDay: 35 } });
    for (let tick = 0; tick < sim.config.time.ticksPerDay; tick++) sim.step();
    expect(sim.snowDepth).toBeGreaterThan(0);
  });

  it('preserves ground and snow when saving before the first daily boundary and continuing', () => {
    const sim = new Simulation(config);
    for (let tick = 0; tick < sim.config.time.ticksPerDay - 1; tick++) sim.step();
    const record = toCheckpointRecord(sim);
    const restored = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(record)));
    expect(toCheckpointRecord(restored)).toEqual(record);
    for (let tick = 0; tick < sim.config.time.ticksPerDay + 2; tick++) { sim.step(); restored.step(); }
    expect(toCheckpointRecord(restored)).toEqual(toCheckpointRecord(sim));
    expect(restored.snowDepth).toBe(0);
  });
});
