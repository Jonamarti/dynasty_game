import { describe, expect, it } from 'vitest';
import { WorldState } from '../world/WorldState.ts';
import { frontierGeography } from '../../../tools/frontierFixture.ts';
import { Inventory } from '../entities/Item.ts';
import { consumeComarcaOffmapNutrition } from '../world/ComarcaOffmapRuntime.ts';

describe('parked comarca ration callback regression', () => {
  it('does not report an ulp of nutrition beyond a fractional food request', () => {
    const requested = 0.000059;
    const rawCredit = (requested / 14) * 14;
    expect(rawCredit).toBeGreaterThan(requested);
    const food = new Inventory(); food.add('berries', 1);

    expect(consumeComarcaOffmapNutrition([food], requested)).toBe(requested);
    expect(food.count('berries')).toBeLessThan(1);
  });

  it('does not credit food when a sub-ulp withdrawal cannot change the stack', () => {
    const food = new Inventory(); food.add('berries', 1);
    expect(consumeComarcaOffmapNutrition([food], Number.EPSILON / 4)).toBe(0);
    expect(food.count('berries')).toBe(1);
  });

  it('advances a six-person comarca after a resident crosses the frontier', () => {
    const state = new WorldState({ seed: 'repro-scout-cross', world: { width: 32, height: 32 },
      population: { bands: 1, peoplePerBand: 6, conceptionChance: 0 },
      time: { ticksPerDay: 40, daysPerSeason: 20, startDay: 0 }, needs: { coldRate: 0 } },
    { geography: frontierGeography(), start: { x: 49.5, y: 20.5 }, peoples: false });
    const source = state.current, actor = source.possessFirst()!;
    source.world.walkable.fill(1);
    expect(source.order(actor, 'leave_comarca', { edge: 'e' })).toBe(true);

    expect(() => {
      for (let i = 0; i < 240 && state.current === source; i++) { state.current.step(); state.advancePeoples(); }
      expect(state.current).not.toBe(source);
      for (let i = 0; i < 100; i++) { state.current.step(); state.advancePeoples(); }
    }).not.toThrow();
  });
});
