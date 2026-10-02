import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeWorldRaster } from '../world/WorldBinary.ts';

describe('pregenerated Earth maps', () => {
  it('ships two compact, correctly sized climate and elevation grids', () => {
    const present = decodeWorldRaster(new Uint8Array(readFileSync('public/world/earth-present.bin')));
    const glacial = decodeWorldRaster(new Uint8Array(readFileSync('public/world/earth-12000-bce.bin')));
    expect([present.width, present.height, present.seaLevelMeters]).toEqual([96, 48, 0]);
    expect([glacial.width, glacial.height, glacial.seaLevelMeters]).toEqual([96, 48, -60]);
    expect(new Set(present.koppen).size).toBeGreaterThan(10);
    expect(Array.from(present.elevationMeters).some(value => value > 3000)).toBe(true);
    expect(Array.from(present.elevationMeters).some(value => value < -3000)).toBe(true);
  });

  it('exposes additional low coastal regions in the 12,000-year map', () => {
    const present = decodeWorldRaster(new Uint8Array(readFileSync('public/world/earth-present.bin')));
    const glacial = decodeWorldRaster(new Uint8Array(readFileSync('public/world/earth-12000-bce.bin')));
    const landNow = Array.from(present.elevationMeters).filter(elevation => elevation > present.seaLevelMeters).length;
    const landThen = Array.from(glacial.elevationMeters).filter(elevation => elevation > glacial.seaLevelMeters).length;
    expect(landThen).toBeGreaterThan(landNow);
    expect(Array.from(glacial.koppen)).toEqual(Array.from(present.koppen));
  });
});
