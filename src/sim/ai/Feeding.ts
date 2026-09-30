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
import { canForage, isNursling } from '../entities/LifeStage.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';
import { KIN_SIBLING } from '../social/SocialSystem.ts';

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

/**
 * Hunger at which somebody is visibly wasting away, M15 phase 20: the
 * owner's "if somebody sees she is dying". Short of `criticalThreshold`
 * (85), where health starts to go, so that help can arrive before it does.
 */
export const STARVING_AT = 70;

/** Opinion from which somebody is a friend worth feeding. */
export const FRIEND_OPINION = 30;

/** Close enough to feed: a spouse, close kin, or a friend. */
export function caresFor(feeder: Person, other: Person, relationships: RelationshipGraph): boolean {
  return feeder.spouseId === other.id ||
    relationships.kinship(feeder.id, other.id) >= KIN_SIBLING ||
    relationships.opinion(feeder.id, other.id) >= FRIEND_OPINION;
}

/**
 * Whether `feeder` sees `other` starving and cares enough to feed them, M15
 * phase 20 (owner, 2026-09-30): anybody with a good relationship who sees a
 * person dying of hunger gives them food they carry, or goes and fetches
 * some. Written for the nursing mother, whose milk makes her half as hungry
 * again and whom no rule fed (40-seed `lean`: nursing mothers starved at two
 * to three times the rate of men), and applied to everybody, because what
 * the feeder sees is somebody they love starving, not a nursing mother.
 *
 * A nursling is left to the breast. A child too young to forage is not a
 * feeder; one old enough to pick berries can bring its mother some.
 */
export function starvingInCare(
  feeder: Person,
  other: Person,
  relationships: RelationshipGraph,
  childhood: ChildhoodConfig
): boolean {
  return other.alive && other.id !== feeder.id && other.captiveOf === null &&
    other.needs.hunger >= STARVING_AT && !isNursling(other, childhood) &&
    canForage(feeder, childhood) && caresFor(feeder, other, relationships);
}
