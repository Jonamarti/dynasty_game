import { describe, expect, it } from 'vitest';
import { drivePressures, DRIVES, urgencyCurve } from '../ai/Drives.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { makeConfig, DEFAULT_CONFIG } from '../core/Config.ts';
import { World } from '../core/World.ts';

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

  it('adds variety pressure only for a macro below its current target', () => {
    const person = new Person('Test', 0, 0, 0, new RNG('variety-drive'), 40);
    person.macroTarget = { fat: 0.3, protein: 0.3, carb: 0.4 };
    person.macroBalance = { fat: 0.3, protein: 0.18, carb: 0.52 };
    expect(drivePressures(person).variety).toBe(1);
    person.macroBalance = { ...person.macroTarget };
    expect(drivePressures(person).variety).toBe(0);
  });

  it('raises home pressure with distance and darkness, with stronger attachment', () => {
    const config = makeConfig();
    const world = new World(DEFAULT_CONFIG.world, new RNG('home-pressure'));
    const person = new Person('Adult', 30, 30, 0, new RNG('adult-drive'));
    person.age = 20 * person.daysPerYear;
    const ctx = { world, peopleById: new Map([[person.id, person]]), buildingsById: new Map(), householdsById: new Map(),
      homes: new Map([[0, { x: 30, y: 30 }]]), motivation: config.motivation,
      time: { daylight: 1 } };
    expect(drivePressures(person, ctx).home).toBe(0);
    person.x = 80;
    const day = drivePressures(person, ctx).home;
    const night = drivePressures(person, { ...ctx, time: { daylight: 0 } }).home;
    expect(day).toBeGreaterThan(0);
    expect(night).toBeGreaterThan(day);
    person.traits.loyalty = 1; person.traits.curiosity = 0;
    expect(drivePressures(person, { ...ctx, time: { daylight: 0 } }).home).toBeGreaterThan(night);
  });
});
