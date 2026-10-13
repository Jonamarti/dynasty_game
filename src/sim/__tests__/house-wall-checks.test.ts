/** The `homes` check must inspect real house walls, not just count collisions. */
import { describe, expect, it } from 'vitest';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';
import { World } from '../core/World.ts';

const wallsHold = (report: ReturnType<typeof runScenario>) =>
  report.checks.find(check => check.id === 'walls-hold');

describe('walls-hold', () => {
  it('passes only with the completed houses’ wall rings and open doors', () => {
    const check = wallsHold(runScenario(SCENARIOS.homes!));
    expect(check).toMatchObject({ ok: true });
    expect(check?.skipped).not.toBe(true);
    expect(check?.detail).toMatch(/finished homes, \d+\/\d+ perimeter wall tiles blocked, every door open/);
  }, 120000);

  it('fails when the house-wall overlay is broken even if nobody stood on a wall', () => {
    const real = World.prototype.setHouseWall;
    World.prototype.setHouseWall = () => {};
    try {
      const check = wallsHold(runScenario(SCENARIOS.homes!));
      expect(check).toMatchObject({ ok: false });
      expect(check?.skipped).not.toBe(true);
      expect(check?.detail).toContain('0/');
    } finally {
      World.prototype.setHouseWall = real;
    }
  }, 120000);
});
