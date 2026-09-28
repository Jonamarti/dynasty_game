/** Fraction of a household's weekly food reserve that is still missing. */
export function possessionPressure(
  carriedNutrition: number,
  storedNutrition: number,
  weeklyNeed: number,
): number {
  return Math.max(0, Math.min(1,
    1 - (carriedNutrition + storedNutrition) / Math.max(1, weeklyNeed)));
}
