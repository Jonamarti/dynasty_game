import { describe, expect, it } from 'vitest';
import { Person } from '../../sim/entities/Person.ts';
import { RNG } from '../../sim/core/RNG.ts';
import type { Simulation } from '../../sim/core/Simulation.ts';
import { choppingPose } from '../WorkAnimation.ts';

function fixture() {
  const person = new Person('Feller', 4, 4, 0, new RNG('chop-animation'));
  person.action = 'chop'; person.targetTreeId = 2; person.workedTicks = 1;
  const tree = { x: 4.3, y: 4, standing: true, chopProgress: 1 };
  const sim = { treesById: new Map([[2, tree]]) } as unknown as Pick<Simulation, 'treesById'>;
  return { person, tree, sim };
}

describe('chopping animation', () => {
  it('cycles four swings during banked work without a harvest timer', () => {
    const { person, tree, sim } = fixture();
    expect([1, 3, 5, 7, 9].map(ticks => {
      person.workedTicks = ticks;
      return choppingPose(person, sim, false, 0);
    })).toEqual(['c0', 'c1', 'c2', 'c3', 'c0']);
    expect(person.actionTimer).toBe(0);
    expect(tree.chopProgress).toBe(1);
    expect([person.x, person.y]).toEqual([4, 4]);
  });

  it('does not swing while walking, away from the tree, unstarted or changing tools', () => {
    const { person, tree, sim } = fixture();
    expect(choppingPose(person, sim, true)).toBeNull();
    person.x = 2;
    expect(choppingPose(person, sim, false)).toBeNull();
    person.x = 4; person.workedTicks = 0;
    expect(choppingPose(person, sim, false)).toBeNull();
    person.workedTicks = 1; person.actionTimer = 3;
    expect(choppingPose(person, sim, false)).toBeNull();
    person.actionTimer = 0; tree.chopProgress = 0;
    expect(choppingPose(person, sim, false)).toBeNull();
  });

  it('releases the gesture after interruption, death, felling or target disappearance', () => {
    const { person, tree, sim } = fixture();
    person.action = 'idle';
    expect(choppingPose(person, sim, false)).toBeNull();
    person.action = 'chop'; person.alive = false;
    expect(choppingPose(person, sim, false)).toBeNull();
    person.alive = true; tree.standing = false;
    expect(choppingPose(person, sim, false)).toBeNull();
    tree.standing = true; sim.treesById.clear();
    expect(choppingPose(person, sim, false)).toBeNull();
  });

  it('holds a paused frame and bounds its interpolation fraction', () => {
    const { person, sim } = fixture(); person.workedTicks = 2;
    expect(choppingPose(person, sim, false, 0.5)).toBe('c0');
    expect(choppingPose(person, sim, false, 0.5)).toBe('c0');
    expect(choppingPose(person, sim, false, 1)).toBe('c1');
    expect(choppingPose(person, sim, false, 50)).toBe('c1');
    expect(choppingPose(person, sim, false, -50)).toBe('c0');
  });
});
