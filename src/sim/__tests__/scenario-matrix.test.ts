import { describe, expect, it } from 'vitest';
import { scenarioMatrixRecord, scenarioCheckDetails } from '../../../tools/scenario-matrix.ts';

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
  it('reports underlying check evidence without changing classification', () => {
    const rows = [
      { id: 'healthy', ok: true, detail: '1 completed' },
      { id: 'broken', ok: false, detail: '0 completed' },
      { id: 'unused', ok: true, skipped: true, detail: 'not reachable' },
    ];
    expect(scenarioCheckDetails('lean', rows)).toEqual({
      name: 'lean', passed: 1, failed: 1, notApplicable: 1,
      checks: [
        { id: 'healthy', status: 'passed', detail: '1 completed' },
        { id: 'broken', status: 'failed', detail: '0 completed' },
        { id: 'unused', status: 'na', detail: 'not reachable' },
      ],
    });
    expect(scenarioMatrixRecord('lean', rows).failed).toEqual(['broken']);
  });
});
