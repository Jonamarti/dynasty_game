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
import { scenarioMatrixRecord, scenarioCheckDetails, type ScenarioMatrixRecord } from './scenario-matrix.ts';
import { matrixFailureDetails } from './matrix-diagnostics.ts';
import { selectScenarios } from './scenario-selection.ts';
import { validateScenarioOutputs } from './scenario-output.ts';

const outputOption = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
};
let validatedOutputs: ReturnType<typeof validateScenarioOutputs>;
try {
  validatedOutputs = validateScenarioOutputs(outputOption('--json'), outputOption('--details-json'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

// M11 phase 17d: wall-clock checks report and do not judge in the matrix.
markMatrixRun();

const verbose = process.argv.includes('--verbose');
const diagnose = process.argv.includes('--diagnose');
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

// CI splits the matrix across parallel jobs: `--shard 2/4` keeps every fourth
// scenario starting at the second. Round-robin rather than contiguous blocks so
// the slow scenarios do not all land in the same job.
const shardIndex = process.argv.indexOf('--shard');
if (shardIndex >= 0) {
  const match = /^(\d+)\/(\d+)$/.exec(process.argv[shardIndex + 1] ?? '');
  const part = match ? Number(match[1]) : NaN;
  const of = match ? Number(match[2]) : NaN;
  if (!match || of < 1 || part < 1 || part > of) {
    console.error('Usage: sim:check:all -- --shard <part>/<total>   (e.g. --shard 1/4)');
    process.exit(2);
  }
  selected = selected.filter((_, i) => i % of === part - 1);
  console.log(`[shard ${part}/${of}] ${selected.map(s => s.name).join(', ')}`);
}
const rows: { name: string; passed: number; total: number; failed: string[]; stepsPerSecond: number }[] = [];
const matrixRecords: ScenarioMatrixRecord[] = [];
const checkDetails: ReturnType<typeof scenarioCheckDetails>[] = [];
const failureDetails: string[] = [];
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
  if (diagnose) failureDetails.push(...matrixFailureDetails(scenario.name, report.checks));
  const applicable = report.checks.filter(c => !c.skipped);
  matrixRecords.push(scenarioMatrixRecord(scenario.name, report.checks));
  checkDetails.push(scenarioCheckDetails(scenario.name, report.checks));
  rows.push({
    name: scenario.name,
    passed: applicable.length - failed.length,
    total: applicable.length,
    failed: failed.map(c => c.id),
    stepsPerSecond: report.stepsPerSecond,
  });
}

if (jsonPath) {
  const outputPath = validatedOutputs.matrix!;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(matrixRecords, null, 2) + '\n', 'utf8');
}

const detailsIndex = process.argv.indexOf('--details-json');
const detailsPath = detailsIndex >= 0 ? process.argv[detailsIndex + 1] : undefined;
if (detailsIndex >= 0 && (!detailsPath || detailsPath.startsWith('--'))) {
  console.error('Usage: sim:check:all -- --details-json <path>');
  process.exit(2);
}
if (detailsPath) {
  const outputPath = validatedOutputs.details!;
  if (jsonPath && outputPath === resolve(jsonPath)) {
    console.error('Matrix and details must have different output paths');
    process.exit(2);
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({ version: 1, scenarios: checkDetails }, null, 2) + '\n', 'utf8');
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

if (diagnose && failureDetails.length > 0) {
  console.log('');
  console.log('FAILED / N/A CHECK DETAILS (measurements and missing preconditions, no baseline adjustment)');
  for (const detail of failureDetails) console.log(detail);
}

const anyFailed = rows.some(r => r.failed.length > 0);
console.log(anyFailed ? 'SOME SCENARIOS FAILED' : 'ALL SCENARIOS HEALTHY');
console.log('');
process.exit(anyFailed ? 1 : 0);
