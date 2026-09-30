/**
 * Where a person is in growing up, read against the owner's timeline in
 * `ChildhoodConfig`.
 *
 * One place for these questions for the reason `vigour` is one multiplier:
 * "is this child still at the breast" asked in five files with five slightly
 * different thresholds is how a baby ends up weaned in the scorer and still
 * nursing in the action system.
 */
import type { ChildhoodConfig } from '../core/Config.ts';
import type { Person } from './Person.ts';

/** Still at the breast: nursed, never fed by hand. */
export function isNursling(person: Person, childhood: ChildhoodConfig): boolean {
  return person.age < childhood.weanYears * person.daysPerYear;
}

/** Walks on their own; carried by somebody before this. */
export function canWalk(person: Person, childhood: ChildhoodConfig): boolean {
  return person.age >= childhood.walkYears * person.daysPerYear;
}

/**
 * Has milk: a woman whose own baby is alive and not yet weaned. Lactation is
 * read off the baby rather than stored, so it cannot outlive the child it
 * belongs to or be forgotten when a birth is registered some other way.
 */
export function isLactating(
  woman: Person,
  peopleById: ReadonlyMap<number, Person>,
  childhood: ChildhoodConfig
): boolean {
  if (woman.sex !== 'female' || !woman.alive) return false;
  return woman.childIds.some(id => {
    const child = peopleById.get(id);
    return !!child?.alive && child.motherId === woman.id && isNursling(child, childhood);
  });
}
