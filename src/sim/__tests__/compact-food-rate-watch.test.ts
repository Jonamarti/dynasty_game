import { describe, expect, it } from 'vitest';
import { RATION_NUTRITION } from '../world/ResourceProfile.ts';
import { recordCompactFoodRates } from '../compact/CompactFoodRateWatch.ts';
const climate = { spring: { days: 1, meanAmbientTemperature: 12 }, summer: { days: 0, meanAmbientTemperature: null },
  autumn: { days: 0, meanAmbientTemperature: null }, winter: { days: 0, meanAmbientTemperature: null } } as const;
const base = { seed: 'rate-watch', scenario: 'single-band', elapsedDays: 1, ticksPerDay: 240,
  initialPopulation: 12, finalPopulation: 11, observedPersonDays: 11, livingAdultTicks: 2400, livingPersonTicks: 4800,
  startingTechs: [] as string[], endingKnownTechs: [] as string[], climate, telemetry: {} as Record<string, number> };

describe('compact food rate observation', () => {
  it('converts nutrition to rations per productive worker-day and reports missing sources as n/a', () => {
    const record = recordCompactFoodRates({ ...base, telemetry: {
      compact_food_nutrition_gather: 3 * RATION_NUTRITION, compact_food_work_ticks_gather: 60,
      compact_food_nutrition_game: RATION_NUTRITION, compact_food_work_ticks_game: 12,
    } });
    expect(record.recordType).toBe('CompactFoodRateWatchRecord');
    expect(record.sources.gather.rations).toBeCloseTo(3, 12);
    expect(record.sources.gather.rationsPerProductiveWorkerDay).toBeCloseTo(12, 12);
    expect(record.sources.gather.shareOfLivingPersonTicks).toBe(0.0125);
    expect(record.sources.game.rationsPerProductiveWorkerDay).toBeCloseTo(20, 12);
    expect(record.sources.fish.coverage).toBe('n/a');
    expect(record.sources.fish.rationsPerProductiveWorkerDay).toBeNull();
  });

  it('reads a frozen telemetry snapshot without mutating it', () => {
    const telemetry = Object.freeze({ compact_food_nutrition_fish: 18, compact_food_work_ticks_fish: 6 });
    const before = JSON.stringify(telemetry);
    recordCompactFoodRates({ ...base, telemetry });
    expect(JSON.stringify(telemetry)).toBe(before);
  });

  it('reports farm and food-processing output against observed work and consumed materials', () => {
    const record = recordCompactFoodRates({ ...base, telemetry: {
      compact_production_work_ticks_farm: 20,
      compact_production_input_farm_grain: 2,
      compact_production_output_farm_grain: 8,
      compact_production_work_ticks_processing: 10,
      compact_production_input_processing_fish: 2,
      compact_production_input_processing_salt: 1,
      compact_production_output_processing_roast_fish: 2,
    } });
    expect(record.version).toBe(2);
    expect(record.production.actions.farm.inputItems).toEqual({ grain: 2 });
    expect(record.production.actions.farm.outputItems).toEqual({ grain: 8 });
    expect(record.production.actions.farm.outputUnitsPerWorkTick).toBe(0.4);
    expect(record.production.actions.farm.netNutritionPerWorkTick).toBe(0);
    expect(record.production.actions.processing.inputItems).toEqual({ fish: 2, salt: 1 });
    expect(record.production.actions.processing.outputItems).toEqual({ roast_fish: 2 });
    expect(record.production.actions.processing.netNutrition).toBe(12);
    expect(record.production.actions.processing.netNutritionPerWorkTick).toBe(1.2);
    expect(record.production.actions.processing.materialWithoutWork).toBe(false);
  });

  it('flags material output with no observed work as a measurement negative control', () => {
    const record = recordCompactFoodRates({ ...base, telemetry: {
      compact_production_output_processing_roast_meat: 1,
    } });
    expect(record.production.actions.processing.coverage).toBe('n/a');
    expect(record.production.actions.processing.netNutritionPerWorkTick).toBeNull();
    expect(record.production.actions.processing.materialWithoutWork).toBe(true);
  });

  it('rejects malformed counts and non-finite nutrition observations', () => {
    expect(() => recordCompactFoodRates({ ...base, elapsedDays: -1 })).toThrow(/elapsedDays/);
    expect(() => recordCompactFoodRates({ ...base, telemetry: { compact_food_nutrition_fish: Infinity } })).toThrow(/finite/);
    expect(() => recordCompactFoodRates({ ...base, ticksPerDay: Number.MAX_SAFE_INTEGER, telemetry: {
      compact_food_nutrition_gather: Number.MAX_VALUE, compact_food_work_ticks_gather: 1 } })).toThrow(/finite/);
    expect(() => recordCompactFoodRates({ ...base, climate: { ...climate, spring: { days: 0, meanAmbientTemperature: 12 } } })).toThrow(/null temperature/);
    expect(() => recordCompactFoodRates({ ...base, climate: { ...climate, spring: { days: 0, meanAmbientTemperature: null }, summer: { days: 0, meanAmbientTemperature: null } } })).toThrow(/add up/);
  });
});
