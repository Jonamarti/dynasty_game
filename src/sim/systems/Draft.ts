import { BUILDINGS, type Building } from '../entities/Building.ts';
import { ITEMS } from '../entities/Item.ts';
import type { Person } from '../entities/Person.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';

/** Two abstract head of a live pen's meat stock make one draft team. */
export const DRAFT_HEADS = 2;
export const DRAFT_RADIUS = 12;

function validField(building: Building | undefined, bandId: number): building is Building {
  return !!building && building.def.field === true && building.crop !== null &&
    building.complete && !building.ruined && building.ownerBandId === bandId;
}

/** A lease is derived from the action and reciprocal IDs, never trusted alone. */
export function activeDraftLease(
  pen: Building,
  peopleById: ReadonlyMap<number, Person>,
  buildingsById: ReadonlyMap<number, Building>,
): Person | null {
  if (pen.draftUserId === null || !pen.complete || pen.ruined || !pen.def.herd ||
      pen.store.count('meat') < DRAFT_HEADS) return null;
  const person = peopleById.get(pen.draftUserId);
  if (!person || !person.alive || person.action !== 'sow' ||
      person.targetItemId !== 'iron_plough' || person.draftPenId !== pen.id ||
      person.targetBuildingId === null) return null;
  const field = buildingsById.get(person.targetBuildingId);
  if (!validField(field, person.bandId) || field.ownerBandId !== pen.ownerBandId ||
      Math.hypot(field.centerX - pen.centerX, field.centerY - pen.centerY) > DRAFT_RADIUS) return null;
  return person;
}

export function reservedDraftHeads(
  pen: Building,
  peopleById: ReadonlyMap<number, Person>,
  buildingsById: ReadonlyMap<number, Building>,
): number {
  return activeDraftLease(pen, peopleById, buildingsById) ? DRAFT_HEADS : 0;
}

export function availableDraftHeads(
  pen: Building,
  peopleById: ReadonlyMap<number, Person>,
  buildingsById: ReadonlyMap<number, Building>,
): number {
  return Math.max(0, pen.store.count('meat') - reservedDraftHeads(pen, peopleById, buildingsById));
}

/** Locate a same-band finished pen by the field's point through the spatial hash. */
export function findDraftPen(
  person: Person,
  buildingHash: SpatialHash<Building>,
  peopleById: ReadonlyMap<number, Person>,
  buildingsById: ReadonlyMap<number, Building>,
  fieldOverride?: Building,
): Building | null {
  const field = fieldOverride ?? (person.targetBuildingId === null
    ? undefined : buildingsById.get(person.targetBuildingId));
  if (!validField(field, person.bandId)) return null;
  // queryRadius filters on the pen origin; add half the pen's diagonal so its
  // center can still be exactly 12 tiles away before applying that exact limit.
  const queryMargin = Math.hypot(BUILDINGS.pen.width, BUILDINGS.pen.height) / 2;
  const nearby = buildingHash.queryRadius(field.centerX, field.centerY, DRAFT_RADIUS + queryMargin);
  return nearby.find(pen => {
    if (!pen.def.herd || !pen.complete || pen.ruined || pen.ownerBandId !== person.bandId ||
        Math.hypot(field.centerX - pen.centerX, field.centerY - pen.centerY) > DRAFT_RADIUS) return false;
    const owner = activeDraftLease(pen, peopleById, buildingsById);
    return owner?.id === person.id || (owner === null && pen.store.count('meat') >= DRAFT_HEADS &&
      availableDraftHeads(pen, peopleById, buildingsById) >= DRAFT_HEADS);
  }) ?? null;
}

/** Distinguish no team from a team already leased, without mutating stale state. */
export function hasBusyDraftPen(
  person: Person,
  buildingHash: SpatialHash<Building>,
  peopleById: ReadonlyMap<number, Person>,
  buildingsById: ReadonlyMap<number, Building>,
  fieldOverride?: Building,
): boolean {
  const field = fieldOverride ?? (person.targetBuildingId === null
    ? undefined : buildingsById.get(person.targetBuildingId));
  if (!validField(field, person.bandId)) return false;
  const queryMargin = Math.hypot(BUILDINGS.pen.width, BUILDINGS.pen.height) / 2;
  return buildingHash.queryRadius(field.centerX, field.centerY, DRAFT_RADIUS + queryMargin).some(pen =>
    pen.def.herd !== undefined && pen.complete && !pen.ruined && pen.ownerBandId === person.bandId &&
    Math.hypot(field.centerX - pen.centerX, field.centerY - pen.centerY) <= DRAFT_RADIUS &&
    pen.store.count('meat') >= DRAFT_HEADS && activeDraftLease(pen, peopleById, buildingsById) !== null);
}

/** Claim only at order/start time. An invalid old owner is safely overwritten here. */
export function claimDraftTeam(
  person: Person,
  pen: Building,
  peopleById: ReadonlyMap<number, Person>,
  buildingsById: ReadonlyMap<number, Building>,
): boolean {
  const owner = activeDraftLease(pen, peopleById, buildingsById);
  if (owner?.id === person.id) return true;
  if (!pen.def.herd || !pen.complete || pen.ruined || pen.ownerBandId !== person.bandId ||
      availableDraftHeads(pen, peopleById, buildingsById) < DRAFT_HEADS || owner) return false;
  // Old identifiers are stale by definition if activeDraftLease rejected them.
  pen.draftUserId = person.id;
  person.draftPenId = pen.id;
  return true;
}

/** Grain for the four-unit sowing must be carried in a real fitted container. */
export function hasSeedContainer(person: Person): boolean {
  return Object.values(person.equipment).some(slot => {
    if (!slot || person.inventory.count(slot.item) <= 0) return false;
    const container = ITEMS[slot.item]?.container;
    return !!container && container.accepts.includes('food') && container.capacity >= 4;
  });
}
