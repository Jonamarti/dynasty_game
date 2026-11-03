#!/usr/bin/env node
// CI-only comparison of independent read-only checkpoint replays on Node 22 and 24.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEEDS = ['1', '2', '3'];
const PIN = '22.23.3';

export function comparisonMarkdown(pinned, alternative) {
  const records = [
    { label: 'pinned Node 22', value: pinned },
    { label: 'diagnostic Node 24', value: alternative },
  ];
  for (const { label, value } of records) {
    if (!value || typeof value !== 'object'
      || typeof value.v8 !== 'string'
      || value.scenario !== 'band' || value.steps !== 3000
      || value.fixture !== 'fixtures/switches-off.json'
      || !Array.isArray(value.observations)
      || value.observations.length !== SEEDS.length) {
      throw new Error('Incomplete or invalid checkpoint report for ' + label);
    }
    const seeds = value.observations.map((observation) => observation.seed);
    if (SEEDS.some((seed) => seeds.filter((item) => item === seed).length !== 1)) {
      throw new Error('Incomplete or duplicate seed in ' + label);
    }
    if (value.observations.some((observation) =>
      typeof observation.expected !== 'string'
      || typeof observation.actual !== 'string'
      || observation.match !== (observation.expected === observation.actual))) {
      throw new Error('Inconsistent fingerprint observations for ' + label);
    }
  }
  if (pinned.node !== PIN || pinned.required_node !== PIN || pinned.compatible !== true
    || pinned.agrees_with_reference !== true
    || pinned.observations.some((observation) => !observation.match)) {
    throw new Error('Pinned Node 22 did not reproduce seeds 1-3');
  }
  if (!alternative.node.startsWith('24.') || alternative.required_node !== PIN
    || alternative.compatible !== false) {
    throw new Error('Alternative runtime is not an unsupported Node 24');
  }

  const rows = SEEDS.map((seed) => {
    const a = pinned.observations.find((observation) => observation.seed === seed);
    const b = alternative.observations.find((observation) => observation.seed === seed);
    if (a.expected !== b.expected) {
      throw new Error('The two runs used different pinned reference fixtures');
    }
    return `| ${seed} | \`${a.expected}\` | \`${a.actual}\` | \`${b.actual}\` | ${a.actual === b.actual ? 'same' : 'diverged'} |`;
  });
  const changed = SEEDS.filter((seed) =>
    pinned.observations.find((observation) => observation.seed === seed).actual
    !== alternative.observations.find((observation) => observation.seed === seed).actual);
  return [
    '# Seed checkpoint comparison — read-only',
    '',
    `Pinned runtime: Node ${pinned.node}, V8 ${pinned.v8}. All three checkpoints match.`,
    `Diagnostic runtime: Node ${alternative.node}, V8 ${alternative.v8}. Not supported for pinning.`,
    '',
    '| Seed | Reference | Node 22 | Node 24 | Comparison |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `Divergent seeds: ${changed.length ? changed.join(', ') : 'none observed'}.`,
    'No baseline was generated or modified by this comparison.',
    '',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [pinnedPath, alternativePath, markdownPath] = process.argv.slice(2);
  if (!pinnedPath || !alternativePath || !markdownPath) {
    console.error('Usage: node tools/runtime-checkpoint-compare.mjs <node22.json> <node24.json> <comparison.md>');
    process.exitCode = 2;
  } else {
    try {
      const pinned = JSON.parse(readFileSync(resolve(pinnedPath), 'utf8'));
      const alternative = JSON.parse(readFileSync(resolve(alternativePath), 'utf8'));
      const markdown = comparisonMarkdown(pinned, alternative);
      writeFileSync(resolve(markdownPath), markdown, 'utf8');
      console.log(markdown);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    }
  }
}
