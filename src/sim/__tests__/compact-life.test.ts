import { describe, expect, it } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { makeConfig } from '../core/Config.ts';
import { Person } from '../entities/Person.ts';
import { CompactBody } from '../compact/CompactAdvance.ts';
import { deriveCompactStream, goalOf, type CompactPerson } from '../compact/CompactPerson.ts';
import { IntakeModel } from '../compact/CompactIntake.ts';
import { NEED_BINS, QUANTILE_STEPS, rateKey, type RateTable } from '../compact/CompactCalibration.ts';
import { gestationDays } from '../systems/LifeSystem.ts';
import type { PopulationConfig } from '../core/Config.ts';

const config = makeConfig({});
const tpd = config.time.ticksPerDay;

/** A table in which every hungry or thirsty day is fully fed: the body lives, so only the life rules act. */
function fedTable(): RateTable {
  const t: RateTable = {};
  for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) for (const group of ['nursling', 'child', 'adult'] as const)
    for (const need of ['hunger', 'thirst'] as const) for (let b = 0; b < NEED_BINS; b++)
      t[rateKey(season, group, need, b)] = { n: 100, mean: 1, q: Array(QUANTILE_STEPS).fill(1), zero: 0, nz: 100, qf: Array(QUANTILE_STEPS).fill(1) };
  return t;
}

function person(name: string, sex: 'male' | 'female', years: number, seed: number): Person {
  const rng = new RNG(seed);
  const p = new Person(name, 10, 10, 0, rng, config.time.daysPerSeason * 4);
  p.sex = sex;
  p.age = years * p.daysPerYear;
  p.lifespanDays = 64 * p.daysPerYear;
  p.needs.hunger = 10; p.needs.thirst = 10; p.health = 100;
  return p;
}

function compactOf(p: Person, seed: string): CompactPerson {
  return { person: p, lastAdvancedTick: 0, rng: deriveCompactStream(seed, p.id), goal: goalOf(p, 0), intake: null, epoch: 0 };
}

function body(options: {
  people: Map<number, Person>; population?: Partial<PopulationConfig>; born?: Person[]; fed?: boolean;
}) {
  let id = 1;
  let childId = 5_000_000;
  const population = { ...config.population, ...options.population };
  return new CompactBody({
    needs: config.needs, time: config.time, nextEventId: () => id++,
    intake: options.fed === false ? undefined : { model: new IntakeModel(fedTable()), capacity: () => ({ hungryZero: 0 }), childhood: config.childhood },
    life: {
      population, peopleById: options.people, householdsById: new Map(),
      makeChild: (mother, rng) => {
        const child = new Person('child', mother.x, mother.y, mother.bandId, rng, mother.daysPerYear, { allocate: () => childId++ } as never);
        return child;
      },
      onBirth: (child, mother, father) => {
        options.born?.push(child); options.people.set(child.id, child);
        mother.childIds.push(child.id); father?.childIds.push(child.id);
      },
    },
  });
}

describe('compact ageing', () => {
  it('adds exactly one day per calendar day crossed, and nothing without the life rules', () => {
    const p = person('a', 'male', 20, 1);
    const people = new Map([[p.id, p]]);
    const before = p.age;
    const c = compactOf(p, 's');
    body({ people }).advance(c, 3 * tpd + 5);
    expect(p.age - before).toBe(3);
    const q = person('b', 'male', 20, 2);
    const withoutLife = new CompactBody({ needs: config.needs, time: config.time, nextEventId: () => 1 });
    withoutLife.advance(compactOf(q, 's'), 3 * tpd);
    expect(q.age).toBe(20 * q.daysPerYear); // control: the closed body does not age
  });
});

/**
 * Tolerance declared before measuring: the mean time to die of old age of 300 compact people who
 * start 93% through their span is within 10% of the expectation computed from LifeSystem's own
 * formula (chance = min(0.5, 0.002 * overdue^2 * frailty), tried once a day), for a window of 25 days.
 */
