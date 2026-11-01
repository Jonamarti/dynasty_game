#!/usr/bin/env node
// #12: A pinned engine is a seed/checkpoint contract, not a style preference.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PINNED_NODE = '22.23.3';

export function runtimeRecord(kind, versions = process.versions, platform = process.platform, arch = process.arch) {
  if (typeof versions.node !== 'string' || typeof versions.v8 !== 'string') {
    throw new TypeError('Node and V8 versions must be reported');
  }
  return {
    schema: 1,
    kind,
    node: versions.node,
    v8: versions.v8,
    platform,
    arch,
    required_node: PINNED_NODE,
    compatible: versions.node === PINNED_NODE,
  };
}

export function assertSupportedRuntime(versions = process.versions) {
  const record = runtimeRecord('seeded-simulation', versions);
  if (!record.compatible) {
    throw new Error('Unsupported Node ' + record.node + ' (V8 ' + record.v8 + ') for deterministic saves/baselines. ' +
      'Use Node ' + PINNED_NODE + ' (.nvmrc; e.g. nvm use) before pinning fixtures or running the matrix. ' +
      'Do not regenerate baseline fingerprints on this runtime.');
  }
  return record;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const command = args.shift();
  const outputIndex = args.indexOf('--out');
  let output;
  if (outputIndex !== -1 && args[outputIndex + 1] && !args[outputIndex + 1].startsWith('--')) {
    output = args[outputIndex + 1];
    args.splice(outputIndex, 2);
  }
  if (command !== 'assert' || args.length) {
    console.error('Usage: node tools/runtime-contract.mjs assert [--out <runtime.json>]');
    process.exitCode = 2;
  } else {
    try {
      const record = assertSupportedRuntime();
      if (output) {
        const path = resolve(output);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(record, null, 2) + '\n', 'utf8');
      }
      console.log('Seed runtime: Node ' + record.node + ', V8 ' + record.v8 +
        ', ' + record.platform + '/' + record.arch + ' (supported)');
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    }
  }
}
