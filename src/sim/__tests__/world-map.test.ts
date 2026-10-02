import { describe, expect, it } from 'vitest';
import { COMARCAS_PER_REGION, REGIONS_HIGH, REGIONS_WIDE, WorldMap } from '../world/WorldMap.ts';

describe('world map phase 29a', () => {
  it('uses the planned grid and allows smaller grids for focused worlds', () => {
    const earth = new WorldMap('earth');
    expect([earth.regionsWide, earth.regionsHigh]).toEqual([96, 48]);
    expect([earth.width, earth.height]).toEqual([960, 480]);

    const small = new WorldMap(7, { regionsWide: 8, regionsHigh: 4 });
    expect([small.width, small.height]).toEqual([8 * COMARCAS_PER_REGION, 4 * COMARCAS_PER_REGION]);
    expect([REGIONS_WIDE, REGIONS_HIGH]).toEqual([96, 48]);
  });

  it('is deterministic from its seed and separates independent seeds', () => {
    const a = new WorldMap('same seed');
    const b = new WorldMap('same seed');
    const c = new WorldMap('other seed');
    expect(a.profileAt(374.25, 206.75)).toEqual(b.profileAt(374.25, 206.75));
    expect(a.profileAt(374.25, 206.75).elevation).not.toBe(c.profileAt(374.25, 206.75).elevation);
  });

  it('has no elevation step at comarca, region, or longitude seams', () => {
    const map = new WorldMap(42, { regionsWide: 8, regionsHigh: 4 });
    const epsilon = 1e-5;
    for (const x of [10, 20, 37]) {
      expect(Math.abs(map.elevationAt(x - epsilon, 1.3) - map.elevationAt(x + epsilon, 1.3))).toBeLessThan(0.0001);
    }
    expect(map.elevationAt(epsilon, 2.2)).toBeCloseTo(map.elevationAt(8 - epsilon, 2.2), 4);
    const comarcaEdge = 3 * COMARCAS_PER_REGION;
    expect(Math.abs(
      map.profileAt(comarcaEdge - epsilon, 13.2).elevation -
      map.profileAt(comarcaEdge + epsilon, 13.2).elevation,
    )).toBeLessThan(0.0001);
  });

  it('reports region, latitude, and bounded elevation for a comarca profile', () => {
    const map = new WorldMap(12, { regionsWide: 8, regionsHigh: 4 });
    const profile = map.profileAt(31, 22);
    expect([profile.regionX, profile.regionY]).toEqual([3, 2]);
    expect(profile.latitude).toBeLessThan(0);
    expect(profile.elevation).toBeGreaterThanOrEqual(0);
    expect(profile.elevation).toBeLessThanOrEqual(1);
  });
});
