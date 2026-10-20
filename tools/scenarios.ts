/**
 * CLI: run every scenario and print a pass/fail matrix.
 *
 * This is the gate in `npm run verify`. A change that keeps `band` healthy but
 * quietly breaks `harsh-winter` is exactly the kind of regression a single
 * scenario hides.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCENARIOS, runScenario, formatReport, thousands, markMatrixRun } from './simcheck.ts';
import { scenarioMatrixRecord, type ScenarioMatrixRecord } from './scenario-matrix.ts';
import { selectScenarios } from './scenario-selection.ts';

// M11 phase 17d: wall-clock checks report and do not judge in the matrix.
markMatrixRun();

const verbose = process.argv.includes('--verbose');
const includeSlow = process.argv.includes('--slow');
const areaIndex = process.argv.indexOf('--area');
const area = areaIndex >= 0 ? process.argv[areaIndex + 1] : undefined;
if (areaIndex >= 0 && (!area || area.startsWith('--'))) {
  console.error('Usage: check:area -- <area> [--slow]');
  process.exit(2);
}
let selected: typeof SCENARIOS[string][];
try { selected = selectScenarios(Object.values(SCENARIOS), area, includeSlow); }
catch (error) { console.error((error as Error).message); process.exit(2); }
const rows: { name: string; passed: number; total: number; failed: string[]; stepsPerSecond: number }[] = [];
const matrixRecords: ScenarioMatrixRecord[] = [];
const jsonIndex = process.argv.indexOf('--json');
const jsonPath = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : undefined;
if (jsonIndex >= 0 && (!jsonPath || jsonPath.startsWith('--'))) {
  console.error('Usage: sim:check:all -- --json <path>');
  process.exit(2);
}

for (const scenario of selected) {
  const report = runScenario(scenario);
  if (verbose) console.log(formatReport(report));
  const failed = report.checks.filter(c => !c.ok);
  const applicable = report.checks.filter(c => !c.skipped);
  matrixRecords.push(scenarioMatrixRecord(scenario.name, report.checks));
  rows.push({
    name: scenario.name,
    passed: applicable.length - failed.length,
    total: applicable.length,
    failed: failed.map(c => c.id),
    stepsPerSecond: report.stepsPerSecond,
  });
}

if (jsonPath) {
  const outputPath = resolve(jsonPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(matrixRecords, null, 2) + '\n', 'utf8');
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
