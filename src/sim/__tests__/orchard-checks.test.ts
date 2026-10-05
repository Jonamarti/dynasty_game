/**
 * `orchards-are-planted` (M15 phase 24) and the `orchard` scenario that exists
 * to reach it. Measured against the broken build first: with `plant` never
 * scored the band plants nothing and the check fails, so green means somebody
 * set a tree.
 */
import { describe, expect, it } from 'vitest';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';
import { Simulation } from '../core/Simulation.ts';

const find = (report: ReturnType<typeof runScenario>) => report.checks.find(c => c.id === 'orchards-are-planted');

describe('orchards-are-planted', () => {
  it('is not applicable where nobody knows how to plant', () => {
    expect(find(runScenario(SCENARIOS.tiny!, 2))).toMatchObject({ ok: true, skipped: true });
  });

  it('fails when nobody ever plants (the broken build)', () => {
    // The scorer reads `plantable`, so a world where the order is refused for
    // want of room is a band that knows and cannot: nothing is ever set.
    const real = Simulation.prototype.plantTree;
    Simulation.prototype.plantTree = () => null;
    try {
      const report = runScenario(SCENARIOS.orchard!, 4000);
      expect(find(report)).toMatchObject({ ok: false });
      expect(find(report)?.skipped).not.toBe(true);
    } finally {
      Simulation.prototype.plantTree = real;
    }
  }, 120000);

  it('passes in orchard, where adults with fruit and the idea plant beside the camp', () => {
    const report = runScenario(SCENARIOS.orchard!);
    expect(find(report)).toMatchObject({ ok: true });
    expect(find(report)?.skipped).not.toBe(true);
    expect(report.checks.find(c => c.id === 'people-on-land')).toMatchObject({ ok: true });
    expect(report.checks.find(c => c.id === 'regions-stay-true')).toMatchObject({ ok: true });
    // Nobody turned back at the hole for want of room: claims keep the planters
    // apart (23 refusals for 4 trees before they did).
    expect(report.telemetry?.abandoned_no_room_for_a_tree ?? 0).toBeLessThanOrEqual(2);
  }, 120000);
});
