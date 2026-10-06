import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { toPersonRecord } from '../persistence/EntityRecords.ts';
import {
  RateWatch, buildRateTable, quantiles, rateKey, needBin, ageBucketOf, type PersonDay,
} from '../compact/CompactCalibration.ts';

const config = () => ({ seed: 'rate-watch', world: { width: 48, height: 48, treeDensity: 0.1 },
  population: { bands: 2, peoplePerBand: 6 } });
const digest = (sim: Simulation) => JSON.stringify([sim.time.tick, sim.people.map(p => toPersonRecord(p, sim.time.tick))]);

describe('RateWatch (the instrument that measures the detailed model)', () => {
  it('is read-only: a watched run is bit-identical to an unwatched one', () => {
    const a = new Simulation(config());
    const b = new Simulation(config());
    const watch = new RateWatch(b);
    watch.observe();
    for (let i = 0; i < 800; i++) { a.step(); b.step(); watch.observe(); }
    expect(digest(b)).toBe(digest(a));
    expect(watch.days.length).toBeGreaterThan(10); // and it really measured something
  });

  it('reads real intake: people in a normal world get relief, with a spread', () => {
    const sim = new Simulation(config());
    const watch = new RateWatch(sim);
    watch.observe();
    for (let i = 0; i < 960; i++) { sim.step(); watch.observe(); }
    const adults = watch.days.filter(d => d.group === 'adult');
    expect(adults.length).toBeGreaterThan(20);
    const mean = adults.reduce((n, d) => n + d.hungerRatio, 0) / adults.length;
    expect(mean).toBeGreaterThan(0.3);
    expect(adults.some(d => d.hungerRatio === 0)).toBe(true);   // days with no meal exist ...
    expect(adults.some(d => d.hungerRatio > 1)).toBe(true);     // ... and days that make up for them
    const drinkers = adults.reduce((n, d) => n + d.thirstRatio, 0) / adults.length;
    expect(drinkers).toBeGreaterThan(0.3);
  });

  it('negative control: in a world where nobody can eat or drink it reads (almost) no relief', () => {
    const sim = new Simulation(config());
    const watch = new RateWatch(sim);
    watch.observe();
    const hold = new Map<number, [number, number]>();
    for (let i = 0; i < 480; i++) {
      for (const p of sim.people) hold.set(p.id, [p.needs.hunger, p.needs.thirst]);
      sim.step();
      // Undo whatever the people did about their needs: every tick ends where bare drift puts it.
      for (const p of sim.people) {
        const [h, t] = hold.get(p.id)!;
        p.needs.hunger = Math.max(p.needs.hunger, Math.min(99, h + 0.055));
        p.needs.thirst = Math.max(p.needs.thirst, Math.min(99, t + 0.075));
        p.health = 100;
      }
      watch.observe();
    }
    const adults = watch.days.filter(d => d.group === 'adult');
    expect(adults.length).toBeGreaterThan(5);
    const mean = adults.reduce((n, d) => n + d.hungerRatio, 0) / adults.length;
    expect(mean).toBeLessThan(0.15);
  });
});

describe('RateWatch and the clamp at 100', () => {
  it('a person pinned at 100 (starving, kept alive) got nothing: reads relief 0, not a full ration', () => {
    const sim = new Simulation(config());
    const watch = new RateWatch(sim);
    watch.observe();
    for (let i = 0; i < 480; i++) {
      for (const p of sim.people) { p.needs.hunger = 100; p.needs.thirst = 100; p.health = 100; }
      sim.step();
      for (const p of sim.people) { p.needs.hunger = 100; p.needs.thirst = 100; p.health = 100; }
      watch.observe();
    }
    const adults = watch.days.filter(d => d.group === 'adult');
    expect(adults.length).toBeGreaterThan(5);
    expect(Math.max(...adults.map(d => d.hungerRatio))).toBeLessThan(0.05);
  });
});

describe('rate table helpers', () => {
  it('quantiles interpolate and bins clamp', () => {
    expect(quantiles([0, 10], 3)).toEqual([0, 5, 10]);
    expect(quantiles([4], 3)).toEqual([4, 4, 4]);
    expect(needBin(-5)).toBe(0); expect(needBin(24.9)).toBe(0); expect(needBin(25)).toBe(1); expect(needBin(100)).toBe(3);
    expect(ageBucketOf(0.5)).toBe(0); expect(ageBucketOf(3)).toBe(1); expect(ageBucketOf(70)).toBe(6);
  });

  it('folds person-days into the conditional table', () => {
    const goals = { obtain_food: 0, build: 0, care: 0, travel: 0, idle: 240 };
    const day = (hungerRatio: number): PersonDay => ({ season: 'spring', group: 'adult', bandId: 0, hungerBin: 1, thirstBin: 0,
      hungerRatio, thirstRatio: 1, eaten: 0, hungerDrift: 13, goals, drinkTicks: 0, ticks: 240 });
    const table = buildRateTable([day(0), day(2), day(1)]);
    const e = table[rateKey('spring', 'adult', 'hunger', 1)]!;
    expect(e.n).toBe(3);
    expect(e.mean).toBe(1);
    expect(e.q[0]).toBe(0);
    expect(e.q[20]).toBe(2);
    expect(e.zero).toBeCloseTo(1 / 3, 3);   // one day of three brought nothing
    expect(e.nz).toBe(2);
    expect(e.qf).toEqual([]);               // too few fed days to keep a distribution of them
    expect(table[rateKey('spring', 'adult', 'thirst', 0)]!.mean).toBe(1);
  });
});
