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
    map.remember('water', 1, 1, 1, 2);
    map.remember('water', 2, 2, 4, 1);
    map.remember('water', 8, 1, 5, 1);
    expect(map.records('water')).toHaveLength(2);
    expect(map.records('water').some(place => place.x === 1)).toBe(false);
    map.remember('water', 17, 1, 6, 2);
    expect(map.records('water')).toHaveLength(2);
    expect(map.records('water').some(place => place.x === 8)).toBe(true);
    expect(map.averageAge(6)).toBe(0.5);
  });
});
