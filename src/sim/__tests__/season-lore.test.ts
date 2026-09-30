import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

/** A year of four one-day seasons, so a winter comes round in a few hundred steps. */
function world(seed: string, sightRadius = 60) {
  const sim = new Simulation({ seed, world: { width: 48, height: 48 },
    time: { daysPerSeason: 1, startDay: 0 }, sightRadius,
    population: { bands: 1, peoplePerBand: 4 } });
  return sim;
}

describe('bushes in winter', () => {
  it('bear nothing', () => {
    const sim = world('bare-winter');
    const bushes = sim.nodes.filter(n => n.kind === 'berries');
    expect(bushes.some(n => n.amount > 0)).toBe(true);
    // The step that turns the day into winter is the one that strips them.
    while (sim.time.season !== 'winter') sim.step();
    expect(bushes.length).toBeGreaterThan(0);
    expect(bushes.every(n => n.amount === 0)).toBe(true);
  });
});
