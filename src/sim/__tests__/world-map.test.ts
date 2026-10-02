import { describe, expect, it } from 'vitest';
import { COMARCAS_PER_REGION, REGIONS_HIGH, REGIONS_WIDE, WorldMap } from '../world/WorldMap.ts';

describe('world map phases 29a-b', () => {
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
    expect(profile.elevation).toBeGreaterThan(-1);
    expect(profile.elevation).toBeLessThan(1);
  });

  it('generates varied continents, climate bands, and climate-specific biomes', () => {
    const map = new WorldMap('continents');
    const land = map.regions.filter(region => region.biome !== 'ocean');
    expect(land.length).toBeGreaterThan(map.regions.length * 0.15);
    expect(land.length).toBeLessThan(map.regions.length * 0.65);
    expect(map.regionAt(40, 0).temperature).toBeLessThan(map.regionAt(40, 23).temperature);
    expect(new Set(land.map(region => region.biome)).size).toBeGreaterThan(3);
    expect(map.regions.every(region => region.temperature >= 0 && region.temperature <= 1)).toBe(true);
    expect(map.regions.every(region => region.rainfall >= 0 && region.rainfall <= 1)).toBe(true);
  });

  it('keeps wild grain in temperate steppe and makes tin scarce', () => {
    const map = new WorldMap('resources');
    const grainRegions = map.regions.filter(region => region.resources.includes('wild_grain'));
    const tinRegions = map.regions.filter(region => region.resources.includes('tin'));
    expect(grainRegions.length).toBeGreaterThan(0);
    expect(grainRegions.every(region => region.biome === 'steppe' && region.temperature >= 0.24 && region.temperature <= 0.84)).toBe(true);
    expect(tinRegions.length).toBeGreaterThan(0);
    expect(tinRegions.length).toBeLessThan(map.regions.length * 0.02);
  });

  it('routes accumulated rain through an acyclic river graph to the ocean', () => {
    const map = new WorldMap('rivers');
    expect(map.rivers.length).toBeGreaterThan(0);
    for (const river of map.rivers) {
      expect(river.flow).toBeGreaterThanOrEqual(3.2);
      let region = map.regions[river.from]!;
      const visited = new Set<number>();
      while (region.downstream >= 0 && !visited.has(region.id)) {
        visited.add(region.id);
        region = map.regions[region.downstream]!;
      }
      expect(region.biome).toBe('ocean');
    }
  });
});
