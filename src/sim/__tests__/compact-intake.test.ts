import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { CompactAuthority } from '../compact/CompactAuthority.ts';
import { CompactBody } from '../compact/CompactAdvance.ts';
import { fromCompactRecord, toCompactRecord, type CompactPerson } from '../compact/CompactPerson.ts';
import { IntakeModel, IntakeUnmeasured } from '../compact/CompactIntake.ts';
import { NEED_BINS, QUANTILE_STEPS, rateKey, type RateTable, type PersonDay } from '../compact/CompactCalibration.ts';
import { MEASURED_RATES } from '../compact/MeasuredRates.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** A table where every cell says "relief = `ratio` times the drift, always", with plenty of samples. */
function flatTable(ratio: number, n = 100): RateTable {
  const t: RateTable = {};
  for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) for (const group of ['nursling', 'child', 'adult'] as const)
    for (const need of ['hunger', 'thirst'] as const) for (let b = 0; b < NEED_BINS; b++)
      t[rateKey(season, group, need, b)] = { n, mean: ratio, q: Array(QUANTILE_STEPS).fill(ratio) };
  return t;
}

function fixture(scale = { hunger: 1, thirst: 1 }) {
  const sim = new Simulation({ seed: 'compact-intake', world: { width: 48, height: 48, treeDensity: 0.1 },
    population: { bands: 2, peoplePerBand: 5 } });
  sim.possessFirst();
  for (let i = 0; i < 300; i++) sim.step();
  const person = sim.people.find(p => p.alive && !p.isPlayer && p.years >= 14 && p.targetPersonId === null &&
    p.caughtId === null && p.fleeFromId === null && p.carriedBy === null && p.armsTaken === 0)!;
  const tick = sim.time.tick;
  const compact = (new CompactAuthority('compact-intake').demote(person, tick) as any).value as CompactPerson;
  let id = 1;
  const make = (model: IntakeModel | null, s = scale) => new CompactBody({
    needs: sim.config.needs, time: sim.config.time, world: sim.world, nextEventId: () => id++,
    intake: model ? { model, scale: () => s, childhood: sim.config.childhood } : undefined,
  });
  return { sim, tick, compact, make, tpd: sim.config.time.ticksPerDay };
}

describe('compact intake from measured rates', () => {
  it('keeps a person alive for weeks where the closed body dies in about eight days', () => {
    const f = fixture();
    const twin = fromCompactRecord(wire(toCompactRecord(f.compact)));
    f.make(new IntakeModel(flatTable(1))).advance(f.compact, f.tick + 30 * f.tpd);
    f.make(null).advance(twin, f.tick + 30 * f.tpd);
    expect(f.compact.person.alive).toBe(true);
    expect(f.compact.person.needs.hunger).toBeLessThan(60);
    expect(twin.person.alive).toBe(false); // negative control: no intake, no life
  });

  it('a band that gets nothing (scale 0) is as dead as the closed body: capacity is what feeds it', () => {
    const none = { hunger: 0, thirst: 0 };
    const f = fixture(none);
    f.make(new IntakeModel(flatTable(1)), none).advance(f.compact, f.tick + 30 * f.tpd);
    expect(f.compact.person.alive).toBe(false);
  });

  it('is invariant to cutting the advance and to a JSON round trip mid-day (the draw lives on the person)', () => {
    const f = fixture();
    const model = new IntakeModel(MEASURED_RATES);
    const whole = fromCompactRecord(wire(toCompactRecord(f.compact)));
    f.make(model).advance(whole, f.tick + 5 * f.tpd);
    f.make(model).advance(f.compact, f.tick + 777); // not a day boundary
    const resumed = fromCompactRecord(wire(toCompactRecord(f.compact)));
    f.make(model).advance(resumed, f.tick + 5 * f.tpd);
    expect(wire(toCompactRecord(resumed))).toEqual(wire(toCompactRecord(whole)));
    expect(whole.intake).not.toBeNull();
    // A cut that forgets the plan redraws it and moves the stream: the control for the test above.
    const forgetful = fromCompactRecord(wire(toCompactRecord(f.compact)));
    forgetful.intake = null;
    f.make(model).advance(forgetful, f.tick + 5 * f.tpd);
    expect(wire(toCompactRecord(forgetful))).not.toEqual(wire(toCompactRecord(whole)));
  });

  it('draws exactly two numbers per day from the person own stream', () => {
    const f = fixture();
    const control = RNG.fromSnapshot(f.compact.rng.snapshot());
    f.make(new IntakeModel(flatTable(1))).advance(f.compact, f.tick + 3 * f.tpd);
    const days = f.compact.intake!.day - Math.floor((f.tick - 1) / f.tpd) + 1;
    for (let i = 0; i < 2 * days; i++) control.next();
    expect(f.compact.rng.next()).toBe(control.next());
  });

  it('uses no draw at all when there is no intake model (the closed body of the earlier commit)', () => {
    const f = fixture();
    const control = RNG.fromSnapshot(f.compact.rng.snapshot());
    f.make(null).advance(f.compact, f.tick + 3 * f.tpd);
    expect(f.compact.rng.next()).toBe(control.next());
    expect(f.compact.intake).toBeNull();
  });
});

describe('IntakeModel refuses rather than invents', () => {
  it('throws when nothing was measured for the cell, and skips a thin bin for the nearest populated one', () => {
    expect(() => new IntakeModel({}).sample('spring', 'adult', 'hunger', 10, 0.5)).toThrow(IntakeUnmeasured);
    const t = flatTable(1);
    t[rateKey('spring', 'adult', 'hunger', 0)] = { n: 5, mean: 9, q: Array(QUANTILE_STEPS).fill(9) }; // thin: ignored
    t[rateKey('spring', 'adult', 'hunger', 1)] = { n: 100, mean: 2, q: Array(QUANTILE_STEPS).fill(2) };
    expect(new IntakeModel(t).sample('spring', 'adult', 'hunger', 10, 0.5)).toBe(2);
    expect(new IntakeModel(t).sample('spring', 'adult', 'hunger', 90, 0.5)).toBe(1);
  });

  it('will not read a band by a handful of days, and reads 1 for a band that matches the table', () => {
    const model = new IntakeModel(flatTable(1));
    const day = (hungerRatio: number): PersonDay => ({ season: 'summer', group: 'adult', bandId: 0, hungerBin: 1, thirstBin: 0,
      hungerRatio, thirstRatio: hungerRatio, eaten: 0, hungerDrift: 13, ticks: 240, drinkTicks: 0,
      goals: { obtain_food: 0, build: 0, care: 0, travel: 0, idle: 240 } });
    expect(() => model.scaleFrom(Array.from({ length: 5 }, () => day(1)))).toThrow(IntakeUnmeasured);
    expect(model.scaleFrom(Array.from({ length: 40 }, () => day(1))).hunger).toBeCloseTo(1, 9);
    expect(model.scaleFrom(Array.from({ length: 40 }, () => day(0.5))).hunger).toBeCloseTo(0.5, 9);
  });

  it('the committed measured table has populated cells for every adult season (not an empty file)', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      expect(MEASURED_RATES[rateKey(season, 'adult', 'hunger', 0)]!.n).toBeGreaterThan(100);
      expect(MEASURED_RATES[rateKey(season, 'adult', 'thirst', 0)]!.n).toBeGreaterThan(100);
    }
  });
});
