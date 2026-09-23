/**
 * M11 phase 12a: one way to eat.
 *
 * The Kit's *Eat* button (`Simulation.eatItem`) and eating by order
 * (`ActionSystem.doEat`) were two copies of one idea, and from 8b onward only
 * the second wrote the day's diet ledger — a player who ate from the panel had
 * a diet that never moved. Both now go through `consumeFood`; this pins that
 * the two routes leave a person in exactly the same state.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { decayMacroBalance } from '../core/Macros.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'eating-test',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 4 },
};

/** Hungry, carrying exactly one berry and nothing else. */
function withOneBerry(person: Person): void {
  for (const [itemId, count] of person.inventory.entries()) person.inventory.remove(itemId, count);
  person.inventory.add('berries', 1);
  person.needs.hunger = 60;
  person.needs.thirst = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  person.macroIntakeToday = { fat: 0, protein: 0, carb: 0 };
  person.eatenToday.clear();
}

describe('eating from the panel', () => {
  it('writes the diet ledger exactly as eating by order does', () => {
    const sim = new Simulation(SMALL);
    const [byPanel, byOrder] = sim.livingPeople();
    withOneBerry(byPanel!);
    withOneBerry(byOrder!);
    // Same cooking bonus on both sides, so any difference is the route.
    byOrder!.knownTech = new Set(byPanel!.knownTech);

    expect(sim.eatItem(byPanel!, 'berries')).toBe(true);
    expect(sim.order(byOrder!, 'eat')).toBe(true);
    for (let i = 0; i < 20 && byOrder!.inventory.has('berries'); i++) sim.step();

    expect(byPanel!.macroIntakeToday.carb).toBeGreaterThan(0);
    expect(byPanel!.macroIntakeToday).toEqual(byOrder!.macroIntakeToday);
    expect(byPanel!.eatenToday.get('berries')).toBe(1);
    expect(byOrder!.eatenToday.get('berries')).toBe(1);
  });

  it('refuses what is not food, and eats nothing', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    withOneBerry(person);
    person.inventory.add('sticks', 1);

    expect(sim.eatItem(person, 'sticks')).toBe(false);
    expect(person.inventory.count('sticks')).toBe(1);
    expect(person.eatenToday.size).toBe(0);
  });

  it("clears the day's tally at midnight, with the ledger", () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    withOneBerry(person);
    sim.eatItem(person, 'berries');

    decayMacroBalance(person);
    expect(person.eatenToday.size).toBe(0);
    expect(person.macroIntakeToday.carb).toBe(0);
  });
});
