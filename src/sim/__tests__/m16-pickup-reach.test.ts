import { describe, expect, it } from 'vitest';
import { pickupFixture, pileAt } from './m16-pickup-fixture.ts';

describe('m16-pickup-reach', () => {
  it('walks to a distant pile before moving anything into the inventory', () => {
    const { sim, person } = pickupFixture('m16-pickup-reach');
    const start = { x: person.x, y: person.y };
    let target: { x: number; y: number } | null = null;
    for (const radius of [10, 9, 8]) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const candidate = sim.world.findWalkableNear(
          Math.round(start.x) + dx! * radius,
          Math.round(start.y) + dy! * radius,
          2,
        );
        if (!candidate || !sim.world.sameRegion(start.x, start.y, candidate.x, candidate.y) ||
            Math.hypot(candidate.x - start.x, candidate.y - start.y) < 8) continue;
        target = candidate;
        break;
      }
      if (target) break;
    }
    expect(target, 'fixture must have a walkable tile ten tiles away in the same region').not.toBeNull();
    const pile = pileAt(sim, target!.x, target!.y, [['sticks', 1]]);

    expect(sim.order(person, 'pickup', { pileId: pile.id, itemId: 'sticks', count: 1 })).toBe(true);
    sim.step();

    expect(person.inventory.count('sticks')).toBe(0);
    expect(pile.contents.count('sticks')).toBe(1);
    expect(Math.hypot(person.x - start.x, person.y - start.y)).toBeGreaterThan(0);
    expect(person.order).toBe('pickup');

    for (let tick = 0; tick < 500 && person.order !== null; tick++) sim.step();

    expect(person.order).toBeNull();
    expect(person.inventory.count('sticks')).toBe(1);
    expect(pile.contents.count('sticks')).toBe(0);
  });
});
