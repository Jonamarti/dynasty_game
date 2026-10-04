import { describe, expect, it, vi } from 'vitest';
import { RNG } from '../core/RNG.ts';
import type { LoadedWorldMap } from '../world/WorldAtlas.ts';
import {
  earthWorldGeography, legacyIslandGeography, profileAt, randomWorldGeography,
} from '../world/WorldGeography.ts';
import { WORLD_FEATURE } from '../world/WorldFeatureSeeds.ts';

function loadedEarth(): LoadedWorldMap {
  return {
    entry: {
      id: 'earth-test', title: 'Earth test', file: 'earth-test.bin',
      seaLevelMeters: 0, recommended: false,
    },
    raster: {
      width: 4,
      height: 2,
      elevationMeters: Int16Array.from([100, 200, 300, 400, -100, -50, 0, 50]),
      koppen: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
      features: Uint32Array.from([WORLD_FEATURE.river, WORLD_FEATURE.lake, 0, 0, 0, 0, 0, 0]),
      seaLevelMeters: 0,
    },
  };
}

describe('world geography facade', () => {
  it('keeps legacy island geography explicit and does not create a macro map', () => {
    const legacy = legacyIslandGeography();
    const profile = profileAt(legacy, 13.25, 9.5);

    expect(legacy.kind).toBe('legacyIsland');
    expect('map' in legacy).toBe(false);
    expect(profile).toMatchObject({ kind: 'legacyIsland', x: 13.25, y: 9.5 });
    if (profile.kind !== 'legacyIsland') throw new Error('Expected the legacy island profile');
    for (const key of [
      'regionX', 'regionY', 'latitude', 'elevation', 'biome', 'climateClass',
      'resources', 'features', 'land', 'water',
    ] as const) {
      expect(profile[key]).toEqual({
        status: 'unknown', reason: 'legacy-island-has-no-world-map',
      });
    }
    expect(() => legacy.profileAt(Number.NaN, 0)).toThrow('finite');
  });

  it('generates a random map from an isolated seed and preserves the source profile', () => {
    const random = randomWorldGeography('geography-seed', { regionsWide: 8, regionsHigh: 4 });
    const same = randomWorldGeography('geography-seed', { regionsWide: 8, regionsHigh: 4 });
    const other = randomWorldGeography('another-seed', { regionsWide: 8, regionsHigh: 4 });
    const profile = random.profileAt(31.25, 22.5);
    const original = random.map.profileAt(31.25, 22.5);

    expect(random.kind).toBe('random');
    expect(profile).toEqual({ kind: 'random', ...original });
    expect(profileAt(same, 31.25, 22.5)).toEqual(profile);
    expect(other.profileAt(31.25, 22.5).elevation).not.toBe(profile.elevation);
    expect(profile).not.toHaveProperty('climateClass');
    expect(profile).not.toHaveProperty('resources');
  });

  it('does not consume caller/global randomness while building selected geography', () => {
    const globalRandom = vi.spyOn(Math, 'random');
    const callerRng = new RNG('simulation-stream');
    const before = callerRng.snapshot();
    try {
      legacyIslandGeography().profileAt(0, 0);
      randomWorldGeography('private-world-seed', { regionsWide: 8, regionsHigh: 4 }).profileAt(0, 0);
      earthWorldGeography(loadedEarth(), 2).profileAt(3, 1);
      expect(callerRng.snapshot()).toEqual(before);
      expect(globalRandom).not.toHaveBeenCalled();
    } finally {
      globalRandom.mockRestore();
    }
  });

  it('samples an atlas map at explicit comarca scale without adding guessed fields', () => {
    const source = loadedEarth();
    const earth = earthWorldGeography(source, 2);
    const profile = profileAt(earth, -1, 1);

    expect(earth.kind).toBe('earth');
    expect(earth.entry).toBe(source.entry);
    expect([earth.map.width, earth.map.height]).toEqual([8, 4]);
    expect(profile).toMatchObject({
      kind: 'earth', mapId: 'earth-test',
      x: 7, y: 1, regionX: 3, regionY: 0,
      climateClass: 4, features: 0, land: true, water: 'land',
    });
    expect(profile).toHaveProperty('elevationMeters');
    expect(profile).not.toHaveProperty('biome');
    expect(profile).not.toHaveProperty('resources');
    expect(() => earthWorldGeography(source, 0)).toThrow('positive integer');
  });
});
