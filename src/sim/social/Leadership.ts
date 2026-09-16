/**
 * The part of leadership that belongs to the band rather than to any one
 * relationship.
 *
 * A welcome is deliberately derived from one timestamp. Putting a positive
 * deed on every edge would make succession O(band size), survive longer than
 * the feeling it represents, and need another cleanup path when somebody
 * changes bands.
 */
import type { Band } from '../core/Simulation.ts';
import type { Person } from '../entities/Person.ts';
import { techPower } from '../knowledge/Tech.ts';

/** A chief normally holds office for half of the current forty-day year. */
export const CHIEF_TERM_DAYS = 20;

/** The welcome loses half its force every four days. */
const CHIEF_HONEYMOON_HALF_LIFE_DAYS = 4;

/**
 * How much longer a chief who understands `chiefdom` holds the office.
 *
 * Half again — twenty days becomes thirty, three quarters of the current
 * forty-day year. The note 4d is built on is that a band gains a *shape*, and
 * the chief's half of that is tenure: an office somebody holds, rather than a
 * standing that has to be re-won before the welcome has even faded. Deliberately
 * a multiplier on `CHIEF_TERM_DAYS` rather than a second number, so shortening
 * the year again moves both together — the two-clocks lesson from phase 3.
 */
const CHIEFDOM_TERM_BONUS = 0.5;

/**
 * How long this particular chief's term runs.
 *
 * A function of the person, not of the band, because the knowledge is theirs:
 * a band that replaces a chief who understood chiefdom with one who does not
 * goes back to the short term, and that is the correct reading. `techPower`
 * scales it, so a half-worked-out idea buys half the extra tenure.
 */
export function chiefTermDays(chief: Person | null | undefined): number {
  if (!chief) return CHIEF_TERM_DAYS;
  return CHIEF_TERM_DAYS * (1 + CHIEFDOM_TERM_BONUS * techPower(chief, 'chiefdom'));
}

/**
 * 1 on the day a chief takes office, halving every four days thereafter.
 *
 * Pure because both the daily band decision and the per-order authority check
 * read it. Looking at somebody's standing must never advance or roll the world.
 */
export function chiefHoneymoon(band: Band, day: number): number {
  if (band.chiefId === null || band.chiefSince === null) return 0;
  const daysHeld = Math.max(0, day - band.chiefSince);
  return Math.pow(0.5, daysHeld / CHIEF_HONEYMOON_HALF_LIFE_DAYS);
}
