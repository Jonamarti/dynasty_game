import { SPECIES, SPECIES_DEFS, type Animal, type Species } from '../entities/Animal.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { PlaceMemory } from '../social/PlaceMemory.ts';

export interface RememberedHuntLead {
  x: number;
  y: number;
  species: Species;
}

export type HuntLead =
  | { kind: 'visible'; animal: Animal }
  | { kind: 'remembered'; place: RememberedHuntLead };

/**
 * An animal's live location is visible information, not something a memory
 * marker authorizes the AI to query. A remembered herd is a destination to
 * investigate, even if the animals have moved or died since the observation.
 */
export function findHuntLead(
  origin: { x: number; y: number },
  sightRadius: number,
  animals: Pick<SpatialHash<Animal>, 'findNearest'>,
  memory: Pick<PlaceMemory, 'nearestAny'>,
  canHuntAt: (x: number, y: number) => boolean,
  canSearchAt: (x: number, y: number) => boolean,
  allowRememberedSearch: boolean,
): HuntLead | null {
  const visible = animals.findNearest(origin.x, origin.y, sightRadius,
    a => a.alive && !a.def.predator && canHuntAt(a.x, a.y));
  if (visible) return { kind: 'visible', animal: visible };
  if (!allowRememberedSearch) return null;

  // No animal-index query around an unseen marker. Ignore markers already
  // in sight: if the animal is there it was a visible candidate; otherwise
  // normal observation can forget the empty marker.
  const record = memory.nearestAny(origin.x, origin.y, sightRadius * 3, place => {
    const species = SPECIES.find(id => place.kind === 'herd:' + id);
    return species !== undefined && !SPECIES_DEFS[species].predator &&
      place.amount > 0 && Math.hypot(place.x - origin.x, place.y - origin.y) > sightRadius &&
      canSearchAt(place.x, place.y);
  });
  if (!record) return null;
  const species = SPECIES.find(id => record.kind === 'herd:' + id);
  return species === undefined ? null :
    { kind: 'remembered', place: { x: record.x, y: record.y, species } };
}
