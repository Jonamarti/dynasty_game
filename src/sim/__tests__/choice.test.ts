/**
 * `chooseAmongBest` is the one place a decision stops being a pure function of
 * state, so the two things worth asserting are the two things that would be
 * invisible in play if they broke.
 *
 * The first is that **`spread: 0` is argmax and takes no draw**. The commit
 * that introduced this shipped at 0 and promised a bit-identical world; if the
 * zero path ever consumed a number, every saved seed would have moved and the
 * only symptom would be that old measurements stopped reproducing.
 *
 * The second is that **nothing outside the band can win**. The band is what
 * replaces a softmax temperature — see the module header — and a bug that let
 * the fifth-best action through would show up as people occasionally doing
 * something inexplicable, which is indistinguishable from the feature working.
 */
import { describe, it, expect } from 'vitest';
import { chooseAmongBest } from '../core/Choice.ts';
import { RNG } from '../core/RNG.ts';

const table = (...scores: number[]) =>
  scores.map((score, i) => ({ id: 'a' + i, score }));

describe('chooseAmongBest', () => {
  it('is argmax at spread 0, and consumes no randomness doing it', () => {
    const rng = new RNG(1);
    const before = rng.getState();
    for (let i = 0; i < 50; i++) {
      expect(chooseAmongBest(table(9, 8.99, 8.98, 0.02), rng, 0)?.id).toBe('a0');
    }
    expect(rng.getState()).toEqual(before);
  });

  it('returns undefined for an empty table rather than throwing', () => {
    expect(chooseAmongBest([], new RNG(1), 0.2)).toBeUndefined();
  });

  it('takes no draw when there is nothing to choose between', () => {
    const rng = new RNG(2);
    const before = rng.getState();
    // One candidate in the table at all...
    expect(chooseAmongBest(table(4), rng, 0.5)?.id).toBe('a0');
    // ...and several candidates of which only one is inside the band. This is
    // the common case for a pressed person: one need dominates.
    expect(chooseAmongBest(table(9, 1, 0.5), rng, 0.15)?.id).toBe('a0');
    expect(rng.getState()).toEqual(before);
  });

  it('never returns anything below the band, however unlucky the draw', () => {
    const rng = new RNG(3);
    // 10 leads; the band at 0.15 reaches down to 8.5, so a1 and a2 are in and
    // a3 and a4 must be unreachable.
    const scores = table(10, 9.5, 8.6, 8.4, 1);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(chooseAmongBest(scores, rng, 0.15)!.id);
    expect(seen).toEqual(new Set(['a0', 'a1', 'a2']));
  });

  it('is scale-free: the same shape of table behaves the same at any magnitude', () => {
    const small = table(0.20, 0.19, 0.02);
    const large = table(20, 19, 2);
    const a = new RNG(4);
    const b = new RNG(4);
    for (let i = 0; i < 200; i++) {
      expect(chooseAmongBest(small, a, 0.1)!.id).toBe(chooseAmongBest(large, b, 0.1)!.id);
    }
  });

  it('caps the band, so a dozen near-ties is not a dozen candidates', () => {
    const rng = new RNG(5);
    // Eight actions within a whisker of each other — a comfortable person late
    // in the day. Only the first four may ever be chosen.
    const scores = table(1, 0.99, 0.98, 0.97, 0.96, 0.95, 0.94, 0.93);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(chooseAmongBest(scores, rng, 0.2)!.id);
    expect(seen).toEqual(new Set(['a0', 'a1', 'a2', 'a3']));
  });

  it('favours the leader rather than drawing uniformly', () => {
    const rng = new RNG(6);
    const scores = table(10, 6);
    let leader = 0;
    for (let i = 0; i < 4000; i++) if (chooseAmongBest(scores, rng, 0.5)!.id === 'a0') leader++;
    // 10/16 = 0.625 in expectation. Wide bounds: this asserts "proportional,
    // not uniform", not a particular stream.
    expect(leader / 4000).toBeGreaterThan(0.56);
    expect(leader / 4000).toBeLessThan(0.69);
  });

  it('is reproducible from a seed', () => {
    const scores = table(5, 4.8, 4.6);
    const run = (seed: number) => {
      const rng = new RNG(seed);
      return Array.from({ length: 40 }, () => chooseAmongBest(scores, rng, 0.2)!.id);
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });
});
