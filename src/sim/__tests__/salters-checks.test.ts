import { afterEach, describe, expect, it } from 'vitest';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { telemetry } from '../core/Telemetry.ts';

afterEach(() => { telemetry.disable(); telemetry.reset(); });

describe('salters checks detect real preservation', () => {
  it('reports actual winter meals without hiding a failure behind n/a', () => {
    const report = runScenario(SCENARIOS.salters!);
    const check = report.checks.find(check => check.id === 'preserved-food-lasts')!;
    const meals = report.telemetry.salters_winter_meals_knowing ?? 0;
    const preserved = report.telemetry.salters_winter_preserved_knowing ?? 0;
    expect(meals).toBeGreaterThan(0);
    expect(check.ok).toBe(meals > 0 && preserved > 0);
    expect(check.skipped).not.toBe(true);
    expect(report.checks.some(check => check.id === 'spoilage-is-answered')).toBe(false);
    const losses = Object.entries(report.telemetry).filter(([key]) => /^spoiled_band_\d+_nutrition$/.test(key));
    expect(losses.length).toBeGreaterThanOrEqual(2);
    expect(losses.every(([, nutrition]) => nutrition > 0)).toBe(true);
  });

  it('fails without any working preservation food recipe, even with the same knowledge and supplied stations', () => {
    const ids = ['dried_meat', 'dried_fish', 'smoked_meat', 'smoked_fish', 'salted_meat', 'salted_fish', 'pemmican'];
    const saved = new Map(ids.map(id => [id, RECIPES[id]!]));
    try {
      for (const id of ids) delete RECIPES[id];
      const report = runScenario(SCENARIOS.salters!);
      expect(report.checks.find(check => check.id === 'preserved-food-lasts')?.ok).toBe(false);
      expect(report.checks.some(check => check.id === 'spoilage-is-answered')).toBe(false);
    } finally { for (const [id, recipe] of saved) RECIPES[id] = recipe; }
  });
});
