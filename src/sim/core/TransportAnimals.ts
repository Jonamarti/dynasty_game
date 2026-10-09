import type { Animal, TransportMode } from '../entities/Animal.ts';
import type { Person } from '../entities/Person.ts';
import { techPower } from '../knowledge/Tech.ts';

export interface TransportLease {
  readonly animal: Animal;
  readonly mode: TransportMode;
  /** Added to the traveller's load without occupying hands, back, or shoulder. */
  readonly capacity: number;
  /** Journey-only multiplier; local walking still uses the usual movement rules. */
  readonly speed: number;
}

const DONKEY_PACK_CAPACITY = 24;
const HORSE_RIDING_SPEED = 1.5;
const TRANSPORT_LEASH_RANGE = 8;

function supports(animal: Animal, person: Person, mode: TransportMode): boolean {
  if (!animal.alive || animal.tamedBy !== person.id) return false;
  if (mode === 'pack') return animal.species === 'donkey' && techPower(person, 'pack_animals') > 0;
  return animal.species === 'horse' && techPower(person, 'horse_riding') > 0;
}

/** Resolve the canonical live animal only when both sides still name the same lease. */
export function transportOf(
  person: Person,
  animalsById: ReadonlyMap<number, Animal>,
): TransportLease | null {
  if (!person.alive || person.transportAnimalId === null || person.transportMode === null) return null;
  const animal = animalsById.get(person.transportAnimalId);
  if (!animal || Math.hypot(animal.x - person.x, animal.y - person.y) > TRANSPORT_LEASH_RANGE ||
      animal.transportedBy !== person.id || animal.transportMode !== person.transportMode ||
      !supports(animal, person, person.transportMode)) return null;
  return {
    animal,
    mode: person.transportMode,
    capacity: person.transportMode === 'pack' ? DONKEY_PACK_CAPACITY : 0,
    speed: person.transportMode === 'riding' ? HORSE_RIDING_SPEED : 1,
  };
}

export function hasPackAnimal(person: Person, animalsById: ReadonlyMap<number, Animal>): boolean {
  return transportOf(person, animalsById)?.mode === 'pack';
}

export function hasRidingHorse(person: Person, animalsById: ReadonlyMap<number, Animal>): boolean {
  return transportOf(person, animalsById)?.mode === 'riding';
}

export function transportCapacityOf(person: Person, animalsById: ReadonlyMap<number, Animal>): number {
  return transportOf(person, animalsById)?.capacity ?? 0;
}

export function transportSpeedFactorOf(person: Person, animalsById: ReadonlyMap<number, Animal>): number {
  return transportOf(person, animalsById)?.speed ?? 1;
}

/** Claim only a tamed individual of the matching species and known transport practice. */
export function claimTransportAnimal(
  person: Person,
  animal: Animal,
  mode: TransportMode,
  animalsById: ReadonlyMap<number, Animal>,
): boolean {
  if (!supports(animal, person, mode) ||
      (animal.transportedBy !== null && animal.transportedBy !== person.id)) return false;
  if (person.transportAnimalId !== null && person.transportAnimalId !== animal.id) {
    releaseTransportAnimal(person, animalsById);
  }
  person.transportAnimalId = animal.id;
  person.transportMode = mode;
  animal.transportedBy = person.id;
  animal.transportMode = mode;
  person.transportCapacity = mode === 'pack' ? DONKEY_PACK_CAPACITY : 0;
  person.transportAutoClaim = true;
  return true;
}

/** Drop both sides of a lease, including stale person state after death or loss. */
export function releaseTransportAnimal(
  person: Person,
  animalsById: ReadonlyMap<number, Animal>,
): void {
  const animal = person.transportAnimalId === null ? undefined : animalsById.get(person.transportAnimalId);
  if (animal?.transportedBy === person.id) {
    animal.transportedBy = null;
    animal.transportMode = null;
  }
  person.transportAnimalId = null;
  person.transportMode = null;
  person.transportCapacity = 0;
}

/** Refresh the carrying cache and clear leases whose animal, owner, or practice changed. */
export function refreshTransportLease(
  person: Person,
  animalsById: ReadonlyMap<number, Animal>,
): boolean {
  const lease = transportOf(person, animalsById);
  if (!lease) {
    releaseTransportAnimal(person, animalsById);
    return false;
  }
  person.transportCapacity = lease.capacity;
  return true;
}

/** Move a leased individual with its traveller, retaining canonical ownership and IDs. */
export function transferTransportAnimal(
  person: Person,
  sourceAnimals: Animal[],
  sourceById: ReadonlyMap<number, Animal>,
  destinationAnimals: Animal[],
  destinationById: Map<number, Animal>,
): Animal | null {
  const lease = transportOf(person, sourceById);
  if (!lease) {
    releaseTransportAnimal(person, sourceById);
    return null;
  }
  if (destinationById.has(lease.animal.id) || destinationAnimals.includes(lease.animal)) {
    throw new RangeError(`Transport animal ${lease.animal.id} already belongs to the destination`);
  }
  const index = sourceAnimals.indexOf(lease.animal);
  if (index < 0 || sourceById.get(lease.animal.id) !== lease.animal) {
    releaseTransportAnimal(person, sourceById);
    return null;
  }
  sourceAnimals.splice(index, 1);
  (sourceById as Map<number, Animal>).delete(lease.animal.id);
  destinationAnimals.push(lease.animal);
  destinationById.set(lease.animal.id, lease.animal);
  return lease.animal;
}