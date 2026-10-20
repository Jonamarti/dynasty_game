/** Selection is separate from execution so a typo cannot launch the whole matrix. */
export function selectScenarios<T extends { name: string; slow?: boolean; areas?: string[] }>(
  scenarios: readonly T[], area?: string, includeSlow = false,
): T[] {
  if (area !== undefined && !scenarios.some(scenario => scenario.areas?.includes(area))) {
    throw new Error(`Unknown scenario area "${area}"`);
  }
  return scenarios.filter(scenario => (includeSlow || !scenario.slow)
    && (area === undefined || scenario.areas?.includes(area)));
}
