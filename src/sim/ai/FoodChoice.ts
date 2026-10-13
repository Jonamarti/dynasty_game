/** A strong protein craving chooses an available protein meal over lower-protein local food. */
export const CRAVING_PROTEIN_MIN_OPPORTUNITIES = 20;
export const CRAVING_PROTEIN_SELECTION_RATE = 0.9;

/** The diet gate measures choices only when protein was actually reachable. */
export function cravingProteinOpportunityPasses(selected: number, opportunities: number): boolean {
  return opportunities >= CRAVING_PROTEIN_MIN_OPPORTUNITIES &&
    selected / opportunities >= CRAVING_PROTEIN_SELECTION_RATE;
}

export function chooseCravingFood<T>(
  ordinary: T | null,
  proteinAlternative: T | null,
  strongProteinCraving: boolean,
  proteinOf: (node: T) => number,
): T | null {
  if (strongProteinCraving && proteinAlternative && (!ordinary || proteinOf(ordinary) < 0.3)) {
    // `proteinAlternative` is searched with reach enforced first; only when
    // that search fails does the caller pass an out-of-reach fallback.
    return proteinAlternative;
  }
  return ordinary;
}
