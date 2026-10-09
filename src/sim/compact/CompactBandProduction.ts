/**
 * Shared daily production for compact bands occupying one comarca (M15 phase 1c).
 *
 * ResourceProfile is the comarca's total potential. This module divides each source's potential among all
 * submitted bands in proportion to their eligible measured worker-day yields, so two bands cannot harvest the same
 * bush, shoal or herd replacement. Work rates remain caller-supplied measurements; this module adds no yield factor.
 */
import { TECH, TECHS, type Tech } from '../knowledge/Tech.ts';
import {
  advanceCompactBandFoodDay, COMPACT_BAND_FOOD_SOURCES,
  type CompactBandFoodDayInput, type CompactBandFoodDayReport, type CompactBandFoodSeason,
  type CompactBandFoodSource, type CompactBandFoodState,
} from './CompactBandFood.ts';
import type { ComarcaResourceProfile, SourceRations } from '../world/ResourceProfile.ts';

export interface CompactBandProductionMember {
  readonly bandId: number;
  readonly state: CompactBandFoodState;
  readonly input: Omit<CompactBandFoodDayInput, 'profile'>;
}

export interface CompactBandProductionInput {
  /** All submitted bands must occupy this same comarca today. */
  readonly profile: ComarcaResourceProfile;
  readonly season: CompactBandFoodSeason;
  readonly bands: readonly CompactBandProductionMember[];
}

export interface CompactBandProductionBandResult {
  readonly bandId: number;
  /** This band's share of potential before its own labour ceiling is applied. */
  readonly allocated: SourceRations;
  readonly food: { readonly state: CompactBandFoodState; readonly report: CompactBandFoodDayReport };
}

export interface CompactBandProductionDayResult {
  readonly day: number | null;
  readonly season: CompactBandFoodSeason;
  readonly sharedPotential: SourceRations;
  /** Actual production summed across the bands. Always at most sharedPotential by source. */
  readonly produced: SourceRations;
  readonly bands: readonly CompactBandProductionBandResult[];
}

const KNOWN_TECHS = new Set<string>(TECHS);

function finiteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative`);
}
function validId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a safe non-negative integer`);
}
function validTechs(values: readonly Tech[], label: string, requireClosure = true): Set<Tech> {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  const set = new Set<Tech>();
  for (const value of values) {
    if (!KNOWN_TECHS.has(value)) throw new RangeError(`${label} contains unknown technique ${String(value)}`);
    set.add(value);
  }
  for (const tech of requireClosure ? set : []) if (!TECH[tech].requires.every(required => set.has(required))) {
    throw new RangeError(`${label} contains ${tech} without its prerequisites`);
  }
  return set;
}

function potentials(profile: ComarcaResourceProfile, season: CompactBandFoodSeason): SourceRations {
  if (!profile || typeof profile !== 'object' || !profile.rations || typeof profile.rations !== 'object') {
    throw new TypeError('one comarca resource profile is required');
  }
  const row = profile.rations[season];
  if (!row || typeof row !== 'object') throw new TypeError(`profile has no ${season} resource row`);
  const result = { gather: row.gather, fish: row.fish, game: row.game, total: 0 };
  for (const source of COMPACT_BAND_FOOD_SOURCES) finiteNonNegative(result[source], `${season} ${source} potential`);
  result.total = result.gather + result.fish + result.game;
  finiteNonNegative(result.total, `${season} total potential`);
  return result;
}

/**
 * Advance a whole comarca's compact food ledgers in one batch. Source potential is split proportional to each
 * band's eligible measured labour. Bands with no living workers or missing a required technique receive no share.
 */
