/**
 * Daily food ledger for one compact band, M15 step 1c.
 *
 * This module accounts for conservation only. The geography profile is the land's potential, not a harvest;
 * callers supply measured worker-day rates. No harvest, storage, spoilage or agriculture coefficient is inferred:
 * current regional tables do not measure those quantities.
 *
 * A call is pure and advances exactly one dated day. It uses no random stream, so slicing cannot replenish stock.
 */
import { TECHS, type Tech } from '../knowledge/Tech.ts';
import type { ComarcaResourceProfile } from '../world/ResourceProfile.ts';

export const COMPACT_BAND_FOOD_RECORD_VERSION = 1 as const;
export const COMPACT_BAND_FOOD_SOURCES = ['gather', 'fish', 'game'] as const;
export type CompactBandFoodSource = (typeof COMPACT_BAND_FOOD_SOURCES)[number];
export type CompactBandFoodSeason = 'spring' | 'summer' | 'autumn' | 'winter';

const SEASONS: ReadonlySet<string> = new Set(['spring', 'summer', 'autumn', 'winter']);
const TECH_SET: ReadonlySet<string> = new Set(TECHS);
const RECORD_KEYS = ['recordType', 'version', 'day', 'stockRations', 'storageCapacityRations'].sort();

/** Rations are person-days of food; the storage ceiling is supplied by the owner of this band. */
export interface CompactBandFoodState {
  readonly day: number;
  readonly stockRations: number;
  readonly storageCapacityRations: number;
}

export interface CompactBandFoodRecord {
  readonly recordType: 'CompactBandFoodRecord';
  readonly version: typeof COMPACT_BAND_FOOD_RECORD_VERSION;
  readonly day: number;
  readonly stockRations: number;
  readonly storageCapacityRations: number;
}

/** Explicitly measured harvest capacity per worker-day; omitted coefficients are never inferred. */
export interface CompactBandFoodWorkRate {
  readonly workerDays: number;
  readonly rationsPerWorkerDay: number;
  /** All these techniques must be held for this measured work rate to apply. Empty means no gate. */
  readonly requires: readonly Tech[];
}

export interface CompactBandFoodDayInput {
  /** Must be exactly state.day + 1. */
  readonly day: number;
  readonly season: CompactBandFoodSeason;
  readonly population: number;
  /** Person-days of food needed today, supplied by the caller's explicit need model. */
  readonly demandRations: number;
  /** Already processed edible nutrition expressed in rations; absent means none was supplied. */
  readonly supplementalRations?: number;
  /** One comarca only: ResourceProfile already describes the band's entire compact territory. */
  readonly profile: ComarcaResourceProfile;
  readonly techs: readonly Tech[];
  /** Every source has an explicit measured rate, even when it has zero workers or rate. */
  readonly work: Readonly<Record<CompactBandFoodSource, CompactBandFoodWorkRate>>;
}

export interface CompactBandFoodDayReport {
  readonly day: number;
  readonly producedBySource: Readonly<Record<CompactBandFoodSource, number>>;
  readonly produced: number;
  /** Processed edible rations, separate from wild-resource potential. */
  readonly producedSupplemental: number;
  readonly demand: number;
  readonly consumed: number;
  readonly withdrawn: number;
  readonly stored: number;
  readonly lost: number;
  readonly unmet: number;
  readonly stock: number;
}

function finiteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative`);
}

function validDay(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a safe non-negative integer`);
}

function validateState(state: CompactBandFoodState): void {
  if (!state || typeof state !== 'object') throw new TypeError('food ledger state is required');
  validDay(state.day, 'food ledger day');
  finiteNonNegative(state.stockRations, 'food stock');
  finiteNonNegative(state.storageCapacityRations, 'food storage capacity');
  if (state.stockRations > state.storageCapacityRations) throw new RangeError('food stock exceeds storage capacity');
}

function validateTechs(techs: readonly Tech[], label: string): Set<Tech> {
  if (!Array.isArray(techs)) throw new TypeError(`${label} must be an array`);
  const out = new Set<Tech>();
  for (const tech of techs) {
    if (!TECH_SET.has(tech)) throw new RangeError(`${label} contains an unknown technique: ${String(tech)}`);
    out.add(tech);
  }
  return out;
}

function profilePotential(profile: ComarcaResourceProfile, season: CompactBandFoodSeason): Record<CompactBandFoodSource, number> {
  if (!profile || typeof profile !== 'object' || !profile.rations || typeof profile.rations !== 'object') {
    throw new TypeError('food profile is required');
  }
  if (!SEASONS.has(season)) throw new RangeError(`unknown food season: ${String(season)}`);
  const row = profile.rations[season];
  if (!row || typeof row !== 'object') throw new TypeError(`food profile has no ${season} rations`);
  const potential = { gather: row.gather, fish: row.fish, game: row.game };
  for (const source of COMPACT_BAND_FOOD_SOURCES) finiteNonNegative(potential[source], `profile ${season} ${source} potential`);
  return potential;
}

