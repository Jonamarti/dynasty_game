import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { Pathfinder } from '../core/Pathfinder.ts';
import { RNG } from '../core/RNG.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { World } from '../core/World.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Person } from '../entities/Person.ts';
import { MovementSystem } from '../systems/MovementSystem.ts';
import { NeedsSystem } from '../systems/NeedsSystem.ts';
import { Simulation } from '../core/Simulation.ts';

function shallowWorld(seed: string): { world: World; x: number; y: number } {
  const world = new World({ ...DEFAULT_CONFIG.world, width: 64, height: 64 }, new RNG(seed));
  const index = world.biome.findIndex((biome, i) => biome === 0 && world.walkable[i] === 0);
  if (index < 0) throw new Error('expected deep water in test world');
  const x = index % world.width;
  const y = Math.floor(index / world.width);
  world.elevation[index] = world.waterLevel - world.wadeDepth / 2;
  world.setWalkable(x, y, true);
  world.updateShore(x, y);
  return { world, x, y };
}

describe('wading', () => {
  it('slows a step through a ford and leaves the person wet', () => {
    const { world, x, y } = shallowWorld('wading-step');
    const dryIndex = world.walkable.findIndex((walkable, i) => walkable === 1 && world.biome[i] !== 0 &&
      world.isWalkable(i % world.width, Math.floor(i / world.width)));
    const dryX = dryIndex % world.width;
    const dryY = Math.floor(dryIndex / world.width);
    const movement = new MovementSystem(world, new RNG('wading-move'), new Pathfinder(world));
    const fordWalker = new Person('ford', x + 0.5, y + 0.5, 0, new RNG('ford'));
    const dryWalker = new Person('dry', dryX + 0.5, dryY + 0.5, 0, new RNG('dry'));
    const fordStart = fordWalker.x;
    const dryStart = dryWalker.x;

    movement.nudge(fordWalker, 1, 0);
    movement.nudge(dryWalker, 1, 0);

    expect(fordWalker.x - fordStart).toBeCloseTo((dryWalker.x - dryStart) * 0.4, 4);
    expect(fordWalker.wet).toBe(world.wetTicks);
  });

  it('adds chill while wet and dries four times faster beside a hearth', () => {
    const { world } = shallowWorld('wading-needs');
    const tile = world.walkable.findIndex((walkable, i) => walkable === 1 && world.biome[i] !== 0);
    const x = tile % world.width;
    const y = Math.floor(tile / world.width);
    const nearby = new Person('near fire', x + 0.5, y + 0.5, 0, new RNG('near-fire'));
    const far = new Person('far fire', x + 20.5, y + 20.5, 0, new RNG('far-fire'));
    const dry = new Person('dry', x + 1.5, y + 0.5, 0, new RNG('dry-needs'));
    nearby.wet = 10;
    far.wet = 10;
    dry.needs.cold = 0;
    nearby.needs.cold = 0;
    far.needs.cold = 0;
    const hearth = new Building(BUILDINGS.hearth!, x, y, 1);
    hearth.complete = true;
    const hash = new SpatialHash<Building>(8);
    hash.insert(hearth);

    new NeedsSystem(DEFAULT_CONFIG.needs, world).update([nearby, far, dry], new TimeManager(DEFAULT_CONFIG.time), [hearth], hash);

    expect(nearby.wet).toBe(6);
    expect(far.wet).toBe(9);
    expect(dry.needs.cold).toBeLessThan(nearby.needs.cold);
  });

  it('refuses dry huts and ditches on a shallow-water footprint but permits a shore installation', () => {
    const sim = new Simulation({ seed: 'wading-placement', world: { width: 64, height: 64 } });
    let patch: { x: number; y: number } | null = null;
    for (let y = 0; y < sim.world.height - 1 && !patch; y++) {
      for (let x = 0; x < sim.world.width - 1 && !patch; x++) {
        if ([0, 1, sim.world.width, sim.world.width + 1].every(offset =>
          sim.world.biome[y * sim.world.width + x + offset] === 0)) patch = { x, y };
      }
    }
    expect(patch).not.toBeNull();
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const x = patch!.x + dx, y = patch!.y + dy, i = sim.world.index(x, y);
      sim.world.elevation[i] = sim.world.waterLevel - sim.world.wadeDepth / 2;
      sim.world.setWalkable(x, y, true);
      sim.world.updateShore(x, y);
    }
    expect(sim.placementRefusal(BUILDINGS.mud_hut!, patch!.x, patch!.y)).toMatch(/ground there will not take it/);
    expect(sim.placementRefusal(BUILDINGS.ditch!, patch!.x, patch!.y)).toMatch(/ground there will not take it/);
    expect(sim.placementRefusal(BUILDINGS.fish_trap!, patch!.x, patch!.y)).toBeNull();
  });
});
