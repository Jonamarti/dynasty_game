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

/** Diagnostic observations, not a pinned baseline. Save these separately from
 * the status-only matrix to explain *why* a check changed without moving any
 * thresholds or relying on wall-clock performance.
 */
export function scenarioCheckDetails(
  name: string,
  checks: readonly (CheckResultLike & { detail: string })[],
): {
  name: string;
  passed: number;
  failed: number;
  notApplicable: number;
  checks: { id: string; status: 'passed' | 'failed' | 'na'; detail: string }[];
} {
  const described = checks.map(check => ({
    id: check.id,
    status: check.skipped ? 'na' as const : check.ok ? 'passed' as const : 'failed' as const,
    detail: check.detail,
  }));
  return {
    name,
    passed: described.filter(check => check.status === 'passed').length,
    failed: described.filter(check => check.status === 'failed').length,
    notApplicable: described.filter(check => check.status === 'na').length,
    checks: described,
  };
}
