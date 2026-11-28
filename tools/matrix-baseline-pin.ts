/**
 * Re-pin fixtures/matrix-baseline.json from the real matrix-shard.json files.
 *
 *   gh run download <run> -n scenario-matrix-1 -D s1   (…and 2, 3, 4)
 *   npm run baseline:matrix-pin -- s1/matrix-shard.json s2/matrix-shard.json s3/matrix-shard.json s4/matrix-shard.json
 *
 * Use the four artifacts of ONE run, and never transcribe annotations: GitHub
 * caps those per level and per step, which is how the 26-oct re-pin lost 35
 * transitions. Re-pinning accepts the current state as "known"; it fixes nothing,
 * so name in the commit what is still failing and where it is being followed.
 */
import { assertSupportedRuntime } from './runtime-contract.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assembleMatrixBaseline, parseScenarioMatrix } from './baseline-diff-lib.ts';
import { SCENARIOS } from './simcheck.ts';
import { selectScenarios } from './scenario-selection.ts';

const args = process.argv.slice(2).filter(value => value !== '--');
const outIndex = args.indexOf('--out');
const output = resolve(outIndex >= 0 ? args.splice(outIndex, 2)[1] ?? '' : 'fixtures/matrix-baseline.json');
if (args.length !== 4) {
  console.error('Usage: baseline:matrix-pin -- <shard-1.json> <shard-2.json> <shard-3.json> <shard-4.json> [--out path]');
  process.exit(2);
}
try {
  assertSupportedRuntime();
  const shards = args.map(path => parseScenarioMatrix(JSON.parse(readFileSync(path, 'utf8')) as unknown));
  const catalog = selectScenarios(Object.values(SCENARIOS), undefined, true).map(scenario => scenario.name);
  const matrix = assembleMatrixBaseline(shards, catalog);
  writeFileSync(output, JSON.stringify(matrix, null, 2) + '\n', 'utf8');
  console.log(`Pinned ${matrix.length} scenarios at ${output}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
