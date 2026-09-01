/**
 * 2D simplex noise plus fractal Brownian motion, seeded from an RNG.
 *
 * Self-contained rather than a dependency: it is 100 lines, it must be
 * deterministic from our own seed, and world generation is the only caller.
 */
import type { RNG } from './RNG.ts';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
] as const;

export class SimplexNoise {
  private perm = new Uint8Array(512);
  private permMod8 = new Uint8Array(512);

  constructor(rng: RNG) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      const tmp = p[i]!;
      p[i] = p[j]!;
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]!;
      this.permMod8[i] = this.perm[i]! % 8;
    }
  }

  /** Raw noise in roughly [-1, 1]. */
  noise2D(xin: number, yin: number): number {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n = 0;
    n += this.corner(x0, y0, this.permMod8[ii + this.perm[jj]!]!);
    n += this.corner(x1, y1, this.permMod8[ii + i1 + this.perm[jj + j1]!]!);
    n += this.corner(x2, y2, this.permMod8[ii + 1 + this.perm[jj + 1]!]!);
    return 70 * n;
  }

  private corner(x: number, y: number, gi: number): number {
    let t = 0.5 - x * x - y * y;
    if (t < 0) return 0;
    t *= t;
    const g = GRAD2[gi]!;
    return t * t * (g[0] * x + g[1] * y);
  }

  /** Fractal Brownian motion, normalized to [0, 1]. */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5, scale = 0.02): number {
    let amplitude = 1;
    let frequency = scale;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amplitude * this.noise2D(x * frequency, y * frequency);
      norm += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return clamp01((sum / norm) * 0.5 + 0.5);
  }
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
