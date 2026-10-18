/** Machine-readable health verdicts, with timing kept out of the baseline. */
export interface ScenarioMatrixRecord {
  name: string;
  passed: string[];
  failed: string[];
  na: string[];
}

interface CheckResultLike {
  id: string;
  ok: boolean;
  skipped?: boolean;
}

/** Keep the same applicability rule as the human-readable scenario matrix. */
export function scenarioMatrixRecord(name: string, checks: readonly CheckResultLike[]): ScenarioMatrixRecord {
  return {
    name,
    passed: checks.filter(check => !check.skipped && check.ok).map(check => check.id),
    failed: checks.filter(check => !check.skipped && !check.ok).map(check => check.id),
    na: checks.filter(check => check.skipped).map(check => check.id),
  };
}
