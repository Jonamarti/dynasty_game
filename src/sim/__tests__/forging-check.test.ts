/** The phase-40c health gate must detect an absent forge, not pass on n/a. */
import { describe, it, expect } from 'vitest';
import { RECIPES } from '../entities/Recipe.ts';
import { SCENARIOS, runScenario } from '../../../tools/simcheck.ts';

describe('iron-bloom-becomes-wrought-iron health gate', () => {
  it('exercises one real ordered forge with exactly one applicable gate', () => {
    const report = runScenario(SCENARIOS.forgers!);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]!.skipped).not.toBe(true);
    expect(report.checks[0]).toMatchObject({ id: 'iron-bloom-becomes-wrought-iron', ok: true });
  });

  it('fails when the build has no forge recipe, despite a supplied bloom', () => {
    const recipe = RECIPES.forge_iron;
    delete RECIPES.forge_iron;
    try {
      const report = runScenario(SCENARIOS.forgers!);
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0]!.skipped).not.toBe(true);
      expect(report.checks[0]).toMatchObject({ id: 'iron-bloom-becomes-wrought-iron', ok: false });
    } finally {
      if (recipe) RECIPES.forge_iron = recipe;
    }
  });
});
