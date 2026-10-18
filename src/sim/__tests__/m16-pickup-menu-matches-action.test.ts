import { describe, expect, it } from 'vitest';
import { availableActions } from '../ai/ActionCatalog.ts';
import { ITEMS } from '../entities/Item.ts';
import { canTake, pickupRefusal } from '../core/Carry.ts';
import { pickupFixture, pileAt, wearContainer } from './m16-pickup-fixture.ts';

describe('m16-pickup-menu-matches-action', () => {
  it('offers each item exactly when the action can carry one unit', () => {
    const { sim, person } = pickupFixture('m16-pickup-menu-matches-action');
    wearContainer(person, 'bundle');
    for (const itemId of Object.keys(ITEMS)) {
      const pile = pileAt(sim, person.x, person.y, [[itemId, 1]]);
      const option = availableActions(person, { kind: 'pile', x: pile.x, y: pile.y, pile },
        { world: sim.world, nearWater: false,
          pickupRefusal: (candidate, id) => pickupRefusal(candidate, sim.config.carry, id) })[0]!;
      expect(option.enabled, itemId).toBe(canTake(person, sim.config.carry, itemId, 1));
    }
  });
});
