import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { CompactAuthority } from '../compact/CompactAuthority.ts';
import { CompactBody } from '../compact/CompactAdvance.ts';
import { fromCompactRecord, toCompactRecord, type CompactPerson } from '../compact/CompactPerson.ts';
import { IntakeModel, IntakeUnmeasured, type BandCapacity } from '../compact/CompactIntake.ts';
import { NEED_BINS, QUANTILE_STEPS, rateKey, type RateTable, type PersonDay } from '../compact/CompactCalibration.ts';
import { MEASURED_RATES } from '../compact/MeasuredRates.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Every cell says "an empty day with probability `zero(bin)`, else relief = `ratio` times the drift". */
function flatTable(ratio: number, zero: (bin: number) => number = () => 0, n = 100): RateTable {
  const t: RateTable = {};
  for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) for (const group of ['nursling', 'child', 'adult'] as const)
    for (const need of ['hunger', 'thirst'] as const) for (let b = 0; b < NEED_BINS; b++)
      t[rateKey(season, group, need, b)] = {
        n, mean: ratio, q: Array(QUANTILE_STEPS).fill(ratio), zero: zero(b), nz: n, qf: Array(QUANTILE_STEPS).fill(ratio),
      };
  return t;
}

function fixture(capacity: BandCapacity | undefined = undefined) {
  const sim = new Simulation({ seed: 'compact-intake', world: { width: 48, height: 48, treeDensity: 0.1 },
    population: { bands: 2, peoplePerBand: 5 } });
  sim.possessFirst();
  for (let i = 0; i < 300; i++) sim.step();
  const person = sim.people.find(p => p.alive && !p.isPlayer && p.years >= 14 && p.targetPersonId === null &&
    p.caughtId === null && p.fleeFromId === null && p.carriedBy === null && p.armsTaken === 0)!;
  const tick = sim.time.tick;
  const compact = (new CompactAuthority('compact-intake').demote(person, tick) as any).value as CompactPerson;
  let id = 1;
  const make = (model: IntakeModel | null, c = capacity) => new CompactBody({
    needs: sim.config.needs, time: sim.config.time, world: sim.world, nextEventId: () => id++,
    intake: model ? { model, capacity: () => c, childhood: sim.config.childhood } : undefined,
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

  it('a band that never feeds a hungry member starves them, even though the table says sated people eat', () => {
    const none = { hungryZero: 1 };
    const table = flatTable(1, bin => bin === 0 ? 0.5 : 0);
    const f = fixture(none);
    f.make(new IntakeModel(table), none).advance(f.compact, f.tick + 30 * f.tpd);
    expect(f.compact.person.alive).toBe(false);
    // and the same table with a band that always feeds them keeps them alive: capacity is the difference
    const g = fixture({ hungryZero: 0 });
    g.make(new IntakeModel(table), { hungryZero: 0 }).advance(g.compact, g.tick + 30 * g.tpd);
    expect(g.compact.person.alive).toBe(true);
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

  it('draws exactly four numbers per day from the person own stream', () => {
    const f = fixture();
    const control = RNG.fromSnapshot(f.compact.rng.snapshot());
    f.make(new IntakeModel(flatTable(1))).advance(f.compact, f.tick + 3 * f.tpd);
    const days = f.compact.intake!.day - Math.floor((f.tick - 1) / f.tpd) + 1;
    for (let i = 0; i < 4 * days; i++) control.next();
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
    expect(() => new IntakeModel({}).sample('spring', 'adult', 'hunger', 10, 0.5, 0.5)).toThrow(IntakeUnmeasured);
    const t = flatTable(1);
    t[rateKey('spring', 'adult', 'hunger', 0)] = { n: 5, mean: 9, q: Array(QUANTILE_STEPS).fill(9), zero: 0, nz: 5, qf: [] }; // thin: ignored
    t[rateKey('spring', 'adult', 'hunger', 1)] = { n: 100, mean: 2, q: Array(QUANTILE_STEPS).fill(2), zero: 0, nz: 100, qf: Array(QUANTILE_STEPS).fill(2) };
    expect(new IntakeModel(t).sample('spring', 'adult', 'hunger', 10, 0.5, 0.5)).toBe(2);
    expect(new IntakeModel(t).sample('spring', 'adult', 'hunger', 90, 0.5, 0.5)).toBe(1);
  });

  it('a cell that has days but too few fed ones lends its ration from the nearest cell that has', () => {
    const t = flatTable(1);
    t[rateKey('winter', 'adult', 'hunger', 3)] = { n: 100, mean: 0, q: Array(QUANTILE_STEPS).fill(0), zero: 1, nz: 0, qf: [] };
    const model = new IntakeModel(t);
    expect(model.sample('winter', 'adult', 'hunger', 90, 0.5, 0.5)).toBe(0);       // empty with probability 1
    expect(model.sample('winter', 'adult', 'hunger', 90, 0.5, 0.5, { hungryZero: 0 })).toBe(1); // a band that feeds: a ration from bin 2
  });

  it('reads a band only from days that began hungry, refuses a handful, and counts empty days', () => {
    const model = new IntakeModel(flatTable(1));
    const day = (hungerBin: number, hungerRatio: number): PersonDay => ({ season: 'summer', group: 'adult', bandId: 0, hungerBin, thirstBin: 0,
      hungerRatio, thirstRatio: 1, eaten: 0, hungerDrift: 13, ticks: 240, drinkTicks: 0,
      goals: { obtain_food: 0, build: 0, care: 0, travel: 0, idle: 240 } });
    expect(() => model.capacityFrom(Array.from({ length: 5 }, () => day(2, 1)))).toThrow(IntakeUnmeasured);
    // 100 sated days do not make a band readable: appetite is not capacity
    expect(() => model.capacityFrom(Array.from({ length: 100 }, () => day(0, 0)))).toThrow(IntakeUnmeasured);
    const window = [...Array.from({ length: 30 }, (_, i) => day(1 + (i % 3), i < 10 ? 0 : 1.5)), ...Array.from({ length: 50 }, () => day(0, 0))];
    expect(model.capacityFrom(window).hungryZero).toBeCloseTo(10 / 30, 9);
  });

  it('the committed measured table has populated cells for every adult season (not an empty file)', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      expect(MEASURED_RATES[rateKey(season, 'adult', 'hunger', 0)]!.n).toBeGreaterThan(100);
      expect(MEASURED_RATES[rateKey(season, 'adult', 'thirst', 0)]!.n).toBeGreaterThan(100);
      expect(MEASURED_RATES[rateKey(season, 'adult', 'hunger', 1)]!.qf.length).toBe(QUANTILE_STEPS);
    }
  });
});
