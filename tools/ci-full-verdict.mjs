#!/usr/bin/env node
/**
 * #10: one proof for each required successful CI job/shard on the same run/SHA.
 * All proof files are emitted only after the actual checks pass.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARD_COUNT = 4;
export const REQUIRED_JOBS = ['contract', 'unit', 'matrix', 'e2e'];

export function expectedProofs() {
  return [
    { file: 'unit.json', kind: 'unit', shard: 0, total: 1 },
    ...Array.from({ length: SHARD_COUNT }, (_, i) =>
      ({ file: 'matrix-' + (i + 1) + '.json', kind: 'matrix', shard: i + 1, total: SHARD_COUNT })),
    ...Array.from({ length: SHARD_COUNT }, (_, i) =>
      ({ file: 'e2e-' + (i + 1) + '.json', kind: 'e2e', shard: i + 1, total: SHARD_COUNT })),
  ];
}

export function makeProof(kind, shardArg, env = process.env) {
  const entry = expectedProofs().find(p => p.kind === kind
    && (kind === 'unit' ? shardArg === undefined : String(p.shard) === String(shardArg)));
  if (!entry) throw new Error('Unknown proof: ' + kind + '/' + shardArg);
  if (!/^[0-9a-f]{40}$/i.test(env.GITHUB_SHA ?? '')) throw new Error('Missing valid GITHUB_SHA');
  if (!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')) throw new Error('Missing valid GITHUB_RUN_ID');
  if (!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')) throw new Error('Missing valid GITHUB_RUN_ATTEMPT');
  if (!['push', 'pull_request', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error('Unexpected GITHUB_EVENT_NAME');
  }
  return {
    schema: 1, kind, shard: entry.shard, total: entry.total,
    sha: env.GITHUB_SHA.toLowerCase(), run_id: env.GITHUB_RUN_ID,
    attempt: Number(env.GITHUB_RUN_ATTEMPT), event: env.GITHUB_EVENT_NAME,
  };
}

export function verifyFullGate(results, proofDir, env = process.env) {
  const errors = [];
  for (const name of REQUIRED_JOBS) {
    if (results[name] !== 'success') {
      errors.push('Required job ' + name + ' is ' + String(results[name] ?? 'missing') + ', not success');
    }
  }
  const expected = expectedProofs();
  const byFile = new Map(expected.map(p => [p.file, p]));
  const files = existsSync(proofDir) ? readdirSync(proofDir) : [];
  for (const name of files) if (!byFile.has(name)) errors.push('Unexpected proof file: ' + name);
  for (const entry of expected) {
    if (!files.includes(entry.file)) {
      errors.push('Missing proof: ' + entry.file);
      continue;
    }
    let proof;
    try {
      proof = JSON.parse(readFileSync(join(proofDir, entry.file), 'utf8'));
    } catch (error) {
      errors.push('Unreadable proof ' + entry.file + ': ' + String(error));
      continue;
    }
    if (!proof || typeof proof !== 'object' || Array.isArray(proof)
        || proof.schema !== 1 || proof.kind !== entry.kind
        || proof.shard !== entry.shard || proof.total !== entry.total) {
      errors.push('Invalid proof identity: ' + entry.file);
      continue;
    }
    if (proof.sha !== (env.GITHUB_SHA ?? '').toLowerCase()) {
      errors.push('Proof from another commit: ' + entry.file);
    }
    if (proof.run_id !== env.GITHUB_RUN_ID
        || proof.attempt !== Number(env.GITHUB_RUN_ATTEMPT)
        || proof.event !== env.GITHUB_EVENT_NAME) {
      errors.push('Proof from another run or attempt: ' + entry.file);
    }
  }
  return {
    schema: 1, status: errors.length ? 'failure' : 'success',
    sha: env.GITHUB_SHA ?? null, run_id: env.GITHUB_RUN_ID ?? null,
    attempt: Number(env.GITHUB_RUN_ATTEMPT) || null,
    job_results: results, expected_proofs: expected.length,
    found_proofs: files.length, errors,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, kind, shard] = process.argv.slice(2);
  if (command === 'write') {
    const proof = makeProof(kind, shard);
    const file = expectedProofs().find(p => p.kind === proof.kind && p.shard === proof.shard).file;
    mkdirSync('ci-gate-proofs', { recursive: true });
    writeFileSync(join('ci-gate-proofs', file), JSON.stringify(proof, null, 2) + '\n');
    console.log('CI proof written: ' + file + ', SHA ' + proof.sha);
  } else if (command === 'verify') {
    const results = {
      contract: process.env.CI_CONTRACT_RESULT,
      unit: process.env.CI_UNIT_RESULT,
      matrix: process.env.CI_MATRIX_RESULT,
      e2e: process.env.CI_E2E_RESULT,
    };
    const report = verifyFullGate(results, kind || 'ci-gate-proofs');
    writeFileSync('ci-global-verdict.json', JSON.stringify(report, null, 2) + '\n');
    for (const error of report.errors) console.error('CI GLOBAL BLOCKED: ' + error);
    console.log('Full verification:', report.status, '(' + report.found_proofs + '/' + report.expected_proofs + ' proofs)');
    if (report.errors.length) process.exitCode = 1;
  } else {
    console.error('Usage: ci-full-verdict.mjs write <unit|matrix|e2e> [shard] | verify [proof-directory]');
    process.exitCode = 2;
  }
}
