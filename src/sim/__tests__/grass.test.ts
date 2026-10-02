/**
 * The sward (M15 phase 23a): a layer advanced by a pure daily function.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../core/World.ts';
import { RNG } from '../core/RNG.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { advanceGrass, STUBBLE } from '../core/Grass.ts';

function makeWorld() {
  return new World({ ...DEFAULT_CONFIG.world, width: 64, height: 64 }, new RNG('grass'));
}

function meadow(world: World): number {
  let sum = 0;
  for (let i = 0; i < world.grass.length; i++) sum += world.grass[i]!;
  return sum;
}

describe('grass', () => {
  it('stands only where the ground can carry it', () => {
    const world = makeWorld();
    for (let i = 0; i < world.grass.length; i++) {
      const biome = world.biomeAt(i % world.width, Math.floor(i / world.width));
      if (biome === 'water' || biome === 'beach' || biome === 'rock') {
        expect(world.grass[i]).toBe(0);
      }
      expect(world.grass[i]).toBeLessThanOrEqual(world.grassCap[i]! + 1e-6);
    }
    expect(meadow(world)).toBeGreaterThan(0);
  });

  it('dies back in the cold, regrows in the warm, and waits under deep snow', () => {
    const world = makeWorld();
    const start = meadow(world);
    for (let d = 0; d < 40; d++) advanceGrass(world, 0.05, 0);
    const winter = meadow(world);
    expect(winter).toBeLessThan(start * 0.5);
    for (let d = 0; d < 5; d++) advanceGrass(world, 0.05, 3);
    expect(meadow(world)).toBe(winter);
    for (let d = 0; d < 60; d++) advanceGrass(world, 0.8, 0);
    expect(meadow(world)).toBeGreaterThan(winter * 2);
  });

  it('keeps a stubble over the winter', () => {
    const world = makeWorld();
    for (let d = 0; d < 400; d++) advanceGrass(world, 0, 0);
    const i = world.grassCap.findIndex(c => c > STUBBLE);
    expect(world.grass[i]).toBeGreaterThanOrEqual(STUBBLE - 1e-6);
  });

  it('graze takes at most what stands', () => {
    const world = makeWorld();
    const i = world.grassCap.findIndex(c => c > 0.3);
    const x = i % world.width;
    const y = Math.floor(i / world.width);
    const had = world.grassAt(x, y);
    expect(world.graze(x, y, 5)).toBeCloseTo(had);
    expect(world.grassAt(x, y)).toBe(0);
  });
});
