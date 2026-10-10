import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { World } from '../core/World.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Person } from '../entities/Person.ts';
import { applyHouseWalls, houseDoor, houseInteriorContains } from '../world/HouseInterior.ts';

function houseSite(defId: string): { world: World; building: Building; anchor: { homeX: number; homeY: number } } {
  const world = new World({ ...DEFAULT_CONFIG.world, width: 64, height: 64 }, new RNG('house-interior-world'));
  const def = BUILDINGS[defId]!;
  let x = -1, y = -1;
  for (let cy = 2; cy < world.height - def.height - 2 && x < 0; cy++) {
    for (let cx = 2; cx < world.width - def.width - 2; cx++) {
      let valid = true;
      for (let dy = 0; dy < def.height && valid; dy++) for (let dx = 0; dx < def.width; dx++)
        if (!world.isWalkable(cx + dx, cy + dy)) { valid = false; break; }
      if (valid) { x = cx; y = cy; break; }
    }
  }
  if (x < 0) throw new Error(`no walkable site for ${defId}`);
  const building = new Building(def, x, y, 0);
  building.complete = true;
  building.durability = def.workTicks;
  return { world, building, anchor: { homeX: x - 3, homeY: y + Math.floor(def.height / 2) } };
}

describe('walled house interiors', () => {
  it('defines room and wall footprints for the four house designs without changing their costs', () => {
    expect(['mud_hut', 'wattle_hut', 'stone_house', 'longhouse'].map(id => {
      const { width, height, materials, workTicks } = BUILDINGS[id]!;
      return [id, width, height, materials, workTicks];
    })).toEqual([
      ['mud_hut', 4, 4, { wood: 8, sticks: 6, thatch: 10, mud: 14 }, 520],
      ['wattle_hut', 4, 4, { sticks: 10, thatch: 12, mud: 10 }, 400],
      ['stone_house', 5, 5, { flint: 20, wood: 6, mud: 10 }, 750],
      ['longhouse', 8, 4, { wood: 34, sticks: 16, thatch: 30, mud: 24 }, 1800],
    ]);
    expect(BUILDINGS.longhouse).toMatchObject({ width: 8, height: 4, interior: { door: 'toward_camp' } });
    expect(BUILDINGS.mud_hut!.interior).toEqual({ door: 'toward_camp' });
    expect(BUILDINGS.wattle_hut!.interior).toEqual({ door: 'toward_camp' });
    expect(BUILDINGS.stone_house!.interior).toEqual({ door: 'toward_camp' });
    expect(BUILDINGS.windbreak!.interior).toBeUndefined();
  });

  it('blocks the perimeter except for the camp-facing door and leaves a connected room', () => {
    for (const id of ['mud_hut', 'wattle_hut', 'stone_house', 'longhouse']) {
      const { world, building, anchor } = houseSite(id);
      const people = new SpatialHash<Person>(8);
      const door = houseDoor(building, anchor);
      applyHouseWalls(world, building, anchor, people, true);
      let blocked = 0;
      for (let dy = 0; dy < building.def.height; dy++) for (let dx = 0; dx < building.def.width; dx++) {
        const x = building.x + dx, y = building.y + dy;
        const perimeter = dx === 0 || dy === 0 || dx === building.def.width - 1 || dy === building.def.height - 1;
        if (perimeter && (x !== door.x || y !== door.y)) {
          expect(world.isWalkable(x, y), `${id} wall at ${x},${y}`).toBe(false);
          blocked++;
        }
      }
      expect(blocked).toBe(2 * building.def.width + 2 * building.def.height - 5);
      expect(world.isWalkable(door.x, door.y)).toBe(true);
      const inside = door.side === 'north' ? { x: door.x, y: door.y + 1 }
        : door.side === 'south' ? { x: door.x, y: door.y - 1 }
          : door.side === 'east' ? { x: door.x - 1, y: door.y } : { x: door.x + 1, y: door.y };
      const outside = door.side === 'north' ? { x: door.x, y: door.y - 1 }
        : door.side === 'south' ? { x: door.x, y: door.y + 1 }
          : door.side === 'east' ? { x: door.x + 1, y: door.y } : { x: door.x - 1, y: door.y };
      expect(world.isWalkable(inside.x, inside.y)).toBe(true);
      expect(world.isWalkable(outside.x, outside.y)).toBe(true);
      expect(houseInteriorContains(building, inside.x, inside.y)).toBe(true);
    }
  });

  it('moves a person off the wall before blocking it, then opens the wall ring on ruin', () => {
    const { world, building, anchor } = houseSite('mud_hut');
    const people = new SpatialHash<Person>(8);
    const wallX = building.x, wallY = building.y;
    const person = new Person('Caught on wall', wallX + 0.9, wallY + 0.9, 0, new RNG('house-occupant'));
    people.insert(person);

    applyHouseWalls(world, building, anchor, people, true);
    expect(world.isWalkable(wallX, wallY)).toBe(false);
    expect(houseInteriorContains(building, person.x, person.y)).toBe(true);
    expect(world.isWalkable(Math.floor(person.x + 0.5), Math.floor(person.y + 0.5))).toBe(true);
    expect(people.queryRadius(person.x, person.y, 1)).toContain(person);

    // Terrain edits below a wall update the hidden ground state without
    // opening the wall; ruination must restore that latest state.
    const otherWall = { x: building.x + building.def.width - 1, y: building.y + building.def.height - 1 };
    world.dig(otherWall.x, otherWall.y, world.pitDepth + 0.1);
    building.durability = 0;
    applyHouseWalls(world, building, anchor, people, building.complete && !building.ruined);
    for (let dy = 0; dy < building.def.height; dy++) for (let dx = 0; dx < building.def.width; dx++) {
      const perimeter = dx === 0 || dy === 0 || dx === building.def.width - 1 || dy === building.def.height - 1;
      if (perimeter) expect(world.isWalkable(building.x + dx, building.y + dy)).toBe(
        building.x + dx !== otherWall.x || building.y + dy !== otherWall.y);
    }
  });

  it('keeps the original doorway after the camp anchor moves and repairs only this ring', () => {
    const { world, building, anchor } = houseSite('mud_hut');
    const people = new SpatialHash<Person>(8);
    const originalDoor = houseDoor(building, anchor);
    applyHouseWalls(world, building, anchor, people, true);
    const movedAnchor = { homeX: building.centerX + 30, homeY: building.centerY };
    expect(houseDoor(building, movedAnchor)).toEqual(originalDoor);

    building.durability = 0;
    applyHouseWalls(world, building, movedAnchor, people, false);
    expect(world.isWalkable(originalDoor.x, originalDoor.y)).toBe(true);
    expect(building.interiorDoorSide).toBe(originalDoor.side);

    building.durability = building.def.workTicks - 0.1;
    expect(building.repair(0.05)).toBe(false);
    expect(building.wallsApplied).toBe(false);
    expect(building.repair(1)).toBe(true);
    applyHouseWalls(world, building, movedAnchor, people, true);
    expect(world.isWalkable(originalDoor.x, originalDoor.y)).toBe(true);
    expect(building.wallsApplied).toBe(true);
  });

  it('uses truncated tile bounds at every room edge', () => {
    const { building } = houseSite('mud_hut');
    expect(houseInteriorContains(building, building.x + 1.99, building.y + 1.99)).toBe(true);
    expect(houseInteriorContains(building, building.x + 0.99, building.y + 1)).toBe(false);
    expect(houseInteriorContains(building, building.x + 3, building.y + 1)).toBe(false);
    expect(houseInteriorContains(building, building.x + 1, building.y + 0.99)).toBe(false);
    expect(houseInteriorContains(building, building.x + 1, building.y + 3)).toBe(false);
  });

  it('does not migrate a legacy saved house definition that has no interior metadata', () => {
    const { world, building, anchor } = houseSite('mud_hut');
    const legacy = new Building({ ...building.def, width: 3, height: 3, interior: undefined }, building.x, building.y, 0);
    legacy.complete = true;
    const before = world.walkable.slice();
    applyHouseWalls(world, legacy, anchor, new SpatialHash<Person>(8), true);
    expect(legacy.def.width).toBe(3);
    expect(world.walkable).toEqual(before);
  });
});
