import { describe, expect, it } from 'vitest';
import { Household, averageRenownByBand } from '../entities/Household.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { statusPressure } from '../ai/Status.ts';
import { sensitivity } from '../ai/Temperament.ts';

describe('status motive', () => {
  it('rises below the band average and disappears at parity', () => {
    const underdog = new Household('Underdog', 1, 0, 0);
    const leading = new Household('Leading', 2, 0, 0);
    const person = new Person('Ari', 0, 0, 0, new RNG('status-pressure'));
    person.householdId = underdog.id;
    underdog.add(person.id);
    leading.add(2);
    leading.renown = 40;
    const houses = new Map([[underdog.id, underdog], [leading.id, leading]]);
    const averages = averageRenownByBand(houses);
    expect(averages.get(0)).toBe(20);
    const initial = statusPressure(person, underdog, averages.get(0)!);
    expect(initial).toBeCloseTo(20 / 24);
    person.memory.record({ id: 1, type: 'gift', actorId: person.id, targetId: null,
      x: 0, y: 0, tick: 0, magnitude: 1, witnesses: 1, victimBandId: null }, true, 1);
    expect(statusPressure(person, underdog, averages.get(0)!)).toBeLessThan(initial);
    underdog.renown = 40;
    expect(statusPressure(person, underdog, 40)).toBe(0);
    expect(statusPressure(person, null, 40)).toBe(0);
  });

  it('uses the ambition traits and keeps sensitivity within the common band', () => {
    const person = new Person('Ari', 0, 0, 0, new RNG('status-sensitivity'));
    person.traits.greed = 0.5;
    person.traits.aggression = 0.5;
    person.traits.tradition = 0.5;
    expect(sensitivity(person, 'status')).toBe(1);
    person.traits.greed = 1;
    person.traits.aggression = 1;
    person.traits.tradition = 0;
    expect(sensitivity(person, 'status')).toBe(1.4);
    person.traits.greed = 0;
    person.traits.aggression = 0;
    person.traits.tradition = 1;
    expect(sensitivity(person, 'status')).toBe(0.6);
  });
});
