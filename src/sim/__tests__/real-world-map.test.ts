import { describe, expect, it } from 'vitest';
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

  it('rejects subdivisions that cannot form a local map grid', () => {
    expect(() => new RealWorldMap(raster(), 0)).toThrow('positive integer');
  });
});
