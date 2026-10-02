import { describe, expect, it } from 'vitest';
import { decodeWorldRaster, encodeWorldRaster } from '../world/WorldBinary.ts';

describe('pregenerated world map assets', () => {
  it('round-trips elevations, climate classes, and the sea level adjustment', () => {
    const raster = {
      width: 3,
      height: 2,
      elevationMeters: Int16Array.from([-4200, -60, 0, 38, 8848, -32768]),
      koppen: Uint8Array.from([0, 4, 14, 7, 30, 0]),
      features: Uint32Array.from([1, 2, 4, 8, 16, 32]),
      seaLevelMeters: -60,
    };
    const decoded = decodeWorldRaster(encodeWorldRaster(raster));
    expect(decoded.width).toBe(3);
    expect(decoded.height).toBe(2);
    expect(Array.from(decoded.elevationMeters)).toEqual(Array.from(raster.elevationMeters));
    expect(Array.from(decoded.koppen)).toEqual(Array.from(raster.koppen));
    expect(Array.from(decoded.features!)).toEqual(Array.from(raster.features));
    expect(decoded.seaLevelMeters).toBe(-60);
  });

  it('rejects unknown versions and truncated maps', () => {
    const good = encodeWorldRaster({ width: 2, height: 2, elevationMeters: new Int16Array(4), koppen: new Uint8Array(4), seaLevelMeters: 0 });
    expect(() => decodeWorldRaster(good.subarray(0, 15))).toThrow('truncated');
    good[4] = 3;
    expect(() => decodeWorldRaster(good)).toThrow('Unsupported');
  });

  it('reads the earlier elevation-and-climate format with empty feature flags', () => {
    const legacy = new Uint8Array(12 + 4 * 3);
    legacy.set([0x44, 0x57, 0x4d, 0x31], 0);
    const view = new DataView(legacy.buffer);
    view.setUint8(4, 1);
    view.setUint8(5, 2);
    view.setUint8(6, 2);
    view.setInt16(8, -60, true);
    const decoded = decodeWorldRaster(legacy);
    expect(decoded.seaLevelMeters).toBe(-60);
    expect(Array.from(decoded.features!)).toEqual([0, 0, 0, 0]);
  });
});
