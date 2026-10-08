/** The phase-40d health gate must detect an absent recipe, not pass on n/a. */
import { describe, it, expect } from 'vitest';
import { RECIPES } from '../entities/Recipe.ts';
import { SCENARIOS, runScenario } from '../../../tools/simcheck.ts';

describe('iron-is-carburised health gate', () => {
  it('exercises one real ordered carburising charge with exactly one applicable gate', () => {
    const report = runScenario(SCENARIOS.carburisers!);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]!.skipped).not.toBe(true);
    expect(report.checks[0]).toMatchObject({ id: 'iron-is-carburised', ok: true });
  });

  it('fails when the build has no carburising recipe, despite supplied wrought iron and charcoal', () => {
    const recipe = RECIPES.carburise_steel;
    delete RECIPES.carburise_steel;
    try {
      const report = runScenario(SCENARIOS.carburisers!);
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0]!.skipped).not.toBe(true);
      expect(report.checks[0]).toMatchObject({ id: 'iron-is-carburised', ok: false });
    } finally {
      if (recipe) RECIPES.carburise_steel = recipe;
    }
  });
});
