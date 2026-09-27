import { describe, expect, it } from 'vitest';
import { Beliefs, expectedFood, expectationRatio, techAppeal } from '../ai/Beliefs.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';

describe('per-person beliefs', () => {
  it('uses known raw food as instinct and unknown food as a fallback', () => {
    const person = new Person('Believer', 0, 0, 0, new RNG('belief-instinct'));
    expect(expectedFood(person, 'berries')).toBe(14);
    expect(expectedFood(person, 'meal')).toBe(10);
    expect(person.beliefs.expect('eat:meal')).toEqual({ value: 10, confidence: 0 });
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

  it('keeps an instinctive yield neutral and lets personal evidence steer it', () => {
    const person = new Person('Learner', 0, 0, 0, new RNG('belief-yield'));
    person.traits.curiosity = 0;
    expect(expectationRatio(person, 'yield:forage')).toBe(1);
    person.beliefs.learn('yield:forage', 24, 1, 'own', 4);
    expect(expectationRatio(person, 'yield:forage')).toBe(2);
  });

  it('carries a parent belief forward at the M15 cultural inheritance strength', () => {
    const parent = new Beliefs();
    parent.learn('yield:fish', 30, 0.8, 'own', 9);
    expect(parent.inherit(0.6).get('yield:fish')).toEqual({
      value: 30, confidence: 0.48, source: 'inherited', tick: 9,
    });
  });

  it('values food technologies by what their products add over their ingredients', () => {
    const person = new Person('Cook', 0, 0, 0, new RNG('belief-tech-appeal'));
    person.beliefs.learn('eat:meal', 45, 0.8, 'own', 9);
    person.beliefs.learn('eat:acorn', 5, 0.8, 'own', 9);
    expect(techAppeal(person, 'grinding')).toBeGreaterThan(0);
    expect(techAppeal(person, 'firemaking')).toBe(0);
  });
});
