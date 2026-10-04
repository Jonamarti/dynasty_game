import type { WorldRaster } from './WorldBinary.ts';
import { WORLD_FEATURE } from './WorldFeatureSeeds.ts';

export type WorldWaterKind = 'land' | 'fresh' | 'salt';

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
  water: WorldWaterKind;
}

/** Geography available to one detailed comarca, sampled from the regional atlas. */
export interface RealWorldComarcaProfile {
  /** Continuous coordinates in comarca units; longitude wraps at `width`. */
  x: number;
  /** Continuous coordinates in comarca units, clamped at the poles. */
  y: number;
  regionX: number;
  regionY: number;
  /** The categorical regional data remains attached to its source region. */
  region: RealWorldRegion;
  latitude: number;
  /** Bilinearly sampled absolute elevation, in metres. */
  elevationMeters: number;
  /** Absolute elevation relative to this map's configured sea level, in metres. */
  elevationAboveSeaMeters: number;
  /** Beck et al. category; zero means the source raster is unclassified. */
  climateClass: number;
  /** Opaque `WORLD_FEATURE` bit flags for the source region. */
  features: number;
  land: boolean;
  water: WorldWaterKind;
}

/** A sampled real map with seam-safe coordinates and no simulation state. */
export class RealWorldMap {
  readonly regionsWide: number;
  readonly regionsHigh: number;
  readonly width: number;
  readonly height: number;
  readonly regions: readonly RealWorldRegion[];

  constructor(readonly raster: WorldRaster, readonly comarcasPerRegion = 10) {
    if (!Number.isInteger(comarcasPerRegion) || comarcasPerRegion < 1) {
      throw new RangeError('comarcasPerRegion must be a positive integer');
    }
    this.regionsWide = raster.width;
    this.regionsHigh = raster.height;
    this.width = raster.width * comarcasPerRegion;
    this.height = raster.height * comarcasPerRegion;
    this.regions = Array.from({ length: raster.width * raster.height }, (_, id) => {
      const x = id % raster.width;
      const y = Math.floor(id / raster.width);
      const elevationMeters = raster.elevationMeters[id]!;
      const features = raster.features?.[id] ?? 0;
      const freshwater = (features & (WORLD_FEATURE.river | WORLD_FEATURE.lake)) !== 0;
      const land = elevationMeters >= raster.seaLevelMeters;
      return {
        id, x, y,
        latitude: 90 - (y + 0.5) / raster.height * 180,
        elevationMeters,
        climateClass: raster.koppen[id]!,
        features,
        land,
        // Natural Earth lakes/rivers remain fresh even when their sampled
        // surface is below the sea-level threshold; the coastline decides
        // salt water only after inland water features have been identified.
        water: freshwater ? 'fresh' : land ? 'land' : 'salt',
      };
    });
  }

  regionAt(x: number, y: number): RealWorldRegion {
    assertFiniteCoordinates(x, y);
    const regionX = mod(Math.floor(x), this.regionsWide);
    const regionY = clamp(Math.floor(y), 0, this.regionsHigh - 1);
    return this.regions[regionY * this.regionsWide + regionX]!;
  }

  /**
   * Sample continuous comarca coordinates. Height is interpolated from the
   * regional raster; categorical climate, water, and feature flags retain the
   * owning region's values rather than inventing sub-region data.
   */
  comarcaAt(x: number, y: number): RealWorldComarcaProfile {
    assertFiniteCoordinates(x, y);
    const wrappedX = wrap(x, this.width);
    const clampedY = clamp(y, 0, this.height);
    const regionX = Math.min(this.regionsWide - 1, Math.floor(wrappedX / this.comarcasPerRegion));
    const regionY = Math.min(this.regionsHigh - 1, Math.floor(clampedY / this.comarcasPerRegion));
    const region = this.regions[regionY * this.regionsWide + regionX]!;
    const elevationMeters = this.elevationAt(
      wrappedX / this.comarcasPerRegion,
      clampedY / this.comarcasPerRegion,
    );
    return {
      x: wrappedX,
      y: clampedY,
      regionX,
      regionY,
      region,
      latitude: 90 - clampedY / this.height * 180,
      elevationMeters,
      elevationAboveSeaMeters: elevationMeters - this.raster.seaLevelMeters,
      climateClass: region.climateClass,
      features: region.features,
      land: region.land,
      water: region.water,
    };
  }

  /** Bilinear elevation in region units. The longitude edge wraps continuously. */
  elevationAt(x: number, y: number): number {
    assertFiniteCoordinates(x, y);
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

function assertFiniteCoordinates(x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError('World map coordinates must be finite');
  }
}

function wrap(value: number, length: number): number { return ((value % length) + length) % length; }
function mod(value: number, divisor: number): number { return ((value % divisor) + divisor) % divisor; }
function clamp(value: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, value)); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
