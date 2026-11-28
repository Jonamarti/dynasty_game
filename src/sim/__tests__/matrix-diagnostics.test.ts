import { describe, expect, it } from 'vitest';
import { matrixFailureDetails } from '../../../tools/matrix-diagnostics.ts';

describe('matrix diagnostic details', () => {
  it('shows measurements for failing checks but does not change results', () => {
    const checks = [
      { id: 'shelter-answers-cold', ok: false, detail: 'final avgCold=97.6, roof_full=82' },
      { id: 'people-act-on-what-they-know', ok: true, detail: '960/960' },
      { id: 'conception-needs-a-roof', ok: true, skipped: true, detail: 'no couples' },
    ];
    expect(matrixFailureDetails('orchard', checks)).toEqual([
      '  FAIL orchard / shelter-answers-cold: final avgCold=97.6, roof_full=82',
      '  N/A orchard / conception-needs-a-roof: no couples',
    ]);
    expect(checks[0]?.ok).toBe(false);
    expect(checks[2]?.skipped).toBe(true);
  });

  it('retains every independent failure in stable input order', () => {
    expect(matrixFailureDetails('culture', [
      { id: 'unknown-target', ok: false, detail: 'unknown by action: hunt=1' },
      { id: 'gossip-is-aimed', ok: false, detail: '0 aimed reports' },
    ])).toEqual([
      '  FAIL culture / unknown-target: unknown by action: hunt=1',
      '  FAIL culture / gossip-is-aimed: 0 aimed reports',
    ]);
  });
});
