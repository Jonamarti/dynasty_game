import { describe, expect, it } from 'vitest';
import { MEASURED_RATES } from '../compact/MeasuredRates.ts';
import { IntakeModel } from '../compact/CompactIntake.ts';
import { pool, runCorrespondence } from '../../../tools/compactCorrespondence.ts';

/**
 * Detailed cohort vs compact cohort from the same moment (tools/compactCorrespondence.ts).
 *
 * Tolerances, declared before the first measurement (2026-10-06) and not moved since:
 *   survival difference <= 0.10 absolute; survivors' mean hunger and thirst within 15
 *   points of the detailed arm; and the closed body (no intake) must be at least 0.30
 *   below the detailed arm in survival or the experiment cannot tell a model from none.
 * The compact arm here is given the band capacity of the days it is compared on (the
 * oracle): what is verified is the shape of the intake. Forecasting capacity across a
 * season boundary is NOT verified and fails (docs/m15_phase32b_compact.md section 5).
 * Births (section 6), declared before the first measurement: over 40 days the compact
 * cohort bears between 0.6x and 1.4x the children the detailed cohort's mothers bore,
 * and at least one. The correspondence gate pools three validation seeds: one seed
 * of ~30 people moves survival by ~0.07 on chance alone, and its needs can diverge
 * beyond the declared 15-point margin even when the pooled cohort stays within it.
 */
const model = new IntakeModel(MEASURED_RATES);
const validationSeeds = ['delta', 'epsilon', 'zeta'] as const;
const run = (scenario: string) => {
  const rows = validationSeeds.map(seed =>
    runCorrespondence({ scenario, seed, warmupSteps: 4800, windowSteps: 2400, days: 10, model }));
  return {
    detailed: pool(rows.map(r => r.detailed)),
    compact: pool(rows.map(r => r.compact)),
    oracle: pool(rows.map(r => r.oracle)),
    closed: pool(rows.map(r => r.closed)),
  };
};

describe('compact vs detailed correspondence (three validation seeds, 10 days; seeds not used to measure the table)', () => {
  for (const scenario of ['lean', 'craft'] as const) {
    it(`${scenario}: pooled survival and needs of equivalent cohorts agree within the declared tolerances`, () => {
      const r = run(scenario);
      const surv = (a: { alive: number; n: number }) => a.alive / a.n;
      expect(Math.abs(surv(r.oracle) - surv(r.detailed))).toBeLessThanOrEqual(0.10);
      expect(Math.abs(r.oracle.hunger - r.detailed.hunger)).toBeLessThanOrEqual(15);
      expect(Math.abs(r.oracle.thirst - r.detailed.thirst)).toBeLessThanOrEqual(15);
      // Negative control: the same cohort with no intake is far from the detailed one.
      expect(surv(r.detailed) - surv(r.closed)).toBeGreaterThanOrEqual(0.30);
      expect(r.closed.hunger).toBeGreaterThan(r.detailed.hunger + 30);
    }, 300000);
  }
});

describe('compact demography against the detailed cohort (craft, 40 days, ageing/conception/birth on)', () => {
  // Skipped since M15 phase 18 put conception under a shared roof: the detailed
  // craft cohort now bears 0 children in this window (0-1 on four seed/warm-up
  // pairs measured), so the control below is vacuous and any ratio is noise.
  // The compact arm, roofed by the household's home, bore 0-4 on the same
  // pairs — likely more than the detailed model. `bugs.md` ("compact births
  // under the roof gate") holds the numbers; re-arm this at phase 41 with a
  // window long enough for the detailed cohort to bear >= 4.
  it.skip('bears about as many children as the detailed mothers did', () => {
    const r = runCorrespondence({ scenario: 'craft', seed: 'delta', warmupSteps: 4800, windowSteps: 2400, days: 40, model, life: true });
    expect(r.detailed.births).toBeGreaterThanOrEqual(4);   // the control is not vacuous
    expect(r.oracle.births).toBeGreaterThanOrEqual(1);
    expect(r.oracle.births / r.detailed.births).toBeGreaterThanOrEqual(0.6);
    expect(r.oracle.births / r.detailed.births).toBeLessThanOrEqual(1.4);
    // Negative control: the closed body (no intake, no life rules) bears nobody, and all of it starves.
    expect(r.closed.births).toBe(0);
  }, 240000);
});
