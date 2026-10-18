import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { SCENARIOS } from '../../../tools/simcheck.ts';

describe('M16 scenario checkpoints', () => {
  it.each(Object.values(SCENARIOS))('can save and reload $name after setup', (scenario) => {
    const sim = scenario.create?.(scenario.config) ?? new Simulation(scenario.config);
    scenario.setup?.(sim);
    for (let step = 0; step < 10; step++) sim.step();

    const record = toCheckpointRecord(sim);
    expect(Simulation.fromCheckpointRecord(record)).toBeInstanceOf(Simulation);
  }, 60_000);
});
