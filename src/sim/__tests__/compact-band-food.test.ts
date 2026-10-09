import { describe, expect, it } from 'vitest';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { comarcaResourceProfile, type ComarcaResourceProfile } from '../world/ResourceProfile.ts';
import {
  advanceCompactBandFoodDay, fromCompactBandFoodRecord, toCompactBandFoodRecord,
  type CompactBandFoodSeason, type CompactBandFoodState, type CompactBandFoodWorkRate,
} from '../compact/CompactBandFood.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const EMPTY_WORK: Record<'gather' | 'fish' | 'game', CompactBandFoodWorkRate> = {
  gather: { workerDays: 0, rationsPerWorkerDay: 0, requires: [] },
  fish: { workerDays: 0, rationsPerWorkerDay: 0, requires: [] },
  game: { workerDays: 0, rationsPerWorkerDay: 0, requires: [] },
};

function findProfiles(): { dry: ComarcaResourceProfile; fertile: ComarcaResourceProfile } {
  const geography = randomWorldGeography('compact-band-food-profiles');
  let dry: ComarcaResourceProfile | undefined;
  let fertile: ComarcaResourceProfile | undefined;
  // These are actual outputs of the game's geography/profile code, not hand-built profiles.
  for (let y = 25; y < 470 && (!dry || !fertile); y += 7) {
    for (let x = 0; x < 960 && (!dry || !fertile); x += 7) {
      const p = comarcaResourceProfile(geography, x, y);
      if (!p.measured) continue;
      if (!dry && p.key.relief === 'low' && p.key.moisture === 0 && p.key.water === 'dry') dry = p;
      if (!fertile && p.key.relief === 'low' && p.key.moisture >= 4) fertile = p;
    }
  }
  if (!dry || !fertile) throw new Error('seeded geography did not contain measured dry and fertile comarcas');
  return { dry, fertile };
}

const FIXTURES = findProfiles();
const SEASONS: readonly CompactBandFoodSeason[] = ['spring', 'summer', 'autumn', 'winter'];

function input(overrides: Partial<Parameters<typeof advanceCompactBandFoodDay>[1]> = {}) {
  return {
    day: 1,
    season: 'summer' as const,
    population: 10,
    demandRations: 10,
    profile: FIXTURES.fertile,
    techs: [] as const,
    work: EMPTY_WORK,
    ...overrides,
  };
}

function state(overrides: Partial<CompactBandFoodState> = {}): CompactBandFoodState {
  return { day: 0, stockRations: 0, storageCapacityRations: 100, ...overrides };
}

function conservation(before: CompactBandFoodState, result: ReturnType<typeof advanceCompactBandFoodDay>) {
  expect(before.stockRations + result.report.produced).toBeCloseTo(
    result.report.consumed + result.report.lost + result.state.stockRations, 9);
}

