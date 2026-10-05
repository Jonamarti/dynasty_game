import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { World } from '../core/World.ts';

describe('water depth', () => {
  it('reports depth from the water surface to the edited terrain height', () => {
    const world = new World({ ...DEFAULT_CONFIG.world, width: 48, height: 48 }, new RNG('water-depth'));
    const index = world.biome.findIndex(value => value === 0);
    expect(index).toBeGreaterThanOrEqual(0);
    const x = index % world.width;
    const y = Math.floor(index / world.width);

    world.elevation[index] = world.waterLevel - 0.001;
    expect(world.depthAt(x, y)).toBeCloseTo(0.001, 6);
    world.elevation[index] = world.waterLevel + 0.25;
    expect(world.depthAt(x, y)).toBe(0);
    expect(world.depthAt(-1, y)).toBe(0);
  });

  it('classifies wading and swimming by the configured depth cutoffs', () => {
    const world = new World({ ...DEFAULT_CONFIG.world, width: 48, height: 48,
      waterLevel: 0.25, wadeDepth: 0.03125, swimDepth: 0.0625 }, new RNG('water-depth-classes'));
    const index = world.biome.findIndex(value => value === 0);
    expect(index).toBeGreaterThanOrEqual(0);
    const x = index % world.width;
    const y = Math.floor(index / world.width);

    world.elevation[index] = world.waterLevel - world.wadeDepth / 2;
    expect(world.isShallow(x, y)).toBe(true);
    expect(world.isSwimTile(x, y)).toBe(false);

    // The exact boundary is not walkable: equality starts the swim band.
    world.elevation[index] = world.waterLevel - world.wadeDepth;
    expect(world.isShallow(x, y)).toBe(false);
    expect(world.isSwimTile(x, y)).toBe(true);

    world.elevation[index] = world.waterLevel - world.swimDepth;
    expect(world.depthAt(x, y)).toBeCloseTo(world.swimDepth, 6);
    expect(world.isSwimTile(x, y)).toBe(false);
  });
});
