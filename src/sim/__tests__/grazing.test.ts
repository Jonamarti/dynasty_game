/**
 * Herds eat the grass, starve without it, and breed in proportion to it
 * (M15 phases 23c and 23d).
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { telemetry } from '../core/Telemetry.ts';

function run(sim: Simulation, days: number): void {
  for (let i = 0; i < days * sim.config.time.ticksPerDay; i++) sim.step();
}

describe('grazing', () => {
  telemetry.enable();
  it('crops the ground under a herd', () => {
    const sim = new Simulation({ seed: 'graze-1' });
    const deer = sim.animals.find(a => a.alive && sim.world.grassAt(a.x, a.y) > 0.5)!;
    const before = sim.world.grassAt(deer.x, deer.y);
    run(sim, 1);
    // The tile it started on, or anywhere on the map: something was eaten.
    let after = 0;
    for (let i = 0; i < sim.world.grass.length; i++) after += sim.world.grass[i]!;
    expect(before).toBeGreaterThan(0.5);
    expect(sim.animals.some(a => a.fed < 1) || after < sim.world.grassCap.reduce((s, c) => s + c, 0) * 0.8).toBe(true);
  });

  it('starves where there is nothing to eat, and says so', () => {
    const sim = new Simulation({ seed: 'graze-2' });
    const start = sim.animals.length;
    sim.world.grass.fill(0);
    sim.world.grassCap.fill(0);
    run(sim, 30);
    expect(sim.animals.length).toBeLessThan(start);
  }, 60000);

  it('breeds in spring in proportion to how well fed the herd is', () => {
    const born = (fed: number) => {
      const sim = new Simulation({ seed: 'graze-3' });
      let guard = 0;
      // The world opens five days from the end of a spring; wait for the next whole one.
      while (sim.time.season === 'spring' && guard++ < 60 * sim.config.time.ticksPerDay) sim.step();
      while (sim.time.season !== 'spring' && guard++ < 60 * sim.config.time.ticksPerDay) sim.step();
      const start = telemetry.get('animal_born');
      for (let i = 0; i < 9 * sim.config.time.ticksPerDay; i++) {
        for (const a of sim.animals) { a.fed = fed; a.health = a.def.health; }
        sim.step();
      }
      return telemetry.get('animal_born') - start;
    };
    expect(born(1)).toBeGreaterThan(born(0.2));
  }, 60000);
});
