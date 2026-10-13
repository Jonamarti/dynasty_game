import { describe, expect, it } from 'vitest';
import { Person } from '../../sim/entities/Person.ts';
import { RNG } from '../../sim/core/RNG.ts';
import { talkingPose } from '../WorkAnimation.ts';

describe('human conversation animation', () => {
  it('cycles four open-handed gestures from the real conversation clock', () => {
    const person = new Person('Speaker', 4, 4, 0, new RNG('talk-animation'));
    person.action = 'talk'; person.actionTimer = 30; person.actionTicks = 1;
    expect([1, 3, 5, 7, 9].map(tick => {
      person.actionTicks = tick;
      return talkingPose(person, false, 0);
    })).toEqual(['l0', 'l1', 'l2', 'l3', 'l0']);
    expect(person.actionTimer).toBe(30);
  });

  it('interpolates the bounded render fraction and hides travel, silence, dead and idle states', () => {
    const person = new Person('Speaker', 4, 4, 0, new RNG('talk-animation-guards'));
    person.action = 'talk'; person.actionTimer = 4; person.actionTicks = 2;
    expect(talkingPose(person, false, 0.5)).toBe('l0');
    expect(talkingPose(person, false, 1)).toBe('l1');
    expect(talkingPose(person, false, 50)).toBe('l1');
    expect(talkingPose(person, true)).toBeNull();
    person.actionTimer = 0; expect(talkingPose(person, false)).toBeNull();
    person.actionTimer = 4; person.actionTicks = 0; expect(talkingPose(person, false)).toBeNull();
    person.actionTicks = 2; person.alive = false; expect(talkingPose(person, false)).toBeNull();
    person.alive = true; person.action = 'idle'; expect(talkingPose(person, false)).toBeNull();
  });
});
