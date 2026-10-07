/** The phase-40 health gate must detect the absent smelt, not pass on n/a. */
import { describe, it, expect } from 'vitest';
import { RECIPES } from '../entities/Recipe.ts';
import { SCENARIOS, runScenario } from '../../../tools/simcheck.ts';

describe('iron-ore-becomes-bloom health gate', () => {
  it('exercises a real ordered smelt with exactly one applicable gate', () => {
    const report = runScenario(SCENARIOS.ironsmiths!);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]!.skipped).not.toBe(true);
    expect(report.checks[0]).toMatchObject({ id: 'iron-ore-becomes-bloom', ok: true });
  });

  it('fails when the build has no iron recipe, despite a supplied charge', () => {
    const recipe = RECIPES.smelt_iron;
    delete RECIPES.smelt_iron;
    try {
      const report = runScenario(SCENARIOS.ironsmiths!);
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0]!.skipped).not.toBe(true);
      expect(report.checks[0]).toMatchObject({ id: 'iron-ore-becomes-bloom', ok: false });
    } finally {
      if (recipe) RECIPES.smelt_iron = recipe;
    }
  });
});
