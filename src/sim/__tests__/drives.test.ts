import { describe, expect, it } from 'vitest';
import { drivePressures, DRIVES, urgencyCurve } from '../ai/Drives.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';

describe('physical drives', () => {
  it('preserves the old urgency curve exactly for each need', () => {
    const person = new Person('Test', 0, 0, 0, new RNG('drives'), 40);
    person.needs.hunger = 37.5;
    person.needs.thirst = 62.25;
    person.needs.fatigue = 48.75;
    person.needs.cold = 21.5;
    person.needs.company = 84.125;
    const drives = drivePressures(person);
    expect(drives.hunger).toBe(urgencyCurve(person.needs.hunger));
    expect(drives.thirst).toBe(urgencyCurve(person.needs.thirst));
    expect(drives.rest).toBe(urgencyCurve(person.needs.fatigue));
    expect(drives.warmth).toBe(urgencyCurve(person.needs.cold));
    expect(drives.company).toBe(urgencyCurve(person.needs.company));
  });

  it('declares at least one action reader for every drive', () => {
    for (const drive of Object.values(DRIVES)) expect(drive.readers.length).toBeGreaterThan(0);
  });
});
