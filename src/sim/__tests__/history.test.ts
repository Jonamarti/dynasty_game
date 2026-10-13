import { describe, expect, it } from 'vitest';
import { HistoryWatch, formatHistory } from '../../../tools/history.ts';
import { Simulation } from '../core/Simulation.ts';
import { telemetry } from '../core/Telemetry.ts';

describe('historical measurement', () => {
  it('prints unknown denominators explicitly', () => {
    const sim = new Simulation({ seed: 'history-empty', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 4 } });
    telemetry.reset();
    telemetry.enable();
    const report = formatHistory([new HistoryWatch(sim).finish()]);
    expect(report).toContain('drawdown p50/p90/max n/a/n/a/n/a');
    expect(report).toContain('answered n/a (0/0 unanswered; actions none; unanswered none)');
    expect(report).toContain('fertility funnel n/a (no opportunities)');
    telemetry.disable();
    telemetry.reset();
  });
  it('reports the victim action distribution behind the answered proxy', () => {
    const sim = new Simulation({ seed: 'history-answered', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 4 } });
    telemetry.reset();
    telemetry.enable();
    telemetry.count('blow_repeat', 3);
    telemetry.count('blow_repeat_unanswered', 2);
    telemetry.count('blow_repeat_action_give', 2);
    telemetry.count('blow_repeat_action_flee', 1);
    telemetry.count('blow_repeat_unanswered_action_give', 2);
    telemetry.count('conception_opportunity', 3);
    telemetry.count('conception_block_spacing', 1);
    telemetry.count('conception_block_partner', 1);
    telemetry.count('conception_attempt', 1);
    telemetry.count('conception_expected_rolls', 0.5);
    telemetry.count('conception_roll_miss', 1);
    expect(formatHistory([new HistoryWatch(sim).finish()])).toContain(
      'answered 0.333 (2/3 unanswered; actions flee:1,give:2; unanswered give:2)'
    );
    expect(formatHistory([new HistoryWatch(sim).finish()])).toContain(
      'fertility funnel opportunities 3; blocked spacing/partner/hunger/health 1/1/0/0; attempts 1; expected rolls 0.500; roll misses 1'
    );
    telemetry.disable();
    telemetry.reset();
  });
  it('keeps both answered action histograms aligned with their denominators', () => {
    const sim = new Simulation({ seed: 'history-answered-invariants', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 4 } });
    telemetry.reset();
    telemetry.enable();
    telemetry.count('blow_repeat', 42);
    telemetry.count('blow_repeat_action_flee', 35);
    telemetry.count('blow_repeat_action_give', 2);
    telemetry.count('blow_repeat_action_go_home');
    telemetry.count('blow_repeat_action_drink');
    telemetry.count('blow_repeat_action_idle', 3);
    telemetry.count('blow_repeat_unanswered', 7);
    telemetry.count('blow_repeat_unanswered_action_give', 2);
    telemetry.count('blow_repeat_unanswered_action_go_home');
    telemetry.count('blow_repeat_unanswered_action_drink');
    telemetry.count('blow_repeat_unanswered_action_idle', 3);

    const snapshot = telemetry.snapshot();
    const actionTotal = Object.entries(snapshot)
      .filter(([key]) => key.startsWith('blow_repeat_action_'))
      .reduce((total, [, count]) => total + count, 0);
    const unansweredActionTotal = Object.entries(snapshot)
      .filter(([key]) => key.startsWith('blow_repeat_unanswered_action_'))
      .reduce((total, [, count]) => total + count, 0);

    expect(actionTotal).toBe(snapshot.blow_repeat);
    expect(unansweredActionTotal).toBe(snapshot.blow_repeat_unanswered);
    expect(snapshot.blow_repeat_unanswered_action_flee ?? 0).toBe(0);
    expect(formatHistory([new HistoryWatch(sim).finish()])).toContain(
      'answered 0.833 (7/42 unanswered; actions drink:1,flee:35,give:2,go_home:1,idle:3; unanswered drink:1,give:2,go_home:1,idle:3)'
    );
    telemetry.disable();
    telemetry.reset();
  });
  it('leaves the simulated world and RNG bit-identical with observation enabled', () => {
    const run = (observed: boolean) => {
      const sim = new Simulation({ seed: 'history-neutral', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 6 } });
      const watch = observed ? new HistoryWatch(sim) : null;
      for (let i = 0; i < 500; i++) {
        sim.step();
        if (sim.time.tick % sim.config.time.ticksPerDay === 0) watch?.observe();
      }
      watch?.finish();
      return JSON.stringify([sim.people, sim.nodes, sim.trees, sim.animals, sim.buildings,
        sim.households, sim.rng.getState()]);
    };
    expect(run(true)).toBe(run(false));
  });
});
