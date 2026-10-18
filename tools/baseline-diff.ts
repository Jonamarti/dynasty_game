import { readFileSync } from 'node:fs';
import { compareScenarioMatrices, isBaselineRegression, parseScenarioMatrix } from './baseline-diff-lib.ts';

const args = process.argv.slice(2).filter(value => value !== '--');
if (args.length !== 2) {
  console.error('Usage: baseline:diff -- <before.json> <after.json>');
  process.exit(2);
}

function readMatrix(path: string) {
  try {
    return parseScenarioMatrix(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  } catch (error) {
    console.error(`Cannot read matrix ${path}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

const before = readMatrix(args[0]!);
const after = readMatrix(args[1]!);
const transitions = compareScenarioMatrices(before, after);
if (transitions.length === 0) {
  console.log('No check status changes.');
} else {
  for (const transition of transitions) {
    console.log(`${transition.scenario}: ${transition.from} -> ${transition.to}: ${transition.checks.join(', ')}`);
  }
}
process.exit(isBaselineRegression(transitions) ? 1 : 0);
