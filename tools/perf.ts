/**
 * Repeat the browser system profile three times, serially, then report medians.
 * The unprofiled run measures overall step cost; method timings are inclusive
 * and overlap, so they must not be added together.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizePerfRuns, validateProfileBundle } from './perf-report.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = join(root, 'artifacts/verification', `m16-perf-${stamp}`);
const repetitions = 3;
const steps = Number(process.env.PROFILE_STEPS ?? 480);
if (!Number.isInteger(steps) || steps < 240) {
  throw new Error('PROFILE_STEPS must be an integer >= 240 to include the daily passes');
}
mkdirSync(out, { recursive: true });

function shortened(output: string): string {
  const trimmed = output.trim();
  return trimmed.length <= 3000 ? trimmed : `${trimmed.slice(-3000)}\n[earlier output omitted]`;
}

const viteNode = join(root, 'node_modules/vite-node/dist/cli.mjs');
const profiler = join(root, 'tools/profile-systems.ts');
const bundles: unknown[] = [];

for (let repeat = 1; repeat <= repetitions; repeat++) {
  const runOut = join(out, `run-${String(repeat).padStart(2, '0')}`);
  const child = spawnSync(process.execPath, [viteNode, profiler], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PROFILE_OUTPUT: runOut },
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    const details = [shortened(child.stdout ?? ''), shortened(child.stderr ?? '')].filter(Boolean).join('\n');
    throw new Error(`profile:systems repeat ${repeat}/${repetitions} failed (exit ${child.status})\n${details}`);
  }

  const reportPath = resolve(runOut, 'report.json');
  let bundle: unknown;
  try {
    bundle = JSON.parse(readFileSync(reportPath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Could not read the profile report at ${reportPath}: ${String(error)}`);
  }
  try { validateProfileBundle(bundle, steps); }
  catch (error) { throw new Error(`Invalid profile report at ${reportPath}: ${String(error)}`); }
  bundles.push(bundle);
  console.log(`Profile repeat ${repeat}/${repetitions} complete: ${reportPath}`);
}

const summaries = summarizePerfRuns(bundles, steps);
console.log(`\nMedian timings across ${repetitions} serial profile runs (${steps} steps each):`);
for (const summary of summaries) {
  console.log(`\n${summary.humans} people:`);
  console.log(`  ${'overall mean (unprofiled)'.padEnd(42)} ${summary.overallMeanMsPerStep.toFixed(4)} ms/step`);
  for (const method of summary.methods) {
    console.log(`  ${`${method.name} (inclusive)`.padEnd(42)} ${method.msPerStep.toFixed(4)} ms/step`);
  }
}
console.log('\nInclusive method timings overlap; do not sum them. Reports: ' + out);
