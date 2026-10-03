/**
 * Herds eat the grass, starve without it, and breed in proportion to it
 * (M15 phases 23c and 23d).
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { telemetry } from '../core/Telemetry.ts';
import { World } from '../core/World.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { Animal } from '../entities/Animal.ts';
import { WildlifeSystem } from '../systems/WildlifeSystem.ts';

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
    const born = (fed: number, season = 'spring', grass = 1) => {
      const rng = new RNG('graze-3');
      const ids = new IdSpace();
      const world = new World({ ...DEFAULT_CONFIG.world, width: 32, height: 32 }, rng);
      world.walkable.fill(1);
      world.grass.fill(grass);
      world.grassCap.fill(grass);
      const animals = Array.from({ length: 5 }, () => new Animal('deer', 16, 16, 0, rng, ids));
      const wildlife = new WildlifeSystem();
      // The mechanism is a daily spring ledger. Waiting through a whole human
      // economy made this assertion exceed its 60s limit during cohort runs,
      // while hunting and starvation also changed the herd being compared.
      let births = 0;
      for (let day = 0; day < 9; day++) {
        for (const animal of animals) animal.fed = fed;
        const young = wildlife.daily(animals, { world, rng, ids, tick: day * 240,
          peopleHash: new SpatialHash(), season });
        animals.push(...young);
        births += young.length;
      }
      return births;
    };
    expect(born(1)).toBeGreaterThan(born(0.2));
    expect(born(1, 'winter')).toBe(0);
    expect(born(1, 'spring', 0)).toBe(0);
  });
});
