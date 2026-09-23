/**
 * M11 phase 13d: the *Life* panel folds a run of the same deed into one line.
 */
import { describe, it, expect } from 'vitest';
import { foldRepeats } from '../../ui/LifeLog.ts';

const at = (tick: number, text: string, kind = 'did') => ({ tick, ageDays: tick, text, kind });

describe('the Life panel', () => {
  it('folds twenty trespasses in a row into one line counted twenty', () => {
    const entries = Array.from({ length: 20 }, (_, i) => at(i, "used what wasn't theirs"));
    const folded = foldRepeats(entries);
    expect(folded).toHaveLength(1);
    expect(folded[0]!.count).toBe(20);
    expect(folded[0]!.first.tick).toBe(0);
    expect(folded[0]!.last.tick).toBe(19);
  });

  it('keeps apart a repeat that has something else in the middle', () => {
    const folded = foldRepeats([at(1, 'stole'), at(2, 'ate'), at(3, 'stole')]);
    expect(folded.map(r => r.count)).toEqual([1, 1, 1]);
  });

  it('keeps apart the same words done and suffered', () => {
    const folded = foldRepeats([at(1, 'a fight', 'did'), at(2, 'a fight', 'suffered')]);
    expect(folded).toHaveLength(2);
  });
});
