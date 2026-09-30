/**
 * Who feeds a weaned child, M15 phase 20.
 *
 * The owner's rules of 2026-09-30: parents feed their child first, before
 * themselves, and a child too young to find food (under `forageYears`) is fed
 * by the band when no parent is there to do it. One predicate for the scorer
 * that chooses to feed and the action that does it, because the two used to
 * carry their own copies of "hungrier than the parent by five", and a parent
 * past that line was a parent who ate first while the child starved: in
 * `lean`, the mother was hungrier than the child in 79% of the ticks the
 * child spent in danger.
 */
import type { ChildhoodConfig } from '../core/Config.ts';
import type { Person } from '../entities/Person.ts';
import { isNursling } from '../entities/LifeStage.ts';

/** A weaned child is fed from this much hunger on. */
export const CHILD_FEED_AT = 30;

/**
 * How `feeder` stands to feed `child`: as a parent (or a member of the same
 * household), as a bandmate, or not at all. A nursling is fed at the breast
 * and never by hand. A bandmate feeds only a child too young to forage whose
 * parents are nowhere in sight of it: what they see is a hungry small child
 * on its own, which is the only thing they can know.
 */
export function feederRole(
  feeder: Person,
  child: Person,
  childhood: ChildhoodConfig,
  peopleById: ReadonlyMap<number, Person>,
  sightRadius: number
): 'parent' | 'band' | null {
  if (!child.alive || !child.isChild || feeder.isChild || feeder.id === child.id ||
    isNursling(child, childhood)) return null;
  if (feeder.childIds.includes(child.id) ||
    (feeder.householdId !== null && child.householdId === feeder.householdId)) return 'parent';
  if (child.bandId !== feeder.bandId || child.age >= childhood.forageYears * child.daysPerYear) return null;
  const parentThere = [child.motherId, child.fatherId].some(id => {
    const parent = id === null ? undefined : peopleById.get(id);
    return !!parent?.alive && Math.hypot(parent.x - child.x, parent.y - child.y) <= sightRadius;
  });
  return parentThere ? null : 'band';
}
