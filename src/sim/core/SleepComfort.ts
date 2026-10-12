/**
 * The daily comfort nudge from the one midnight reading of a sleeper.
 * Quality is the physical surface multiplier; the other terms describe the
 * night actually spent there. Keep the arithmetic pure so readers and tests
 * cannot quietly disagree about whether a hearth, huddle, guard or perimeter
 * helped.
 */
export interface SleepComfortSample {
  quality: number;
  cold: number;
  snow: boolean;
  ownCamp: boolean;
  huddled: boolean;
  guarded: boolean;
  claimed: boolean;
}

export interface SleepMoodChange { comfort: number; security: number }

/** Preserve measurements of the actual surface while allowing a quality-effect ablation. */
export function effectiveSleepRecoveryQuality(physicalQuality: number, enabled: boolean): number {
  return enabled ? physicalQuality : 1;
}

/** 0.7 is the exposed-ground baseline in the comfort reader; disabling quality keeps cold/snow active. */
export function effectiveSleepMoodQuality(physicalQuality: number, enabled: boolean): number {
  return enabled ? physicalQuality : 0.7;
}

export function sleepMoodChange(sample: SleepComfortSample): SleepMoodChange {
  const quality = Number.isFinite(sample.quality) ? Math.max(0, Math.min(1.5, sample.quality)) : 0.7;
  const cold = Number.isFinite(sample.cold) ? Math.max(0, Math.min(100, sample.cold)) : 100;
  return {
    comfort: (quality - 0.7) * 8 - cold * 0.04 - (sample.snow ? 2 : 0),
    // An exposed night begins uneasy; camp, company, a watch and claimed land
    // are independent, observable reasons that make it safer.
    security: -2 + (sample.ownCamp ? 1 : 0) + (sample.huddled ? 1 : 0) +
      (sample.guarded ? 1 : 0) + (sample.claimed ? 1 : 0),
  };
}
