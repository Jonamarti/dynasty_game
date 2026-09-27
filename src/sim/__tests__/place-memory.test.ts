import { describe, expect, it } from 'vitest';
import { PlaceMemory } from '../social/PlaceMemory.ts';

describe('PlaceMemory', () => {
  it('tracks explored cells and remembers the last observation day', () => {
    const map = new PlaceMemory(16, 16);
    expect(map.exploredFraction()).toBe(0);
    map.observe(6, 6, 2, 3);
    expect(map.seenDayAt(6, 6)).toBe(3);
    expect(map.seenDayAt(14, 14)).toBe(0);
    map.observe(6, 6, 2, 7);
    expect(map.seenDayAt(6, 6)).toBe(7);
    expect(map.exploredFraction()).toBeGreaterThan(0);
  });

  it('deduplicates places by cell and forgets oldest places at the cap', () => {
    const map = new PlaceMemory(32, 32, 2);
    map.remember('resource:berries', 1, 1, 1, 2);
    map.remember('resource:berries', 2, 2, 4, 1);
    map.remember('resource:berries', 8, 1, 5, 1);
    expect(map.records('resource:berries')).toHaveLength(2);
    expect(map.records('resource:berries').some(place => place.x === 1)).toBe(false);
    map.remember('resource:berries', 17, 1, 6, 2);
    expect(map.records('resource:berries')).toHaveLength(2);
    expect(map.records('resource:berries').some(place => place.x === 8)).toBe(true);
    expect(map.averageAge(6)).toBe(0.5);
  });

  it('keeps remembered water beyond the ordinary per-kind cap', () => {
    const map = new PlaceMemory(32, 32, 1);
    map.remember('water', 1, 1, 1, 2);
    map.remember('water', 9, 1, 2, 2);
    expect(map.records('water').map(place => place.x)).toEqual([1, 9]);
  });

  it('updates a stale place without pretending it was seen again', () => {
    const map = new PlaceMemory(32, 32);
    map.remember('resource:berries', 5, 5, 3, 2, 'told');
    expect(map.updateAt('resource:berries', 6, 6, 0)).toBe(true);
    expect(map.records('resource:berries')).toEqual([{
      kind: 'resource:berries', x: 5, y: 5, day: 3, amount: 0, source: 'told',
    }]);
    expect(map.updateAt('resource:berries', 30, 30, 0)).toBe(false);
  });
});
