import { describe, expect, it } from 'vitest';
import { perceivedFatigue } from '../core/Circadian.ts';

describe('circadian pressure', () => {
  it('modulates the same debt continuously without assigning an action', () => {
    expect(perceivedFatigue(30, 0, 60)).toBe(90);
    expect(perceivedFatigue(30, 0.5, 60)).toBe(0);
    expect(perceivedFatigue(30, 1, 60)).toBe(90);
    const delta = 0.00001;
    // The cosine's slope is bounded by 2πA. Crossing dawn therefore cannot
    // create the discontinuity an isNight branch would introduce.
    expect(Math.abs(perceivedFatigue(30, 0.25 - delta, 60) -
      perceivedFatigue(30, 0.25 + delta, 60))).toBeLessThanOrEqual(2 * Math.PI * 60 * 2 * delta);
  });
  it('allows exhaustion to outweigh daytime alertness, while a rested day stays alert', () => {
    expect(perceivedFatigue(100, 0.5, 60)).toBe(40);
    expect(perceivedFatigue(0, 0.5, 60)).toBe(0);
    expect(perceivedFatigue(100, 0, 60)).toBe(100);
  });
  it('can remove the clock modulation without changing physical debt', () => {
    for (const phase of [0, 0.25, 0.5, 0.75]) expect(perceivedFatigue(40, phase, 0)).toBe(40);
  });
});
