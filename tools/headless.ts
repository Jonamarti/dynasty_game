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

const name = arg('scenario') ?? 'band';
const scenario = SCENARIOS[name];
if (!scenario) {
  console.error('Unknown scenario "' + name + '". Available: ' + Object.keys(SCENARIOS).join(', '));
  process.exit(2);
}

const stepsArg = arg('steps');
const steps = stepsArg ? Number(stepsArg) : undefined;

const report = runScenario(scenario, steps);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatReport(report));
}

process.exit(report.checks.every(c => c.ok) ? 0 : 1);
