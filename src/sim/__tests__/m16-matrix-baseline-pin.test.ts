import { describe, expect, it } from 'vitest';
import { assembleMatrixBaseline, type ScenarioMatrixRecord } from '../../../tools/baseline-diff-lib.ts';

const row = (name: string): ScenarioMatrixRecord => ({ name, passed: ['a'], failed: [], na: [] });
const catalog = ['s0', 's1', 's2', 's3', 's4', 's5'];
const shards = () => [[row('s0'), row('s4')], [row('s1'), row('s5')], [row('s2')], [row('s3')]];

describe('a matrix re-pin cannot lose results', () => {
  it('rebuilds the catalog order from all four shards', () => {
    expect(assembleMatrixBaseline(shards(), catalog).map(r => r.name)).toEqual(catalog);
  });

  it('refuses a missing shard', () => {
    expect(() => assembleMatrixBaseline(shards().slice(0, 3), catalog)).toThrow();
  });

  it('refuses a shard that lost a scenario', () => {
    const partial = shards();
    partial[0] = [row('s0')];
    expect(() => assembleMatrixBaseline(partial, catalog)).toThrow(/missing scenario s4/);
  });

  it('refuses shards given in the wrong order', () => {
    const swapped = shards();
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(() => assembleMatrixBaseline(swapped, catalog)).toThrow(/catalog expects s0/);
  });

  it('refuses a scenario the catalog does not know', () => {
    const extra = shards();
    extra[2] = [row('s2'), row('stray')];
    expect(() => assembleMatrixBaseline(extra, catalog)).toThrow(/7 scenarios/);
  });
});
