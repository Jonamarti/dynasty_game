/** The 40e health gate must catch any absent tool recipe; supplied orders stay applicable. */
import { describe, it, expect } from 'vitest';
import { RECIPES } from '../entities/Recipe.ts';
import { SCENARIOS, runScenario } from '../../../tools/simcheck.ts';

const RECIPE_IDS = ['iron_axe', 'iron_adze', 'iron_sickle', 'iron_spade'] as const;

describe('iron-tools-cut-the-day health gate', () => {
  it('crafts every supplied tool and confirms each existing work reader', () => {
    const report = runScenario(SCENARIOS.ironworkers!);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]!.skipped).not.toBe(true);
    expect(report.checks[0]).toMatchObject({ id: 'iron-tools-cut-the-day', ok: true });
  });

  it.each(RECIPE_IDS)('fails as an applicable check when %s has no recipe', recipeId => {
    const recipe = RECIPES[recipeId];
    delete RECIPES[recipeId];
    try {
      const report = runScenario(SCENARIOS.ironworkers!);
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0]!.skipped).not.toBe(true);
      expect(report.checks[0]).toMatchObject({ id: 'iron-tools-cut-the-day', ok: false });
    } finally {
      if (recipe) RECIPES[recipeId] = recipe;
    }
  });
});
