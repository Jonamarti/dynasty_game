import { describe, expect, it } from 'vitest';
import { DemographyWatch, formatDemography } from '../../../tools/demography.ts';
import { Person, ADULT_YEARS } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { Simulation } from '../core/Simulation.ts';

function person(years: number, daysPerYear = 40): Person {
  const p = new Person('Test', 0, 0, 0, new RNG('demography'), daysPerYear);
  p.age = years * p.daysPerYear;
  p.sex = 'female';
  return p;
}

describe('demographic measurement', () => {
  it('counts pregnant women and women entering fertile age, with endpoint exposure', () => {
    const mother = person(25);
    mother.pregnant = true;
    const child = person(ADULT_YEARS + 1);
    const people = new Map([[mother.id, mother], [child.id, child]]);
    const watch = new DemographyWatch(people.values(), 10);
    expect(watch.finish(people.values(), 0).fertileWomen).toBe(1);
    watch.observe(people.values(), 1);
    child.age += 40;
    watch.observe(people.values(), 2);
    const result = watch.finish(people.values(), 2);
    expect(result.fertileWomen).toBe(2);
    expect(result.fertileWomanYears).toBeCloseTo(3 / 400);
    expect(result.births).toBe(0);
  });

  it('keeps a dead newborn in the eligible cohort, excluding founders and recent births', () => {
    const founder = person(0.5);
    const watch = new DemographyWatch([founder], 10);
    const baby = person(0);
    const people = [founder, baby];
    watch.observe(people, 1);
    baby.age = 10;
    baby.alive = false;
    baby.causeOfDeath = 'starvation';
    founder.alive = false;
    founder.causeOfDeath = 'exposure';
    const recent = person(0);
    people.push(recent);
    watch.observe(people, 400);
    const before = watch.finish(people, 400);
    expect(before.underOne).toEqual({ deaths: 1, eligible: 1, censored: 1 });
    expect(before.underFive).toEqual({ deaths: 1, eligible: 1, censored: 1 });
    const after = watch.finish(people, 401);
    expect(after.underOne).toEqual({ deaths: 1, eligible: 1, censored: 1 });
    expect(after.underFive).toEqual({ deaths: 1, eligible: 1, censored: 1 });
    expect(after.deaths).toBe(2);
    expect(after.deathAgeYears).toBe(0.75);
    expect(after.causes).toEqual({ starvation: 1, exposure: 1 });
  });

  it('observes births and counts partial-day fertility exposure at the run boundary', () => {
    const mother = person(25);
    const watch = new DemographyWatch([mother], 10);
    const baby = person(0);
    watch.observe([mother, baby], 9);
    const result = watch.finish([mother, baby], 9);
    expect(result.births).toBe(1);
    expect(result.fertileWomanYears).toBeCloseTo(9 / 400);
    expect(result.underOne).toEqual({ deaths: 0, eligible: 0, censored: 1 });
  });

  it('uses strict age thresholds and the scenario calendar for five-year follow-up', () => {
    const watch = new DemographyWatch([], 10);
    const one = person(1, 20), five = person(5, 20);
    one.alive = five.alive = false;
    watch.observe([one, five], 1);
    const result = watch.finish([one, five], 1001);
    expect(result.underOne).toEqual({ deaths: 0, eligible: 2, censored: 0 });
    expect(result.underFive).toEqual({ deaths: 1, eligible: 2, censored: 0 });
  });

  it('prints n/a for missing denominators, rather than a zero mortality claim', () => {
    const empty = new DemographyWatch([], 10).finish([], 0);
    expect(formatDemography([empty])).toContain('mortality <1y n/a (0/0;');
    expect(formatDemography([empty])).toContain('births/woman; n/a births/woman-year');
    expect(formatDemography([empty])).toContain('causes none');
  });

  it('aggregates killings by cause rather than splitting them by the killer name', () => {
    const a = person(20), b = person(30);
    a.die('killed by One');
    b.die('killed by Two');
    const watch = new DemographyWatch([a, b], 10);
    expect(watch.finish([a, b], 0).causes).toEqual({ murder: 2 });
  });

  it('counts a death settled by the simulation after it leaves the live array', () => {
    const sim = new Simulation({
      seed: 'demography-settled-death', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 6 },
    });
    const watch = new DemographyWatch(sim.peopleById.values(), sim.config.time.ticksPerDay);
    const victim = sim.people[0]!;
    victim.die('starvation');
    sim.step(); // cleanupDead removes the corpse from `people`, retaining its id.

    const result = watch.finish(sim.peopleById.values(), sim.time.tick);
    expect(sim.people).not.toContain(victim);
    expect(sim.peopleById.get(victim.id)).toBe(victim);
    expect(victim.alive).toBe(false);
    expect(result.deaths).toBe(1);
    expect(result.causes).toEqual({ starvation: 1 });
  });

  it('pools counts rather than averaging seed-level mortality rates', () => {
    const empty = new DemographyWatch([], 10).finish([], 0);
    const a = { ...empty, underOne: { deaths: 1, eligible: 1, censored: 2 } };
    const b = { ...empty, underOne: { deaths: 0, eligible: 9, censored: 3 } };
    expect(formatDemography([a, b])).toContain('mortality <1y 0.100 (1/10; 5 births');
  });

  it('leaves the simulated world and RNG bit-identical with observation enabled', () => {
    const run = (observed: boolean) => {
      const sim = new Simulation({
        seed: 'demography-neutral', world: { width: 48, height: 48 },
        population: { bands: 1, peoplePerBand: 6 },
      });
      const watch = observed ? new DemographyWatch(sim.peopleById.values(), sim.config.time.ticksPerDay) : null;
      for (let i = 0; i < 500; i++) {
        sim.step();
        watch?.observe(sim.peopleById.values(), sim.time.tick);
      }
      watch?.finish(sim.peopleById.values(), sim.time.tick);
      return JSON.stringify([sim.people, sim.nodes, sim.trees, sim.animals, sim.buildings,
        sim.households, sim.rng.getState()]);
    };
    expect(run(true)).toBe(run(false));
  });
});
