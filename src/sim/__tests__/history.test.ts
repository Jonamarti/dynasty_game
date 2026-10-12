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
    expect(formatHistory([new HistoryWatch(sim).finish()])).toContain(
      'answered 0.333 (2/3 unanswered; actions flee:1,give:2; unanswered give:2)'
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
