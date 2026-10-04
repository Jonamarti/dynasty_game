import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeWorldRaster } from '../world/WorldBinary.ts';
import { RealWorldMap } from '../world/RealWorldMap.ts';
import { WORLD_FEATURE } from '../world/WorldFeatureSeeds.ts';

describe('pregenerated Earth maps', () => {
  it('ships two compact, correctly sized climate and elevation grids', () => {
    const present = decodeWorldRaster(new Uint8Array(readFileSync('public/world/earth-present.bin')));
    const glacial = decodeWorldRaster(new Uint8Array(readFileSync('public/world/earth-12000-bce.bin')));
    expect([present.width, present.height, present.seaLevelMeters]).toEqual([96, 48, 0]);
    expect([glacial.width, glacial.height, glacial.seaLevelMeters]).toEqual([96, 48, -60]);
    expect(new Set(present.koppen).size).toBeGreaterThan(10);
    expect(Array.from(present.elevationMeters).some(value => value > 3000)).toBe(true);
    expect(Array.from(present.elevationMeters).some(value => value < -3000)).toBe(true);
    expect(present.features!.filter(value => (value & WORLD_FEATURE.river) !== 0).length).toBeGreaterThan(20);
    expect(present.features!.some(value => (value & WORLD_FEATURE.lake) !== 0)).toBe(true);
    expect(present.features!.some(value => (value & WORLD_FEATURE.wildWheat) !== 0)).toBe(true);
    expect(present.features!.some(value => (value & WORLD_FEATURE.tin) !== 0)).toBe(true);
  });

  it('exposes additional low coastal regions in the 12,000-year map', () => {
    const present = decodeWorldRaster(new Uint8Array(readFileSync('public/world/earth-present.bin')));
    const glacial = decodeWorldRaster(new Uint8Array(readFileSync('public/world/earth-12000-bce.bin')));
    const landNow = Array.from(present.elevationMeters).filter(elevation => elevation > present.seaLevelMeters).length;
    const landThen = Array.from(glacial.elevationMeters).filter(elevation => elevation > glacial.seaLevelMeters).length;
    expect(landThen).toBeGreaterThan(landNow);
    expect(Array.from(glacial.koppen)).toEqual(Array.from(present.koppen));
    expect(Array.from(glacial.features!)).toEqual(Array.from(present.features!));
  });

  it('keeps real atlas coordinates aligned with Iberia and the central Pacific', () => {
    const raster = decodeWorldRaster(new Uint8Array(readFileSync('public/world/earth-present.bin')));
    const map = new RealWorldMap(raster, 10);
    const at = (longitude: number, latitude: number) => map.comarcaAt(
      (longitude + 180) / 360 * map.width,
      (90 - latitude) / 180 * map.height,
    );
    const iberia = at(-3, 40);
    const pacific = at(175, 0);
    expect(iberia.land).toBe(true);
    expect(iberia.elevationAboveSeaMeters).toBeGreaterThan(0);
    expect(pacific.land).toBe(false);
    expect(pacific.water).toBe('salt');
  });
});
