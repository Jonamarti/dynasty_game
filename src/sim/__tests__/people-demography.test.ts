import { describe, expect, it } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { Simulation } from '../core/Simulation.ts';
import { CompactAuthority } from '../compact/CompactAuthority.ts';
import { CompactBody } from '../compact/CompactAdvance.ts';
import { IntakeModel } from '../compact/CompactIntake.ts';
import { MEASURED_RATES } from '../compact/MeasuredRates.ts';
import type { CompactPerson } from '../compact/CompactPerson.ts';
import { LIFESPAN_MEAN_YEARS, LIFESPAN_SD_YEARS } from '../entities/Person.ts';
import { oldAgeChancePerDay } from '../systems/LifeSystem.ts';
import { PeopleSim, emptyCohorts, populationOf, type PeopleCohorts, type People } from '../world/PeopleSim.ts';
import {
  binomial, demography, oldAgeHazardByYear, birthsPerWomanYear, FERTILE_WEIGHT, type SeasonReport,
} from '../world/PeopleDemography.ts';
import {
  buildCurve, capacityAt, CAPACITY_CURVE, bandCapacityOf, foodMultiplier, measuredRegion, starvationHazardPerDay,
  starvationRunChance, supplyRatioOf, type PeopleRegion,
} from '../world/PeopleCapacity.ts';
import { MEASURED_CAPACITY_POINTS, MEASURED_KIT } from '../world/PeopleMeasured.ts';
import { TechSet } from '../world/PeopleSim.ts';
import type { Tech } from '../knowledge/Tech.ts';

const CLOCK = { ticksPerDay: 24, daysPerSeason: 10 };
const YEARS = (n: number) => n * 4 * CLOCK.ticksPerDay * CLOCK.daysPerSeason;
function adults(n: number): PeopleCohorts {
  const c = emptyCohorts();
  const per = Math.floor(n / 8);
  for (let b = 1; b <= 8; b++) { c.male[b] = per; c.female[b] = per; }
  return c;
}
const uniform = (rations: number): PeopleRegion => ({ rationsPerComarcaDay: { spring: rations, summer: rations, autumn: rations, winter: rations } });

/** Run `streams` peoples of one starting shape and return the final populations and every season report. */
function run(cohorts: PeopleCohorts, region: PeopleRegion, years: number, streams: number, techs: Tech[] = [], comarcas = 1) {
  const finals: number[] = []; const reports: SeasonReport[] = [];
  for (let k = 0; k < streams; k++) {
    const sim = new PeopleSim(`dem-${k}`, CLOCK, [demography({ regionOf: () => region }, r => reports.push(r))]);
    const people = sim.found({ cohorts, comarcas, techs });
    sim.advanceTo(YEARS(years));
    finals.push(populationOf(people));
  }
  return { finals, reports, mean: finals.reduce((a, b) => a + b, 0) / streams };
}

