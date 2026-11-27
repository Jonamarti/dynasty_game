import { describe, expect, it, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

describe('m16 live construction queue', () => {
  it('immediately exposes a freed construction slot during the same daily planning pass', () => {
    const sim = new Simulation({
      seed: 'm16-live-construction-queue',
      world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
      population: { bands: 1, peoplePerBand: 6 },
    });
    const daily = vi.spyOn(sim.bandSystem, 'daily').mockImplementation((_bands, _people, ctx) => {
      const site = ctx.buildings.find(b => !b.complete && !b.playerPlaced);
      expect(site).toBeDefined();
      const before = ctx.buildings.length;
      ctx.abandonSite(site!);
      expect(sim.buildingsById.has(site!.id)).toBe(false);
      expect(ctx.buildings).toBe(sim.buildings);
      expect(ctx.buildings.some(b => b.id === site!.id)).toBe(false);
      expect(ctx.buildings.length).toBe(before - 1);
    });
    try {
      sim.time.tick = sim.config.time.ticksPerDay - 1;
      sim.step();
      expect(daily).toHaveBeenCalledTimes(1);
    } finally { daily.mockRestore(); }
  });
});
