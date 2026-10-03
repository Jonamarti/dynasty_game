import { describe, expect, it } from 'vitest';
import { Person } from '../../sim/entities/Person.ts';
import { RNG } from '../../sim/core/RNG.ts';
import { diggingPose, gatheringPose } from '../WorkAnimation.ts';
import type { Simulation } from '../../sim/core/Simulation.ts';

function fixture() {
  const person = new Person('Gatherer', 4, 4, 0, new RNG('work-animation'));
  person.action = 'forage'; person.targetNodeId = 1;
  person.actionTimer = 10; person.workedTicks = 1;
  // The selector only reads these fields, not an entity's mutation methods.
  const node = { x: 4.3, y: 4, kind: 'berries', depleted: false };
  const tree = { x: 4.3, y: 4, standing: true, fruit: 3 };
  const sim = { nodesById: new Map([[1, node]]), treesById: new Map([[2, tree]]) } as unknown as Pick<Simulation, 'nodesById' | 'treesById'>;
  return { person, node, tree, sim };
}

describe('gathering animation', () => {
  it('does not mistake a tool change after an earlier pull for gathering work', () => {
    const { person, sim } = fixture();
    person.workedTicks = 3; person.actionTimer = 3; person.actionTotal = 0;
    expect(gatheringPose(person, sim, false)).toBeNull();
    person.actionTotal = 10;
    expect(gatheringPose(person, sim, false)).toBe('g1');
  });

  it('cycles four frames during work without moving the feet or advancing the simulation', () => {
    const { person, sim } = fixture();
    const frames = [1, 3, 5, 7, 9].map(ticks => {
      person.workedTicks = ticks;
      return gatheringPose(person, sim, false, 0);
    });
    expect(frames).toEqual(['g0', 'g1', 'g2', 'g3', 'g0']);
    expect(person.actionTimer).toBe(10);
    expect([person.x, person.y]).toEqual([4, 4]);
  });

  it('does not gather while travelling, blocked away from the target, or waiting to start', () => {
    const { person, sim } = fixture();
    expect(gatheringPose(person, sim, true)).toBeNull();
    person.x = 2;
    expect(gatheringPose(person, sim, false)).toBeNull();
    person.x = 4; person.actionTimer = 0;
    expect(gatheringPose(person, sim, false)).toBeNull();
    person.actionTimer = 10; person.workedTicks = 0;
    expect(gatheringPose(person, sim, false)).toBeNull();
  });

  it('stops on interruption, death, disappearance or depletion', () => {
    const { person, node, sim } = fixture();
    person.action = 'idle';
    expect(gatheringPose(person, sim, false)).toBeNull();
    person.action = 'forage'; person.alive = false;
    expect(gatheringPose(person, sim, false)).toBeNull();
    person.alive = true; node.depleted = true;
    expect(gatheringPose(person, sim, false)).toBeNull();
    node.depleted = false; sim.nodesById.clear();
    expect(gatheringPose(person, sim, false)).toBeNull();
  });

  it('uses hand gathering for plants and sticks, leaving fish, flint and clay for their own gestures', () => {
    const { person, node, sim } = fixture();
    for (const action of ['forage', 'gather'] as const) {
      person.action = action;
      for (const kind of ['berries', 'sticks', 'reeds', 'wild_grain']) {
        node.kind = kind;
        expect(gatheringPose(person, sim, false), `${action} ${kind}`).toBe('g0');
      }
      for (const kind of ['fish', 'flint', 'clay']) {
        node.kind = kind;
        expect(gatheringPose(person, sim, false)).toBeNull();
      }
    }
  });

  it('picks fruit only from a standing tree with fruit', () => {
    const { person, tree, sim } = fixture();
    person.action = 'pick'; person.targetTreeId = 2;
    expect(gatheringPose(person, sim, false)).toBe('g0');
    tree.fruit = 0;
    expect(gatheringPose(person, sim, false)).toBeNull();
    tree.fruit = 3; tree.standing = false;
    expect(gatheringPose(person, sim, false)).toBeNull();
    tree.standing = true; person.targetTreeId = null;
    expect(gatheringPose(person, sim, false)).toBeNull();
  });

  it('holds the frame while paused and interpolates only the bounded simulation fraction', () => {
    const { person, sim } = fixture();
    person.workedTicks = 2;
    expect(gatheringPose(person, sim, false, 0.5)).toBe('g0');
    expect(gatheringPose(person, sim, false, 0.5)).toBe('g0');
    expect(gatheringPose(person, sim, false, 1)).toBe('g1');
    expect(gatheringPose(person, sim, false, 50)).toBe('g1');
    expect(gatheringPose(person, sim, false, -50)).toBe('g0');
  });
});

describe('digging animation', () => {
  function digFixture() {
    const person = new Person('Digger', 4.5, 4.5, 0, new RNG('dig-animation'));
    person.action = 'dig'; person.targetX = 4; person.targetY = 4;
    person.actionTimer = 10; person.workedTicks = 1;
    const sim = { world: { biomeAt: () => 'grass' } } as unknown as Pick<Simulation, 'world'>;
    return { person, sim };
  }

  it('cycles four tool strokes from work ticks without changing the worker or world', () => {
    const { person, sim } = digFixture();
    const frames = [1, 3, 5, 7, 9].map(ticks => {
      person.workedTicks = ticks;
      return diggingPose(person, sim, false, 0);
    });
    expect(frames).toEqual(['d0', 'd1', 'd2', 'd3', 'd0']);
    expect(person.actionTimer).toBe(10);
    expect([person.x, person.y, person.targetX, person.targetY]).toEqual([4.5, 4.5, 4, 4]);
  });

  it('does not show a stroke while travelling, moving, unstarted, interrupted, dead or over invalid ground', () => {
    const { person, sim } = digFixture();
    expect(diggingPose(person, sim, true)).toBeNull();
    person.x = 6;
    expect(diggingPose(person, sim, false)).toBeNull();
    person.x = 4.5; person.actionTimer = 0;
    expect(diggingPose(person, sim, false)).toBeNull();
    person.actionTimer = 10; person.workedTicks = 0;
    expect(diggingPose(person, sim, false)).toBeNull();
    person.workedTicks = 1; person.action = 'idle';
    expect(diggingPose(person, sim, false)).toBeNull();
    person.action = 'dig'; person.alive = false;
    expect(diggingPose(person, sim, false)).toBeNull();
    person.alive = true;
    const badGround = { world: { biomeAt: () => 'water' } } as unknown as Pick<Simulation, 'world'>;
    expect(diggingPose(person, badGround, false)).toBeNull();
  });

  it('holds and interpolates the stroke only within the bounded simulation fraction', () => {
    const { person, sim } = digFixture();
    person.workedTicks = 2;
    expect(diggingPose(person, sim, false, 0.5)).toBe('d0');
    expect(diggingPose(person, sim, false, 0.5)).toBe('d0');
    expect(diggingPose(person, sim, false, 1)).toBe('d1');
    expect(diggingPose(person, sim, false, 50)).toBe('d1');
    expect(diggingPose(person, sim, false, -50)).toBe('d0');
  });
});
