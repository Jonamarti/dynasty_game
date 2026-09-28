import { describe, expect, it } from 'vitest';
import { projectBackerCoverage, projectCrewWithinLimit } from '../../../tools/simcheck.ts';

describe('construction checks', () => {
  it('fails when an unbacked project attracts more than its sponsor', () => {
    const site = {
      first200Workers: new Set<number>([1, 2]),
      backers: [],
      first200Ordered: new Set<number>(),
    };

    expect(projectCrewWithinLimit(site)).toBe(false);
  });

  it('counts backers and ordered contributors against the crew limit', () => {
    const site = {
      first200Workers: new Set([1, 2, 3]),
      backers: [2],
      first200Ordered: new Set([3]),
    };

    expect(projectCrewWithinLimit(site)).toBe(true);
  });

  it('measures backers on finished planner projects, excluding player sites', () => {
    const coverage = projectBackerCoverage([
      { complete: true, playerPlaced: false, backers: [2] },
      { complete: true, playerPlaced: false, backers: [] },
      { complete: true, playerPlaced: true, backers: [] },
      { complete: false, playerPlaced: false, backers: [] },
    ]);

    expect(coverage).toEqual({ backed: 1, total: 2, ratio: 0.5 });
    expect(coverage.ratio).toBeLessThan(0.7);
  });
});
