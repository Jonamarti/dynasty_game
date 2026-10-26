import { readFileSync } from 'node:fs';
import { compareScenarioMatrices, isBaselineRegression, parseScenarioMatrix, validateMatrixCoverage } from './baseline-diff-lib.ts';

const args = process.argv.slice(2).filter(value => value !== '--');
const shardFlag = args.indexOf('--shard');
let shard: { part: number; total: number } | undefined;
if (shardFlag !== -1) {
  const match = /^([0-9]+)\/([0-9]+)$/.exec(args[shardFlag + 1] ?? '');
  if (!match) { console.error('Invalid --shard part/total'); process.exit(2); }
  const part = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(part) || !Number.isSafeInteger(total) || total < 1 || part < 1 || part > total) {
    console.error('Invalid --shard part/total'); process.exit(2);
  }
  shard = { part, total };
  args.splice(shardFlag, 2);
}
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
const coverageErrors = validateMatrixCoverage(before, after, shard);
for (const error of coverageErrors) {
  console.error(`Matrix coverage error: ${error}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Matrix coverage::${error}`);
}
const transitions = compareScenarioMatrices(before, after);
if (transitions.length === 0 && coverageErrors.length === 0) {
  console.log('No check status changes.');
} else {
  for (const transition of transitions) {
    console.log(`${transition.scenario}: ${transition.from} -> ${transition.to}: ${transition.checks.join(', ')}`);
    // On GitHub Actions, put each change on the PR: a lost pass as an error, anything else as a notice.
    if (process.env.GITHUB_ACTIONS) {
      const lost = transition.from === 'passed';
      console.log(`::${lost ? 'error' : 'notice'} title=${transition.scenario}: ${transition.from} -> ${transition.to}::${transition.checks.join(', ')}`);
    }
  }
}
process.exit(coverageErrors.length > 0 ? 2 : isBaselineRegression(transitions) ? 1 : 0);
