/**
 * M11 phase 10, seventh and last commit: `brewing`.
 *
 * `doToast` is deliberately not routed through `doEat` — see the comment on
 * `ITEMS.beer` — so this is the one node in this whole pass with no
 * existing verb's tests to lean on the way `herding` leans on `traps.test.ts`
 * and `well` leans on nothing at all (there was no test file for `play`
 * either, and this is the same shape of verb).
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'brewing-test',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: {
    bands: 1, peoplePerBand: 6,
    startingTech: ['pottery', 'farming', 'brewing'],
  },
};

/** A world one day old. See `traps.test.ts` for why this matters on tick zero. */
function aDayIn(sim: Simulation): void {
  for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
}

/** Somebody with nothing pressing, so a test measures what it means to. */
function settle(person: Person): void {
  person.needs.thirst = 0;
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  for (const [itemId, count] of person.inventory.entries()) person.inventory.remove(itemId, count);
}

describe('a toast', () => {
  it('refuses with no beer to share, and says why', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    settle(person);

    expect(sim.order(person, 'toast')).toBe(true);
    for (let i = 0; i < 100 && person.order !== null; i++) sim.step();
    expect(sim.interruptions.some(stop => stop.reason === 'nothing_to_toast')).toBe(true);
  });

  it('never fires for somebody who could not have brewed it', () => {
    // The `handaxe` rule again: carrying a beer somebody else made is not the
    // same as knowing how, and `doToast` gates on `techPower` rather than
    // merely on `inventory.has`.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.knownTech.delete('brewing');
    person.inventory.add('beer', 1);

    expect(sim.order(person, 'toast')).toBe(true);
    for (let i = 0; i < 100 && person.order !== null; i++) sim.step();
    expect(sim.interruptions.some(stop => stop.reason === 'nothing_to_toast')).toBe(true);
    expect(person.inventory.count('beer')).toBe(1);
  });

  it('spends one beer and relieves company for whoever is in earshot, self included', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const people = sim.livingPeople();
    const person = people[0]!;
    settle(person);
    person.inventory.add('beer', 2);
    person.needs.company = 40;

    const others = people.slice(1);
    for (const other of others) {
      other.x = person.x;
      other.y = person.y;
      other.needs.company = 40;
    }

    expect(sim.order(person, 'toast')).toBe(true);
    for (let i = 0; i < 200 && person.order !== null; i++) sim.step();

    expect(person.inventory.count('beer')).toBe(1);
    expect(person.needs.company).toBeLessThan(40);
    for (const other of others) {
      expect(other.needs.company, 'person ' + other.id + ' heard nothing').toBeLessThan(40);
    }
  });
});