describe('compact band food ledger', () => {
  it('accounts for processed-food rations separately and conserves them through stock and loss', () => {
    const before = state({ stockRations: 2, storageCapacityRations: 5 });
    const result = advanceCompactBandFoodDay(before, input({ demandRations: 3, supplementalRations: 4 }));
    expect(result.report.producedSupplemental).toBe(4);
    expect(result.report.produced).toBe(4);
    expect(result.report.consumed).toBe(3);
    expect(result.state.stockRations).toBe(3);
    conservation(before, result);
    expect(() => advanceCompactBandFoodDay(state(), input({ supplementalRations: -1 }))).toThrow(/supplemental/);
    expect(() => advanceCompactBandFoodDay(state(), input({ supplementalRations: Number.POSITIVE_INFINITY }))).toThrow(/supplemental/);
  });

  it('rejects overflow when finite wild potential is added to finite processed food', () => {
    const p = {
      ...FIXTURES.fertile,
      rations: { ...FIXTURES.fertile.rations,
        summer: { gather: Number.MAX_VALUE, fish: 0, game: 0, total: Number.MAX_VALUE } },
    } as ComarcaResourceProfile;
    const work = { ...EMPTY_WORK, gather: { workerDays: 1, rationsPerWorkerDay: Number.MAX_VALUE, requires: [] } };
    expect(() => advanceCompactBandFoodDay(state(), input({ profile: p, work, population: 1,
      demandRations: 0, supplementalRations: Number.MAX_VALUE }))).toThrow(/food production/);
  });
  it('conserves rations across harvest, consumption, storage and loss', () => {
    const { fertile: profile } = FIXTURES;
    const work = { ...EMPTY_WORK, gather: { workerDays: 10, rationsPerWorkerDay: 100, requires: [] } };
    const before = state({ stockRations: 4, storageCapacityRations: 12 });
    const result = advanceCompactBandFoodDay(before, input({ profile, work, demandRations: 8 }));

    expect(result.report.producedBySource.gather).toBeLessThanOrEqual(profile.rations.summer.gather);
    expect(result.report.consumed).toBe(8);
    expect(result.report.withdrawn).toBe(0);
    expect(result.state.stockRations).toBe(12);
    expect(result.report.lost).toBeGreaterThan(0);
    conservation(before, result);
  });

  it('requires the exact next day, and the strict JSON record round-trips each turn', () => {
    const first = advanceCompactBandFoodDay(state(), input({ demandRations: 2 })).state;
    expect(() => advanceCompactBandFoodDay(first, input({ day: 1 }))).toThrow();
    const resumed = fromCompactBandFoodRecord(wire(toCompactBandFoodRecord(first)));
    const a = advanceCompactBandFoodDay(first, input({ day: 2, demandRations: 3 }));
    const b = advanceCompactBandFoodDay(resumed, input({ day: 2, demandRations: 3 }));
    expect(wire(toCompactBandFoodRecord(b.state))).toEqual(wire(toCompactBandFoodRecord(a.state)));
    expect(wire(b.report)).toEqual(wire(a.report));
  });

  it('uses stored reserves through a bad day, reports unmet demand at zero, then rebuilds reserves after recovery', () => {
    const { fertile: profile } = FIXTURES;
    const productive = { ...EMPTY_WORK, gather: { workerDays: 10, rationsPerWorkerDay: 100, requires: [] } };
    let current = state({ storageCapacityRations: 20 });
    const plenty = advanceCompactBandFoodDay(current, input({ profile, work: productive, demandRations: 5 }));
    current = plenty.state;
    expect(current.stockRations).toBeGreaterThan(0);

    const beforeDrought = current;
    const drought = advanceCompactBandFoodDay(current, input({ day: 2, profile, demandRations: 25 }));
    current = drought.state;
    expect(drought.report.withdrawn).toBeGreaterThan(0);
    expect(drought.report.unmet).toBeGreaterThan(0);
    expect(current.stockRations).toBe(0);
    conservation(beforeDrought, drought);

    const recovery = advanceCompactBandFoodDay(current, input({ day: 3, profile, work: productive, demandRations: 5 }));
    expect(recovery.report.unmet).toBe(0);
    expect(recovery.state.stockRations).toBeGreaterThan(0);
  });

  it('caps total labor at population and caps every source at its real seasonal profile potential', () => {
    const { fertile: profile } = FIXTURES;
    const work = {
      gather: { workerDays: 4, rationsPerWorkerDay: 100, requires: [] },
      fish: { workerDays: 4, rationsPerWorkerDay: 100, requires: [] },
      game: { workerDays: 4, rationsPerWorkerDay: 100, requires: [] },
    };
    expect(() => advanceCompactBandFoodDay(state(), input({ profile, work, population: 10 }))).toThrow();
    const valid = { ...work, game: { ...work.game, workerDays: 2 } };
    const result = advanceCompactBandFoodDay(state(), input({ profile, work: valid, population: 10, demandRations: 0 }));
    for (const source of ['gather', 'fish', 'game'] as const) {
      expect(result.report.producedBySource[source]).toBeLessThanOrEqual(profile.rations.summer[source]);
      expect(result.report.producedBySource[source]).toBeLessThanOrEqual(valid[source].workerDays * valid[source].rationsPerWorkerDay);
    }
  });

  it('limits a partial interval by proportional seasonal potential and worker-days', () => {
    const { fertile: profile } = FIXTURES;
    const work = { ...EMPTY_WORK, gather: { workerDays: 0.5, rationsPerWorkerDay: 1000, requires: [] } };
    const result = advanceCompactBandFoodDay(state(), input({ profile, population: 1,
      durationFactor: 0.5, demandRations: 0, work }));
    expect(result.report.producedBySource.gather).toBeCloseTo(Math.min(profile.rations.summer.gather * 0.5, 500));
    expect(() => advanceCompactBandFoodDay(state(), input({ population: 1, durationFactor: 0.5,
      work: { ...work, gather: { ...work.gather, workerDays: 0.5001 } } }))).toThrow(/interval population/);
    expect(() => advanceCompactBandFoodDay(state(), input({ durationFactor: 0 }))).toThrow(/duration factor/);
  });

  it('rejects invalid numeric inputs, missing source rates and malformed profile potentials', () => {
    const base = input();
    const validWork = { ...EMPTY_WORK, gather: { workerDays: 1, rationsPerWorkerDay: Number.MAX_VALUE, requires: [] } };
    expect(() => advanceCompactBandFoodDay(state(), input({ demandRations: Number.NaN }))).toThrow();
    expect(() => advanceCompactBandFoodDay(state(), input({ demandRations: Number.POSITIVE_INFINITY }))).toThrow();
    expect(() => advanceCompactBandFoodDay(state(), input({
      work: { ...validWork, gather: { ...validWork.gather, workerDays: -1 } },
    }))).toThrow();
    expect(() => advanceCompactBandFoodDay(state(), input({
      work: { ...validWork, gather: { ...validWork.gather, rationsPerWorkerDay: -1 } },
    }))).toThrow();
    expect(() => advanceCompactBandFoodDay(state(), input({
      work: { ...validWork, gather: { ...validWork.gather, workerDays: Number.POSITIVE_INFINITY } },
    }))).toThrow();
    expect(() => advanceCompactBandFoodDay(state(), input({
      work: { ...validWork, gather: { ...validWork.gather, rationsPerWorkerDay: Number.NaN } },
    }))).toThrow();
    expect(() => advanceCompactBandFoodDay(state(), input({ population: 1.5 }))).toThrow();

    const missingSource = { ...validWork } as Partial<typeof validWork>;
    delete missingSource.game;
    expect(() => advanceCompactBandFoodDay(state(), input({ work: missingSource as typeof validWork }))).toThrow();

    const profile = base.profile;
    const malformedProfile = {
      ...profile,
      rations: {
        ...profile.rations,
        summer: { ...profile.rations.summer, gather: Number.NaN },
      },
    } as ComarcaResourceProfile;
    expect(() => advanceCompactBandFoodDay(state(), input({ profile: malformedProfile }))).toThrow();
  });

  it('rejects overflow when individually finite source yields sum to infinite production', () => {
    const max = Number.MAX_VALUE;
    const profile = FIXTURES.fertile;
    const overflowProfile = {
      ...profile,
      rations: {
        ...profile.rations,
        summer: { gather: max, fish: max, game: max, total: max },
      },
    } as ComarcaResourceProfile;
    const work = {
      gather: { workerDays: 1, rationsPerWorkerDay: max, requires: [] },
      fish: { workerDays: 1, rationsPerWorkerDay: max, requires: [] },
      game: { workerDays: 1, rationsPerWorkerDay: max, requires: [] },
    };
    expect(() => advanceCompactBandFoodDay(state(), input({ profile: overflowProfile, work, population: 3, demandRations: 0 })))
      .toThrow(/food production/);
  });
  it('gates each source on its required technique without exceeding the profile potential', () => {
    const { fertile: profile } = FIXTURES;
    const work = {
      ...EMPTY_WORK,
      gather: { workerDays: 5, rationsPerWorkerDay: 100, requires: ['plant_lore'] as const },
      fish: { workerDays: 5, rationsPerWorkerDay: 100, requires: ['fishing'] as const },
    };
    const locked = advanceCompactBandFoodDay(state(), input({ profile, work, demandRations: 0 }));
    expect(locked.report.producedBySource.gather).toBe(0);
    expect(locked.report.producedBySource.fish).toBe(0);
    const unlocked = advanceCompactBandFoodDay(state(), input({ profile, work,
      techs: ['plant_lore', 'fishing'], demandRations: 0 }));
    expect(unlocked.report.producedBySource.gather).toBeGreaterThan(0);
    expect(unlocked.report.producedBySource.fish).toBeGreaterThan(0);
    expect(unlocked.report.produced).toBeLessThanOrEqual(profile.rations.summer.total);
  });

  it('uses actual dry and fertile comarca profiles, with the poorer one producing less in every season', () => {
    const { dry, fertile } = FIXTURES;
    for (const season of SEASONS) {
      expect(dry.rations[season].total).toBeLessThan(fertile.rations[season].total);
      const work = { ...EMPTY_WORK, gather: { workerDays: 10, rationsPerWorkerDay: 1_000, requires: [] } };
      const poor = advanceCompactBandFoodDay(state(), input({ season, profile: dry, work, demandRations: 0 }));
      const rich = advanceCompactBandFoodDay(state(), input({ season, profile: fertile, work, demandRations: 0 }));
      expect(poor.report.produced).toBeLessThan(rich.report.produced);
      expect(poor.report.produced).toBeLessThanOrEqual(dry.rations[season].gather);
      expect(rich.report.produced).toBeLessThanOrEqual(fertile.rations[season].gather);
    }
  });

  it('does not mutate the prior state, work table or resource profile', () => {
    const { fertile: profile } = FIXTURES;
    const before = state({ stockRations: 7 });
    const work = { ...EMPTY_WORK, gather: { workerDays: 4, rationsPerWorkerDay: 2, requires: [] } };
    const beforeWire = wire({ before, work, profile });
    advanceCompactBandFoodDay(before, input({ profile, work, demandRations: 3 }));
    expect(wire({ before, work, profile })).toEqual(beforeWire);
  });

  it('rejects malformed or non-canonical JSON state records', () => {
    const record = toCompactBandFoodRecord(state({ stockRations: 2 }));
    expect(fromCompactBandFoodRecord(wire(record))).toEqual(state({ stockRations: 2 }));
    expect(() => fromCompactBandFoodRecord(null)).toThrow();
    expect(() => fromCompactBandFoodRecord({ ...record, version: 2 })).toThrow();
    expect(() => fromCompactBandFoodRecord({ ...record, stockRations: -1 })).toThrow();
    expect(() => fromCompactBandFoodRecord({ ...record, storageCapacityRations: 1 })).toThrow();
    expect(() => fromCompactBandFoodRecord({ ...record, unrecognized: true })).toThrow();
  });
});