describe('the measured capacity curve', () => {
  it('is monotone: more food per person never means more empty days or more hungry people', () => {
    for (let i = 1; i < CAPACITY_CURVE.length; i++) {
      expect(CAPACITY_CURVE[i]!.s).toBeGreaterThanOrEqual(CAPACITY_CURVE[i - 1]!.s);
      expect(CAPACITY_CURVE[i]!.hungryZero).toBeLessThanOrEqual(CAPACITY_CURVE[i - 1]!.hungryZero + 1e-12);
      expect(CAPACITY_CURVE[i]!.hungryShare).toBeLessThanOrEqual(CAPACITY_CURVE[i - 1]!.hungryShare + 1e-12);
    }
    expect(capacityAt(0)).toEqual({ hungryZero: 1, hungryShare: 1 });
    const last = CAPACITY_CURVE[CAPACITY_CURVE.length - 1]!;
    expect(capacityAt(last.s * 5).hungryZero).toBe(last.hungryZero);
    expect(capacityAt(0.2).hungryZero).toBeGreaterThan(capacityAt(1).hungryZero);
    expect(capacityAt(1).hungryZero).toBeGreaterThan(capacityAt(1.5).hungryZero);
  });

  it('pools a measurement that points the wrong way instead of passing it through (control)', () => {
    const pts = MEASURED_CAPACITY_POINTS.map(p => ({ ...p }));
    // Make the poorest point look *better fed* than the richest: a non-monotone input.
    pts.sort((a, b) => a.s - b.s);
    pts[0] = { ...pts[0]!, hungryZero: 0.05 };
    const curve = buildCurve(pts);
    for (let i = 1; i < curve.length; i++) expect(curve[i]!.hungryZero).toBeLessThanOrEqual(curve[i - 1]!.hungryZero + 1e-12);
    // The raw input was not monotone, so the pooling really did something.
    expect(pts.some((p, i) => i > 0 && p.hungryZero > pts[i - 1]!.hungryZero)).toBe(true);
  });

  it('derives starvation from a run of empty days: none when fed, heavy when starving, never negative', () => {
    expect(starvationRunChance(0)).toBe(0);
    expect(starvationHazardPerDay(2)).toBeLessThan(starvationHazardPerDay(0.5));
    expect(starvationHazardPerDay(0.5)).toBeGreaterThan(0.005);
    expect(starvationHazardPerDay(0.01)).toBeGreaterThan(0);
    for (const z of [0, 0.3, 0.8, 0.95, 1]) expect(starvationRunChance(z)).toBeGreaterThanOrEqual(0);
  });

  it('gives the foraging kit its measured multiplier and nothing else (unmeasured techniques count as 1)', () => {
    const kit = new TechSet(MEASURED_KIT.techs as unknown as Tech[]);
    expect(foodMultiplier(kit)).toBe(MEASURED_KIT.multiplier);
    expect(foodMultiplier(new TechSet())).toBe(1);
    expect(foodMultiplier(new TechSet(['firemaking', 'cooking']))).toBe(1); // a partial kit: not interpolated
    expect(MEASURED_KIT.multiplier).toBeGreaterThan(1);
  });
});

describe('old age: the aggregate hazard is the one the individual rolls', () => {
  it('matches the survival of individually rolled lifespans (Monte Carlo of the Person formula)', () => {
    const dpy = 40;
    const table = oldAgeHazardByYear(dpy);
    const rng = new RNG('old-age-check');
    const N = 6000;
    const diedAtYear = new Array<number>(N);
    for (let i = 0; i < N; i++) {
      const lifespanDays = rng.gaussian(LIFESPAN_MEAN_YEARS, LIFESPAN_SD_YEARS) * dpy;
      let age = Math.floor(lifespanDays * 0.85);
      let died = 105;
      for (; age < 105 * dpy; age++) if (rng.chance(oldAgeChancePerDay(age, lifespanDays, dpy, false))) { died = age / dpy; break; }
      diedAtYear[i] = died;
    }
    // Survival to a year from the table: product of daily survival, from the first year with any hazard.
    const survival = (y: number) => { let s = 1; for (let k = 0; k < y; k++) s *= Math.pow(1 - table[k]!, dpy); return s; };
    for (const y of [55, 60, 64, 68, 72]) {
      const mc = diedAtYear.filter(d => d > y).length / N;
      expect(Math.abs(survival(y) - mc)).toBeLessThan(0.03);
    }
    // Control: a table that ignores the lifespan spread (everyone dies at exactly the mean) is far from it.
    const sharp = (y: number) => y < LIFESPAN_MEAN_YEARS * 0.85 ? 1 : 0;
    expect(Math.abs(sharp(60) - diedAtYear.filter(d => d > 60).length / N)).toBeGreaterThan(0.05);
  });
});

describe('binomial draws', () => {
  it('has the right mean and variance, exact and approximate branches, and is deterministic', () => {
    for (const [n, p] of [[40, 0.3], [1000, 0.05]] as const) {
      const rng = new RNG('bin' + n);
      const xs = Array.from({ length: 4000 }, () => binomial(n, p, rng));
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
      expect(Math.abs(mean - n * p) / (n * p)).toBeLessThan(0.03);
      expect(Math.abs(variance - n * p * (1 - p)) / (n * p * (1 - p))).toBeLessThan(0.1);
    }
    expect(binomial(30, 0.4, new RNG('x'))).toBe(binomial(30, 0.4, new RNG('x')));
    expect(binomial(0, 0.5, new RNG('x'))).toBe(0);
    expect(binomial(9, 1, new RNG('x'))).toBe(9);
  });
});

