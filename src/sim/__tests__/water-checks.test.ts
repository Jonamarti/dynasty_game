import { describe, expect, it } from 'vitest';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';
import { EARTH_UNIT } from '../core/Earth.ts';
import type { Simulation } from '../core/Simulation.ts';

function lowShore(sim: Simulation) {
  const w = sim.world;
  return w.shoreTiles.find(t => w.elevation[w.index(t.x, t.y)]! - w.waterLevel < 6 * EARTH_UNIT
    && w.biomeAt(t.x, t.y) !== 'rock')!;
}
const find = (report: ReturnType<typeof runScenario>) => report.checks.find(c => c.id === 'water-follows-the-trench');

describe('water-follows-the-trench measurement', () => {
  it('is not applicable where nothing was dug', () => {
    expect(find(runScenario(SCENARIOS.tiny!, 2))).toMatchObject({ ok: true, skipped: true });
  });

  it('passes where a trench was dug and the water followed it', () => {
    const report = runScenario({ ...SCENARIOS.tiny!, setup: sim => {
      const t = lowShore(sim);
      sim.world.dig(t.x, t.y, 7 * EARTH_UNIT);
    } }, 2);
    expect(find(report)).toMatchObject({ ok: true });
    expect(find(report)?.skipped).not.toBe(true);
  });

  it('fails on a build where a dig path skips the fill (verified against the broken behaviour)', () => {
    const report = runScenario({ ...SCENARIOS.tiny!, setup: sim => {
      const t = lowShore(sim);
      // The pre-26d behaviour: the ground goes down, the water does not come.
      sim.world.offset[sim.world.index(t.x, t.y)] = -7 * EARTH_UNIT;
    } }, 2);
    expect(find(report)).toMatchObject({ ok: false });
  });
});
