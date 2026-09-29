/**
 * M15 phase 11a. `ItemDef.hand` and `.class` are required fields, not
 * optional ones an entry can quietly skip — a hand-carry table with a hole in
 * it is exactly how a future container's `accepts` check would silently
 * refuse an item nobody remembered to classify.
 */
import { describe, it, expect } from 'vitest';
import { ITEMS } from '../entities/Item.ts';

describe('M15 phase 11a: the hand-carry table', () => {
  it('gives every item a hand entry and a class', () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      expect(def.hand, id + ' has no ItemDef.hand').toBeTruthy();
      expect(def.class, id + ' has no ItemDef.class').toBeTruthy();
      expect(def.hand.hands === 1 || def.hand.hands === 2, id + ' hand.hands must be 1 or 2').toBe(true);
      expect(def.hand.perHand, id + ' hand.perHand must not be negative').toBeGreaterThanOrEqual(0);
      expect(def.hand.perArms, id + ' hand.perArms must not be negative').toBeGreaterThanOrEqual(0);
      if (def.container) {
        expect(def.container.capacity, id + ' container must carry something').toBeGreaterThan(0);
        expect(def.container.accepts.length, id + ' container must name accepted classes').toBeGreaterThan(0);
      }
    }
  });
});
