import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { World } from '../core/World.ts';
import { fromWorldTerrainRecord, toWorldTerrainRecord } from '../persistence/WorldRecords.ts';
import { createLocalGeography, RANDOM_RELIEF_TO_WORLD_UNITS } from '../world/LocalGeography.ts';
import { earthWorldGeography, randomWorldGeography } from '../world/WorldGeography.ts';
import type { LoadedWorldMap } from '../world/WorldAtlas.ts';
import { WORLD_FEATURE } from '../world/WorldFeatureSeeds.ts';
import { createTurnedRiverFixture } from '../../../tools/waterTerrainFixture.ts';

function loadedEarth(): LoadedWorldMap {
  return {
    entry: { id: 'terrain-test', title: 'Terrain test', file: 'terrain-test.bin', seaLevelMeters: 0, recommended: false },
    raster: {
      width: 4,
      height: 2,
      elevationMeters: Int16Array.from([0, 500, 1500, -10, 0, 500, 1500, -10]),
      koppen: Uint8Array.from([1, 4, 8, 29, 3, 7, 16, 30]),
      features: Uint32Array.from([WORLD_FEATURE.lake, 0, 0, 0, 0, 0, 0, 0]),
      seaLevelMeters: 0,
    },
  };
}

const bounds = { originX: 0, originY: 0, comarcasWide: 4, comarcasHigh: 2 };
const config = { ...DEFAULT_CONFIG.world, width: 4, height: 2, metresPerUnit: 100 };

