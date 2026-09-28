import { describe, expect, it } from 'vitest';
import { curiosityNeed, sensitivity } from '../ai/Temperament.ts';
import { expectationRatio } from '../ai/Beliefs.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';

describe('curiosity motive', () => {
  it('builds with time and scales with the curiosity trait', () => {
    const person = new Person('Ari', 0, 0, 0, new RNG('curiosity-pressure'));
    person.traits.curiosity = 0.5;
    expect(curiosityNeed(person)).toBe(0);
    person.curiosityDays = 15;
    expect(curiosityNeed(person)).toBeCloseTo(0.5);
    person.curiosityDays = 60;
    expect(curiosityNeed(person)).toBeCloseTo(1);
    expect(sensitivity(person, 'curiosity')).toBe(1);
    person.traits.curiosity = 1;
    expect(curiosityNeed(person)).toBeCloseTo(1.5);
  });

  it('resets on a new belief but not a repeated observation', () => {
    const person = new Person('Ari', 0, 0, 0, new RNG('curiosity-learning'));
    person.curiosityDays = 20;
    person.beliefs.learn('yield:forage', 20, 0.5, 'own', 1);
    expect(person.curiosityDays).toBe(0);
    person.curiosityDays = 8;
    person.beliefs.learn('yield:forage', 22, 0.5, 'own', 2);
    expect(person.curiosityDays).toBe(8);
  });

  it('adds novelty to uncertain expectations after time without discovery', () => {
    const person = new Person('Ari', 0, 0, 0, new RNG('curiosity-expectation'));
    person.traits.curiosity = 0.5;
    expect(expectationRatio(person, 'yield:forage')).toBe(1);
    person.curiosityDays = 30;
    expect(expectationRatio(person, 'yield:forage')).toBeCloseTo(1.15);
  });

  it("gives inherited knowledge the child's own reset callback", () => {
    const parent = new Person('Parent', 0, 0, 0, new RNG('curiosity-parent'));
    const child = new Person('Child', 0, 0, 0, new RNG('curiosity-child'));
    parent.beliefs.learn('eat:berries', 20, 0.5, 'own', 1);
    child.beliefs = parent.beliefs.inherit(0.6, () => child.noteDiscovery());
    child.curiosityDays = 12;
    child.beliefs.learn('eat:fish', 30, 0.5, 'told', 2);
    expect(child.curiosityDays).toBe(0);
    expect(parent.beliefs.get('eat:fish')).toBeUndefined();
  });
});
