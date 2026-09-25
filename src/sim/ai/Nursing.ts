import type { Person } from '../entities/Person.ts';
import type { World } from '../core/World.ts';

/** A baby cries for care before either lethal need reaches its danger line. */
export const NURSING_HUNGER = 30;
export const NURSING_THIRST = 35;
export const NURSING_HUNGER_RELIEF = 45;
export const NURSING_THIRST_RELIEF = 55;

/** The most urgent living infant of this mother, found through her direct family links. */
export function infantNeedingNursing(
  mother: Person,
  peopleById: ReadonlyMap<number, Person>,
  world: World
): Person | null {
  let chosen: Person | null = null;
  let highestNeed = 0;
  for (const id of mother.childIds) {
    const child = peopleById.get(id);
    if (!child?.alive || child.motherId !== mother.id || !child.isInfant ||
      child.bandId !== mother.bandId || child.captiveOf !== null ||
      !world.sameRegion(mother.x, mother.y, child.x, child.y)) continue;
    const hunger = child.needs.hunger >= NURSING_HUNGER ? child.needs.hunger / NURSING_HUNGER : 0;
    const thirst = child.needs.thirst >= NURSING_THIRST ? child.needs.thirst / NURSING_THIRST : 0;
    const need = Math.max(hunger, thirst);
    if (need > highestNeed) {
      highestNeed = need;
      chosen = child;
    }
  }
  return chosen;
}
