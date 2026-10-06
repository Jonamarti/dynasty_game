import { describe, expect, it } from 'vitest';
import {
  bandDistribution, percentile, perceptionEstimate, summarizeDurations, unitCostFromBlocks,
} from '../../../tools/profile-stats.ts';

describe('profile-stats (M15 32a instrument)', () => {
  it('reports mean, p50, p95, max and the slowest steps of a known series', () => {
    // 100 steps of 1 ms, one daily-pass spike of 50 ms at step 40.
    const values = Array.from({ length: 100 }, (_, i) => (i === 40 ? 50 : 1));
    const s = summarizeDurations(values);
    expect(s.meanMs).toBeCloseTo(1.49, 5);
    expect(s.p50Ms).toBe(1);
    expect(s.p95Ms).toBe(1);
    expect(s.maxMs).toBe(50);
    expect(s.slowest[0]).toEqual({ step: 40, ms: 50 });
  });

  it('negative control: a mean alone hides the spike that the distribution shows', () => {
    const flat = summarizeDurations(Array.from({ length: 100 }, () => 1.49));
    const spiky = summarizeDurations(Array.from({ length: 100 }, (_, i) => (i === 40 ? 50 : 1)));
    expect(flat.meanMs).toBeCloseTo(spiky.meanMs, 5);
    expect(flat.maxMs).toBeCloseTo(1.49, 5);
    expect(spiky.maxMs).toBe(50);
  });

  it('handles empty input and uses nearest-rank percentiles', () => {
    expect(summarizeDurations([]).meanMs).toBe(0);
    expect(summarizeDurations([]).tailRatio).toBe(0);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4], 0.95)).toBe(4);
  });

  it('splits individuals per band between inside and outside vision', () => {
    const d = bandDistribution([{ band: 'a', within: 3, outside: 1 }, { band: 'b', within: 0, outside: 6 }]);
    expect(d.total).toBe(10);
    expect(d.outside).toBe(7);
    expect(d.outsideShare).toBeCloseTo(0.7, 5);
    expect(d.bands[0]!.band).toBe('b');
    expect(d.bands[1]!.outsideShare).toBeCloseTo(0.25, 5);
  });

  it('estimates perception as calls x unit cost, per step and as a share of the step', () => {
    const e = perceptionEstimate({ q: { calls: 2000, unitMs: 0.001 }, n: { calls: 1000, unitMs: 0.002 } }, 100, 10);
    expect(e.perKind.q!.callsPerStep).toBe(20);
    expect(e.msPerStep).toBeCloseTo(0.04, 8);
    expect(e.shareOfStep).toBeCloseTo(0.004, 8);
    // Negative control: no counted calls means no perception cost, never NaN.
    const none = perceptionEstimate({ q: { calls: 0, unitMs: 0.5 } }, 100, 10);
    expect(none.msPerStep).toBe(0);
    expect(perceptionEstimate({}, 0, 0).shareOfStep).toBe(0);
  });

  it('derives a unit cost from the median replay block', () => {
    expect(unitCostFromBlocks([9, 1, 2], 2)).toBe(1);
    expect(unitCostFromBlocks([], 2)).toBe(0);
    expect(unitCostFromBlocks([1], 0)).toBe(0);
  });
});
