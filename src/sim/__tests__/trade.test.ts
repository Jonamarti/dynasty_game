/**
 * `trade`, M15 phase 36 (M14 fase 18b): the node `next-steps.md` carried since
 * M8.2 as never having reached `TECHS`. See `ActionSystem.doTrade`.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Person } from '../entities/Person.ts';
import { ITEMS } from '../entities/Item.ts';
import { TRADE_TICKS } from '../systems/ActionSystem.ts';

const SMALL = {
  seed: 'trade-test',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  // Just the two: no third person left to trade with `other`, or a storage
  // pit for either of them to walk a surplus off to, while the loop below
  // runs the clock for the timed action to finish.
  population: { bands: 1, peoplePerBand: 2 },
};

function twoAdults(sim: Simulation): [Person, Person] {
  const adults = sim.livingPeople().filter(p => !p.isChild);
  return [adults[0]!, adults[1]!];
}

function clearInventory(person: Person): void {
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
}

function runTrade(sim: Simulation, person: Person, other: Person): void {
  other.x = person.x + 1;
  other.y = person.y;
  expect(sim.order(person, 'trade', { personId: other.id })).toBe(true);
  for (let i = 0; i < TRADE_TICKS + 5 && person.action === 'trade'; i++) {
    for (const p of [person, other]) {
      p.needs.thirst = 0; p.needs.hunger = 0; p.needs.cold = 0; p.needs.fatigue = 0;
    }
    other.x = person.x + 1;
    other.y = person.y;
    sim.step();
  }
}

describe('trade', () => {
  it('without the tech, picks each side\'s count with no regard for what either is worth', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [person, other] = twoAdults(sim);
    clearInventory(person);
    clearInventory(other);
    person.inventory.add('berries', 9);
    other.inventory.add('meal', 9);
    const theirBefore = other.inventory.count('meal');

    runTrade(sim, person, other);

    expect(person.inventory.count('berries')).toBe(9 - 2);
    expect(theirBefore - other.inventory.count('meal')).toBe(2);
  });

  it('known, balances the swap by baseValue instead of by count', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [person, other] = twoAdults(sim);
    person.knownTech.add('trade');
    clearInventory(person);
    clearInventory(other);
    person.inventory.add('berries', 9);
    other.inventory.add('meal', 9);
    const theirBefore = other.inventory.count('meal');

    runTrade(sim, person, other);

    const berriesGiven = 9 - person.inventory.count('berries');
    const mealGiven = theirBefore - other.inventory.count('meal');
    // `berries` is worth 1 and `meal` 4 (`ITEMS`): two berries are worth half
    // of one meal, so a fair swap gives one meal rather than the two the
    // blind count above gave away for the same two berries.
    expect(ITEMS.berries!.baseValue).toBe(1);
    expect(ITEMS.meal!.baseValue).toBe(4);
    expect(berriesGiven).toBe(2);
    expect(mealGiven).toBe(1);
  });
});
