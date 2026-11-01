import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * The matrix CLI produces disposable reports, NEVER canonical input fixtures.
 * Re-pinning is a separate, deliberate command. Reject before simulation,
 * because a run with --slow may use minutes of CI time before reaching output.
 */
export function validateScenarioOutputs(
  jsonPath?: string, detailsPath?: string, projectRoot = process.cwd(),
): { matrix?: string; details?: string } {
  const root = resolve(projectRoot);
  const resolveOutput = (p: string | undefined, label: string) => {
    if (p === undefined) return undefined;
    if (!p.trim() || p.startsWith('--') || p.includes('\0')) {
      throw new Error(label + ' requires a valid output path');
    }
    const absolute = resolve(root, p);
    // On Windows, path comparison is case-insensitive. This is also safe on
    // case-sensitive machines: refuse the ambiguous spelling as well.
    const rel = relative(root, absolute).toLowerCase();
    if (rel === 'fixtures' || rel.startsWith('fixtures' + sep)) {
      throw new Error('Scenario output cannot overwrite pinned fixtures: ' + p);
    }
    return absolute;
  };
  const matrix = resolveOutput(jsonPath, '--json');
  const details = resolveOutput(detailsPath, '--details-json');
  if (matrix && details && matrix.toLowerCase() === details.toLowerCase()) {
    throw new Error('Matrix status and diagnostic details need different output paths');
  }
  return { matrix, details };
}
