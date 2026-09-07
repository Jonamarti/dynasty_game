/**
 * Drawing between two simulation steps.
 *
 * Lives with the simulation tests rather than beside the renderer because the
 * interpolator is pure arithmetic over ids and coordinates and touches no DOM —
 * the same reason `TechWebLayout` was split out of `TechWeb`. Anything here
 * that needed a canvas would be a sign the split had been drawn in the wrong
 * place.
 */
import { describe, it, expect } from 'vitest';
import { Interpolator, type Moving } from '../../render/Interpolator.ts';

/** A thing that moves, standing in for a person or an animal. */
function mover(id: number, x = 0, y = 0): Moving {
  return { id, x, y };
}

describe('the interpolator', () => {
  it('draws something it has never seen where it says it is', () => {
    // The frame a person is born on. Without this they would slide in from
    // wherever a missing previous position defaulted to.
    const lerp = new Interpolator();
    expect(lerp.at('person', mover(1, 7, 9), 0.5)).toEqual({ x: 7, y: 9 });
  });

  it('holds still for something that has not moved', () => {
    const lerp = new Interpolator();
    const person = mover(1, 4, 4);
    lerp.capture('person', [person]);
    lerp.capture('person', [person]);
    expect(lerp.at('person', person, 0.5)).toEqual({ x: 4, y: 4 });
  });

  it('spreads a one-step move across the step', () => {
    // The textbook case: somebody who moves every step. alpha 0 is where they
    // were, alpha 1 is where they are, and the middle is the middle.
    const lerp = new Interpolator();
    const person = mover(1, 0, 0);
    lerp.capture('person', [person]);
    person.x = 1;
    lerp.capture('person', [person]);

    expect(lerp.at('person', person, 0).x).toBeCloseTo(0);
    expect(lerp.at('person', person, 0.5).x).toBeCloseTo(0.5);
    expect(lerp.at('person', person, 1).x).toBeCloseTo(1);
  });

  it('spreads a staggered move across the whole gap it was made over', () => {
    // The case that decides whether this is worth having. `WildlifeSystem`
    // moves an animal one tick in five at five times the speed, so at five
    // steps a second an animal moves once per real second. Interpolating that
    // against the immediately preceding step would slide it across in a fifth
    // of a second and freeze for four fifths — a 1Hz twitch, visibly worse than
    // no interpolation at all.
    const lerp = new Interpolator();
    const deer = mover(2, 0, 0);
    lerp.capture('animal', [deer]);          // seen, standing at 0
    deer.x = 5;
    lerp.capture('animal', [deer]);          // the first jump: span 1 so far
    for (let i = 0; i < 4; i++) lerp.capture('animal', [deer]);
    deer.x = 10;
    lerp.capture('animal', [deer]);          // arrived after five quiet steps

    // Straight after the jump it is at the start of its span, not the end: the
    // five tiles are about to be walked over the next five steps.
    expect(lerp.at('animal', deer, 0).x).toBeCloseTo(5);
    // One step in, a fifth of the way across — where the old single-step
    // formula would already have put it at its destination.
    lerp.capture('animal', [deer]);
    expect(lerp.at('animal', deer, 0).x).toBeCloseTo(6);
    expect(lerp.at('animal', deer, 0.5).x).toBeCloseTo(6.5);
    // And it arrives exactly as the next jump is due, with no pause and no
    // overshoot.
    for (let i = 0; i < 4; i++) lerp.capture('animal', [deer]);
    expect(lerp.at('animal', deer, 0).x).toBeCloseTo(10);
  });

  it('never overshoots, however long a thing stands still afterwards', () => {
    // An animal that jumps and then stops for good must settle exactly on its
    // destination rather than sailing past it.
    const lerp = new Interpolator();
    const deer = mover(2, 0, 0);
    lerp.capture('animal', [deer]);
    deer.x = 4;
    lerp.capture('animal', [deer]);
    for (let i = 0; i < 50; i++) lerp.capture('animal', [deer]);
    expect(lerp.at('animal', deer, 1).x).toBeCloseTo(4);
  });

  it('forgets things that stop being captured', () => {
    // A century run kills a great many people and animals. Without the sweep
    // the map would hold every one of them for the length of the game.
    const lerp = new Interpolator();
    const alive = mover(1, 1, 1);
    const doomed = mover(2, 5, 5);
    lerp.capture('person', [alive, doomed]);
    for (let i = 0; i < 70; i++) lerp.capture('person', [alive]);

    // Reintroducing the dead id shows it has been forgotten: a remembered
    // track would interpolate it away from where it now claims to be.
    expect(lerp.at('person', mover(2, 40, 40), 0.5)).toEqual({ x: 40, y: 40 });
  });

  it('keeps a person and an animal with the same id apart', () => {
    // `Person` and `Animal` number themselves from separate counters, so person
    // 5 and animal 5 both exist and are different creatures. Keyed on the bare
    // id they overwrote each other, and a person was drawn sliding across the
    // map to wherever an unrelated deer was standing — sixty-five tiles, in the
    // run that caught it.
    const lerp = new Interpolator();
    const person = mover(5, 1, 1);
    const deer = mover(5, 60, 60);
    lerp.capture('person', [person]);
    lerp.capture('animal', [deer]);
    person.x = 2;
    lerp.capture('person', [person]);
    lerp.capture('animal', [deer]);

    expect(lerp.at('person', person, 0.5)).toEqual({ x: 1.5, y: 1 });
    expect(lerp.at('animal', deer, 0.5)).toEqual({ x: 60, y: 60 });
  });

  it('handles several groups at once, as the loop passes them', () => {
    const lerp = new Interpolator();
    const person = mover(1, 0, 0);
    const deer = mover(2, 10, 10);
    lerp.capture('person', [person]);
    lerp.capture('animal', [deer]);
    person.y = 2;
    deer.x = 12;
    lerp.capture('person', [person]);
    lerp.capture('animal', [deer]);

    expect(lerp.at('person', person, 0.5).y).toBeCloseTo(1);
    expect(lerp.at('animal', deer, 0.5).x).toBeCloseTo(11);
  });
});
