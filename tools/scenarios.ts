/**
 * CLI: run every scenario and print a pass/fail matrix.
 *
 * This is the gate in `npm run verify`. A change that keeps `band` healthy but
 * quietly breaks `harsh-winter` is exactly the kind of regression a single
 * scenario hides.
 */
import { SCENARIOS, runScenario, formatReport, thousands, markMatrixRun } from './simcheck.ts';

// M11 phase 17d: wall-clock checks report and do not judge in the matrix.
markMatrixRun();

const verbose = process.argv.includes('--verbose');
const rows: { name: string; passed: number; total: number; failed: string[]; stepsPerSecond: number }[] = [];

for (const scenario of Object.values(SCENARIOS)) {
  const report = runScenario(scenario);
  if (verbose) console.log(formatReport(report));
  const failed = report.checks.filter(c => !c.ok);
  const applicable = report.checks.filter(c => !c.skipped);
  rows.push({
    name: scenario.name,
    passed: applicable.length - failed.length,
    total: applicable.length,
    failed: failed.map(c => c.id),
    stepsPerSecond: report.stepsPerSecond,
  });
}

const pad = (s: string, n: number) => s.padEnd(n);
console.log('');
console.log('SCENARIO MATRIX');
console.log('='.repeat(78));
console.log('  ' + pad('scenario', 16) + pad('checks', 10) + pad('steps/s', 12) + 'failures');
for (const row of rows) {
  console.log(
    '  ' + pad(row.name, 16) +
    pad(row.passed + '/' + row.total, 10) +
    pad(thousands(row.stepsPerSecond), 12) +
    (row.failed.length === 0 ? '-' : row.failed.join(', '))
  );
}
console.log('='.repeat(78));

const anyFailed = rows.some(r => r.failed.length > 0);
console.log(anyFailed ? 'SOME SCENARIOS FAILED' : 'ALL SCENARIOS HEALTHY');
console.log('');
process.exit(anyFailed ? 1 : 0);
