/**
 * `earthworks-are-dug` (M15 phase 26f) and the `diggers` scenario that exists
 * to reach it. Measured against the broken behaviour first: a band that has
 * marked out earthworks and cannot dig them fails the check, so a green result
 * means somebody finished one.
 */
import { describe, expect, it } from 'vitest';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';
import { Building } from '../entities/Building.ts';

const find = (report: ReturnType<typeof runScenario>) => report.checks.find(c => c.id === 'earthworks-are-dug');

describe('earthworks-are-dug', () => {
  it('is not applicable where nobody marked out an earthwork', () => {
    expect(find(runScenario(SCENARIOS.tiny!, 2))).toMatchObject({ ok: true, skipped: true });
  });

  it('fails when the progress is never banked (the broken build)', () => {
    // Sticks are lying about on the island, so a band cannot be made toolless;
    // what can be broken is the thing the check exists to see: that a lift
    // reaches the tile. With `addEarth` doing nothing no earthwork is ever finished.
    const real = Building.prototype.addEarth;
    Building.prototype.addEarth = () => false;
    try {
      const report = runScenario(SCENARIOS.diggers!, 4000);
      expect(find(report)).toMatchObject({ ok: false });
      expect(find(report)?.skipped).not.toBe(true);
    } finally {
      Building.prototype.addEarth = real;
    }
  });

  it('fails on a band that was never asked to dig (sites with no sponsor, and nobody backing them)', () => {
    const report = runScenario({
      ...SCENARIOS.diggers!,
      setup: sim => {
        SCENARIOS.diggers!.setup!(sim);
        for (const site of sim.buildings) if (site.earth) site.sponsorId = null;
      },
    }, 3000);
    expect(find(report)).toMatchObject({ ok: false });
  });

  it('passes in diggers, where the band finishes what the chief marked out', () => {
    const report = runScenario(SCENARIOS.diggers!);
    expect(find(report)).toMatchObject({ ok: true });
    expect(find(report)?.skipped).not.toBe(true);
    // The other invariants hold with earth being moved.
    expect(report.checks.find(c => c.id === 'regions-stay-true')).toMatchObject({ ok: true });
    expect(report.checks.find(c => c.id === 'water-follows-the-trench')).toMatchObject({ ok: true });
    expect(report.checks.find(c => c.id === 'people-on-land')).toMatchObject({ ok: true });
  }, 120000);
});
