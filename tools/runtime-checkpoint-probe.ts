/**
 * Read-only runtime comparison for issue #12. No fixture writes or re-pins.
 * Run with: ./node_modules/.bin/vite-node tools/runtime-checkpoint-probe.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runtimeRecord } from './runtime-contract.mjs';
import { SWITCHES_OFF_SEEDS, switchesOffFingerprints } from './switches-off-checkpoint.ts';

const expected = JSON.parse(readFileSync(resolve('fixtures/switches-off.json'), 'utf8')) as Record<string, string>;
const actual = switchesOffFingerprints();
const runtime = runtimeRecord('switches-off-checkpoints');
const observations = SWITCHES_OFF_SEEDS.map((seed) => ({
  seed,
  expected: expected[seed] ?? null,
  actual: actual[seed] ?? null,
  match: typeof expected[seed] === 'string' && actual[seed] === expected[seed],
}));
const agreesWithReference = observations.every((observation) => observation.match)
  && Object.keys(expected).length === SWITCHES_OFF_SEEDS.length
  && Object.keys(actual).length === SWITCHES_OFF_SEEDS.length;

const report = {
  ...runtime,
  scenario: 'band',
  steps: 3000,
  fixture: 'fixtures/switches-off.json',
  observations,
  agrees_with_reference: agreesWithReference,
};
writeFileSync(resolve('runtime-checkpoints.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`Node ${runtime.node}, V8 ${runtime.v8}, supported=${runtime.compatible}`);
for (const observation of observations) {
  console.log(`Seed ${observation.seed}: expected=${observation.expected}, actual=${observation.actual}, ${observation.match ? 'MATCH' : 'DIFF'}`);
}
if (runtime.compatible && !agreesWithReference) {
  console.error('Pinned Node failed its own checkpoint reference; do not re-pin.');
  process.exitCode = 1;
} else if (!runtime.compatible) {
  console.log('Diagnostic-only runtime. These values must never be used to re-pin.');
}
