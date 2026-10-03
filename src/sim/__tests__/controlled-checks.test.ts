import { describe, expect, it } from 'vitest';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';

describe('checks with a necessary opportunity', () => {
  it('uses news about the only food, and fails when conversation transfers nothing', () => {
    const scenario = SCENARIOS['food-news']!;
    const check = (report: ReturnType<typeof runScenario>) =>
      report.checks.find(c => c.id === 'word-of-food-travels')!;
    const working = runScenario(scenario);
    expect(check(working)).toMatchObject({ ok: true });
    expect(working.telemetry.harvest_fish).toBeGreaterThan(0);
    const broken = runScenario({ ...scenario, setup: sim => {
      sim.social.converse = () => {};
      scenario.setup!(sim);
    } });
    expect(check(broken)).toMatchObject({ ok: false });
    expect(check(broken).skipped).not.toBe(true);
  }, 15000);

  it('creates hostility through a real assault, and fails if its social consequences are lost', () => {
    const scenario = SCENARIOS.conflicts!;
    const check = (report: ReturnType<typeof runScenario>) =>
      report.checks.find(c => c.id === 'opinions-diverge')!;
    const working = runScenario(scenario);
    expect(check(working)).toMatchObject({ ok: true });
    const broken = runScenario({ ...scenario, setup: sim => {
      const original = sim.social.emit.bind(sim.social);
      sim.social.emit = (...args) => args[0] === 'assault'
        ? { id: -1, type: 'assault', actorId: args[1].id, targetId: args[2]?.id ?? null,
          x: args[1].x, y: args[1].y, tick: args[4], magnitude: args[3], witnesses: 0,
          victimBandId: args[2]?.bandId ?? null }
        : original(...args);
      scenario.setup!(sim);
    } });
    expect(check(broken)).toMatchObject({ ok: false });
    expect(check(broken).skipped).not.toBe(true);
  }, 15000);

  it('does not require unnecessary rumours or enemies in an ordinary quiet world', () => {
    const report = runScenario(SCENARIOS.band!, 2);
    for (const id of ['word-of-food-travels', 'opinions-diverge']) {
      expect(report.checks.find(c => c.id === id)?.skipped).toBe(true);
    }
  });
});
