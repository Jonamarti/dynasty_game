import { describe, expect, it } from 'vitest';
import { chooseCravingFood, cravingProteinOpportunityPasses } from '../FoodChoice.ts';

describe('chooseCravingFood', () => {
  const proteinOf = (node: { protein: number }) => node.protein;
  const berry = { protein: 0.05 };
  const fish = { protein: 0.65 };

  it('chooses out-of-reach protein when a strong craving is masked by local food', () => {
    expect(chooseCravingFood(berry, fish, true, proteinOf)).toBe(fish);
  });
  it('chooses reachable protein when ordinary food would leave a strong craving unanswered', () => {
    expect(chooseCravingFood(berry, fish, true, proteinOf)).toBe(fish);
  });
  it('keeps ordinary food when the craving is weak', () => {
    expect(chooseCravingFood(berry, fish, false, proteinOf)).toBe(berry);
  });
  it('keeps the ordinary choice if it already supplies protein', () => {
    expect(chooseCravingFood(fish, null, true, proteinOf)).toBe(fish);
  });
});

describe('cravingProteinOpportunityPasses', () => {
  it('accepts consistent protein selection when a reachable alternative exists', () => {
    expect(cravingProteinOpportunityPasses(840, 840)).toBe(true);
  });

  it('rejects the measured pre-fix selection rate', () => {
    expect(cravingProteinOpportunityPasses(303, 1039)).toBe(false);
  });

  it('requires enough real opportunities to score the gate', () => {
    expect(cravingProteinOpportunityPasses(19, 19)).toBe(false);
  });
});
