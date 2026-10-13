import { describe, expect, it } from 'vitest';
import { aggressionSummary, opensAdultAssaultWindow } from '../../../tools/violence-report.ts';

describe('violence report summaries', () => {
  it('reports unavailable aggression statistics after extinction', () => {
    expect(aggressionSummary([])).toEqual({ median: 'n/a', aboveHalf: 'n/a' });
  });

  it('summarizes a living population', () => {
    expect(aggressionSummary([0.2, 0.8, 0.6])).toEqual({ median: '0.60', aboveHalf: '67%' });
  });

  it('opens response windows only for adult human assaults', () => {
    expect(opensAdultAssaultWindow('assault', false)).toBe(true);
    expect(opensAdultAssaultWindow('murder', false)).toBe(false);
    expect(opensAdultAssaultWindow('assault', true)).toBe(false);
  });
});
