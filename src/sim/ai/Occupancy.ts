/**
 * M16 14.3: physical refuge admission. No RNG, DOM, or global roster.
 * Occupants are ordered by entry tick and stable person id, never array order.
 */
import type { Person } from '../entities/Person.ts';
import { BUILDINGS, type Building } from '../entities/Building.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import { isUnderRoof } from '../systems/LifeSystem.ts';

/** The open windbreak also protects a little margin against cold. */
export function coversShelter(building: Building, person: Person): boolean {
  return building.def.interior || building.def.roofed
    ? isUnderRoof(building, person.x, person.y)
    : building.contains(person.x, person.y, 1.5);
}

const SHELTER_SEARCH_RADIUS = Math.max(1, ...Object.values(BUILDINGS).map(def =>
  Math.hypot(def.width / 2 + 2, def.height / 2 + 2)));

/** Called once per simulation tick after rebuilding its spatial indexes. */
export function syncShelterArrival(
  person: Person, buildings: SpatialHash<Building>, tick: number,
): void {
  if (!person.alive || person.carriedBy !== null) {
    person.shelterArrivalBuildingId = null;
    person.shelterArrivalTick = null;
    return;
  }
  const candidates = buildings.queryRadius(person.x, person.y, SHELTER_SEARCH_RADIUS)
    .filter(b => b.complete && !b.ruined && b.def.places !== undefined &&
      coversShelter(b, person));
  // An explicitly targeted refuge wins; overlapping untargeted margins use
  // greatest shelter, then stable building id.
  const chosen = candidates.find(b => b.id === person.targetBuildingId) ??
    candidates.sort((a, b) => b.def.shelter - a.def.shelter || a.id - b.id)[0];
  const next = chosen?.id ?? null;
  if (next !== person.shelterArrivalBuildingId) {
    person.shelterArrivalBuildingId = next;
    person.shelterArrivalTick = next === null ? null : tick;
  }
}

function arrivalAt(building: Building, person: Person): number {
  return person.shelterArrivalBuildingId === building.id
    ? person.shelterArrivalTick ?? Number.MAX_SAFE_INTEGER
    : Number.MAX_SAFE_INTEGER;
}

/** Physically present occupants, sorted by actual entry; carried babies use no place. */
export function occupantsOf(building: Building, people: SpatialHash<Person>): Person[] {
  if (!building.complete || building.ruined || building.def.places === undefined) return [];
  const radius = Math.hypot(building.def.width / 2 + 2, building.def.height / 2 + 2);
  return people.queryRadius(building.centerX, building.centerY, radius)
    .filter(person => person.alive && person.carriedBy === null &&
      coversShelter(building, person))
    .sort((a, b) => arrivalAt(building, a) - arrivalAt(building, b) || a.id - b.id);
}

export function admittedOccupantsOf(building: Building, people: SpatialHash<Person>): Person[] {
  return occupantsOf(building, people).slice(0, building.def.places ?? 0);
}

/** Allows an entrant only when a place remains, and protects existing occupants. */
export function hasRoomFor(
  building: Building, person: Person, people: SpatialHash<Person>,
): boolean {
  if (!building.complete || building.ruined || building.def.places === undefined) return false;
  const occupants = occupantsOf(building, people);
  const admitted = occupants.slice(0, building.def.places);
  // A baby in arms is accounted for by the carrier rather than a new bed.
  if (person.carriedBy !== null) return admitted.some(p => p.id === person.carriedBy);
  if (occupants.some(p => p.id === person.id)) return admitted.some(p => p.id === person.id);
  return occupants.length < building.def.places;
}
