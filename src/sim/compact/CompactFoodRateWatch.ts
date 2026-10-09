/**
 * Read-only report adapter for detailed-model food production observations.
 * ActionSystem emits raw nutrition units and productive work ticks only when telemetry is enabled; this module converts
 * them into person-day rations using the shared scale and reports work allocation against living adult ticks.
 */
import { RATION_NUTRITION } from '../world/ResourceProfile.ts';
import { COMPACT_BAND_FOOD_SOURCES, type CompactBandFoodSeason, type CompactBandFoodSource } from './CompactBandFood.ts';
export const COMPACT_FOOD_RATE_WATCH_RECORD_VERSION = 1 as const;
export type CompactFoodRateCoverage = 'measured' | 'n/a';
export interface CompactFoodSeasonObservation { readonly days: number; readonly meanAmbientTemperature: number | null }
export interface CompactFoodSourceRateRecord {
  readonly nutritionUnits: number; readonly rations: number; readonly workTicks: number;
  /** Yield per productive task tick scaled to a day; walking, searching and idle time are excluded. */
  readonly rationsPerProductiveWorkerDay: number | null;
  /** Share of observed living-adult ticks spent in this source's productive work actions. */
  readonly shareOfLivingPersonTicks: number | null;
  readonly coverage: CompactFoodRateCoverage;
}
export interface CompactFoodRateWatchInput {
  readonly seed: string; readonly scenario: string; readonly elapsedDays: number; readonly ticksPerDay: number;
  readonly initialPopulation: number; readonly finalPopulation: number; readonly observedPersonDays: number;
  readonly livingAdultTicks: number; readonly livingPersonTicks: number; readonly startingTechs: readonly string[]; readonly endingKnownTechs: readonly string[];
  readonly climate: Readonly<Record<CompactBandFoodSeason, CompactFoodSeasonObservation>>;
  readonly telemetry: Readonly<Record<string, number>>;
}
export interface CompactFoodRateWatchRecord {
  readonly recordType: 'CompactFoodRateWatchRecord'; readonly version: typeof COMPACT_FOOD_RATE_WATCH_RECORD_VERSION;
  readonly seed: string; readonly scenario: string; readonly elapsedDays: number; readonly ticksPerDay: number;
  readonly initialPopulation: number; readonly finalPopulation: number; readonly observedPersonDays: number;
  readonly livingAdultTicks: number; readonly livingPersonTicks: number; readonly startingTechs: readonly string[]; readonly endingKnownTechs: readonly string[];
  readonly climate: Readonly<Record<CompactBandFoodSeason, CompactFoodSeasonObservation>>;
  readonly temperatureScale: 'simulation temperature units';
  readonly interpretation: 'single-seed mechanism observation; not a calibrated forecast';
  readonly sources: Readonly<Record<CompactBandFoodSource, CompactFoodSourceRateRecord>>;
  readonly crossChecks: Readonly<Record<string, number>>;
}
const SEASONS: readonly CompactBandFoodSeason[] = ['spring', 'summer', 'autumn', 'winter'];
function nonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative`);
}
function counter(snapshot: Readonly<Record<string, number>>, key: string): number {
  const value = snapshot[key] ?? 0; nonNegative(value, `telemetry ${key}`); return value;
}
function safeList(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || value.length === 0)) throw new TypeError(`${label} must be a list of non-empty strings`);
  return Object.freeze([...new Set(values)].sort());
}

/** Build a detached JSON-safe report; missing source coverage is `n/a`, never an invented zero-rate measurement. */
export function recordCompactFoodRates(input: CompactFoodRateWatchInput): CompactFoodRateWatchRecord {
  if (!input || typeof input !== 'object') throw new TypeError('food rate observation metadata is required');
  if (typeof input.seed !== 'string' || input.seed.length === 0) throw new TypeError('food rate observation seed is required');
  if (typeof input.scenario !== 'string' || input.scenario.length === 0) throw new TypeError('food rate observation scenario is required');
  const metadata = { elapsedDays: input.elapsedDays, ticksPerDay: input.ticksPerDay, initialPopulation: input.initialPopulation,
    finalPopulation: input.finalPopulation, observedPersonDays: input.observedPersonDays, livingAdultTicks: input.livingAdultTicks, livingPersonTicks: input.livingPersonTicks };
  for (const [key, value] of Object.entries(metadata)) nonNegative(value, key);
  if (!Number.isSafeInteger(input.elapsedDays) || !Number.isSafeInteger(input.ticksPerDay) || input.ticksPerDay === 0 ||
      !Number.isSafeInteger(input.initialPopulation) || !Number.isSafeInteger(input.finalPopulation) ||
      !Number.isSafeInteger(input.observedPersonDays) || !Number.isSafeInteger(input.livingAdultTicks) || !Number.isSafeInteger(input.livingPersonTicks)) throw new RangeError('food rate metadata counts must be safe integers');
  if (!input.telemetry || typeof input.telemetry !== 'object' || Array.isArray(input.telemetry)) throw new TypeError('telemetry snapshot is required');
  if (!input.climate || typeof input.climate !== 'object' || SEASONS.some(season => !input.climate[season])) throw new TypeError('climate observation for all seasons is required');
  let summedClimateDays = 0;
  const climate = Object.fromEntries(SEASONS.map(season => {
    const row = input.climate[season];
    nonNegative(row.days, `${season} days`);
    if (!Number.isSafeInteger(row.days)) throw new RangeError(`${season} days must be an integer`);
    summedClimateDays += row.days;
    if (row.days === 0 && row.meanAmbientTemperature !== null) throw new RangeError(`${season} with no observed days must have null temperature`);
    if (row.days > 0 && row.meanAmbientTemperature === null) throw new RangeError(`${season} with observed days requires a temperature`);
    if (row.meanAmbientTemperature !== null && !Number.isFinite(row.meanAmbientTemperature)) throw new RangeError(`${season} mean ambient temperature must be finite or null`);
    return [season, Object.freeze({ ...row })];
  })) as Record<CompactBandFoodSeason, CompactFoodSeasonObservation>;
  if (summedClimateDays !== input.elapsedDays) throw new RangeError('season day counts must add up to elapsed days');

  const sources = Object.fromEntries(COMPACT_BAND_FOOD_SOURCES.map(source => {
    const nutritionUnits = counter(input.telemetry, `compact_food_nutrition_${source}`);
    const workTicks = counter(input.telemetry, `compact_food_work_ticks_${source}`);
    if (!Number.isSafeInteger(workTicks)) throw new RangeError(`${source} work ticks must be a safe integer`);
    const rations = nutritionUnits / RATION_NUTRITION;
    nonNegative(rations, `${source} rations`);
    const rationsPerProductiveWorkerDay = workTicks > 0 ? rations / workTicks * input.ticksPerDay : null;
    const shareOfLivingPersonTicks = input.livingPersonTicks > 0 ? workTicks / input.livingPersonTicks : null;
    if (rationsPerProductiveWorkerDay !== null) nonNegative(rationsPerProductiveWorkerDay, `${source} worker-day rate`);
    if (shareOfLivingPersonTicks !== null) nonNegative(shareOfLivingPersonTicks, `${source} living-person-tick share`);
    return [source, Object.freeze({ nutritionUnits, rations, workTicks, rationsPerProductiveWorkerDay,
      shareOfLivingPersonTicks, coverage: nutritionUnits > 0 && workTicks > 0 ? 'measured' : 'n/a' })];
  })) as Record<CompactBandFoodSource, CompactFoodSourceRateRecord>;
  const crossChecks = Object.freeze({
    fishHarvestEvents: counter(input.telemetry, 'harvest_fish'),
    meatYieldUnitsGross: counter(input.telemetry, 'harvest_meat'),
    berryHarvestEvents: counter(input.telemetry, 'harvest_berries'),
    huntKills: counter(input.telemetry, 'hunt_killed'),
  });
  return Object.freeze({
    recordType: 'CompactFoodRateWatchRecord', version: COMPACT_FOOD_RATE_WATCH_RECORD_VERSION,
    seed: input.seed, scenario: input.scenario, elapsedDays: input.elapsedDays, ticksPerDay: input.ticksPerDay,
    initialPopulation: input.initialPopulation, finalPopulation: input.finalPopulation,
    observedPersonDays: input.observedPersonDays, livingAdultTicks: input.livingAdultTicks, livingPersonTicks: input.livingPersonTicks,
    startingTechs: safeList(input.startingTechs, 'starting techniques'), endingKnownTechs: safeList(input.endingKnownTechs, 'ending known techniques'),
    climate: Object.freeze(climate), temperatureScale: 'simulation temperature units',
    interpretation: 'single-seed mechanism observation; not a calibrated forecast',
    sources: Object.freeze(sources), crossChecks,
  });
}