describe('births and deaths by cohort', () => {
  it('conserves people exactly: population change = births - starved - old age - lost', () => {
    const reports: SeasonReport[] = [];
    const sim = new PeopleSim('conserve', CLOCK, [demography({
      regionOf: () => uniform(15),
      losses: () => ({ war: 2, disease: 1 }),
    }, r => reports.push(r))]);
    const people = sim.found({ cohorts: adults(80), comarcas: 1 });
    let prev = populationOf(people);
    sim.advanceTo(YEARS(5));
    expect(reports.length).toBeGreaterThan(15);
    for (const r of reports) {
      expect(r.population - prev).toBe(r.births - r.starved - r.oldAge - r.lost);
      prev = r.population;
    }
    expect(reports.some(r => r.lost > 0)).toBe(true);
  });

  it('grows on a rich region and shrinks on a poor one, from the same people', () => {
    const rich = run(adults(40), uniform(80), 4, 12);
    const poor = run(adults(40), uniform(8), 4, 12);
    expect(rich.mean).toBeGreaterThan(40 * 1.2);
    expect(poor.mean).toBeLessThan(40 * 0.5);
  });

  it('control: a model that ignored the region (the same food for everybody) could not tell them apart', () => {
    // If supply did not matter the two would be statistically the same; they are not (previous test), and
    // here the supply ratio is what separates them, season by season.
    const rich = run(adults(40), uniform(80), 1, 1);
    const poor = run(adults(40), uniform(8), 1, 1);
    expect(rich.reports[0]!.supplyRatio).toBeGreaterThan(poor.reports[0]!.supplyRatio * 5);
    expect(rich.reports.reduce((a, r) => a + r.starved, 0)).toBeLessThan(poor.reports.reduce((a, r) => a + r.starved, 0));
  });

  it('more comarcas feed more people, and the techniques the kit measured raise what a comarca feeds', () => {
    const one = run(adults(40), uniform(20), 3, 12);
    const three = run(adults(40), uniform(20), 3, 12, [], 3);
    expect(three.mean).toBeGreaterThan(one.mean);
    const base = new PeopleSim('k', CLOCK); const a = base.found({ cohorts: adults(40), comarcas: 1 });
    const b = base.found({ cohorts: adults(40), comarcas: 1, techs: MEASURED_KIT.techs as unknown as Tech[] });
    const region = measuredRegion('lean');
    for (const season of ['spring', 'winter'] as const) {
      expect(supplyRatioOf(b, region, season)).toBeCloseTo(supplyRatioOf(a, region, season) * MEASURED_KIT.multiplier, 9);
      expect(bandCapacityOf(b, region, season).hungryZero).toBeLessThan(bandCapacityOf(a, region, season).hungryZero);
    }
  });

  it('has no births without fertile women and none of them in a people of old men', () => {
    const c = emptyCohorts(); c.male[3] = 20; c.female[0] = 5; c.female[10] = 5; // no woman between 15 and 44
    const r = run(c, uniform(100), 2, 6);
    expect(r.reports.reduce((a, x) => a + x.births, 0)).toBe(0);
    expect(FERTILE_WEIGHT[2]).toBe(0); expect(FERTILE_WEIGHT[9]).toBe(0); expect(FERTILE_WEIGHT[3]).toBeGreaterThan(0);
    // The scaling by hunger: a starving people bears fewer children per woman than a fed one.
    expect(birthsPerWomanYear(0.9)).toBeLessThan(birthsPerWomanYear(0.2));
  });

  it('war and disease subtract: the same people loses more with a loss source than without (control)', () => {
    // Plenty of food, so that starvation does not give back what the losses take (fewer mouths, more per head).
    const plain = run(adults(80), uniform(400), 3, 10);
    let lossy = 0;
    for (let k = 0; k < 10; k++) {
      const sim = new PeopleSim(`dem-${k}`, CLOCK, [demography({ regionOf: () => uniform(400), losses: () => ({ war: 3, disease: 0 }) })]);
      const p = sim.found({ cohorts: adults(80), comarcas: 1 }); sim.advanceTo(YEARS(3)); lossy += populationOf(p);
    }
    expect(lossy / 10).toBeLessThan(plain.mean - 15);
  });

  it('draws from its own stream only, so another people in the world changes nothing about it', () => {
    const solo = new PeopleSim('own', CLOCK, [demography({ regionOf: () => uniform(30) })]);
    const a = solo.found({ cohorts: adults(40), comarcas: 1 });
    const crowd = new PeopleSim('own', CLOCK, [demography({ regionOf: () => uniform(30) })]);
    const b = crowd.found({ cohorts: adults(40), comarcas: 1 }); crowd.found({ cohorts: adults(90), comarcas: 2 });
    solo.advanceTo(YEARS(3)); crowd.advanceTo(YEARS(3));
    expect(b.cohorts).toEqual(a.cohorts);
  });

  it('an empty people stays empty and does not throw', () => {
    const r = run(emptyCohorts(), uniform(10), 2, 2);
    expect(r.finals).toEqual([0, 0]);
  });
});

