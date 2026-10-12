import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { EARTH_UNIT } from '../core/Earth.ts';
import { Pathfinder, PathStatus } from '../core/Pathfinder.ts';
import { RNG } from '../core/RNG.ts';
import { BIOME_ID, World } from '../core/World.ts';

function flatWorld(): World {
  const world = new World({ ...DEFAULT_CONFIG.world, width: 48, height: 32 }, new RNG('earthwork-routing'));
  world.elevation.fill(0.5);
  world.offset.fill(0);
  world.biome.fill(BIOME_ID.grass);
  // Refresh the component index through the same public edit path used by a
  // changed terrain tile; Pathfinder deliberately treats it as authoritative.
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) world.setWalkable(x, y, true);
  }
  return world;
}

function trench(world: World, gapY: number | null): void {
  for (let y = 0; y < world.height; y++) {
    if (y === gapY) continue;
    world.dig(24, y, 16 * EARTH_UNIT);
  }
}

function routeCrossingY(pathfinder: Pathfinder): number[] {
  const ys: number[] = [];
  for (let i = 0; i < pathfinder.routeLength; i++) ys.push(pathfinder.route[i * 2 + 1]!);
  return ys;
}

describe('earthwork pathfinding (M15 phase 26e)', () => {
  it('routes through the only opening in a deep trench', () => {
    const world = flatWorld();
    trench(world, 5);
    const pathfinder = new Pathfinder(world);

    expect(pathfinder.find(10, 16, 38, 16)).toBe(PathStatus.Found);
    // The gap is the only walkable connection between the two sides. A route
    // through any dug tile would contradict World.pitDepth's movement rule.
    expect(routeCrossingY(pathfinder)).toContain(5);
  });

  it('rejects the same crossing when the earthwork has no opening', () => {
    const world = flatWorld();
    trench(world, null);
    const pathfinder = new Pathfinder(world);

    // Negative control: if the trench is not dug through its closure, this
    // would remain the same cheap, straight path as the original flat field.
    expect(pathfinder.find(10, 16, 38, 16)).toBe(PathStatus.NoRoute);
  });
});
