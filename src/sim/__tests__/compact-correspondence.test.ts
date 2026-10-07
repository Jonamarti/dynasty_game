import { describe, expect, it } from 'vitest';
import { MEASURED_RATES } from '../compact/MeasuredRates.ts';
import { IntakeModel } from '../compact/CompactIntake.ts';
import { runCorrespondence } from '../../../tools/compactCorrespondence.ts';

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
 * and at least one. Pooled over three seeds the table in the doc is tighter; one seed
 * of ~30 people bears ~7, so the single-seed band is as wide as chance allows.
 * Cohorts are 31-42 people, so one seed's survival moves by ~0.07 on chance alone.
 */
const model = new IntakeModel(MEASURED_RATES);
const run = (scenario: string, seed: string) =>
  runCorrespondence({ scenario, seed, warmupSteps: 4800, windowSteps: 2400, days: 10, model });

describe('compact vs detailed correspondence (small cohort, 10 days; seeds not used to measure the table)', () => {
  for (const [scenario, seed] of [['lean', 'delta'], ['craft', 'delta']] as const) {
    it(`${scenario}/${seed}: survival and needs of an equivalent cohort agree within the declared tolerances`, () => {
      const r = run(scenario, seed);
      const surv = (a: { alive: number; n: number }) => a.alive / a.n;
      expect(Math.abs(surv(r.oracle) - surv(r.detailed))).toBeLessThanOrEqual(0.10);
      expect(Math.abs(r.oracle.hunger - r.detailed.hunger)).toBeLessThanOrEqual(15);
      expect(Math.abs(r.oracle.thirst - r.detailed.thirst)).toBeLessThanOrEqual(15);
      // Negative control: the same cohort with no intake is far from the detailed one.
      expect(surv(r.detailed) - surv(r.closed)).toBeGreaterThanOrEqual(0.30);
      expect(r.closed.hunger).toBeGreaterThan(r.detailed.hunger + 30);
    }, 180000);
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
