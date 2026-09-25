import { describe, expect, it } from 'vitest';
import { Beliefs, expectedFood } from '../ai/Beliefs.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';

describe('per-person beliefs', () => {
  it('uses known raw food as instinct and unknown food as a fallback', () => {
    const person = new Person('Believer', 0, 0, 0, new RNG('belief-instinct'));
    expect(expectedFood(person, 'berries')).toBe(14);
    expect(expectedFood(person, 'meal')).toBe(10);
    person.beliefs.learn('eat:meal', 25, 0.5, 'own', 12);
    expect(expectedFood(person, 'meal')).toBe(25);
  });

  it('updates deterministically, inherits with reduced confidence, and evicts the weakest oldest belief', () => {
    const beliefs = new Beliefs();
    beliefs.learn('yield:forage', 20, 0.5, 'own', 1);
    beliefs.learn('yield:forage', 40, 0.5, 'seen', 2);
    expect(beliefs.get('yield:forage')).toEqual({ value: 30, confidence: 0.75, source: 'seen', tick: 2 });
    const child = beliefs.inherit(0.25);
    expect(child.get('yield:forage')).toEqual({ value: 30, confidence: 0.1875, source: 'inherited', tick: 2 });
    const bounded = new Beliefs();
    for (let i = 0; i < Beliefs.MAX; i++) bounded.learn('k' + i, i, i === 0 ? 0.1 : 0.8, 'own', i);
    bounded.learn('new', 1, 0.5, 'own', 100);
    expect(bounded.get('k0')).toBeUndefined();
    expect(bounded.get('new')?.value).toBe(1);
  });
});
