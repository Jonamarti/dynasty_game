import type { Person } from '../entities/Person.ts';
import type { World } from '../core/World.ts';
import type { ComarcaEdge } from './ComarcaNeighbour.ts';

/** Runtime gateway belongs to the world root and is rebound after loading. */
export interface ComarcaTravelRequest {
  readonly person: Person;
  readonly direction: ComarcaEdge;
  readonly scout: boolean;
  readonly migration?: boolean;
  readonly travellerIds?: readonly number[];
}
export interface ComarcaTravel {
  readonly refusal: (person: Person, direction: ComarcaEdge, scout: boolean) => string | null;
  readonly arrive: (request: ComarcaTravelRequest) => string | null;
  readonly propose?: (person: Person, direction: ComarcaEdge) => string | null;
}

/** Search terrain along one edge, never entities; the movement system still owns reachability. */
export function approachComarcaEdge(world: World, person: Pick<Person, 'x' | 'y'>, direction: ComarcaEdge): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let distance = Infinity;
  const vertical = direction === 'e' || direction === 'w';
  const length = vertical ? world.height : world.width;
  for (let i = 1; i < length - 1; i++) {
    const x = vertical ? (direction === 'e' ? world.width - 1 : 0) : i;
    const y = vertical ? i : (direction === 's' ? world.height - 1 : 0);
    if (!world.isWalkable(x, y)) continue;
    const d = (x + 0.5 - person.x) ** 2 + (y + 0.5 - person.y) ** 2;
    if (d < distance) { distance = d; best = { x: x + 0.5, y: y + 0.5 }; }
  }
  return best;
}
