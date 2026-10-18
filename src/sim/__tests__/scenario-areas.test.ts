import { describe, expect, it } from 'vitest';
import { FIXTURE_RECIPES } from '../../../tools/fixtures.ts';
import { SCENARIOS } from '../../../tools/simcheck.ts';

const areas = new Set(['foresight', 'assembly', 'objects', 'bands', 'discovery', 'player', 'world', 'shelter', 'base']);

describe('scenario area and fixture metadata', () => {
  it('tags every scenario with known areas', () => {
    for (const scenario of Object.values(SCENARIOS)) {
      expect(scenario.areas?.length, scenario.name).toBeGreaterThan(0);
      for (const area of scenario.areas ?? []) expect(areas.has(area), `${scenario.name}: ${area}`).toBe(true);
    }
  });

  it('has one short -from scenario for every fixture recipe', () => {
    const fromScenarios = Object.values(SCENARIOS).filter(scenario => scenario.name.endsWith('-from'));
    expect(fromScenarios).toHaveLength(FIXTURE_RECIPES.length);
    for (const recipe of FIXTURE_RECIPES) {
      const scenario = SCENARIOS[`${recipe.scenario}-from`];
      const original = SCENARIOS[recipe.scenario]!;
      expect(scenario, recipe.name).toBeDefined();
      expect(scenario!.world).toBe(recipe.name);
      expect(scenario!.steps).toBeGreaterThan(0);
      expect(scenario!.steps).toBeLessThanOrEqual(Math.floor(original.steps / 3));
    }
  });
});
