import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

describe('household position', () => {
  it('carries stored wealth when two households become one', () => {
    const sim = new Simulation({
      seed: 'wealth-inheritance',
      world: { width: 64, height: 64, berryBushes: 30, flintOutcrops: 8, deadwood: 12, gameHerds: 3 },
      population: { bands: 1, peoplePerBand: 6 },
    });
    const first = sim.livingPeople().find(person => !person.isChild)!;
    const second = sim.livingPeople().find(person =>
      !person.isChild && person.householdId !== first.householdId)!;
    const target = sim.householdsById.get(first.householdId!)!;
    const source = sim.householdsById.get(second.householdId!)!;
    target.wealth = 17;
    source.wealth = 23;
    sim.mergeHouseholds(first, second);
    const merged = sim.households.find(household =>
      household.memberIds.includes(first.id) && household.memberIds.includes(second.id))!;
    expect(merged.wealth).toBe(40);
  });
});
