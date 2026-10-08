import { describe, it, expect } from 'vitest';
import { RECIPES } from '../entities/Recipe.ts';
import { TECH } from '../knowledge/Tech.ts';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';

function oxenCheck() {
  return runScenario(SCENARIOS.ploughmen!, 0).checks.find(check => check.id === 'oxen-turn-the-field')!;
}

describe('the plough health gate', () => {
  it('fails when the recipe or technology node is removed', () => {
    const recipe = RECIPES.iron_plough;
    try {
      delete RECIPES.iron_plough;
      const missingRecipe = oxenCheck();
      expect(missingRecipe.ok).toBe(false);
      expect(missingRecipe.detail).toContain('recipe false');
    } finally {
      RECIPES.iron_plough = recipe!;
    }

    const node = TECH.ploughshare;
    try {
      delete (TECH as unknown as Record<string, unknown>).ploughshare;
      const scenario = SCENARIOS.ploughmen!;
      const population = scenario.config.population!;
      const withoutNode = {
        ...scenario,
        config: {
          ...scenario.config,
          population: {
            ...population,
            startingTech: population.startingTech?.filter(tech => tech !== 'ploughshare'),
          },
        },
      };
      const missingNode = runScenario(withoutNode, 0).checks.find(check => check.id === 'oxen-turn-the-field')!;
      expect(missingNode.ok).toBe(false);
      expect(missingNode.detail).toContain('node false');
    } finally {
      (TECH as unknown as Record<string, unknown>).ploughshare = node;
    }
  });
});
