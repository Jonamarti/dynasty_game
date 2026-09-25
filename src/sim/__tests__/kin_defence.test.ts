import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

describe('defending children', () => {
  it('a parent attacks an outsider who just struck their child', () => {
    const sim = new Simulation({ seed: 'parent-defence', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 5 } });
    const mother = sim.people.find(person => !person.isPlayer)!;
    const child = sim.people.find(person => person.id !== mother.id)!;
    const aggressor = sim.people.find(person => person.id !== mother.id && person.id !== child.id)!;
    mother.age = 30 * mother.daysPerYear;
    child.age = 4 * child.daysPerYear;
    mother.childIds = [child.id];
    child.motherId = mother.id;
    child.bandId = mother.bandId;
    aggressor.bandId = mother.bandId + 10;
    mother.x = child.x = aggressor.x = 20;
    mother.y = child.y = aggressor.y = 20;
    child.lastHarmedBy = aggressor.id;
    child.lastHarmedTick = sim.time.tick;
    mother.action = 'idle';

    sim.step();

    expect(mother.action).toBe('attack');
    expect(mother.targetPersonId).toBe(aggressor.id);
  });
});
