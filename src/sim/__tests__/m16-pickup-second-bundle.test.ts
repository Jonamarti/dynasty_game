import { describe, expect, it } from 'vitest';
import { availableActions } from '../ai/ActionCatalog.ts';
import { pickupRefusal, pickupRefusalText } from '../core/Carry.ts';
import { pickupFixture, pileAt, wearContainer } from './m16-pickup-fixture.ts';

describe('m16-pickup-second-bundle', () => {
  it('explains the shoulder limit in the menu and when the ordered pickup runs', () => {
    const { sim, person } = pickupFixture('m16-pickup-second-bundle');
    wearContainer(person, 'bundle');
    const pile = pileAt(sim, person.x, person.y, [['bundle', 1]]);
    const option = availableActions(person, { kind: 'pile', x: pile.x, y: pile.y, pile },
      { world: sim.world, nearWater: false,
        pickupRefusal: (candidate, itemId) => pickupRefusal(candidate, sim.config.carry, itemId) })[0]!;

    expect(option.enabled).toBe(false);
    expect(option.reason).toBe('A bundle is already on the shoulder');
    expect(sim.order(person, 'pickup', { pileId: pile.id })).toBe(true);
    sim.step();
    expect(sim.interruptions.at(-1)?.reason).toBe('bundle_on_shoulder');
    expect(pickupRefusalText(sim.interruptions.at(-1)?.reason as 'bundle_on_shoulder')).toBe(option.reason);
    expect(person.inventory.count('bundle')).toBe(1);
    expect(pile.contents.count('bundle')).toBe(1);
  });
});
