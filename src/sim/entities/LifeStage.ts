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

/** Moves by itself at all: crawling, then walking. */
export function canCrawl(person: Person, childhood: ChildhoodConfig): boolean {
  return person.age >= childhood.crawlYears * person.daysPerYear;
}

/** Finds food for themselves: picks berries, takes from a store. */
export function canForage(person: Person, childhood: ChildhoodConfig): boolean {
  return person.age >= childhood.forageYears * person.daysPerYear;
}

/** Old enough to hunt. */
export function canHunt(person: Person, childhood: ChildhoodConfig): boolean {
  return person.age >= childhood.huntYears * person.daysPerYear;
}

/**
 * How fast a child moves against an adult, 0-1: still before crawling, a
 * crawl, a toddler's walk, a child's run, and from `huntYears` a climb to
 * full speed at `fullSpeedYears` (owner, 2026-09-30: at eight they hunt but
 * run slower than adults; at twelve they run as adults do).
 */
export function ageSpeed(person: Person, childhood: ChildhoodConfig): number {
  const years = person.age / person.daysPerYear;
  if (years >= childhood.fullSpeedYears) return 1;
  if (years < childhood.crawlYears) return 0;
  if (years < childhood.walkYears) return 0.2;
  if (years < childhood.forageYears) return 0.5;
  if (years < childhood.huntYears) return 0.7;
  const span = Math.max(0.001, childhood.fullSpeedYears - childhood.huntYears);
  return 0.8 + 0.2 * (years - childhood.huntYears) / span;
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
