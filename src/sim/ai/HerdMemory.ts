import type { Animal } from '../entities/Animal.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { PlaceMemory, PlaceRecord } from '../social/PlaceMemory.ts';

/** A remembered herd only identifies the species actually observed. */
export function rememberedHerdMatchesSpecies(kind: string, species: Animal['species']): boolean {
  return kind === `herd:${species}`;
}

/**
 * An extinct or displaced remembered herd must not hide another eligible
 * memory. Search remembered locations through PlaceMemory's spatial index,
 * then resolve live prey through the animal spatial index. Neither search
 * consumes RNG, and the agent never acquires knowledge of unrelated species.
 */
export function findRememberedHerdQuarry(
  memory: Pick<PlaceMemory, 'nearestAny'>,
  animals: Pick<SpatialHash<Animal>, 'findNearest'>,
  origin: { x: number; y: number },
  maxDistance: number,
  canPursueAt: (x: number, y: number) => boolean,
): Animal | null {
  const liveMatch = (place: PlaceRecord): Animal | null =>
    animals.findNearest(place.x, place.y, 2, animal =>
      animal.alive && !animal.def.predator &&
      rememberedHerdMatchesSpecies(place.kind, animal.species) &&
      Math.hypot(animal.x - place.x, animal.y - place.y) <= 1 &&
      canPursueAt(animal.x, animal.y));

  const place = memory.nearestAny(origin.x, origin.y, maxDistance,
    remembered => remembered.kind.startsWith('herd:') &&
      canPursueAt(remembered.x, remembered.y) &&
      liveMatch(remembered) !== null);
  return place ? liveMatch(place) : null;
}
