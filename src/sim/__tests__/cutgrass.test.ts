/**
 * Cutting grass for thatch (M15 phase 23b).
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { CUT_ABOVE, CUT_FLOOR } from '../core/Grass.ts';

function meadowSim() {
  const sim = new Simulation({ seed: 'cut-grass' });
  const person = sim.people.find(p => p.alive && !p.isChild)!;
  const spot = sim.world.findTallGrass(person.x, person.y, 40, CUT_ABOVE);
  return { sim, person, spot: spot! };
}

describe('cut_grass', () => {
  it('turns tall grass into thatch and leaves the root', () => {
    const { sim, person, spot } = meadowSim();
    expect(spot).toBeTruthy();
    const before = sim.world.grassAt(spot.x, spot.y);
    person.x = spot.x + 0.5;
    person.y = spot.y + 0.5;
    expect(sim.order(person, 'cut_grass', { x: spot.x, y: spot.y })).toBe(true);
    for (let i = 0; i < 400 && person.action === 'cut_grass'; i++) sim.step();
    expect(sim.world.grassAt(spot.x, spot.y)).toBeLessThan(before);
    expect(sim.world.grassAt(spot.x, spot.y)).toBeGreaterThanOrEqual(CUT_FLOOR - 0.01);
    expect(person.inventory.count('thatch')).toBeGreaterThan(0);
  });

  it('refuses short grass, with the reason', () => {
    const { sim, person, spot } = meadowSim();
    sim.world.graze(spot.x, spot.y, 1);
    expect(sim.order(person, 'cut_grass', { x: spot.x, y: spot.y })).toBe(false);
    expect(sim.lastRefusal).toMatch(/too short/);
  });
});
