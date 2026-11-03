import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparisonMarkdown } from './runtime-checkpoint-compare.mjs';

const pinned = () => ({
  node: '22.23.3', v8: '12.4', required_node: '22.23.3',
  compatible: true, agrees_with_reference: true,
  scenario: 'band', steps: 3000, fixture: 'fixtures/switches-off.json',
  observations: ['1','2','3'].map(seed => ({seed, expected: seed, actual: seed, match: true})),
});
const alternative = () => ({
  ...pinned(), node: '24.0.0', v8: '13.0', compatible: false,
});
test('reports the same reference and a Node 24 divergence without rejecting it', () => {
  const node24 = alternative();
  node24.observations[1].actual = 'changed';
  node24.observations[1].match = false;
  assert.match(comparisonMarkdown(pinned(), node24), /Divergent seeds: 2/);
});
test('fails when pinned Node cannot reproduce a checkpoint', () => {
  const node22 = pinned();
  node22.observations[0].actual = 'other';
  node22.observations[0].match = false;
  node22.agrees_with_reference = false;
  assert.throws(() => comparisonMarkdown(node22, alternative()), /Pinned Node 22/);
});
test('fails if a seed is missing or duplicated', () => {
  const node24 = alternative();
  node24.observations[1] = {...node24.observations[0]};
  assert.throws(() => comparisonMarkdown(pinned(), node24), /seed/);
});
test('fails if runtime identities or reference fixtures disagree', () => {
  const node24 = alternative();
  node24.observations[0].expected = 'not-the-same';
  node24.observations[0].match = false;
  assert.throws(() => comparisonMarkdown(pinned(), node24), /different pinned reference/);
  assert.throws(() => comparisonMarkdown({...pinned(), node: '23.7.0'}, alternative()), /Pinned Node 22/);
});
