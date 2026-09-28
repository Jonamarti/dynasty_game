import { describe, expect, it } from 'vitest';
import { possessionPressure } from '../ai/Possession.ts';
import { sensitivity } from '../ai/Temperament.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';

describe('possession motive', () => {
  it('falls as carried and stored food cover the household week', () => {
    expect(possessionPressure(0, 0, 100)).toBe(1);
    expect(possessionPressure(20, 30, 100)).toBeCloseTo(0.5);
    expect(possessionPressure(100, 0, 100)).toBe(0);
    expect(possessionPressure(300, 0, 100)).toBe(0);
  });

  it('scales the remaining reserve pressure by greed', () => {
    const person = new Person('Ari', 0, 0, 0, new RNG('possession-sensitivity'));
    person.traits.greed = 0;
    expect(sensitivity(person, 'possession')).toBe(0.6);
    person.traits.greed = 0.5;
    expect(sensitivity(person, 'possession')).toBe(1);
    person.traits.greed = 1;
    expect(sensitivity(person, 'possession')).toBe(1.4);
  });
});
