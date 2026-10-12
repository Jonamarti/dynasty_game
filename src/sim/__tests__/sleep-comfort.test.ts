import { describe, expect, it } from 'vitest';
import {
  effectiveSleepMoodQuality, effectiveSleepRecoveryQuality, sleepMoodChange, type SleepComfortSample,
} from '../core/SleepComfort.ts';

const exposed: SleepComfortSample = {
  quality: 0.7, cold: 0, snow: false,
  ownCamp: false, huddled: false, guarded: false, claimed: false,
};

describe('the midnight sleep sample', () => {
  it('improves comfort with a better surface and worsens it with cold and snow', () => {
    const bare = sleepMoodChange(exposed);
    expect(sleepMoodChange({ ...exposed, quality: 1.1 }).comfort).toBeGreaterThan(bare.comfort);
    expect(sleepMoodChange({ ...exposed, cold: 50 }).comfort).toBeLessThan(bare.comfort);
    expect(sleepMoodChange({ ...exposed, snow: true }).comfort).toBeLessThan(bare.comfort);
  });

  it('credits each real security term independently and does not change comfort for them', () => {
    const one = sleepMoodChange({ ...exposed, ownCamp: true });
    expect(one.security).toBeGreaterThan(sleepMoodChange(exposed).security);
    for (const key of ['huddled', 'guarded', 'claimed'] as const) {
      expect(sleepMoodChange({ ...exposed, [key]: true }).security)
        .toBeGreaterThan(sleepMoodChange(exposed).security);
    }
    expect(sleepMoodChange({ ...exposed, ownCamp: true, huddled: true, guarded: true, claimed: true }))
      .toMatchObject({ comfort: 0, security: 2 });
  });

  it('clamps malformed quality and cold inputs instead of emitting non-finite mood', () => {
    expect(Number.isFinite(sleepMoodChange({ ...exposed, quality: Number.NaN, cold: Infinity }).comfort)).toBe(true);
    expect(sleepMoodChange({ ...exposed, quality: -4, cold: -10 }).comfort).toBeCloseTo(-5.6);
  });

  it('ablates only surface quality effects while retaining cold, snow, and safety terms', () => {
    expect(effectiveSleepRecoveryQuality(1.1, false)).toBe(1);
    expect(effectiveSleepMoodQuality(1.1, false)).toBe(0.7);
    expect(effectiveSleepRecoveryQuality(1.1, true)).toBe(1.1);
    expect(effectiveSleepMoodQuality(1.1, true)).toBe(1.1);
    const enabled = sleepMoodChange({ ...exposed, quality: 1.1, cold: 20, snow: true, guarded: true });
    const ablated = sleepMoodChange({ ...exposed, quality: effectiveSleepMoodQuality(1.1, false), cold: 20, snow: true, guarded: true });
    expect(ablated.comfort).toBeLessThan(enabled.comfort);
    expect(ablated.security).toBe(enabled.security);
  });
});
