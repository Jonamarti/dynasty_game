import type { WorldRaster } from './WorldBinary.ts';

export interface RealWorldRegion {
  id: number;
  x: number;
  y: number;
  latitude: number;
  elevationMeters: number;
  /** Beck et al. Köppen-Geiger category; 0 means unclassified. */
  climateClass: number;
  /** `WORLD_FEATURE` bit flags, kept opaque so this module stays data-driven. */
  features: number;
  land: boolean;
}

/** A sampled real map with seam-safe coordinates and no simulation state. */
export class RealWorldMap {
  readonly regionsWide: number;
  readonly regionsHigh: number;
  readonly regions: readonly RealWorldRegion[];

  constructor(readonly raster: WorldRaster, readonly comarcasPerRegion = 10) {
    if (!Number.isInteger(comarcasPerRegion) || comarcasPerRegion < 1) {
      throw new RangeError('comarcasPerRegion must be a positive integer');
    }
    this.regionsWide = raster.width;
    this.regionsHigh = raster.height;
    this.regions = Array.from({ length: raster.width * raster.height }, (_, id) => {
      const x = id % raster.width;
      const y = Math.floor(id / raster.width);
      const elevationMeters = raster.elevationMeters[id]!;
      return {
        id, x, y,
        latitude: 90 - (y + 0.5) / raster.height * 180,
        elevationMeters,
        climateClass: raster.koppen[id]!,
        features: raster.features?.[id] ?? 0,
        land: elevationMeters >= raster.seaLevelMeters,
      };
    });
  }

  regionAt(x: number, y: number): RealWorldRegion {
    const regionX = mod(Math.floor(x), this.regionsWide);
    const regionY = clamp(Math.floor(y), 0, this.regionsHigh - 1);
    return this.regions[regionY * this.regionsWide + regionX]!;
  }

  /** Bilinear elevation in region units. The longitude edge wraps continuously. */
  elevationAt(x: number, y: number): number {
    const gx = wrap(x, this.regionsWide) - 0.5;
    const gy = clamp(y, 0.5, this.regionsHigh - 0.5) - 0.5;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = gx - x0;
    const ty = gy - y0;
    const a = lerp(this.sampleMeters(x0, y0), this.sampleMeters(x0 + 1, y0), tx);
    const b = lerp(this.sampleMeters(x0, y0 + 1), this.sampleMeters(x0 + 1, y0 + 1), tx);
    return lerp(a, b, ty);
  }

  private sampleMeters(x: number, y: number): number {
    const xx = mod(x, this.regionsWide);
    const yy = clamp(y, 0, this.regionsHigh - 1);
    return this.raster.elevationMeters[yy * this.regionsWide + xx]!;
  }
}

function wrap(value: number, length: number): number { return ((value % length) + length) % length; }
function mod(value: number, divisor: number): number { return ((value % divisor) + divisor) % divisor; }
function clamp(value: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, value)); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
