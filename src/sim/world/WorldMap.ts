/**
 * World-scale coordinates and the first terrain field for M15 phase 29a.
 *
 * This is deliberately independent of Simulation: adding a world map must not
 * consume the legacy RNG stream or perturb the classic island's seed contract.
 */
import { RNG } from '../core/RNG.ts';
import { SimplexNoise } from '../core/Noise.ts';

export const REGIONS_WIDE = 96;
export const REGIONS_HIGH = 48;
export const COMARCAS_PER_REGION = 10;

export interface WorldMapOptions {
  regionsWide?: number;
  regionsHigh?: number;
}

export interface ComarcaProfile {
  /** Continuous coordinates in comarca units; integers identify comarca centres. */
  x: number;
  y: number;
  regionX: number;
  regionY: number;
  /** Degrees north, from -90 at the south pole to +90 at the north pole. */
  latitude: number;
  /** Normalized terrain height, with 0 as ocean level. */
  elevation: number;
}

/**
 * A deterministic, seam-continuous height field over the world grid.
 * Longitude wraps; latitude clamps at the poles. Region centre heights are
 * interpolated before fine detail is added, so neighboring comarca profiles
 * agree at their shared edge without a pairwise border repair pass.
 */
export class WorldMap {
  readonly regionsWide: number;
  readonly regionsHigh: number;
  readonly width: number;
  readonly height: number;

  private readonly broad: SimplexNoise;
  private readonly detail: SimplexNoise;

  constructor(seed: number | string, options: WorldMapOptions = {}) {
    this.regionsWide = options.regionsWide ?? REGIONS_WIDE;
    this.regionsHigh = options.regionsHigh ?? REGIONS_HIGH;
    if (!Number.isInteger(this.regionsWide) || this.regionsWide < 2 ||
        !Number.isInteger(this.regionsHigh) || this.regionsHigh < 2) {
      throw new RangeError('WorldMap needs at least two integer regions on each axis');
    }
    this.width = this.regionsWide * COMARCAS_PER_REGION;
    this.height = this.regionsHigh * COMARCAS_PER_REGION;

    // Named derived seeds keep this terrain independent of every simulation fork.
    const seedText = String(seed);
    this.broad = new SimplexNoise(new RNG(`${seedText}:worldmap:broad`));
    this.detail = new SimplexNoise(new RNG(`${seedText}:worldmap:detail`));
  }

  profileAt(x: number, y: number): ComarcaProfile {
    const comarcaX = wrap(x, this.width);
    const comarcaY = clamp(y, 0, this.height);
    const regionX = Math.floor(comarcaX / COMARCAS_PER_REGION);
    const regionY = Math.min(this.regionsHigh - 1, Math.floor(comarcaY / COMARCAS_PER_REGION));
    const latitude = 90 - comarcaY / this.height * 180;
    const elevation = this.elevationAt(comarcaX / COMARCAS_PER_REGION, comarcaY / COMARCAS_PER_REGION);
    return { x: comarcaX, y: comarcaY, regionX, regionY, latitude, elevation };
  }

  /** Height at a point measured in region units; useful at exact shared edges. */
  elevationAt(regionX: number, regionY: number): number {
    // The map has no east/west edge and no terrain beyond its polar caps.
    regionX = wrap(regionX, this.regionsWide);
    regionY = clamp(regionY, 0.5, this.regionsHigh - 0.5);
    const gx = regionX - 0.5;
    const gy = regionY - 0.5;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const a = lerp(this.regionHeight(x0, y0), this.regionHeight(x0 + 1, y0), tx);
    const b = lerp(this.regionHeight(x0, y0 + 1), this.regionHeight(x0 + 1, y0 + 1), tx);
    const base = lerp(a, b, ty);
    // Detail noise itself is not periodic. Fade it at the longitude seam so
    // the field stays continuous when x wraps from the last region to the first.
    const seamFade = Math.sin(Math.PI * regionX / this.regionsWide) ** 2;
    const fine = (this.detail.fbm(regionX, regionY, 3, 2, 0.5, 0.9) - 0.5) * seamFade;
    return clamp(base + fine * 0.12, 0, 1);
  }

  private regionHeight(x: number, y: number): number {
    const wrappedX = mod(x, this.regionsWide);
    const clampedY = clamp(y, 0, this.regionsHigh - 1);
    return this.broad.fbm(wrappedX + 0.5, clampedY + 0.5, 4, 2, 0.5, 0.075);
  }
}

function smooth(t: number): number { return t * t * (3 - 2 * t); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }
function mod(n: number, divisor: number): number { return ((n % divisor) + divisor) % divisor; }
function wrap(n: number, length: number): number { return mod(n, length); }