describe('local geography terrain projection', () => {
  it('maps local tile coordinates continuously and converts Earth metres from configured sea level', () => {
    const geography = earthWorldGeography(loadedEarth(), 1);
    const local = createLocalGeography(geography, bounds, config);
    const fiveHundredMetres = local.sample(1.5, 0.5);

    expect(local.bounds).toEqual(bounds);
    expect(local.profileAtLocal(1.5, 0.5)).toMatchObject({ kind: 'earth', x: 1.5, y: 0.5 });
    expect(fiveHundredMetres.elevation).toBeCloseTo(config.waterLevel + 5);
    expect(fiveHundredMetres.land).toBe(true);
    expect(fiveHundredMetres.profile.kind).toBe('earth');
    if (fiveHundredMetres.profile.kind === 'earth') expect(fiveHundredMetres.profile.region.climateClass).toBe(4);

    const seaLevel = local.sample(0.5, 0.5);
    expect(seaLevel.elevation).toBe(config.waterLevel);
    expect(seaLevel.land).toBe(true);
    expect(seaLevel.profile.kind === 'earth' && seaLevel.profile.water).toBe('fresh');
    expect(seaLevel.land).toBe(true); // regional lake metadata does not paint a whole tile as water
    expect(local.sample(3.5, 0.5).land).toBe(false);
    expect(() => local.sample(-0.01, 0)).toThrow('inside');
  });

  it('uses explicit Beck ID wetness bands and does not treat regional water flags as local water', () => {
    const local = createLocalGeography(earthWorldGeography(loadedEarth(), 1), bounds, config);
    expect(local.sample(0.5, 0.5).moisture).toBe(0.82); // code 1, tropical
    expect(local.sample(1.5, 0.5).moisture).toBe(0.12); // code 4, arid
    expect(local.sample(2.5, 0.5).moisture).toBe(0.58); // code 8, temperate
    expect(local.sample(3.5, 0.5).moisture).toBe(0.42); // code 29, polar
    // An atlas cell can be called inland water while interpolated height is
    // above sea; local terrain follows continuous elevation and keeps the flag.
    expect(local.sample(0.5, 0.5).profile.kind).toBe('earth');
  });

  it('maps normalized random relief separately and builds all derived World state without draws', () => {
    const geography = randomWorldGeography('local-terrain', { regionsWide: 8, regionsHigh: 4 });
    const local = createLocalGeography(geography, { originX: 7, originY: 4, comarcasWide: 3, comarcasHigh: 2 }, config);
    const sample = local.sample(1.5, 0.5);
    if (sample.profile.kind !== 'random') throw new Error('Expected a random map profile');
    expect(sample.elevation).toBeCloseTo(config.waterLevel + sample.profile.elevation * RANDOM_RELIEF_TO_WORLD_UNITS);
    expect(sample.moisture).toBeGreaterThanOrEqual(0);
    expect(sample.moisture).toBeLessThanOrEqual(1);

    const rng = new RNG('not-consumed-by-geographic-generation');
    const before = rng.snapshot();
    const world = new World(config, rng, local);
    expect(rng.snapshot()).toEqual(before);
    expect(world.soil.effectiveFertility(0)).toBeGreaterThanOrEqual(0);
    expect(world.countBiomes()).toEqual(expect.objectContaining({ water: expect.any(Number), rock: expect.any(Number) }));
    expect(Array.from(world.walkable).every((value) => value === 0 || value === 1)).toBe(true);
    expect(world.shoreTiles.every(({ x, y }) => world.isWalkable(x, y))).toBe(true);
    const terrainRecord = toWorldTerrainRecord(world);
    const restored = fromWorldTerrainRecord(JSON.parse(JSON.stringify(terrainRecord)));
    expect(toWorldTerrainRecord(restored)).toEqual(terrainRecord);
  });

  it('projects sampled macro relief into local hills and rock across representative seeds', () => {
    for (const seed of ['relief-a', 'relief-b', 'relief-c']) {
      const geography = randomWorldGeography(seed);
      const localConfig = { ...DEFAULT_CONFIG.world, width: 96, height: 48 };
      const source = createLocalGeography(geography, {
        originX: 0, originY: 0, comarcasWide: geography.map.width, comarcasHigh: geography.map.height,
      }, localConfig);
      const world = new World(localConfig, new RNG(`local-${seed}`), source);
      const counts = world.countBiomes();
      expect(counts.hills + counts.rock, `${seed}: normalized relief should reach elevated local classes`).toBeGreaterThan(0);
      expect(counts.rock, `${seed}: high macro ridges should include exposed rock`).toBeGreaterThan(0);
    }
  });

  it('keeps Earth biome and fertility policy stable when metric display scale changes', () => {
    const geography = earthWorldGeography(loadedEarth(), 1);
    const ordinary = new World(config, new RNG('earth-scale'), createLocalGeography(geography, bounds, config));
    const differentScaleConfig = { ...config, waterLevel: 0.7, metresPerUnit: 400 };
    const differentScale = new World(
      differentScaleConfig,
      new RNG('earth-scale'),
      createLocalGeography(geography, bounds, differentScaleConfig),
    );

    expect(Array.from(differentScale.biome)).toEqual(Array.from(ordinary.biome));
    expect(Array.from(differentScale.moisture)).toEqual(Array.from(ordinary.moisture));
    expect(Array.from(differentScale.fertility)).toEqual(Array.from(ordinary.fertility));
    expect(Array.from(ordinary.elevation)).not.toEqual(Array.from(differentScale.elevation));
  });

  it('snapshots caller bounds so later mutation cannot move a generated local map', () => {
    const geography = randomWorldGeography('stable-bounds', { regionsWide: 8, regionsHigh: 4 });
    const mutableBounds = { ...bounds };
    const mutableConfig = { ...config };
    const local = createLocalGeography(geography, mutableBounds, mutableConfig);
    const before = local.sample(1, 1);
    mutableBounds.originX = 40;
    mutableBounds.comarcasWide = 400;
    mutableConfig.waterLevel = 99;
    mutableConfig.metresPerUnit = 1;
    expect(local.sample(1, 1)).toEqual(before);
  });

  it('samples adjacent comarca patches at a shared boundary with the same continuous profile', () => {
    const geography = earthWorldGeography(loadedEarth(), 1);
    const west = createLocalGeography(geography, { ...bounds, comarcasWide: 2 }, config);
    const east = createLocalGeography(geography, { ...bounds, originX: 2, comarcasWide: 2 }, config);
    expect(west.sample(config.width, 1).profile).toEqual(east.sample(0, 1).profile);
    expect(west.sample(config.width, 1).elevation).toBe(east.sample(0, 1).elevation);
  });

  it('traces a narrow descending river from coarse candidates and keeps a falling water surface', () => {
    const heights = [100, 85, 70, 55, 40, 25, -10, -20];
    const riverGeography = earthWorldGeography({
      entry: { id: 'river-course', title: 'River course', file: 'river-course.bin', seaLevelMeters: 0, recommended: false },
      raster: {
        width: 8, height: 4,
        elevationMeters: Int16Array.from({ length: 32 }, (_, i) => heights[i % 8]!),
        koppen: new Uint8Array(32).fill(8),
        features: Uint32Array.from({ length: 32 }, (_, i) => i % 8 < 6 ? WORLD_FEATURE.river : 0),
        seaLevelMeters: 0,
      },
    }, 10);
    const local = createLocalGeography(riverGeography,
      { originX: 40, originY: 20, comarcasWide: 60, comarcasHigh: 20 },
      { ...DEFAULT_CONFIG.world, width: 64, height: 48 });

    expect(local.hydrology.rivers.length).toBeGreaterThan(0);
    const freshTiles = Array.from(local.hydrology.kind).filter(value => value === 1).length;
    expect(freshTiles).toBeGreaterThan(1);
    expect(freshTiles).toBeLessThan(64 * 48 / 3); // coarse flags do not flood their regions
    expect(Array.from(local.hydrology.kind).every((kind, i) => kind !== 1 ||
      local.hydrology.surface[i]! >= DEFAULT_CONFIG.world.waterLevel)).toBe(true); // the mouth cannot repaint salt sea
    for (const river of local.hydrology.rivers) {
      expect(river.tiles.length).toBeGreaterThan(1);
      for (let step = 1; step < river.tiles.length; step++) {
        const previous = river.tiles[step - 1]!;
        const current = river.tiles[step]!;
        expect(local.hydrology.surface[current]).toBeLessThanOrEqual(local.hydrology.surface[previous]!);
        expect(local.hydrology.surface[current]! - local.hydrology.bed[current]!).toBeGreaterThan(0);
      }
    }
    expect(Array.from(local.hydrology.surface).some((surface, i) => local.hydrology.kind[i] === 1 &&
      surface - local.sample(i % 64 + 0.5, Math.floor(i / 64) + 0.5).elevation <= DEFAULT_CONFIG.world.wadeDepth))
      .toBe(true); // at least one shallow ford remains walkable
    for (const river of local.hydrology.rivers) for (const index of river.tiles) {
      const x = index % 64, y = Math.floor(index / 64);
      const profile = local.profileAtLocal(x + 0.5, y + 0.5);
      const rawGround = profile.kind === 'earth'
        ? DEFAULT_CONFIG.world.waterLevel + profile.elevationAboveSeaMeters / DEFAULT_CONFIG.world.metresPerUnit
        : DEFAULT_CONFIG.world.waterLevel + profile.elevation * RANDOM_RELIEF_TO_WORLD_UNITS;
      expect(local.hydrology.bed[index]).toBeLessThanOrEqual(rawGround + 1e-6);
    }
  });

  it('keeps a flagged river connected across the edge of adjacent local maps', () => {
    const heights = [100, 85, 70, 55, 40, 25, -10, -20];
    const geography = earthWorldGeography({
      entry: { id: 'river-seam', title: 'River seam', file: 'river-seam.bin', seaLevelMeters: 0, recommended: false },
      raster: {
        width: 8, height: 4,
        elevationMeters: Int16Array.from({ length: 32 }, (_, i) => heights[i % 8]!),
        koppen: new Uint8Array(32).fill(8),
        features: Uint32Array.from({ length: 32 }, (_, i) => i % 8 < 6 ? WORLD_FEATURE.river : 0),
        seaLevelMeters: 0,
      },
    }, 10);
    const west = createLocalGeography(geography,
      { originX: 40, originY: 20, comarcasWide: 1, comarcasHigh: 10 },
      { ...DEFAULT_CONFIG.world, width: 64, height: 48 });
    const east = createLocalGeography(geography,
      { originX: 41, originY: 20, comarcasWide: 1, comarcasHigh: 10 },
      { ...DEFAULT_CONFIG.world, width: 64, height: 48 });

    const westEdge = Array.from({ length: 48 }, (_, y) => west.hydrologyAt(64, y + 0.5)?.kind ?? null);
    const eastEdge = Array.from({ length: 48 }, (_, y) => east.hydrologyAt(0, y + 0.5)?.kind ?? null);
    expect(west.hydrology.rivers.length).toBeGreaterThan(0);
    expect(westEdge.some(kind => kind === 'fresh')).toBe(true);
    expect(eastEdge.some(kind => kind === 'fresh')).toBe(true);
    const westRows = westEdge.flatMap((kind, y) => kind === 'fresh' ? [y] : []);
    const eastRows = eastEdge.flatMap((kind, y) => kind === 'fresh' ? [y] : []);
    expect(Math.min(...westRows.flatMap(a => eastRows.map(b => Math.abs(a - b))))).toBeLessThanOrEqual(2);
  });

  it('follows the same canonical segment through a macro-region turn and keeps ford phase global', () => {
    const fixture = createTurnedRiverFixture();
    const geography = earthWorldGeography(fixture.loaded, fixture.comarcasPerRegion);
    const local = createLocalGeography(geography, fixture.bounds, fixture.config);
    const sameCourseTurns = local.hydrology.rivers.some(({ tiles }) => {
      let east = false, south = false;
      for (let i = 1; i < tiles.length; i++) {
        const previous = tiles[i - 1]!;
        const current = tiles[i]!;
        east ||= current % fixture.config.width > previous % fixture.config.width;
        south ||= Math.floor(current / fixture.config.width) > Math.floor(previous / fixture.config.width);
      }
      return east && south;
    });
    expect(sameCourseTurns).toBe(true);
    const fordCount = local.hydrology.rivers.reduce((total, river) => total + river.tiles.filter(index =>
      local.hydrology.surface[index]! - local.hydrology.bed[index]! <= fixture.config.wadeDepth).length, 0);
    expect(fordCount).toBeGreaterThan(0);

    // A full map and four same-resolution crops must rasterize the same river
    // cells and bed depths. This catches patch-local head selection and a ford
    // phase that silently restarts at each local map.
    for (const originY of [0, 10]) for (const originX of [4, 14]) {
      const crop = createLocalGeography(geography,
        { originX, originY, comarcasWide: 10, comarcasHigh: 10 },
        { ...fixture.config, width: 40, height: 40 });
      const offsetX = Math.round((originX - fixture.bounds.originX) / fixture.bounds.comarcasWide * fixture.config.width);
      const offsetY = Math.round((originY - fixture.bounds.originY) / fixture.bounds.comarcasHigh * fixture.config.height);
      for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
        const wholeIndex = (offsetY + y) * fixture.config.width + offsetX + x;
        const cropIndex = y * 40 + x;
        expect(crop.hydrology.kind[cropIndex]).toBe(local.hydrology.kind[wholeIndex]);
        if (crop.hydrology.kind[cropIndex] === 1) {
          expect(crop.hydrology.surface[cropIndex]).toBe(local.hydrology.surface[wholeIndex]);
          expect(crop.hydrology.bed[cropIndex]).toBe(local.hydrology.bed[wholeIndex]);
        }
      }
    }

    const westBounds = { originX: fixture.bounds.originX, originY: fixture.bounds.originY,
      comarcasWide: 10, comarcasHigh: fixture.bounds.comarcasHigh };
    const eastBounds = { ...westBounds, originX: 14 };
    const west = createLocalGeography(geography, westBounds, { ...fixture.config, width: 40 });
    const east = createLocalGeography(geography, eastBounds, { ...fixture.config, width: 40 });
    const westEdge = Array.from({ length: 80 }, (_, y) => west.hydrologyAt(40, y + 0.5));
    const eastEdge = Array.from({ length: 80 }, (_, y) => east.hydrologyAt(0, y + 0.5));
    expect(westEdge.some(value => value?.kind === 'fresh')).toBe(true);
    expect(eastEdge.some(value => value?.kind === 'fresh')).toBe(true);
  });

  it('places reachable fords in a one-comarca river segment', () => {
    const fixture = createTurnedRiverFixture();
    const geography = earthWorldGeography(fixture.loaded, fixture.comarcasPerRegion);
    const local = createLocalGeography(geography,
      { originX: 12, originY: 6, comarcasWide: 1, comarcasHigh: 1 },
      { ...fixture.config, width: 64, height: 64 });
    const water = Array.from(local.hydrology.kind).filter(kind => kind === 1).length;
    const fords = local.hydrology.rivers.flatMap(river => river.tiles).filter(index =>
      local.hydrology.surface[index]! - local.hydrology.bed[index]! <= fixture.config.wadeDepth);
    expect(water).toBeGreaterThan(0);
    expect(fords.length).toBeGreaterThan(0);
  });

});
