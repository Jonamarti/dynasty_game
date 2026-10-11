import { afterEach, describe, expect, it } from 'vitest';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';
import { telemetry } from '../core/Telemetry.ts';

afterEach(() => { telemetry.disable(); telemetry.reset(); });

describe('homes comfort mechanism check', () => {
  it('samples furnished indoor sleep, cold, all security terms and safe house paths', () => {
    const report = runScenario(SCENARIOS.homes!);
    expect(report.checks).toHaveLength(7);
    expect(report.checks.every(check => check.ok && !check.skipped)).toBe(true);
    expect(report.checks.find(check => check.id === 'beds-are-slept-in')?.detail).toMatch(/midnight samples inside a home/);
  });
});
