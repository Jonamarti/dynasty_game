import { describe, expect, it } from 'vitest';
import { appealOf, bestFoodFor, cravings } from '../core/Macros.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';

describe('food cravings', () => {
  it('measures only the macros below the current target', () => {
    const person = new Person('Test', 0, 0, 0, new RNG('cravings'), 40);
    person.macroTarget = { fat: 0.3, protein: 0.3, carb: 0.4 };
    person.macroBalance = { fat: 0.30, protein: 0.18, carb: 0.52 };
    expect(cravings(person)).toEqual({ fat: 0, protein: 1, carb: 0 });
    expect(appealOf(person, 'fish')).toBeGreaterThan(appealOf(person, 'apple'));
  });

  it('selects the highest appeal in inventory and leaves ties in pack order', () => {
    const person = new Person('Test', 0, 0, 0, new RNG('food-choice'), 40);
    person.macroTarget = { fat: 0.3, protein: 0.3, carb: 0.4 };
    person.macroBalance = { ...person.macroTarget };
    person.inventory.add('berries', 1);
    person.inventory.add('apple', 1);
    expect(bestFoodFor(person)).toBe('apple');
    person.inventory.add('meat', 1);
    expect(bestFoodFor(person)).toBe('meat');
  });
});
