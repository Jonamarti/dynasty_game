import { describe, expect, it } from 'vitest';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { World } from '../core/World.ts';
import { RNG } from '../core/RNG.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { Person } from '../entities/Person.ts';
import { applyHouseWalls, houseDoor, houseInteriorContains, houseInteriorTiles } from '../world/HouseInterior.ts';

describe('m16-shelter-ladder-order', () => {
  it('ranks all five early roofs in strictly increasing warmth', () => {
    const ids = ['windbreak', 'lean_to', 'mud_hut', 'wattle_hut', 'longhouse'];
    expect(ids.map(id => BUILDINGS[id]!.shelter)).toEqual([0.4, 0.6, 0.75, 0.88, 0.95]);
  });
  it('sets the mud hut to the new capacity, costs, footprint and work duration', () => {
    expect(BUILDINGS.mud_hut).toMatchObject({
      width: 3, height: 3, places: 3, shelter: 0.75, workTicks: 420,
      materials: { sticks: 12, thatch: 10, mud: 8 },
      interior: { door: 'toward_camp' },
    });
    expect(Object.keys(BUILDINGS.mud_hut!.materials)).not.toContain('wood');
  });
  it('keeps the 3x3 room reachable through every cardinal doorway', () => {
    const world = new World({ ...DEFAULT_CONFIG.world, width: 64, height: 64 }, new RNG('m16-mud-hut-3x3'));
    for (const [side, anchor] of Object.entries({
      north: { homeX: 12, homeY: 0 }, south: { homeX: 12, homeY: 40 },
      west: { homeX: 0, homeY: 12 }, east: { homeX: 40, homeY: 12 },
    })) {
      const hut = new Building(BUILDINGS.mud_hut!, 11, 11, 1);
      expect(houseInteriorTiles(hut)).toHaveLength(1);
      const door = houseDoor(hut, anchor);
      expect(door.side).toBe(side);
      expect(houseInteriorContains(hut, hut.centerX, hut.centerY)).toBe(true);
      const people = new SpatialHash<Person>(8);
      applyHouseWalls(world, hut, anchor, people, true);
      expect(world.isWalkable(door.x, door.y)).toBe(true);
      expect(world.isWalkable(12, 12)).toBe(true);
      applyHouseWalls(world, hut, anchor, people, false);
    }
  });
});
