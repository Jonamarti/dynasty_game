import { describe, expect, it } from 'vitest';
import { ITEMS } from '../entities/Item.ts';
import { canTake } from '../core/Carry.ts';
import { pickupFixture, pileAt, wearContainer } from './m16-pickup-fixture.ts';

describe('m16-pickup-conserves-items', () => {
  it('keeps every container and hand-carried item in the world or inventory', () => {
    const { sim, person } = pickupFixture('m16-pickup-conserves-items');
    wearContainer(person, 'bundle');
    wearContainer(person, 'hide_bag');

    for (const [itemId, def] of Object.entries(ITEMS)) {
      if (!def.container && !def.hand) continue;
      const inventoryBefore = person.inventory.count(itemId);
      const before = inventoryBefore + 2;
      const fits = canTake(person, sim.config.carry, itemId, 1);
      const pile = pileAt(sim, person.x, person.y, [[itemId, 2]]);
      expect(sim.order(person, 'pickup', { pileId: pile.id, itemId, count: 2 })).toBe(true);
      for (let tick = 0; tick < 20 && person.order !== null; tick++) sim.step();
      expect(person.order).toBeNull();
      if (fits) expect(person.inventory.count(itemId)).toBeGreaterThan(inventoryBefore);
      const after = person.inventory.count(itemId) + pile.contents.count(itemId);
      expect(after).toBe(before);
    }
  });
});
