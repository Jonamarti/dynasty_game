import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { MAP_CELL } from '../social/BandMaps.ts';

describe('marked territory', () => {
  it('claims camp cells only after a band knows marking', () => {
    const sim = new Simulation({
      seed: 'territory-claims',
      world: { width: 64, height: 64, berryBushes: 30, flintOutcrops: 8, deadwood: 12, gameHerds: 3 },
      population: { bands: 2, peoplePerBand: 4 },
    });
    const band = sim.bands[0]!;
    expect(band.claimedCells?.size ?? 0).toBe(0);
    for (const person of sim.livingPeople().filter(person => person.bandId === band.id)) {
      person.needs.hunger = 0;
      person.needs.thirst = 0;
      person.needs.cold = 0;
      person.needs.fatigue = 0;
      if (!person.isChild) person.knownTech.add('marking');
    }
    for (let i = 0; i < sim.config.time.ticksPerDay; i++) sim.step();
    const key = `${Math.floor(band.homeX / MAP_CELL)},${Math.floor(band.homeY / MAP_CELL)}`;
    expect(band.claimedCells?.has(key)).toBe(true);
    expect(band.claimedCells?.size).toBeGreaterThan(0);
  });
});
