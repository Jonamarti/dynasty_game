/** Craft-specific capability gates. A reed raft is a freshwater craft; the
 * hollowed logboat can also use the sheltered saltwater lanes in a local map. */
import type { Person } from '../entities/Person.ts';
import type { World } from './World.ts';
import { techPower } from '../knowledge/Tech.ts';
export function canUseRaft(person: Person): boolean {
  return person.inventory.has('raft') && techPower(person, 'cordage') > 0;
}


export function canUseLogboat(person: Person): boolean {
  return person.inventory.has('logboat') && techPower(person, 'logboat') > 0;
}

export function canUseBoat(person: Person): boolean {
  return canUseRaft(person) || canUseLogboat(person);
}

export function boatTileFor(person: Person, world: World, x: number, y: number): boolean {
  return (canUseLogboat(person) && world.isLogboatTile(x, y)) ||
    (canUseRaft(person) && world.isBoatTile(x, y));
}

export function sameBoatRouteFor(person: Person, world: World, ax: number, ay: number, bx: number, by: number): boolean {
  return canUseLogboat(person) ? world.sameLogboatRegion(ax, ay, bx, by)
    : canUseRaft(person) && world.sameBoatRegion(ax, ay, bx, by);
}
