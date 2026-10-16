import { afterEach, describe, expect, it } from 'vitest';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { telemetry } from '../core/Telemetry.ts';
import { Simulation } from '../core/Simulation.ts';
import { isPreservedFood, observeSalters, setupSalters } from '../../../tools/saltersFixture.ts';

afterEach(() => { telemetry.disable(); telemetry.reset(); });

describe('salters checks detect real preservation', () => {
  it('reports actual winter meals without hiding a failure behind n/a', () => {
    const report = runScenario(SCENARIOS.salters!);
    const check = report.checks.find(check => check.id === 'preserved-food-lasts')!;
    const meals = report.telemetry.salters_winter_meals_knowing ?? 0;
    const preserved = report.telemetry.salters_winter_preserved_knowing ?? 0;
    expect(meals).toBeGreaterThan(0);
    expect(preserved).toBeGreaterThan(0);
    expect(check.ok).toBe(true);
    expect(check.ok).toBe(meals > 0 && preserved > 0);
    expect(check.skipped).not.toBe(true);
    // These are instrumentation bounds, not a gameplay target: other food
    // selection or hunger can move as the mechanics evolve. Every measured
    // hunger/selector observation must remain a subset of carrier person-ticks.
    const carrierTicks = report.telemetry.salters_winter_preserved_carrier_ticks_knowing ?? 0;
    const hunger40Ticks = report.telemetry.salters_winter_preserved_carrier_hunger40_ticks_knowing ?? 0;
    const hunger60Ticks = report.telemetry.salters_winter_preserved_carrier_hunger60_ticks_knowing ?? 0;
    const preservedBest = report.telemetry.salters_winter_preserved_best_food_ticks_knowing ?? 0;
    const otherBest = report.telemetry.salters_winter_other_food_best_ticks_with_preserved_knowing ?? 0;
    expect(carrierTicks).toBeGreaterThan(0);
    expect(hunger40Ticks).toBeLessThanOrEqual(carrierTicks);
    expect(hunger60Ticks).toBeLessThanOrEqual(hunger40Ticks);
    expect(preservedBest + otherBest).toBeLessThanOrEqual(carrierTicks);
    expect(report.checks.some(check => check.id === 'spoilage-is-answered')).toBe(false);
    const losses = Object.entries(report.telemetry).filter(([key]) => /^spoiled_band_\d+_nutrition$/.test(key));
    expect(losses.length).toBeGreaterThanOrEqual(2);
    expect(losses.every(([, nutrition]) => nutrition > 0)).toBe(true);
  });

  it('counts a real winter preserved meal and stops attributing it when its recipes are absent', () => {
    const ids = ['dried_meat', 'dried_fish', 'smoked_meat', 'smoked_fish', 'salted_meat', 'salted_fish', 'pemmican'];
    const saved = new Map(ids.map(id => [id, RECIPES[id]!]));
    const eatOneWinterPreservedMeal = (): void => {
      telemetry.reset(); telemetry.enable();
      const sim = new Simulation(SCENARIOS.salters!.config);
      setupSalters(sim);
      const person = sim.livingPeople()[0]!;
      for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
      person.inventory.add('dried_meat', 1);
      person.eatenToday.clear();
      person.needs.hunger = 60;
      // startDay=4 and two days per season: day 6 is winter.
      sim.time.tick = sim.config.time.ticksPerDay * 2;
      expect(sim.time.season).toBe('winter');
      expect(sim.eatItem(person, 'dried_meat')).toBe(true);
      observeSalters(sim);
      expect(telemetry.get('salters_winter_meals_knowing')).toBe(1);
    };
    try {
      expect(isPreservedFood('dried_meat')).toBe(true);
      eatOneWinterPreservedMeal();
      expect(telemetry.get('salters_winter_preserved_knowing')).toBe(1);

      for (const id of ids) delete RECIPES[id];
      expect(isPreservedFood('dried_meat')).toBe(false);
      eatOneWinterPreservedMeal();
      expect(telemetry.get('salters_winter_preserved_knowing')).toBe(0);
    } finally { for (const [id, recipe] of saved) RECIPES[id] = recipe; }
  });
});