export function advanceCompactBandProductionDay(input: CompactBandProductionInput): CompactBandProductionDayResult {
  if (!input || typeof input !== 'object') throw new TypeError('compact band production input is required');
  if (!Array.isArray(input.bands)) throw new TypeError('compact bands must be an array');
  const sharedPotential = potentials(input.profile, input.season);
  if (input.bands.length === 0) return { day: null, season: input.season, sharedPotential, produced: { gather: 0, fish: 0, game: 0, total: 0 }, bands: [] };

  const sorted = [...input.bands].sort((a, b) => a.bandId - b.bandId);
  const ids = new Set<number>();
  let day: number | null = null;
  const limits = new Map<number, Record<CompactBandFoodSource, number>>();
  for (const band of sorted) {
    if (!band || typeof band !== 'object') throw new TypeError('compact band input must be an object');
    validId(band.bandId, 'band id');
    if (ids.has(band.bandId)) throw new RangeError(`duplicate compact band ${band.bandId}`);
    ids.add(band.bandId);
    if (!band.input || band.input.season !== input.season) throw new RangeError(`band ${band.bandId} season differs from shared comarca season`);
    if (day === null) day = band.input.day;
    else if (band.input.day !== day) throw new RangeError('all compact bands must advance the same calendar day');
    const known = validTechs(band.input.techs, `band ${band.bandId} techniques`);
    let workerDays = 0;
    const row = {} as Record<CompactBandFoodSource, number>;
    for (const source of COMPACT_BAND_FOOD_SOURCES) {
      const rate = band.input.work?.[source];
      if (!rate || typeof rate !== 'object') throw new TypeError(`missing explicit work rate for ${source} in band ${band.bandId}`);
      finiteNonNegative(rate.workerDays, `${source} worker-days for band ${band.bandId}`);
      finiteNonNegative(rate.rationsPerWorkerDay, `${source} rate for band ${band.bandId}`);
      workerDays += rate.workerDays;
      const required = validTechs(rate.requires, `${source} requirements for band ${band.bandId}`, false);
      const eligible = [...required].every(tech => known.has(tech));
      row[source] = eligible ? rate.workerDays * rate.rationsPerWorkerDay : 0;
      finiteNonNegative(row[source], `${source} labour yield for band ${band.bandId}`);
    }
    if (!Number.isSafeInteger(band.input.population) || band.input.population < 0 || workerDays > band.input.population) {
      throw new RangeError(`food worker-days exceed the living population in band ${band.bandId}`);
    }
    limits.set(band.bandId, row);
  }

  const allocations = new Map<number, Record<CompactBandFoodSource, number>>();
  for (const source of COMPACT_BAND_FOOD_SOURCES) {
    let totalLabour = 0;
    for (const band of sorted) {
      totalLabour += limits.get(band.bandId)![source]!;
      finiteNonNegative(totalLabour, `${source} shared labour`);
    }
    const totalHarvest = Math.min(sharedPotential[source], totalLabour);
    let assigned = 0;
    const active = sorted.filter(band => limits.get(band.bandId)![source]! > 0);
    for (let index = 0; index < active.length; index++) {
      const band = active[index]!;
      const labour = limits.get(band.bandId)![source]!;
      const remaining = Math.max(0, totalHarvest - assigned);
      const allocation = index === active.length - 1
        ? Math.min(labour, remaining)
        : Math.min(labour, remaining, totalHarvest * (labour / totalLabour));
      const row = allocations.get(band.bandId) ?? { gather: 0, fish: 0, game: 0 };
      row[source] = allocation;
      allocations.set(band.bandId, row);
      assigned += allocation;
    }
  }

  const producedBySource: Record<CompactBandFoodSource, number> = { gather: 0, fish: 0, game: 0 };
  const bands: CompactBandProductionBandResult[] = [];
  for (const band of sorted) {
    const allocated = allocations.get(band.bandId) ?? { gather: 0, fish: 0, game: 0 };
    const seasonRow = input.profile.rations[input.season];
    const allocatedProfile: ComarcaResourceProfile = {
      ...input.profile,
      rations: {
        ...input.profile.rations,
        [input.season]: {
          ...seasonRow,
          gather: allocated.gather,
          fish: allocated.fish,
          game: allocated.game,
          total: allocated.gather + allocated.fish + allocated.game,
        },
      },
    };
    const food = advanceCompactBandFoodDay(band.state, { ...band.input, profile: allocatedProfile });
    for (const source of COMPACT_BAND_FOOD_SOURCES) producedBySource[source] += food.report.producedBySource[source];
    bands.push({
      bandId: band.bandId,
      allocated: { ...allocated, total: allocated.gather + allocated.fish + allocated.game },
      food,
    });
  }
  const produced: SourceRations = { ...producedBySource, total: producedBySource.gather + producedBySource.fish + producedBySource.game };
  finiteNonNegative(produced.total, `${input.season} total shared production`);
  for (const source of COMPACT_BAND_FOOD_SOURCES) {
    if (produced[source] > sharedPotential[source] + Number.EPSILON * Math.max(1, sharedPotential[source]) * 4) {
      throw new RangeError(`${source} shared production exceeds comarca potential`);
    }
  }
  return { day, season: input.season, sharedPotential, produced, bands };
}

