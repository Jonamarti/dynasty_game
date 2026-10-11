import { describe, expect, it } from 'vitest';
import { drivePressures, DRIVES, urgencyCurve } from '../ai/Drives.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { makeConfig, DEFAULT_CONFIG } from '../core/Config.ts';
import { World } from '../core/World.ts';
import { purposeAppetite, sensitivity } from '../ai/Temperament.ts';
import { Simulation } from '../core/Simulation.ts';
import { lastScores } from '../ai/Brain.ts';
import { COMMITMENT_DRIVES } from '../ai/Commitment.ts';

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

  it('turns damaged security into safety pressure and scales safety by aggression', () => {
    const person = new Person('Test', 0, 0, 0, new RNG('safety-drive'), 40);
    person.mood.security = 0;
    expect(drivePressures(person).safety).toBe(0);
    person.mood.security = -30;
    expect(drivePressures(person).safety).toBe(0.5);
    person.mood.security = -100;
    expect(drivePressures(person).safety).toBe(1);
    person.traits.aggression = 0.5;
    expect(sensitivity(person, 'safety')).toBeCloseTo(1);
    person.traits.aggression = 1;
    expect(sensitivity(person, 'safety')).toBeCloseTo(0.6);
  });

  it('turns only a comfort deficit into pressure and raises the existing dusk home decision', () => {
    const person = new Person('Test', 0, 0, 0, new RNG('comfort-drive'), 40);
    person.mood.comfort = 40;
    expect(drivePressures(person).comfort).toBe(0);
    person.mood.comfort = 0;
    expect(drivePressures(person).comfort).toBe(0);
    person.mood.comfort = -50;
    expect(drivePressures(person).comfort).toBe(urgencyCurve(50));
    person.mood.comfort = -100;
    expect(drivePressures(person).comfort).toBe(1);
    expect(DRIVES.comfort.readers).toContain('go_home');
    expect(DRIVES.comfort.readers).toContain('place_furniture');
    expect(COMMITMENT_DRIVES).not.toContain('comfort');

    const scoreGoingHome = (comfort: number): number => {
      const sim = new Simulation({
        seed: 'comfort-home-reader', world: { width: 80, height: 80 },
        time: { ticksPerDay: 24, startDay: 110 }, thinkInterval: 1,
        population: { bands: 1, peoplePerBand: 6 },
      });
      const band = sim.bands[0]!;
      const sleeper = sim.people.find(candidate => candidate.alive && !candidate.isChild)!;
      sleeper.mood.comfort = comfort;
      sleeper.needs.hunger = sleeper.needs.thirst = sleeper.needs.fatigue = sleeper.needs.cold = 0;
      sleeper.action = 'idle';
      sleeper.order = null;
      sleeper.x = band.homeX > 40 ? band.homeX - 30 : band.homeX + 30;
      sleeper.y = band.homeY;
      sim.time.tick = 18;
      sim.step();
      return lastScores.get(sleeper.id)?.find(action => action.id === 'go_home')?.score ?? 0;
    };

    const comfortableControl = scoreGoingHome(0);
    expect(scoreGoingHome(40)).toBeCloseTo(comfortableControl);
    expect(scoreGoingHome(-50)).toBeGreaterThan(comfortableControl);
  });

  it('scales belonging pressure with loyalty while keeping the population midpoint neutral', () => {
    const person = new Person('Test', 0, 0, 0, new RNG('belonging-drive'), 40);
    person.traits.loyalty = 0;
    expect(sensitivity(person, 'belonging')).toBeCloseTo(0.6);
    person.traits.loyalty = 0.5;
    expect(sensitivity(person, 'belonging')).toBeCloseTo(1);
    person.traits.loyalty = 1;
    expect(sensitivity(person, 'belonging')).toBeCloseTo(1.4);
  });

  it('lets successful work raise purpose appetite and interruptions lower it within the old band', () => {
    const person = new Person('Test', 0, 0, 0, new RNG('purpose-drive'), 40);
    person.traits.industriousness = 0.5;
    person.mood.purpose = 0;
    expect(purposeAppetite(person)).toBeCloseTo(1);
    person.mood.purpose = 30;
    expect(purposeAppetite(person)).toBeGreaterThan(1);
    person.mood.purpose = -30;
    expect(purposeAppetite(person)).toBeLessThan(1);
    person.mood.purpose = -100;
    expect(purposeAppetite(person)).toBeCloseTo(0.8);
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

  it('lets every urgent physical need lower home pressure without erasing the safety drive', () => {
    const config = makeConfig();
    const world = new World(DEFAULT_CONFIG.world, new RNG('home-maslow'));
    const person = new Person('Adult', 80, 30, 0, new RNG('adult-maslow'));
    person.age = 20 * person.daysPerYear;
    const ctx = { world, peopleById: new Map([[person.id, person]]), buildingsById: new Map(), householdsById: new Map(),
      homes: new Map([[0, { x: 30, y: 30 }]]), motivation: config.motivation, time: { daylight: 1 } };
    person.needs.hunger = 0; person.needs.thirst = 0; person.needs.fatigue = 0; person.needs.cold = 0;
    const safeAndFed = drivePressures(person, ctx).home;
    for (const need of ['hunger', 'thirst', 'fatigue', 'cold'] as const) {
      person.needs[need] = 100;
      const urgent = drivePressures(person, ctx).home;
      expect(urgent).toBeLessThan(safeAndFed);
      expect(urgent).toBeGreaterThan(0);
      expect(urgent).toBeCloseTo(safeAndFed * 0.35);
      person.needs[need] = 0;
    }
  });

});
