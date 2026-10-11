import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { BUILDINGS } from '../entities/Building.ts';
import { EARTH_UNIT } from '../core/Earth.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { BIOME_ID, World } from '../core/World.ts';
import { RNG } from '../core/RNG.ts';
import { TECH, TECH_EFFECTS, TECHS } from '../knowledge/Tech.ts';

function flatWorld(): World {
  const world = new World({ ...DEFAULT_CONFIG.world, width: 64, height: 64 }, new RNG('earthwork-crossing'));
  world.elevation.fill(0.5);
  world.offset.fill(0);
  world.walkable.fill(1);
  world.biome.fill(BIOME_ID.grass);
  return world;
}

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
    expect(TECH_EFFECTS.earthworks.site).toContain('BUILDINGS.moat');
    expect(TECH_EFFECTS.earthworks.site).toContain('World.pitDepth');
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

  it('gates the water moat, while its depth and a shallow ditch use the existing terrain readers', () => {
    const sim = new Simulation({ seed: 'moat-gate' });
    sim.knownTech.add('ground_stone');
    sim.knownTech.add('basketry');
    expect(BUILDINGS.moat?.requiresTech).toBe('earthworks');
    expect(sim.availableDesigns().map(def => def.id)).not.toContain('moat');
    expect(sim.lockedDesigns().map(def => def.id)).toContain('moat');
    expect(sim.place('moat', 32, 32, 0)).toBeNull();
    sim.knownTech.add('earthworks');
    expect(sim.availableDesigns().map(def => def.id)).toContain('moat');

    const world = flatWorld();
    const x = 32, y = 32;
    world.dig(x, y, 16 * EARTH_UNIT);
    expect(world.depthDug(x, y)).toBeGreaterThan(world.pitDepth);
    expect(world.isWalkable(x, y)).toBe(false);

    const ditch = flatWorld();
    ditch.dig(x, y, 6 * EARTH_UNIT);
    expect(ditch.depthDug(x, y)).toBeLessThan(ditch.pitDepth);
    expect(ditch.isWalkable(x, y)).toBe(true);
    expect(ditch.stepFactor(x + 0.5, y + 0.5, x - 0.5, y + 0.5)).toBeLessThan(1);
  });
});
