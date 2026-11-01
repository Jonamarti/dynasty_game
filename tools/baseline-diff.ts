import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compareScenarioMatrices, isBaselineRegression, parseScenarioMatrix, validateMatrixCoverage,
  type MatrixTransition, type ScenarioMatrixRecord } from './baseline-diff-lib.ts';

// Exit 0: complete with no new regression, 1: new failing/NA transition,
// exit 2: invalid/partial matrix or CLI error. Never re-pin automatically.
const args = process.argv.slice(2).filter(value => value !== '--');
function optionalArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  const next = args[i + 1];
  if (!next || next.startsWith('--')) {
    console.error('Missing path/value after ' + flag);
    process.exit(2);
  }
  args.splice(i, 2);
  return next;
}
const jsonOutput = optionalArg('--json');
const mdOutput = optionalArg('--md');
const shardValue = optionalArg('--shard');
let shard: { part: number; total: number } | undefined;
if (shardValue !== undefined) {
  const match = /^([0-9]+)\/([0-9]+)$/.exec(shardValue);
  if (!match) { console.error('Invalid --shard part/total'); process.exit(2); }
  const part = Number(match[1]), total = Number(match[2]);
  if (!Number.isSafeInteger(part) || !Number.isSafeInteger(total) || total < 1 || part < 1 || part > total) {
    console.error('Invalid --shard part/total'); process.exit(2);
  }
  shard = { part, total };
}
if (args.length !== 2) {
  console.error('Usage: baseline:diff -- <before.json> <after.json> [--shard part/total] [--json report.json] [--md report.md]');
  process.exit(2);
}
for (const output of [jsonOutput, mdOutput]) {
  if (output && [args[0], args[1]].some(input => resolve(output) === resolve(input))) {
    console.error('Refusing to overwrite input matrix: ' + output);
    process.exit(2);
  }
}
if (jsonOutput && mdOutput && resolve(jsonOutput) === resolve(mdOutput)) {
  console.error('--json and --md must have distinct paths');
  process.exit(2);
}
type Verdict = 'invalid' | 'regression' | 'ok';
type Report = {
  version: number; verdict: Verdict; exit_code: number;
  baseline: string; actual: string; shard: { part: number; total: number } | null;
  expected_scenarios: number; actual_scenarios: number;
  baseline_known_failed_checks: number;
  coverage_errors: string[]; transitions: MatrixTransition[];
  regressions: MatrixTransition[]; error: string | null;
};

function isRegression(t: MatrixTransition): boolean {
  return isBaselineRegression([t]);
}
function markdown(report: Report): string {
  const esc = (s: string) => s.replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');
  const lines = [
    '# Scenario matrix baseline comparison', '',
    'Verdict: **' + report.verdict + '** (exit ' + report.exit_code + ')',
    'Baseline: ' + report.baseline, 'Actual: ' + report.actual,
    'Shard: ' + (report.shard ? report.shard.part + '/' + report.shard.total : 'all'),
    'Expected scenarios: ' + report.expected_scenarios,
    'Actual scenarios: ' + report.actual_scenarios,
    'Known baseline failures: ' + report.baseline_known_failed_checks,
    'Regressed checks: ' + report.regressions.reduce((n, x) => n + x.checks.length, 0),
    ''
  ];
  if (report.error) lines.push('Invalid input: ' + esc(report.error), '');
  if (report.coverage_errors.length) {
    lines.push('## Coverage errors', '');
    for (const problem of report.coverage_errors) lines.push('- ' + esc(problem));
    lines.push('');
  }
  lines.push('## Status transitions', '',
    '| Scenario | From | To | Checks | Regression |',
    '| --- | --- | --- | --- | --- |');
  for (const t of report.transitions) {
    lines.push('| ' + esc(t.scenario) + ' | ' + t.from + ' | ' + t.to +
      ' | ' + esc(t.checks.join(', ')) + ' | ' + (isRegression(t) ? 'YES' : 'no') + ' |');
  }
  if (!report.transitions.length) lines.push('| - | - | - | no changes | - |');
  return lines.join('\n') + '\n';
}
function finish(report: Report): never {
  try {
    if (jsonOutput) {
      mkdirSync(dirname(resolve(jsonOutput)), { recursive: true });
      writeFileSync(jsonOutput, JSON.stringify(report, null, 2) + '\n', 'utf8');
    }
    if (mdOutput) {
      mkdirSync(dirname(resolve(mdOutput)), { recursive: true });
      writeFileSync(mdOutput, markdown(report), 'utf8');
    }
  } catch (error) {
    console.error('Unable to save audit evidence: ' + String(error));
    process.exit(2);
  }
  process.exit(report.exit_code);
}
const report: Report = {
  version: 1, verdict: 'invalid', exit_code: 2,
  baseline: args[0]!, actual: args[1]!, shard: shard ?? null,
  expected_scenarios: 0, actual_scenarios: 0, baseline_known_failed_checks: 0,
  coverage_errors: [], transitions: [], regressions: [], error: null,
};
function readMatrix(path: string): ScenarioMatrixRecord[] {
  try {
    return parseScenarioMatrix(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  } catch (error) {
    report.error = 'Cannot read matrix ' + path + ': ' + (error instanceof Error ? error.message : String(error));
    console.error(report.error);
    return finish(report);
  }
}
const before = readMatrix(args[0]!);
const after = readMatrix(args[1]!);
const expected = shard
  ? before.filter((_, i) => i % shard!.total === shard!.part - 1) : before;
report.expected_scenarios = expected.length;
report.actual_scenarios = after.length;
report.baseline_known_failed_checks = expected.reduce((sum, row) => sum + row.failed.length, 0);
report.coverage_errors = validateMatrixCoverage(before, after, shard);
report.transitions = compareScenarioMatrices(before, after);
report.regressions = report.transitions.filter(isRegression);
for (const issue of report.coverage_errors) {
  console.error('Matrix coverage error: ' + issue);
  if (process.env.GITHUB_ACTIONS) console.log('::error title=Matrix coverage::' + issue);
}
if (report.transitions.length === 0 && report.coverage_errors.length === 0) {
  console.log('No check status changes.');
}
for (const transition of report.transitions) {
  const ids = transition.checks.join(', ');
  console.log(transition.scenario + ': ' + transition.from + ' -> ' + transition.to + ': ' + ids);
  if (process.env.GITHUB_ACTIONS) {
    const lost = isRegression(transition);
    console.log('::' + (lost ? 'error' : 'notice') + ' title=' +
      transition.scenario + ': ' + transition.from + ' -> ' + transition.to + '::' + ids);
  }
}
report.exit_code = report.coverage_errors.length ? 2 : report.regressions.length ? 1 : 0;
report.verdict = report.exit_code === 2 ? 'invalid' : report.exit_code === 1 ? 'regression' : 'ok';
console.log('Baseline verdict: ' + report.verdict + '; known failed checks: ' +
  report.baseline_known_failed_checks + '; regressed transitions: ' + report.regressions.length);
finish(report);
