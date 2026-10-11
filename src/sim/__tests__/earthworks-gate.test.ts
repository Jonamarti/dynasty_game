import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { BUILDINGS } from '../entities/Building.ts';
import { TECH, TECH_EFFECTS, TECHS } from '../knowledge/Tech.ts';

function openDitchSpot(sim: Simulation): { x: number; y: number } {
  for (let y = 2; y < sim.world.height - 3; y++) {
    for (let x = 2; x < sim.world.width - 8; x++) {
      let open = true;
      for (let dx = 0; dx < 6; dx++) {
        const tx = x + dx;
        if (!sim.world.isWalkable(tx, y) || sim.world.isShore(tx, y) ||
            sim.world.biomeAt(tx, y) === 'rock' || sim.world.biomeAt(tx, y) === 'water' ||
            sim.buildingAt(tx, y)) open = false;
      }
      if (open) return { x, y };
    }
  }
  throw new Error('no open ground for a ditch');
}

describe('earthworks gate (M15 phase 26e)', () => {
  it('declares a useful gate whose first reader is the ditch design', () => {
    expect(TECHS).toContain('earthworks');
    expect(TECH.earthworks.requires).toEqual(expect.arrayContaining(['ground_stone', 'basketry']));
    expect(TECH_EFFECTS.earthworks.site).toContain('BUILDINGS.ditch');
    expect(BUILDINGS.ditch?.requiresTech).toBe('earthworks');
    expect(BUILDINGS.ditch_ns?.requiresTech).toBe('earthworks');
  });

  it('keeps the ditch locked until earthworks is known, then exposes only its base design', () => {
    const sim = new Simulation({ seed: 'earthworks-gate' });
    sim.knownTech.add('ground_stone');
    sim.knownTech.add('basketry');
    const spot = openDitchSpot(sim);
    const designs = () => sim.availableDesigns().map(def => def.id);
    const locked = () => sim.lockedDesigns().map(def => def.id);

    expect(designs()).not.toContain('ditch');
    expect(locked()).toContain('ditch');
    expect(locked()).not.toContain('ditch_ns');
    expect(sim.place('ditch', spot.x, spot.y, 0)).toBeNull();

    sim.knownTech.add('earthworks');
    expect(designs()).toContain('ditch');
    expect(designs()).not.toContain('ditch_ns');
    expect(sim.lockedDesigns().map(def => def.id)).not.toContain('ditch');
    expect(sim.place('ditch', spot.x, spot.y, 0)).not.toBeNull();
  });
});