/** Advance one band food ledger day, conserving all rations and returning a dated report. */
export function advanceCompactBandFoodDay(
  state: CompactBandFoodState,
  input: CompactBandFoodDayInput,
): { readonly state: CompactBandFoodState; readonly report: CompactBandFoodDayReport } {
  validateState(state);
  if (!input || typeof input !== 'object') throw new TypeError('food day input is required');
  if (!Number.isSafeInteger(state.day + 1) || input.day !== state.day + 1) {
    throw new RangeError(`food ledger must advance one day: ${state.day} -> ${input.day}`);
  }
  validDay(input.day, 'food input day');
  if (!Number.isSafeInteger(input.population) || input.population < 0) throw new RangeError('food population must be a non-negative integer');
  finiteNonNegative(input.demandRations, 'food demand');
  const supplemental = input.supplementalRations ?? 0;
  finiteNonNegative(supplemental, 'supplemental food production');
  const known = validateTechs(input.techs, 'food techniques');
  const potential = profilePotential(input.profile, input.season);

  // Copy all work values and gates; the ledger neither retains nor mutates caller-owned snapshots.
  const work = {} as Record<CompactBandFoodSource, CompactBandFoodWorkRate>;
  let totalWorkerDays = 0;
  for (const source of COMPACT_BAND_FOOD_SOURCES) {
    const row = input.work?.[source];
    if (!row || typeof row !== 'object') throw new TypeError(`missing explicit work rate for ${source}`);
    finiteNonNegative(row.workerDays, `${source} worker-days`);
    finiteNonNegative(row.rationsPerWorkerDay, `${source} rations per worker-day`);
    const requires = validateTechs(row.requires, `${source} required techniques`);
    work[source] = { workerDays: row.workerDays, rationsPerWorkerDay: row.rationsPerWorkerDay, requires: [...requires] };
    totalWorkerDays += row.workerDays;
  }
  if (totalWorkerDays > input.population) throw new RangeError('food worker-days exceed band population');

  const producedBySource = {} as Record<CompactBandFoodSource, number>;
  for (const source of COMPACT_BAND_FOOD_SOURCES) {
    const rate = work[source]!;
    const eligible = rate.requires.every(tech => known.has(tech));
    const labourLimit = eligible ? rate.workerDays * rate.rationsPerWorkerDay : 0;
    // One profile is one comarca; repeated comarcas require their own measured profile.
    producedBySource[source] = Math.min(potential[source], labourLimit);
  }
  const produced = COMPACT_BAND_FOOD_SOURCES.reduce((sum, source) => sum + producedBySource[source]!, supplemental);
  finiteNonNegative(produced, 'food production');
  const demand = input.demandRations;
  let withdrawn = 0, stored = 0, lost = 0, unmet = 0, consumed: number;
  if (produced >= demand) {
    consumed = demand;
    const excess = produced - demand;
    stored = Math.min(excess, state.storageCapacityRations - state.stockRations);
    lost = excess - stored;
  } else {
    const deficit = demand - produced;
    withdrawn = Math.min(deficit, state.stockRations);
    unmet = deficit - withdrawn;
    consumed = produced + withdrawn;
  }
  const stock = state.stockRations - withdrawn + stored;
  const nextState: CompactBandFoodState = {
    day: input.day,
    stockRations: stock,
    storageCapacityRations: state.storageCapacityRations,
  };
  const report: CompactBandFoodDayReport = {
    day: input.day, producedBySource, produced, producedSupplemental: supplemental,
    demand, consumed, withdrawn, stored, lost, unmet, stock,
  };
  return { state: nextState, report };
}

/** JSON-compatible v1 record for a checkpoint; state validation is shared with the daily API. */
export function toCompactBandFoodRecord(state: CompactBandFoodState): CompactBandFoodRecord {
  validateState(state);
  return {
    recordType: 'CompactBandFoodRecord', version: COMPACT_BAND_FOOD_RECORD_VERSION,
    day: state.day, stockRations: state.stockRations, storageCapacityRations: state.storageCapacityRations,
  };
}

/** Restore a detached ledger state, refusing extra/missing fields, unknown versions, and overfull stores. */
export function fromCompactBandFoodRecord(value: unknown): CompactBandFoodState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('food ledger record must be an object');
  const record = value as Partial<CompactBandFoodRecord>;
  const keys = Object.keys(record).sort();
  if (keys.length !== RECORD_KEYS.length || keys.some((key, index) => key !== RECORD_KEYS[index])) {
    throw new RangeError('food ledger record fields do not match v1');
  }
  if (record.recordType !== 'CompactBandFoodRecord' || record.version !== COMPACT_BAND_FOOD_RECORD_VERSION) {
    throw new RangeError('unsupported compact band food record');
  }
  const state: CompactBandFoodState = {
    day: record.day as number,
    stockRations: record.stockRations as number,
    storageCapacityRations: record.storageCapacityRations as number,
  };
  validateState(state);
  return state;
}
