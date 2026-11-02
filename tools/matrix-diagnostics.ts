import type { Check } from './simcheck.ts';

/**
 * Short, deterministic diagnostics for matrix failures. Showing only check
 * IDs meant a failure such as "shelter-answers-cold" hid the measurements
 * needed to decide whether roofs were full or nobody sought shelter.
 */
export function matrixFailureDetails(
  scenario: string,
  checks: readonly Pick<Check, 'id' | 'ok' | 'skipped' | 'detail'>[],
): string[] {
  return checks
    .filter(check => !check.ok && !check.skipped)
    .map(check => `  ${scenario} / ${check.id}: ${check.detail}`);
}
