import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { decodeWorldRaster } from '../world/WorldBinary.ts';
import { RealWorldMap } from '../world/RealWorldMap.ts';
import { WORLD_FEATURE } from '../world/WorldFeatureSeeds.ts';

function raster() {
  return {
    width: 4,
    height: 2,
    elevationMeters: Int16Array.from([100, 200, 300, 400, -100, -50, 0, 50]),
    koppen: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
    features: Uint32Array.from([WORLD_FEATURE.river, WORLD_FEATURE.lake, 16, 32, 64, 128, 256, 512]),
    seaLevelMeters: 0,
  };
}

describe('real-world map data model', () => {
  it('exposes actual relief, climate classes, and feature bits per region', () => {
    const map = new RealWorldMap(raster());
    expect(map.regionAt(1, 0)).toMatchObject({
      id: 1, x: 1, y: 0, latitude: 45, elevationMeters: 200, climateClass: 2, features: WORLD_FEATURE.lake, land: true,
    });
    expect(map.regionAt(2, 1).land).toBe(true);
    expect(map.regionAt(0, 1).land).toBe(false);
    expect(map.regionAt(0, 0).water).toBe('fresh');
    expect(map.regionAt(1, 0).water).toBe('fresh');
    expect(map.regionAt(0, 1).water).toBe('salt');
    expect(map.regionAt(2, 1).water).toBe('land');
  });

  it('wraps longitude and interpolates smoothly across the antimeridian', () => {
    const map = new RealWorldMap(raster());
    expect(map.regionAt(-1, 0).id).toBe(map.regionAt(3, 0).id);
    expect(map.elevationAt(0, 0.5)).toBe(250);
    expect(map.elevationAt(4, 0.5)).toBe(map.elevationAt(0, 0.5));
    expect(map.elevationAt(0.5, 0.5)).toBe(100);
  });

  it('samples comarca coordinates in their own units with regional source data', () => {
    const map = new RealWorldMap({ ...raster(), seaLevelMeters: -60 }, 3);
    expect(map.width).toBe(12);
    expect(map.height).toBe(6);
    const profile = map.comarcaAt(4.5, 1.5);
    expect(profile).toMatchObject({
      x: 4.5, y: 1.5, regionX: 1, regionY: 0, latitude: 45,
      elevationMeters: 200, elevationAboveSeaMeters: 260,
      climateClass: 2, features: WORLD_FEATURE.lake, land: true, water: 'fresh',
    });
    expect(profile.region).toBe(map.regionAt(1, 0));
    expect(map.comarcaAt(-1, 1.5)).toMatchObject({ x: 11, regionX: 3 });
    expect(map.comarcaAt(12, 1.5)).toMatchObject({ x: 0, regionX: 0 });
    expect(map.comarcaAt(2, -4).latitude).toBe(90);
    expect(map.comarcaAt(2, 10).latitude).toBe(-90);
  });

  it('keeps interpolated height continuous at comarca-region borders and the longitude seam', () => {
    const map = new RealWorldMap(raster(), 3);
    const epsilon = 1e-5;
    const near = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(0.01);

    near(map.comarcaAt(3 - epsilon, 1.5).elevationMeters, map.comarcaAt(3, 1.5).elevationMeters);
    near(map.comarcaAt(3 + epsilon, 1.5).elevationMeters, map.comarcaAt(3, 1.5).elevationMeters);
    near(map.comarcaAt(-epsilon, 1.5).elevationMeters, map.comarcaAt(0, 1.5).elevationMeters);
    near(map.comarcaAt(map.width - epsilon, 1.5).elevationMeters, map.comarcaAt(0, 1.5).elevationMeters);
  });

  it('rejects non-finite coordinates instead of returning missing region data', () => {
    const map = new RealWorldMap(raster());
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => map.regionAt(value, 0)).toThrow('coordinates must be finite');
      expect(() => map.elevationAt(0, value)).toThrow('coordinates must be finite');
      expect(() => map.comarcaAt(value, 0)).toThrow('coordinates must be finite');
    }
  });

  it('samples the committed glacial asset using its sea-level adjustment', async () => {
    const bytes = await readFile(new URL('../../../public/world/earth-12000-bce.bin', import.meta.url));
    const raster = decodeWorldRaster(new Uint8Array(bytes));
    const map = new RealWorldMap(raster, 10);
    const profile = map.comarcaAt(487.5, 237.5);
    expect(map.width).toBe(960);
    expect(map.height).toBe(480);
    expect(profile.elevationAboveSeaMeters).toBe(profile.elevationMeters + 60);
    expect(profile.region).toBe(map.regionAt(profile.regionX, profile.regionY));
    expect(profile.climateClass).toBe(profile.region.climateClass);
    expect(profile.features).toBe(profile.region.features);
    expect(profile.water).toBe(profile.region.water);
  });

  it('rejects subdivisions that cannot form a local map grid', () => {
    expect(() => new RealWorldMap(raster(), 0)).toThrow('positive integer');
  });
});
