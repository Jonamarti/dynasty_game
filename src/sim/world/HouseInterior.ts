import type { World } from '../core/World.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { Person } from '../entities/Person.ts';
import type { Building } from '../entities/Building.ts';

export type HouseSide = 'north' | 'east' | 'south' | 'west';
export interface HouseDoor { readonly side: HouseSide; readonly x: number; readonly y: number }
export interface HouseBandAnchor { readonly homeX: number; readonly homeY: number }

/** Whether the tile World.isWalkable would use is a room tile. */
export function houseInteriorContains(building: Building, x: number, y: number): boolean {
  const tileX = Math.floor(x), tileY = Math.floor(y);
  return building.def.interior !== undefined &&
    tileX >= building.x + 1 && tileX <= building.x + building.def.width - 2 &&
    tileY >= building.y + 1 && tileY <= building.y + building.def.height - 2;
}

/** Pick a wall opening facing camp once, then preserve it across relocation. */
export function houseDoor(building: Building, band: HouseBandAnchor): HouseDoor {
  const dx = band.homeX - building.centerX, dy = band.homeY - building.centerY;
  // Cardinal ties resolve north/south before east/west, then the negative side.
  const side: HouseSide = building.interiorDoorSide ?? (Math.abs(dy) >= Math.abs(dx)
    ? dy <= 0 ? 'north' : 'south'
    : dx <= 0 ? 'west' : 'east');
  building.interiorDoorSide = side;
  if (side === 'north') return { side, x: building.x + Math.floor(building.def.width / 2), y: building.y };
  if (side === 'south') return { side, x: building.x + Math.floor(building.def.width / 2), y: building.y + building.def.height - 1 };
  if (side === 'west') return { side, x: building.x, y: building.y + Math.floor(building.def.height / 2) };
  return { side, x: building.x + building.def.width - 1, y: building.y + Math.floor(building.def.height / 2) };
}

function wallTiles(building: Building, door: HouseDoor): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let dy = 0; dy < building.def.height; dy++) for (let dx = 0; dx < building.def.width; dx++) {
    if (dx !== 0 && dy !== 0 && dx !== building.def.width - 1 && dy !== building.def.height - 1) continue;
    const x = building.x + dx, y = building.y + dy;
    if (x !== door.x || y !== door.y) out.push({ x, y });
  }
  return out;
}

/**
 * Apply or remove a house's wall ring. A person caught on a soon-to-be wall is
 * moved to the nearest room tile before blocking; the door remains open, so
 * nobody is sealed away from the rest of the map.
 */
export function applyHouseWalls(
  world: World, building: Building, band: HouseBandAnchor,
  peopleHash: SpatialHash<Person>, active: boolean,
): void {
  if (!building.def.interior) return;
  const door = houseDoor(building, band);
  const walls = wallTiles(building, door);
  const overlayNeedsRepair = walls.some(tile => world.isHouseWallBlocked(tile.x, tile.y) !== active);
  if (building.wallsApplied === active && !overlayNeedsRepair) return;
  if (active) {
    const rooms: { x: number; y: number }[] = [];
    for (let y = building.y + 1; y < building.y + building.def.height - 1; y++) {
      for (let x = building.x + 1; x < building.x + building.def.width - 1; x++) {
        if (world.isWalkable(x, y)) rooms.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
    for (const tile of walls) {
      const occupants = peopleHash.queryRadius(tile.x + 0.5, tile.y + 0.5, Math.SQRT1_2 + 1e-6)
        .filter(person => Math.floor(person.x) === tile.x && Math.floor(person.y) === tile.y)
        .sort((a, b) => a.id - b.id);
      for (const person of occupants) {
        const destination = [...rooms].sort((a, b) =>
          Math.abs(a.x - person.x) + Math.abs(a.y - person.y) - Math.abs(b.x - person.x) - Math.abs(b.y - person.y) ||
          a.y - b.y || a.x - b.x)[0] ?? { x: door.x + 0.5, y: door.y + 0.5 };
        peopleHash.remove(person);
        person.x = destination.x; person.y = destination.y;
        peopleHash.insert(person);
      }
      world.setHouseWall(tile.x, tile.y, true);
    }
  } else {
    for (const tile of walls) {
      if (world.isHouseWallBlocked(tile.x, tile.y)) world.setHouseWall(tile.x, tile.y, false);
    }
  }
  building.wallsApplied = active;
}