describe('compact death of old age', () => {
  it('follows the hazard of the detailed model, and a body that does not age never dies of it', () => {
    const N = 300, DAYS = 25;
    const dpy = config.time.daysPerSeason * 4;
    const startAge = 0.93 * 64 * dpy;
    // Expected truncated lifetime in days, from the formula alone.
    let alive = 1, expected = 0;
    for (let d = 1; d <= DAYS; d++) {
      const age = startAge + d; // age after this day's increment
      const overdue = Math.max(0, age - 0.85 * 64 * dpy) / dpy;
      const hazard = Math.min(0.5, 0.002 * overdue * overdue);
      expected += alive; // alive at the start of day d contributes one day
      alive *= 1 - hazard;
    }
    const lived: number[] = [];
    for (let i = 0; i < N; i++) {
      const p = person('old' + i, 'male', 0, 100 + i);
      p.age = startAge;
      const c = compactOf(p, 'old-age');
      const events = body({ people: new Map([[p.id, p]]) }).advance(c, DAYS * tpd);
      const death = events.find(e => e.kind === 'death');
      lived.push(death ? Math.floor((death.tick - 1) / tpd) + 1 : DAYS);
      if (death) expect(death.data.cause).toBe('old age');
    }
    const mean = lived.reduce((a, b) => a + b, 0) / N;
    expect(Math.abs(mean - expected) / expected).toBeLessThan(0.10);
    // Control: the same people with no life rules all live the whole window.
    let survivors = 0;
    for (let i = 0; i < 20; i++) {
      const p = person('immortal' + i, 'male', 0, 900 + i);
      p.age = startAge;
      const c = compactOf(p, 'control');
      const plain = new CompactBody({ needs: config.needs, time: config.time, nextEventId: () => 1,
        intake: { model: new IntakeModel(fedTable()), capacity: () => ({ hungryZero: 0 }), childhood: config.childhood } });
      plain.advance(c, DAYS * tpd);
      if (p.alive) survivors++;
    }
    expect(survivors).toBe(20);
    expect(expected).toBeLessThan(DAYS * 0.8); // the window is long enough for the control to mean something
  });
});

describe('compact conception and birth', () => {
  function couple(seed: number) {
    const mother = person('mother', 'female', 24, seed);
    const father = person('father', 'male', 26, seed + 1);
    mother.spouseId = father.id; father.spouseId = mother.id;
    mother.lastBirthDay = -1000; // long past any birth spacing
    return { mother, father, people: new Map([[mother.id, mother], [father.id, father]]) };
  }

  it('conceives, carries for the gestation of the detailed model and bears a dated child', () => {
    const { mother, father, people } = couple(10);
    const born: Person[] = [];
    const c = compactOf(mother, 'births');
    const events = body({ people, population: { conceptionChance: 1 }, born }).advance(c, 40 * tpd);
    const birth = events.find(e => e.kind === 'birth');
    expect(birth).toBeDefined();
    expect(born.length).toBeGreaterThanOrEqual(1);
    expect(birth!.data).toMatchObject({ childId: born[0]!.id, fatherId: father.id });
    expect(birth!.subjectId).toBe(mother.id);
    // conceived on the first eligible day (day 1), borne `gestationDays` days later
    expect(birth!.tick).toBe((1 + gestationDays(mother)) * tpd);
    expect(mother.childIds).toContain(born[0]!.id);
    expect(born[0]!.motherId).toBe(mother.id);
  });

  it('negative controls: nothing without a living father or a spouse, at zero chance, or too soon after a birth', () => {
    const run = (setup: (m: Person, f: Person) => void, options: Parameters<typeof body>[0] extends infer O ? Partial<O> : never = {}) => {
      const { mother, father, people } = couple(20);
      setup(mother, father);
      const born: Person[] = [];
      body({ people, population: { conceptionChance: 1 }, born, ...options }).advance(compactOf(mother, 'neg'), 20 * tpd);
      return born.length;
    };
    expect(run(() => {})).toBeGreaterThan(0); // the positive control for every line below
    expect(run((_, f) => { f.alive = false; })).toBe(0);
    expect(run((m, f) => { m.spouseId = null; f.spouseId = null; })).toBe(0);
    expect(run(() => {}, { population: { conceptionChance: 0 } })).toBe(0);
    expect(run((m) => { m.lastBirthDay = 1_000_000; })).toBe(0); // too soon after a birth: spacing is honoured
  });

  it('draws from the person\'s own stream only: a second woman with the same stream seed bears on the same day', () => {
    const a = couple(30), b = couple(40);
    const sa = deriveCompactStream('same', 7), sb = deriveCompactStream('same', 7);
    const ca: CompactPerson = { person: a.mother, lastAdvancedTick: 0, rng: sa, goal: goalOf(a.mother, 0), intake: null, epoch: 0 };
    const cb: CompactPerson = { person: b.mother, lastAdvancedTick: 0, rng: sb, goal: goalOf(b.mother, 0), intake: null, epoch: 0 };
    const ea = body({ people: a.people, population: { conceptionChance: 0.3 } }).advance(ca, 60 * tpd).map(e => [e.kind, e.tick]);
    const eb = body({ people: b.people, population: { conceptionChance: 0.3 } }).advance(cb, 60 * tpd).map(e => [e.kind, e.tick]);
    expect(ea).toEqual(eb);
    expect(ea.length).toBeGreaterThan(0);
  });
});
