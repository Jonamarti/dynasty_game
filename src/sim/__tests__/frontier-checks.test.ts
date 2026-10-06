import { describe, expect, it } from 'vitest';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';

const check = (report: ReturnType<typeof runScenario>, id: string) => report.checks.find(c => c.id === id)!;

describe('continental water mechanism checks', () => {
  it('drinks freshwater beside a salt coast and completes a real ford crossing', () => {
    const report = runScenario(SCENARIOS.frontier!);
    for (const id of ['nobody-drinks-the-sea', 'rivers-are-crossed']) {
      expect(check(report, id)).toMatchObject({ ok: true });
      expect(check(report, id).skipped).not.toBe(true);
    }
  }, 15000);

  it('detects the broken build which puts the salt coast in the drinking hash', () => {
    const scenario = SCENARIOS.frontier!;
    const report = runScenario({ ...scenario, setup: sim => {
      scenario.setup!(sim);
      // Reproduce the pre-salinity search with an actual saltwater candidate,
      // rather than writing the failure counter the check later reads.
      sim.freshShoreHash.rebuild(sim.world.saltShore);
      (sim as unknown as { shoreSeen: number }).shoreSeen = sim.world.earthVersion;
    } });
    expect(check(report, 'nobody-drinks-the-sea')).toMatchObject({ ok: false });
    expect(check(report, 'nobody-drinks-the-sea').skipped).not.toBe(true);
  }, 15000);

  it('detects a river whose generated shallow tiles cannot be crossed', () => {
    const scenario = SCENARIOS.frontier!;
    const report = runScenario({ ...scenario, setup: sim => {
      scenario.setup!(sim);
      const world = sim.world;
      for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
        if (world.biomeAt(x, y) === 'river' && world.isWadeTile(x, y)) world.setWalkable(x, y, false);
      }
    } });
    expect(check(report, 'rivers-are-crossed')).toMatchObject({ ok: false });
    expect(check(report, 'rivers-are-crossed').skipped).not.toBe(true);
  }, 15000);
});
