import type { Animal } from '../entities/Animal.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { PlaceMemory, PlaceRecord } from '../social/PlaceMemory.ts';
import { telemetry } from '../core/Telemetry.ts';

/** A remembered herd only identifies the species actually observed. */
export function rememberedHerdMatchesSpecies(kind: string, species: Animal['species']): boolean {
  return kind === `herd:${species}`;
}

/**
 * An extinct or displaced remembered herd must not hide another eligible
 * memory. Search remembered locations through PlaceMemory's spatial index,
 * then resolve live prey through the animal spatial index.
 *
 * The memory index invokes its predicate for a strictly closer candidate
 * than the currently selected record. Cache that candidate's prey instead of
 * querying the animal hash a second time (and risking a different choice).
 * The diagnostic counters are inert in normal play and consume no RNG.
 */
export function findRememberedHerdQuarry(
  memory: Pick<PlaceMemory, 'nearestAny'>,
  animals: Pick<SpatialHash<Animal>, 'findNearest'>,
  origin: { x: number; y: number },
  maxDistance: number,
  canPursueAt: (x: number, y: number) => boolean,
): Animal | null {
  let selected: Animal | null = null;
  let visited = 0;
  let stale = 0;
  const place = memory.nearestAny(origin.x, origin.y, maxDistance,
    (remembered: PlaceRecord) => {
      if (!remembered.kind.startsWith('herd:') ||
          !canPursueAt(remembered.x, remembered.y)) return false;
      visited++;
      const match = animals.findNearest(remembered.x, remembered.y, 2, animal =>
        animal.alive && !animal.def.predator &&
        rememberedHerdMatchesSpecies(remembered.kind, animal.species) &&
        Math.hypot(animal.x - remembered.x, animal.y - remembered.y) <= 1 &&
        canPursueAt(animal.x, animal.y));
      if (!match) {
        stale++;
        return false;
      }
      selected = match;
      return true;
    });

  if (telemetry.isEnabled()) {
    telemetry.count('herd_memory_searches');
    telemetry.count('herd_memory_checked', visited);
    telemetry.count('herd_memory_stale_candidates', stale);
    if (place) telemetry.count('herd_memory_live_matches');
    if (place && stale > 0) telemetry.count('herd_memory_fallback_matches');
  }

  return place ? selected : null;
}
