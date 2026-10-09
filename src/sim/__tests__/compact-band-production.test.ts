import { describe, expect, it } from 'vitest';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { comarcaResourceProfile, type ComarcaResourceProfile, type SourceRations } from '../world/ResourceProfile.ts';
import { closeUnderRequires } from '../world/PeopleSim.ts';
import { type CompactBandFoodDayInput, type CompactBandFoodState, type CompactBandFoodWorkRate } from '../compact/CompactBandFood.ts';
import { advanceCompactBandProductionDay, type CompactBandProductionInput } from '../compact/CompactBandProduction.ts';

const ZERO: Record<'gather' | 'fish' | 'game', CompactBandFoodWorkRate> = {
  gather: { workerDays: 0, rationsPerWorkerDay: 0, requires: [] },
  fish: { workerDays: 0, rationsPerWorkerDay: 0, requires: [] },
  game: { workerDays: 0, rationsPerWorkerDay: 0, requires: [] },
};

function sharedProfile(): ComarcaResourceProfile {
  const geography = randomWorldGeography('compact-band-production');
  for (let y = 25; y < 470; y += 5) for (let x = 0; x < 960; x += 5) {
    const profile = comarcaResourceProfile(geography, x, y);
    const p = profile.rations.summer;
    if (profile.measured && p.gather > 0 && p.fish > 0 && p.game > 0) return profile;
  }
  throw new Error('seeded geography did not contain a measured comarca with all food sources');
}

const PROFILE = sharedProfile();
const state = (day: number): CompactBandFoodState => ({ day, stockRations: 0, storageCapacityRations: 500 });
function bandInput(day: number, population: number, work = ZERO, techs: readonly string[] = [], demandRations = 0): Omit<CompactBandFoodDayInput, 'profile'> {
  return { day, season: 'summer', population, demandRations, techs: techs as never, work };
}
function member(bandId: number, day: number, population: number, work = ZERO, techs: readonly string[] = [], demandRations = 0) {
  return { bandId, state: state(day - 1), input: bandInput(day, population, work, techs, demandRations) };
}
function rationSum(sources: SourceRations): number { return sources.gather + sources.fish + sources.game; }

function run(bands: CompactBandProductionInput['bands'], profile = PROFILE): ReturnType<typeof advanceCompactBandProductionDay> {
  return advanceCompactBandProductionDay({ profile, season: 'summer', bands });
}

