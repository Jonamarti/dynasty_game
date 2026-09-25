import type { Person } from '../entities/Person.ts';
import type { World } from '../core/World.ts';
import type { Household } from '../entities/Household.ts';
import type { Building } from '../entities/Building.ts';

/** A baby cries for care before either lethal need reaches its danger line. */
export const NURSING_HUNGER = 30;
export const NURSING_THIRST = 35;
export const NURSING_HUNGER_RELIEF = 45;
export const NURSING_THIRST_RELIEF = 55;

/** The assigned home is usable for a baby only when it is a finished shelter. */
export function homeForMother(
  mother: Person,
  householdsById: ReadonlyMap<number, Household>,
  buildingsById: ReadonlyMap<number, Building>
): Building | null {
  const household = mother.householdId === null ? null : householdsById.get(mother.householdId);
  const home = household?.homeBuildingId == null ? null : buildingsById.get(household.homeBuildingId);
  return home && home.complete && !home.ruined && home.def.shelter > 0 &&
    home.ownerBandId === mother.bandId ? home : null;
}

/** A direct child who should be brought to the family's usable home. */
export function infantOutsideHome(
  mother: Person,
  peopleById: ReadonlyMap<number, Person>,
  householdsById: ReadonlyMap<number, Household>,
  buildingsById: ReadonlyMap<number, Building>
): Person | null {
  const home = homeForMother(mother, householdsById, buildingsById);
  if (!home) return null;
  return mother.childIds.map(id => peopleById.get(id)).find((child): child is Person =>
    !!child?.alive && child.motherId === mother.id && child.isInfant &&
    child.bandId === mother.bandId && child.captiveOf === null &&
    !home.contains(child.x, child.y) && child.carriedBy !== mother.id
  ) ?? null;
}

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
