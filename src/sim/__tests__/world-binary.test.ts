import { describe, expect, it } from 'vitest';
import { decodeWorldRaster, encodeWorldRaster } from '../world/WorldBinary.ts';

describe('pregenerated world map assets', () => {
  it('round-trips elevations, climate classes, and the sea level adjustment', () => {
    const raster = {
      width: 3,
      height: 2,
      elevationMeters: Int16Array.from([-4200, -60, 0, 38, 8848, -32768]),
      koppen: Uint8Array.from([0, 4, 14, 7, 30, 0]),
      seaLevelMeters: -60,
    };
    const decoded = decodeWorldRaster(encodeWorldRaster(raster));
    expect(decoded.width).toBe(3);
    expect(decoded.height).toBe(2);
    expect(Array.from(decoded.elevationMeters)).toEqual(Array.from(raster.elevationMeters));
    expect(Array.from(decoded.koppen)).toEqual(Array.from(raster.koppen));
    expect(decoded.seaLevelMeters).toBe(-60);
  });

  it('rejects unknown versions and truncated maps', () => {
    const good = encodeWorldRaster({ width: 2, height: 2, elevationMeters: new Int16Array(4), koppen: new Uint8Array(4), seaLevelMeters: 0 });
    expect(() => decodeWorldRaster(good.subarray(0, 15))).toThrow('truncated');
    good[4] = 2;
    expect(() => decodeWorldRaster(good)).toThrow('Unsupported');
  });
});
