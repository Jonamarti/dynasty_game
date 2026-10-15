import { describe, expect, it } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { gaussianTileWeight, pickGaussianTile } from '../world/GaussianPlacement.ts';

describe('Gaussian resource placement', () => {
  it('gives coastal tiles near a cluster center higher weight than distant tiles', () => {
    const centre = { x: 20, y: 30 };
    expect(gaussianTileWeight(centre, [centre], 9)).toBe(1);
    expect(gaussianTileWeight({ x: 21, y: 30 }, [centre], 9))
      .toBeGreaterThan(gaussianTileWeight({ x: 45, y: 30 }, [centre], 9));
    expect(gaussianTileWeight({ x: 45, y: 30 }, [centre], 9)).toBeGreaterThan(0);
  });

  it('samples reproducible clusters while retaining nonzero tails', () => {
    const coast = Array.from({ length: 81 }, (_, x) => ({ x, y: 0 }));
    const centres = [{ x: 20, y: 0 }, { x: 60, y: 0 }];
    const sample = (seed: string) => {
      const rng = new RNG(seed);
      return Array.from({ length: 3000 }, () => pickGaussianTile(coast, centres, 8, rng)!.x);
    };
    const a = sample('gaussian-coast-repeatable');
    expect(sample('gaussian-coast-repeatable')).toEqual(a);
    const nearClusters = a.filter(x => Math.abs(x - 20) <= 8 || Math.abs(x - 60) <= 8).length;
    const farTail = a.filter(x => Math.abs(x - 20) >= 18 && Math.abs(x - 60) >= 18).length;
    expect(nearClusters).toBeGreaterThan(2000);
    expect(farTail).toBeGreaterThan(0);
  });

  it('uses uniform selection when no centers are supplied and handles empty shores', () => {
    const tiles = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
    expect(pickGaussianTile(tiles, [], 9, new RNG('empty-centers'))).toBeDefined();
    expect(pickGaussianTile([], [], 9, new RNG('empty-shore'))).toBeUndefined();
  });

  it('rejects an invalid spread', () => {
    expect(() => gaussianTileWeight({ x: 0, y: 0 }, [], 0)).toThrow(RangeError);
  });
});
