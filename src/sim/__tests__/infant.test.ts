import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { Pathfinder } from '../core/Pathfinder.ts';
import { World } from '../core/World.ts';
import { MovementSystem, Arrival } from '../systems/MovementSystem.ts';

describe('babies under one year', () => {
  it('cannot be moved by direct control or a walking target', () => {
    const world = new World(DEFAULT_CONFIG.world, new RNG('infant-world'));
    const baby = new Person('Baby', 64, 64, 0, new RNG('infant-person'));
    baby.age = 0;
    baby.targetX = baby.x + 5;
    baby.targetY = baby.y;
    const movement = new MovementSystem(world, new RNG('infant-movement'), new Pathfinder(world));
    movement.nudge(baby, 1, 0);
    expect(movement.advance(baby, 0)).toBe(Arrival.Arrived);
    expect([baby.x, baby.y]).toEqual([64, 64]);
  });

  it('does not choose its own forage, drink, or wandering action', () => {
    const sim = new Simulation({ seed: 'infant-no-autonomy', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 } });
    const baby = sim.people[0]!;
    baby.age = 0;
    baby.needs.hunger = 95;
    baby.needs.thirst = 95;
    baby.action = 'idle';
    baby.clearTarget();
    const position = [baby.x, baby.y];
    expect(sim.order(baby, 'goto', { x: baby.x + 10, y: baby.y })).toBe(false);
    expect(sim.lastRefusal).toBe('babies cannot act on their own');
    for (let i = 0; i < 50; i++) sim.step();
    expect([baby.x, baby.y]).toEqual(position);
    expect(baby.action).toBe('idle');
    expect(baby.targetNodeId).toBeNull();
  });
});
