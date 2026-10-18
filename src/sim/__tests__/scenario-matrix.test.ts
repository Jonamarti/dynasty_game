import { describe, expect, it } from 'vitest';
import { scenarioMatrixRecord } from '../../../tools/scenario-matrix.ts';

describe('scenario matrix records', () => {
  it('separates passing, failing, and not-applicable checks without timing data', () => {
    expect(scenarioMatrixRecord('fixture', [
      { id: 'healthy', ok: true },
      { id: 'broken', ok: false },
      { id: 'not-exercised', ok: true, skipped: true },
    ])).toEqual({
      name: 'fixture',
      passed: ['healthy'],
      failed: ['broken'],
      na: ['not-exercised'],
    });
  });
});
