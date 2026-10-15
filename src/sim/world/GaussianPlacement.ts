import type { RNG } from '../core/RNG.ts';

export interface TilePoint { readonly x: number; readonly y: number }

/** Relative probability for a tile under a spatial Gaussian centered on any of `centres`. */
export function gaussianTileWeight(tile: TilePoint, centres: readonly TilePoint[], sigma: number): number {
  if (!(sigma > 0) || !Number.isFinite(sigma)) throw new RangeError('Gaussian placement sigma must be positive');
  const denominator = 2 * sigma * sigma;
  let weight = 0;
  for (const centre of centres) {
    const dx = tile.x - centre.x;
    const dy = tile.y - centre.y;
    weight += Math.exp(-(dx * dx + dy * dy) / denominator);
  }
  return weight;
}

/** Select without replacement, favoring tiles near one of the coastline cluster centers. */
export function pickGaussianTile<T extends TilePoint>(
  candidates: readonly T[], centres: readonly TilePoint[], sigma: number, rng: RNG,
): T | undefined {
  if (candidates.length === 0) return undefined;
  const weights = candidates.map(tile => gaussianTileWeight(tile, centres, sigma));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return candidates[rng.int(0, candidates.length - 1)];
  let draw = rng.next() * total;
  for (let i = 0; i < candidates.length; i++) {
    draw -= weights[i]!;
    if (draw < 0) return candidates[i]!;
  }
  return candidates[candidates.length - 1];
}
