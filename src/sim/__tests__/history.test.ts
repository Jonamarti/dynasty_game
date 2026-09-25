import { describe, expect, it } from 'vitest';
import { HistoryWatch, formatHistory } from '../../../tools/history.ts';
import { Simulation } from '../core/Simulation.ts';

describe('historical measurement', () => {
  it('prints unknown denominators explicitly', () => {
    const sim = new Simulation({ seed: 'history-empty', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 4 } });
    expect(formatHistory([new HistoryWatch(sim).finish()])).toContain('drawdown p50/p90/max n/a/n/a/n/a');
  });
  it('leaves the simulated world and RNG bit-identical with observation enabled', () => {
    const run = (observed: boolean) => {
      const sim = new Simulation({ seed: 'history-neutral', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 6 } });
      const watch = observed ? new HistoryWatch(sim) : null;
      for (let i = 0; i < 500; i++) {
        sim.step();
        if (sim.time.tick % sim.config.time.ticksPerDay === 0) watch?.observe();
      }
      watch?.finish();
      return JSON.stringify([sim.people, sim.nodes, sim.trees, sim.animals, sim.buildings,
        sim.households, sim.rng.getState()]);
    };
    expect(run(true)).toBe(run(false));
  });
});