describe('capacity for the compact level (32b)', () => {
  const fixture = (people: People, region: PeopleRegion) => {
    const sim = new Simulation({ seed: 'people-capacity', world: { width: 48, height: 48, treeDensity: 0.1 }, population: { bands: 2, peoplePerBand: 5 } });
    sim.possessFirst();
    for (let i = 0; i < 300; i++) sim.step();
    const person = sim.people.find(p => p.alive && !p.isPlayer && p.years >= 14 && p.targetPersonId === null &&
      p.caughtId === null && p.fleeFromId === null && p.carriedBy === null && p.armsTaken === 0)!;
    const tick = sim.time.tick;
    const compact = (new CompactAuthority('people-capacity').demote(person, tick) as any).value as CompactPerson;
    let id = 1;
    const body = new CompactBody({
      needs: sim.config.needs, time: sim.config.time, world: sim.world, nextEventId: () => id++,
      intake: { model: new IntakeModel(MEASURED_RATES), childhood: sim.config.childhood,
        capacity: () => bandCapacityOf(people, region, sim.time.season) },
    });
    body.advance(compact, tick + 30 * sim.config.time.ticksPerDay);
    return compact.person;
  };

  it('is a function of the region, the people and the season that the compact intake can use: a fed people keeps its member alive, a starving one does not', () => {
    const sim = new PeopleSim('cap', CLOCK);
    const fed = sim.found({ cohorts: adults(24), comarcas: 1 });
    const starving = sim.found({ cohorts: adults(24), comarcas: 1 });
    expect(fixture(fed, uniform(60)).alive).toBe(true);
    expect(fixture(starving, uniform(0.5)).alive).toBe(false);
    // The capacity is readable for a season that has not come yet, from the region alone.
    const winter = bandCapacityOf(fed, measuredRegion('lean'), 'winter');
    const summer = bandCapacityOf(fed, measuredRegion('lean'), 'summer');
    expect(winter.hungryZero).toBeGreaterThan(summer.hungryZero);
  });
});

describe('what the measured regions do to a founding people (pins of tools/people-correspond.ts, not a claim of fidelity)', () => {
  const days = (d: number) => d * CLOCK.ticksPerDay;
  it('the craft island lets 24 founders grow in 66 days; the lean island does not carry 36 for 100 days', () => {
    const grow = [], fall = [];
    for (let k = 0; k < 12; k++) {
      const a = new PeopleSim(`pin-${k}`, CLOCK, [demography({ regionOf: () => measuredRegion('craft') })]);
      const pa = a.found({ cohorts: adults(24), comarcas: 1 }); a.advanceTo(days(66)); grow.push(populationOf(pa));
      const b = new PeopleSim(`pin-${k}`, CLOCK, [demography({ regionOf: () => measuredRegion('lean') })]);
      const pb = b.found({ cohorts: adults(36), comarcas: 1 }); b.advanceTo(days(100)); fall.push(populationOf(pb));
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(grow)).toBeGreaterThan(24 * 1.1);
    expect(mean(fall)).toBeLessThan(36 * 0.6);
  });
});
