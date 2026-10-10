import { afterEach, describe, expect, it } from 'vitest';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';
import { telemetry } from '../core/Telemetry.ts';

afterEach(() => { telemetry.disable(); telemetry.reset(); });
describe('nights mechanism checks', () => {
  it('exercises witnesses, ignition and actual night craft progress without n/a', () => {
    const report = runScenario(SCENARIOS.nights!);
    expect(report.checks).toHaveLength(3);
    expect(report.checks.every(check => check.ok && !check.skipped)).toBe(true);
  });
  it('detects disabled sight and fine-work light readers', () => {
    const scenario = SCENARIOS.nights!;
    const report = runScenario({ ...scenario, config: { ...scenario.config, light: { enabled: false } } });
    expect(report.checks.find(check => check.id === 'darkness-hides')?.ok).toBe(false);
    expect(report.checks.find(check => check.id === 'light-lets-work')?.ok).toBe(false);
    expect(report.checks.find(check => check.id === 'torches-are-carried')?.ok).toBe(true);
  });
  it('detects a torch removed before ignition completes', () => {
    const scenario = SCENARIOS.nights!;
    const report = runScenario({ ...scenario, setup(sim) {
      scenario.setup!(sim);
      for (const person of sim.people) person.inventory.remove('fat_torch', person.inventory.count('fat_torch'));
    } });
    expect(report.checks.find(check => check.id === 'torches-are-carried')?.ok).toBe(false);
  });
});
