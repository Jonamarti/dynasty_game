/** A strong protein craving may break the home-radius filter if local food masks protein. */
export function chooseCravingFood<T>(
  ordinary: T | null,
  proteinOutsideReach: T | null,
  hasReachableProtein: boolean,
  strongProteinCraving: boolean,
  proteinOf: (node: T) => number,
): T | null {
  if (strongProteinCraving && !hasReachableProtein && proteinOutsideReach &&
      (!ordinary || proteinOf(ordinary) < 0.3)) return proteinOutsideReach;
  return ordinary;
}
