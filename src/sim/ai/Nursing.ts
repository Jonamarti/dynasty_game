import type { Person } from '../entities/Person.ts';
import type { World } from '../core/World.ts';
import type { Household } from '../entities/Household.ts';
import type { Building } from '../entities/Building.ts';
import type { ChildhoodConfig } from '../core/Config.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import { canWalk, isLactating, isNursling } from '../entities/LifeStage.ts';

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

/**
 * Reused by the wet-nursing search, which runs every tick for every woman
 * with milk (`Simulation`'s cry override is per tick, not per think).
 */
const nearbyScratch: Person[] = [];

/** How loudly a baby is crying for the breast, 0 when it is not. */
function cryOf(child: Person): number {
  const hunger = child.needs.hunger >= NURSING_HUNGER ? child.needs.hunger / NURSING_HUNGER : 0;
  const thirst = child.needs.thirst >= NURSING_THIRST ? child.needs.thirst / NURSING_THIRST : 0;
  return Math.max(hunger, thirst);
}

/**
 * The baby this woman should nurse now, if any.
 *
 * Her own first, found through her direct family links: a mother answers her
 * own child's cry before anybody else's. Then, with `wetNursing` on and milk
 * of her own (`isLactating`), a baby of her band crying within sight of her
 * whose own mother is not there to answer it — dead, taken, or simply out of
 * sight of the child. Every historical band relied on this, and without it
 * `lean` lost 21 of 22 babies whose mothers died first (owner, 2026-09-30).
 *
 * "Not there" is read from what the nurse can see, never from a registry:
 * she hears a baby crying and sees no mother with it. A mother who is merely
 * on her way back is out of sight too, and the nurse answering in the
 * meantime is what a camp of women with babies does.
 */
export function infantNeedingNursing(
  nurse: Person,
  peopleById: ReadonlyMap<number, Person>,
  world: World,
  childhood: ChildhoodConfig,
  peopleHash?: SpatialHash<Person>,
  sightRadius = 0
): Person | null {
  let chosen: Person | null = null;
  let highestNeed = 0;
  for (const id of nurse.childIds) {
    const child = peopleById.get(id);
    if (!child?.alive || child.motherId !== nurse.id || !isNursling(child, childhood) ||
      child.bandId !== nurse.bandId || child.captiveOf !== null ||
      !world.sameRegion(nurse.x, nurse.y, child.x, child.y)) continue;
    const need = cryOf(child);
    if (need > highestNeed) {
      highestNeed = need;
      chosen = child;
    }
  }
  if (chosen || !childhood.wetNursing || !peopleHash || nurse.captiveOf !== null ||
    !isLactating(nurse, peopleById, childhood)) return chosen;

  for (const child of peopleHash.queryRadius(nurse.x, nurse.y, sightRadius, nearbyScratch)) {
    if (!child.alive || child.motherId === nurse.id || child.bandId !== nurse.bandId ||
      child.captiveOf !== null || !isNursling(child, childhood) ||
      !world.sameRegion(nurse.x, nurse.y, child.x, child.y)) continue;
    const need = cryOf(child);
    if (need <= highestNeed) continue;
    const mother = child.motherId === null ? undefined : peopleById.get(child.motherId);
    const motherThere = !!mother?.alive && mother.captiveOf === null &&
      Math.hypot(mother.x - child.x, mother.y - child.y) <= sightRadius;
    if (motherThere) continue;
    highestNeed = need;
    chosen = child;
  }
  return chosen;
}

/**
 * Her own baby that cannot walk and that she is not already holding, for her
 * to go and pick up. A baby somebody else is holding (a wet nurse who found it
 * alone) is still hers to take back.
 */
export function babyToCarry(
  mother: Person,
  peopleById: ReadonlyMap<number, Person>,
  world: World,
  childhood: ChildhoodConfig
): Person | null {
  if (!childhood.carryBaby || mother.armsTaken >= 2 || mother.captiveOf !== null) return null;
  for (const id of mother.childIds) {
    const child = peopleById.get(id);
    if (!child?.alive || child.motherId !== mother.id || canWalk(child, childhood) ||
      child.carriedBy === mother.id || child.bandId !== mother.bandId || child.captiveOf !== null ||
      !world.sameRegion(mother.x, mother.y, child.x, child.y)) continue;
    return child;
  }
  return null;
}

/** Whether this woman may nurse this baby: her own, or a band baby she has milk for. */
export function mayNurse(
  nurse: Person,
  baby: Person,
  peopleById: ReadonlyMap<number, Person>,
  childhood: ChildhoodConfig
): boolean {
  if (!baby.alive || !isNursling(baby, childhood)) return false;
  if (baby.motherId === nurse.id) return true;
  return childhood.wetNursing && baby.bandId === nurse.bandId && isLactating(nurse, peopleById, childhood);
}
