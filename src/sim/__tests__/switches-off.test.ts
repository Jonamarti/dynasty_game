import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { switchesOffFingerprints } from '../../../tools/switches-off-checkpoint.ts';

// Re-pin only when a phase changes the world on purpose, and say so in the commit (`docs/m16/README.md` §5).
describe('M16 switches off', () => {
  // Three full 3,000-step band replays deliberately protect the whole checkpoint.
  it('preserves the pinned checkpoint for seeds 1, 2, and 3', () => {
    const expected = JSON.parse(readFileSync(resolve('fixtures/switches-off.json'), 'utf8')) as Record<string, string>;
    expect(switchesOffFingerprints()).toEqual(expected);
  }, 60_000);
});
