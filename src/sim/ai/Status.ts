import type { Person } from '../entities/Person.ts';
import type { Household } from '../entities/Household.ts';
import { DEED_WEIGHT } from '../social/Events.ts';

/**
 * Relative standing, not a fixed idea of wealth or rank. A family's recent
 * deeds count for the person who did them while the household's standing
 * supplies the slower, inherited part of the comparison.
 */
export function statusPressure(person: Person, household: Household | null, bandAverage: number): number {
  if (!household) return 0;
  let personalRecent = 0;
  for (const deed of person.memory.all()) {
    if (deed.actorId === person.id) personalRecent += DEED_WEIGHT[deed.type] * deed.salience;
  }
  const gap = bandAverage - household.renown - personalRecent;
  return Math.max(0, Math.min(1, gap / 24));
}
