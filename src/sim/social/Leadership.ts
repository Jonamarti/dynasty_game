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

/** A chief normally holds office for half of the current forty-day year. */
export const CHIEF_TERM_DAYS = 20;

/** The welcome loses half its force every four days. */
const CHIEF_HONEYMOON_HALF_LIFE_DAYS = 4;

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
