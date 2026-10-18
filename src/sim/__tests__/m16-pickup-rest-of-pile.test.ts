import { describe, expect, it } from 'vitest';
import { pickupFixture, pileAt, wearContainer } from './m16-pickup-fixture.ts';

describe('m16-pickup-rest-of-pile', () => {
  it('takes sticks after the first bundle in a pile does not fit', () => {
    const { sim, person } = pickupFixture('m16-pickup-rest-of-pile');
    wearContainer(person, 'bundle');
    const pile = pileAt(sim, person.x, person.y, [['bundle', 1], ['sticks', 2]]);

    expect(sim.takeFromPile(person, pile)).toBe(2);
    expect(person.inventory.count('sticks')).toBe(2);
    expect(pile.contents.count('bundle')).toBe(1);
    expect(pile.contents.count('sticks')).toBe(0);
  });
});
