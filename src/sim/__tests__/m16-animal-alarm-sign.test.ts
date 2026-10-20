import { describe, expect, it } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { Animal } from '../entities/Animal.ts';

describe('m16 animal alarm sign', () => {
  it('stops showing an animal as alarmed after its alarm expires', () => {
    const animal = new Animal('hare', 4.5, 4.5, 1, new RNG('m16-animal-alarm-sign'));
    const alarmStartedAt = 120;
    animal.alarmedUntil = alarmStartedAt + 90;

    expect(animal.isAlarmed(alarmStartedAt)).toBe(true);
    expect(animal.isAlarmed(alarmStartedAt + 89)).toBe(true);
    expect(animal.isAlarmed(alarmStartedAt + 90)).toBe(false);
    expect(animal.isAlarmed(alarmStartedAt + 91)).toBe(false);
  });
});
