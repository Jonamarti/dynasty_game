import { describe, expect, it } from 'vitest';
import { appealOf, bestFoodFor, consumeFood, consumeFoodAtSource, cravings, hydrationOf } from '../core/Macros.ts';
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

  it('gets a little water from juicy fruit without relieving more thirst than remains', () => {
    const person = new Person('Test', 0, 0, 0, new RNG('fruit-water'), 40);
    person.inventory.add('apple', 1);
    person.needs.hunger = 40;
    person.needs.thirst = 4;

    expect(consumeFood(person, 'apple')).toBe(true);
    expect(person.needs.hunger).toBe(24);
    expect(person.needs.thirst).toBe(0);
  });

  it('enables milk hydration on geographic worlds while preserving classic diet decisions', () => {
    expect(hydrationOf('apple')).toBe(6);
    expect(hydrationOf('milk')).toBe(0);
    expect(hydrationOf('milk', true)).toBe(5);

    const classic = new Person('Classic', 0, 0, 0, new RNG('milk-water-classic'), 40);
    classic.inventory.add('milk', 1);
    classic.needs.hunger = 40;
    classic.needs.thirst = 12;
    expect(consumeFood(classic, 'milk')).toBe(true);
    expect(classic.needs.thirst).toBe(12);

    const continental = new Person('Continental', 0, 0, 0, new RNG('milk-water-geo'), 40);
    continental.inventory.add('milk', 1);
    continental.needs.hunger = 40;
    continental.needs.thirst = 12;
    expect(consumeFood(continental, 'milk', 0, true, undefined, true)).toBe(true);
    expect(continental.needs.hunger).toBe(20);
    expect(continental.needs.thirst).toBe(7);
  });

  it('nourishes directly from a bush even when no food fits in the pack', () => {
    const person = new Person('Hungry', 0, 0, 0, new RNG('source-meal'), 40);
    person.needs.hunger = 80;
    person.inventory.add('sticks', 10);

    expect(consumeFoodAtSource(person, 'berries')).toBe(true);
    expect(person.needs.hunger).toBe(66);
    expect(person.inventory.count('berries')).toBe(0);
    expect(person.inventory.count('sticks')).toBe(10);
  });

  it('can remove craving and belief preferences for survival ablations', () => {
    const person = new Person('Test', 0, 0, 0, new RNG('ablated-food-choice'), 40);
    person.macroTarget = { fat: 0, protein: 1, carb: 0 };
    person.macroBalance = { fat: 1, protein: 0, carb: 0 };
    person.beliefs.learn('eat:berries', 100, 1, 'own', 0);
    expect(cravings(person, false)).toEqual({ fat: 0, protein: 0, carb: 0 });
    expect(appealOf(person, 'berries', 0, true, false)).toBe(14);
    expect(appealOf(person, 'berries', 0, true, true)).toBe(100);
  });
});
