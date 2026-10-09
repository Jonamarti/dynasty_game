import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { CompactBandCalendar, type CompactBandDaySupply } from '../compact/CompactBandCalendar.ts';
import { comarcaResourceProfile } from '../world/ResourceProfile.ts';
import { randomWorldGeography } from '../world/WorldGeography.ts';

const profile = comarcaResourceProfile(randomWorldGeography('band-calendar'), 100, 100);
const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const emptyWork = { workerDays: 0, rationsPerWorkerDay: 0, requires: [] };
const supply: CompactBandDaySupply = { population: 2, demandRations: 2, profile, techs: [],
  work: { gather: emptyWork, fish: emptyWork, game: emptyWork } };
function make() {
  const clock = new TimeManager({ ...DEFAULT_CONFIG.time, ticksPerDay: 8, daysPerSeason: 10, startDay: 9 });
  return new CompactBandCalendar(clock.snapshot(), { day: 9, stockRations: 5, storageCapacityRations: 10 });
}

describe('compact band calendar', () => {
  it('settles completed days once and uses the season of the elapsed day at midnight', () => {
    const band = make();
    const seen: unknown[] = [];
    expect(band.advanceTo(7, () => { throw new Error('partial day must not settle'); })).toEqual([]);
    const reports = band.advanceTo(24, period => { seen.push(period); return supply; });
    expect(seen).toEqual([
      { day: 10, season: 'spring', fromTick: 0, toTick: 8 },
      { day: 11, season: 'summer', fromTick: 8, toTick: 16 },
      { day: 12, season: 'summer', fromTick: 16, toTick: 24 },
    ]);
    expect(reports.map(r => [r.tick, r.withdrawn, r.unmet, r.stock])).toEqual([[8, 2, 0, 3], [16, 2, 0, 1], [24, 1, 1, 0]]);
    expect(band.advanceTo(24, () => { throw new Error('cannot repeat settled day'); })).toEqual([]);
    expect(band.tick).toBe(24);
  });

  it('partial-day saves and arbitrary slices preserve all reports and final JSON', () => {
    const whole = make(), cut = make();
    const expected = whole.advanceTo(43, () => supply);
    const reports = cut.advanceTo(5, () => supply);
    reports.push(...cut.advanceTo(19, () => supply));
    const restored = CompactBandCalendar.fromRecord(wire(cut.toRecord()));
    reports.push(...restored.advanceTo(23, () => supply));
    reports.push(...restored.advanceTo(43, () => supply));
    expect(reports).toEqual(expected);
    expect(restored.toRecord()).toEqual(whole.toRecord());
  });

  it('a bad later day rolls back earlier settlements and retry withdraws only once', () => {
    const band = make(), before = band.toRecord();
    expect(() => band.advanceTo(24, day => day.day === 11 ? { ...supply, demandRations: NaN } : supply)).toThrow();
    expect(band.toRecord()).toEqual(before);
    expect(band.advanceTo(24, () => supply).map(r => r.stock)).toEqual([3, 1, 0]);
  });

  it('detects the midnight-season bug through actual seasonal production', () => {
    const rich = { ...profile, rations: {
      spring: { gather: 1, fish: 0, game: 0, total: 1 },
      summer: { gather: 4, fish: 0, game: 0, total: 4 },
      autumn: { gather: 0, fish: 0, game: 0, total: 0 },
      winter: { gather: 0, fish: 0, game: 0, total: 0 },
    } };
    const reader = () => ({ ...supply, profile: rich, demandRations: 0,
      work: { ...supply.work, gather: { workerDays: 2, rationsPerWorkerDay: 2, requires: [] } } });
    const band = make();
    const reports = band.advanceTo(16, reader);
    expect(reports.map(r => r.produced)).toEqual([1, 4]);
    // Negative control: reading the new day's season at the first midnight would produce 4.
    expect(reports[0]!.produced).not.toBe(rich.rations.summer.gather);
  });

  it('rejects rewinds, corrupt dates, extra fields and reentrant updates without changing live state', () => {
    const band = make();
    band.advanceTo(7, () => supply);
    expect(() => band.advanceTo(6, () => supply)).toThrow(/backwards/);
    const before = band.toRecord();
    expect(() => band.advanceTo(8, () => { band.advanceTo(8, () => supply); return supply; })).toThrow(/reentrant/);
    expect(band.toRecord()).toEqual(before);
    expect(() => CompactBandCalendar.fromRecord({ ...before, version: 2 })).toThrow();
    expect(() => CompactBandCalendar.fromRecord({ ...before, extra: true })).toThrow();
    expect(() => CompactBandCalendar.fromRecord({ ...before, food: { ...before.food, day: 8 } })).toThrow(/date/);
    expect(() => CompactBandCalendar.fromRecord({ ...before, time: { ...before.time, tick: NaN } })).toThrow();
    const detached = band.foodState as { stockRations: number };
    detached.stockRations = 999;
    const record = band.toRecord();
    (record.time.config as { startDay: number }).startDay = 400;
    expect(band.toRecord()).toEqual(before);
  });
});
