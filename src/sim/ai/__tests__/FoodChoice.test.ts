import { describe, expect, it } from 'vitest';
import { chooseCravingFood } from '../FoodChoice.ts';

describe('chooseCravingFood', () => {
  const proteinOf = (node: { protein: number }) => node.protein;
  const berry = { protein: 0.05 };
  const fish = { protein: 0.65 };

  it('chooses out-of-reach protein when a strong craving is masked by local food', () => {
    expect(chooseCravingFood(berry, fish, false, true, proteinOf)).toBe(fish);
  });
  it('keeps ordinary food when protein is reachable or the craving is weak', () => {
    expect(chooseCravingFood(berry, fish, true, true, proteinOf)).toBe(berry);
    expect(chooseCravingFood(berry, fish, false, false, proteinOf)).toBe(berry);
  });
  it('keeps the ordinary choice if it already supplies protein', () => {
    expect(chooseCravingFood(fish, null, false, true, proteinOf)).toBe(fish);
  });
});
