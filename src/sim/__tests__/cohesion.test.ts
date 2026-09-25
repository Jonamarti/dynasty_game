import { describe, expect, it } from 'vitest';
import { CohesionWatch, formatCohesion } from '../../../tools/cohesion.ts';
import { Simulation } from '../core/Simulation.ts';

describe('cohesion measurement', () => {
  it('reports missing samples without calling them zero', () => {
    const sim = new Simulation({ seed: 'cohesion-empty', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 4 } });
    const watch = new CohesionWatch(sim);
    expect(formatCohesion([watch.finish()])).toContain('night near<15 n/a');
  });
  it('leaves the world and RNG unchanged when sampled', () => {
    const run = (observed: boolean) => {
      const sim = new Simulation({ seed: 'cohesion-neutral', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 6 } });
      const watch = observed ? new CohesionWatch(sim) : null;
      for (let i = 0; i < 500; i++) { sim.step(); if (sim.time.tick % 40 === 0) watch?.observe(); }
      watch?.finish();
      return JSON.stringify([sim.people, sim.nodes, sim.trees, sim.animals, sim.buildings, sim.households, sim.rng.getState()]);
    };
    expect(run(true)).toBe(run(false));
  });
});