describe('shared comarca production for compact bands', () => {
  it('divides one source potential proportionally to eligible measured yield and never duplicates it', () => {
    const a = member(2, 1, 10, { ...ZERO, gather: { workerDays: 2, rationsPerWorkerDay: 100, requires: [] } });
    const b = member(1, 1, 10, { ...ZERO, gather: { workerDays: 6, rationsPerWorkerDay: 100, requires: [] } });
    const result = run([a, b]);
    const first = result.bands.find(row => row.bandId === 1)!;
    const second = result.bands.find(row => row.bandId === 2)!;
    expect(result.bands.map(row => row.bandId)).toEqual([1, 2]);
    expect(result.produced.gather).toBeCloseTo(PROFILE.rations.summer.gather, 9);
    expect(first.allocated.gather / second.allocated.gather).toBeCloseTo(3, 9);
    expect(result.produced.gather).toBeLessThanOrEqual(result.sharedPotential.gather);
    expect(result.produced.fish).toBe(0);
    expect(result.produced.game).toBe(0);
  });

  it('does not allocate a gated source to a band without its actual required technology', () => {
    const locked = member(1, 1, 10, { ...ZERO, gather: { workerDays: 5, rationsPerWorkerDay: 100, requires: ['farming'] as never[] } });
    const qualified = member(2, 1, 10, { ...ZERO, gather: { workerDays: 1, rationsPerWorkerDay: 100, requires: ['farming'] as never[] } }, closeUnderRequires(['farming']));
    const result = run([locked, qualified]);
    expect(result.bands.find(row => row.bandId === 1)!.allocated.gather).toBe(0);
    expect(result.bands.find(row => row.bandId === 2)!.food.report.producedBySource.gather).toBeGreaterThan(0);

    const invalid = member(3, 1, 2, { ...ZERO, gather: { workerDays: 1, rationsPerWorkerDay: 1, requires: [] } }, ['farming']);
    expect(() => run([invalid])).toThrow(/prerequisites/);
  });

  it("removing a dead band's workers removes its claim and reduces production to remaining labour", () => {
    const worker = { ...ZERO, gather: { workerDays: 4, rationsPerWorkerDay: 100, requires: [] } };
    const activeDay = run([member(1, 1, 4, worker), member(2, 1, 4, worker)]);
    expect(activeDay.produced.gather).toBeCloseTo(PROFILE.rations.summer.gather, 9);

    const dead = member(1, 2, 0);
    const surviving = member(2, 2, 1, { ...ZERO, gather: { workerDays: 1, rationsPerWorkerDay: 1, requires: [] } });
    const reducedDay = advanceCompactBandProductionDay({ profile: PROFILE, season: 'summer', bands: [
      { ...dead, state: activeDay.bands.find(row => row.bandId === 1)!.food.state },
      { ...surviving, state: activeDay.bands.find(row => row.bandId === 2)!.food.state },
    ] });
    expect(reducedDay.bands.find(row => row.bandId === 1)!.allocated.gather).toBe(0);
    expect(reducedDay.bands.find(row => row.bandId === 2)!.food.report.producedBySource.gather).toBe(1);
    expect(reducedDay.produced.gather).toBeLessThan(activeDay.produced.gather);
  });

  it('keeps uncapped potential below the land ceiling when total work is smaller', () => {
    const result = run([member(1, 1, 3, { ...ZERO, fish: { workerDays: 1, rationsPerWorkerDay: 2.5, requires: [] } })]);
    expect(result.bands[0]!.food.report.producedBySource.fish).toBe(2.5);
    expect(result.produced.fish).toBeLessThanOrEqual(PROFILE.rations.summer.fish);
    expect(rationSum(result.produced)).toBe(result.produced.total);
  });

  it('rejects duplicate bands, split dates, and overflow in summed source potential', () => {
    const a = member(1, 1, 2);
    expect(() => run([a, a])).toThrow(/duplicate/);
    const b = member(2, 2, 2);
    expect(() => run([a, b])).toThrow(/same calendar day/);

    const max = Number.MAX_VALUE;
    const overflowProfile = {
      ...PROFILE,
      rations: { ...PROFILE.rations, summer: { gather: max, fish: max, game: 0, total: max } },
    } as ComarcaResourceProfile;
    const overflowWork = {
      ...ZERO,
      gather: { workerDays: 1, rationsPerWorkerDay: max / 2, requires: [] },
      fish: { workerDays: 1, rationsPerWorkerDay: max / 2, requires: [] },
    };
    expect(() => run([member(1, 1, 2, overflowWork)], overflowProfile)).toThrow();
  });

  it("does not mutate the shared profile, inputs or any band's prior food state", () => {
    const bands = [member(1, 1, 10, { ...ZERO, gather: { workerDays: 2, rationsPerWorkerDay: 10, requires: [] } }),
      member(2, 1, 10, { ...ZERO, gather: { workerDays: 2, rationsPerWorkerDay: 10, requires: [] } })];
    const before = JSON.stringify({ bands, profile: PROFILE });
    run(bands);
    expect(JSON.stringify({ bands, profile: PROFILE })).toBe(before);
  });

  it('does not overfeed a band beyond the allocated profile share when advancing its food ledger', () => {
    const a = member(1, 1, 10, { ...ZERO, gather: { workerDays: 5, rationsPerWorkerDay: 1_000, requires: [] } }, [], 0);
    const b = member(2, 1, 10, { ...ZERO, gather: { workerDays: 5, rationsPerWorkerDay: 1_000, requires: [] } }, [], 0);
    const result = run([a, b]);
    for (const row of result.bands) {
      expect(row.food.report.producedBySource.gather).toBeCloseTo(row.allocated.gather, 9);
      expect(row.food.report.produced).toBeLessThanOrEqual(rationSum(row.allocated));
    }
  });
});
