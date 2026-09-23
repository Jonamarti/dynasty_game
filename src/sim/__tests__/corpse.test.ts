/**
 * The body stays — M11 phase 16 (owner's note 1).
 *
 * 16a: every death leaves a body where it happened, and the person still
 * leaves `people` exactly as before, so nothing that loops over the living
 * has to learn about the dead.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

const SMALL = {
  seed: 'corpse-test',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 2, peoplePerBand: 4 },
};

describe('a body', () => {
  it('is left where somebody died, and they leave the living as before', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [victim] = sim.livingPeople().filter(p => !p.isPlayer);
    const x = victim!.x;
    const y = victim!.y;
    victim!.die('killed by nobody in particular');
    sim.step();

    expect(sim.people.includes(victim!)).toBe(false);
    expect(sim.corpses.length).toBe(1);
    const corpse = sim.corpses[0]!;
    expect(corpse.person).toBe(victim);
    expect(corpse.x).toBe(x);
    expect(corpse.y).toBe(y);
    expect(corpse.wounded).toBe(true);
    expect(sim.corpseHash.findNearest(x, y, 1)).toBe(corpse);
  });

  it('shows no wound on somebody who died of age', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [elder] = sim.livingPeople().filter(p => !p.isPlayer);
    elder!.die('old age');
    sim.step();
    expect(sim.corpses[0]?.wounded).toBe(false);
  });
});
