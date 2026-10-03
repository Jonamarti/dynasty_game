import { describe, expect, it } from 'vitest';
import { animalPose, trackAnimal, type AnimalTrack } from '../AnimalAnimation.ts';

const fresh = () => ({ alive: true, lastMealAt: -Infinity, lastAttackAt: -Infinity, lastRunAt: -Infinity });
describe('animal animation selection', () => {
  it('shows actual meals, even with a full stomach, but never infers sleeping from inactivity', () => {
    const animal = fresh();
    expect(animalPose(animal, 100, 0, false, 0)).toBe('idle');
    animal.lastMealAt = 100;
    expect([0, 1.25, 2.5, 3.75].map(t => animalPose(animal, 100 + Math.floor(t), t % 1, false, 0))).toEqual(['e0', 'e1', 'e2', 'e3']);
    expect(animalPose(animal, 105, 0, false, 0)).toBe('idle');
    expect(animalPose(animal, 99, 0, false, 0)).toBe('idle');
  });
  it('gives strikes priority over chasing and eating, and holds a paused fraction', () => {
    const animal = { ...fresh(), lastAttackAt: 100, lastMealAt: 100, lastRunAt: 100 };
    expect(animalPose(animal, 102, .5, true, 3)).toBe('a2');
    expect(animalPose(animal, 102, .5, true, 3)).toBe('a2');
    expect(animalPose(animal, 102, 40, true, 3)).toBe('a2');
    expect(animalPose(animal, 105, 0, true, .22)).toBe('e0');
    expect(animalPose({ ...fresh(), lastRunAt: 100 }, 104, 0, true, .22)).toBe('r1');
    expect(animalPose(animal, 106, 0, true, .22)).toBe('e0');
    expect(animalPose(animal, 110, 0, true, .22)).toBe('w1');
    animal.alive = false;
    expect(animalPose(animal, 102, .5, true, 3)).toBe('idle');
  });
  it('shows the killer eating after its strike and lets urgent flight override feeding', () => {
    const animal = { ...fresh(), lastAttackAt: 10, lastMealAt: 10 };
    expect(animalPose(animal, 14, 0, false, 0)).toBe('a3');
    expect(animalPose(animal, 15, 0, true, 0)).toBe('e0');
    expect(animalPose(animal, 18, .75, false, 0)).toBe('e3');
    animal.lastRunAt = 16;
    expect(animalPose(animal, 18, .75, true, .22)).toBe('r1');
  });
  it('does not run merely because an alarm or old chase exists', () => {
    const animal = { ...fresh(), lastRunAt: 100 };
    expect(animalPose(animal, 101, 0, false, .22)).toBe('idle');
    expect(animalPose(animal, 101, 0, true, .66)).toBe('r3');
    expect(animalPose(fresh(), 101, 0, true, .66)).toBe('w3');
  });
  it('counts north/south movement and preserves facing without advancing a paused walk', () => {
    const track: AnimalTrack = { x: 3, y: 3, east: false, distance: 0, movedAt: -Infinity };
    expect(trackAnimal(track, { x: 3, y: 4 }, 100)).toBe(true);
    expect(track.distance).toBe(1); expect(track.east).toBe(false);
    const frozen = { ...track };
    expect(trackAnimal(track, { x: 3, y: 4 }, 100)).toBe(true);
    expect(track).toEqual(frozen);
    expect(trackAnimal(track, { x: 3, y: 4 }, 101)).toBe(false);
    trackAnimal(track, { x: 4, y: 4 }, 102);
    expect(track.east).toBe(true);
  });
});
