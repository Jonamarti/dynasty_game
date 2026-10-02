/**
 * CLI: run one scenario and print its health report.
 *
 *   npm run sim:check
 *   npm run sim:check -- --scenario harsh-winter
 *   npm run sim:check -- --steps 10000
 *   npm run sim:check -- --json
 */
import { SCENARIOS, runScenario, formatReport } from './simcheck.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// vite-node keeps unknown flag values but strips their names after the package
// script's `--` delimiter; accept the same positional form as `sim:seeds`.
const forwarded = process.argv.slice(2).filter(value => value !== '--');
const scenarioName = arg('scenario') ?? forwarded[0] ?? 'band';
// Only a number counts as a step count: where npm forwards the flag names
// as well (`--scenario century`), `forwarded[1]` is the scenario's name, and
// `Number('century')` is NaN — a run of zero steps that reports every check n/a.
const stepsArg = arg('steps') ?? (/^\d+$/.test(forwarded[1] ?? '') ? forwarded[1] : undefined);
const selectedScenario = SCENARIOS[scenarioName];
if (!selectedScenario) {
  console.error('Unknown scenario "' + scenarioName + '". Available: ' + Object.keys(SCENARIOS).join(', '));
  process.exit(2);
}
const steps = stepsArg ? Number(stepsArg) : undefined;

const report = runScenario(selectedScenario, steps);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatReport(report));
}

process.exit(report.checks.every(c => c.ok) ? 0 : 1);
