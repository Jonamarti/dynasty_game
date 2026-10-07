import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { World } from '../core/World.ts';
import { fromWorldTerrainRecord, toWorldTerrainRecord } from '../persistence/WorldRecords.ts';
import { createLocalGeography, worldElevationAt } from '../world/LocalGeography.ts';
import { earthWorldGeography, randomWorldGeography } from '../world/WorldGeography.ts';
import { decodeWorldRaster } from '../world/WorldBinary.ts';
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
    // M15 terrain variety: a local map now layers bounded relief noise on top
    // of the bilinear sample (see LocalGeography.ts's addedReliefWorldUnits),
    // so this is no longer exactly 5 world units above sea level — it is
    // within the noise envelope of it. worldElevationAt is the exact formula
    // production code uses, so the test calls it rather than keeping a
    // second, driftable copy of "base + noise".
    const expectedWithRelief = worldElevationAt(geography, 1.5, 0.5, config.waterLevel, config.metresPerUnit);
    expect(fiveHundredMetres.elevation).toBeCloseTo(expectedWithRelief);
    expect(Math.abs(fiveHundredMetres.elevation - (config.waterLevel + 5))).toBeLessThan(2); // noise stays bounded
    expect(fiveHundredMetres.land).toBe(true);
    expect(fiveHundredMetres.profile.kind).toBe('earth');
    if (fiveHundredMetres.profile.kind === 'earth') expect(fiveHundredMetres.profile.region.climateClass).toBe(4);

    const seaLevel = local.sample(0.5, 0.5);
    // This region sits exactly at the configured sea level (elevationMeters:
    // 0), which used to make it land by the >= waterLevel tie-break. An
    // irregular coastline is the point of the relief noise (bays, headlands,
    // small islets instead of a dead-straight line — see the "coastline is
    // not straight" test below), so this exact tile can now land on either
    // side of the threshold; only the formula identity is asserted here.
    expect(seaLevel.elevation).toBeCloseTo(worldElevationAt(geography, 0.5, 0.5, config.waterLevel, config.metresPerUnit));
    expect(seaLevel.profile.kind === 'earth' && seaLevel.profile.water).toBe('fresh');
    // This fixture packs a 1500 m drop between adjacent regions into a 4-wide
    // strip purely to give each comarca a distinct Köppen code (see
    // loadedEarth above) — a far steeper regional gradient than any real
    // atlas data, which is exactly what drives the gradient term of the
    // relief noise. At -10 m this one tile's own amplitude can plausibly
    // cross back to land, so only the shared formula is asserted here; the
    // "coastline is not a straight line" test below uses real atlas relief
    // for the actual irregular-coast claim.
    const minus10m = local.sample(3.5, 0.5);
    expect(minus10m.elevation).toBeCloseTo(worldElevationAt(geography, 3.5, 0.5, config.waterLevel, config.metresPerUnit));
    expect(minus10m.land).toBe(minus10m.elevation >= config.waterLevel);
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
    // M15 terrain variety: elevation is now the bilinear base plus bounded
    // relief noise (worldElevationAt), not the base formula alone — call the
    // same shared formula production code uses rather than reconstructing it.
    // profile.x/y (not the local 1.5, 0.5 passed to sample) are the GLOBAL
    // comarca coordinates worldElevationAt and the noise field key off.
    expect(sample.elevation).toBeCloseTo(
      worldElevationAt(geography, sample.profile.x, sample.profile.y, config.waterLevel, config.metresPerUnit));
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
      // M15 terrain variety: the ground hydrology actually carved into is the
      // noisy elevation (worldElevationAt), not the bilinear base alone —
      // `profile.x`/`.y` are the global coordinates the noise is keyed on.
      const rawGround = worldElevationAt(riverGeography, profile.x, profile.y,
        DEFAULT_CONFIG.world.waterLevel, DEFAULT_CONFIG.world.metresPerUnit, profile);
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

/** The real 12000 BCE atlas, loaded once: the same fixture start-place.test.ts
 * uses, so "an alpine region" and "a coastal region" below are genuine
 * entries from the shipped map rather than a hand-built height table. */
function earthAtlas() {
  const raster = decodeWorldRaster(new Uint8Array(readFileSync(resolve('public/world/earth-12000-bce.bin'))));
  return earthWorldGeography(
    { entry: { id: 'earth-12000-bce', title: 'Earth', file: 'earth-12000-bce.bin', seaLevelMeters: -60, recommended: true }, raster },
    10,
  );
}

describe('M15 terrain variety: local relief noise', () => {
  it('is a pure function of its bounds: the same window generates the same elevation twice', () => {
    const geography = randomWorldGeography('relief-determinism', { regionsWide: 16, regionsHigh: 8 });
    const bounds = { originX: 10, originY: 5, comarcasWide: 4, comarcasHigh: 4 };
    const config = { ...DEFAULT_CONFIG.world, width: 64, height: 64 };
    const first = createLocalGeography(geography, bounds, config);
    const second = createLocalGeography(geography, bounds, config);
    const sampleAll = (source: typeof first) =>
      Array.from({ length: config.width * config.height }, (_, i) =>
        source.sample(i % config.width + 0.5, Math.floor(i / config.width) + 0.5).elevation);
    expect(sampleAll(second)).toEqual(sampleAll(first));
  });

  it('agrees exactly at the shared edge of two adjacent windows (the seam a save and "leave the comarca" rely on)', () => {
    const geography = earthAtlas();
    // A plain strip of ordinary temperate land, away from any crafted test
    // fixture, so the seam is exercised on real, noisy relief.
    const config = { ...DEFAULT_CONFIG.world, width: 32, height: 32 };
    const west = createLocalGeography(geography, { originX: 300, originY: 150, comarcasWide: 4, comarcasHigh: 4 }, config);
    const east = createLocalGeography(geography, { originX: 304, originY: 150, comarcasWide: 4, comarcasHigh: 4 }, config);
    for (let y = 0; y < config.height; y++) {
      const westElevation = west.sample(config.width, y + 0.5).elevation;
      const eastElevation = east.sample(0, y + 0.5).elevation;
      expect(eastElevation).toBeCloseTo(westElevation, 5);
    }
    // And the same holds north-south, at a different pair of windows.
    const north = createLocalGeography(geography, { originX: 300, originY: 150, comarcasWide: 4, comarcasHigh: 4 }, config);
    const south = createLocalGeography(geography, { originX: 300, originY: 154, comarcasWide: 4, comarcasHigh: 4 }, config);
    for (let x = 0; x < config.width; x++) {
      expect(south.sample(x + 0.5, 0).elevation).toBeCloseTo(north.sample(x + 0.5, config.height).elevation, 5);
    }
  });

  it('reaches hills and rock in a real alpine region, not a flat bilinear plane of one biome', () => {
    const geography = earthAtlas();
    // Region (60, 29): 1448 m above this map's sea level, 52 m short of the
    // "rock" cutoff, next to a neighbour over 6 km different in elevation —
    // exactly the "almost there" case the bug report described: the old
    // bilinear plane alone would paint this whole local map one uniform
    // biome (actually hills throughout, since 1448 m already clears the 500 m
    // cutoff — see docs/m15_terrain_variety.md), with no texture and no rock
    // anywhere. Added relief noise gives it real variety: forest low down,
    // hills through most of it, and patches that cross into rock.
    const config = { ...DEFAULT_CONFIG.world, width: 128, height: 128 };
    const span = 4;
    const originX = 60 * 10 + 5 - span / 2;
    const originY = 29 * 10 + 5 - span / 2;
    const source = createLocalGeography(geography, { originX, originY, comarcasWide: span, comarcasHigh: span }, config);
    const world = new World(config, new RNG('alpine-relief-test'), source);
    const counts = world.countBiomes();
    expect(counts.hills + counts.rock, 'an alpine region must produce elevated local classes').toBeGreaterThan(0);
    expect(counts.rock, 'a region this close to the rock threshold should cross it somewhere once noise is added').toBeGreaterThan(0);
  });

  it('gives a real coastline measurable irregularity instead of one straight line', () => {
    const geography = earthAtlas();
    // Region (23, 2): land next to an ocean neighbour — a genuine coast, not
    // a crafted fixture. The old bilinear-only coast crossed each row at
    // essentially the same x (a straight line, give or take the region's
    // constant tilt); added relief noise should make that crossing wander.
    const config = { ...DEFAULT_CONFIG.world, width: 128, height: 128 };
    const span = 4;
    const originX = 23 * 10 + 5 - span / 2;
    const originY = 2 * 10 + 5 - span / 2;
    const source = createLocalGeography(geography, { originX, originY, comarcasWide: span, comarcasHigh: span }, config);
    const boundaryXByRow: number[] = [];
    for (let y = 0; y < config.height; y++) {
      for (let x = 0; x < config.width - 1; x++) {
        if (source.sample(x + 0.5, y + 0.5).land !== source.sample(x + 1.5, y + 0.5).land) {
          boundaryXByRow.push(x);
          break;
        }
      }
    }
    // A dead-straight (or constant-slope) coast would cross at very few
    // distinct x positions across 128 rows; real, noisy relief should spread
    // that crossing over a visible range of columns.
    expect(boundaryXByRow.length, 'the window should actually show a coastline').toBeGreaterThan(10);
    expect(new Set(boundaryXByRow).size, 'the coastline should not sit at one constant x').toBeGreaterThan(5);
  });
});

/**
 * One long, single-row descending river, wide enough (nine regions) to chain
 * several macro segments end to end. A single row — unlike the "traces a
 * narrow descending river" fixture's 8x4 raster, which repeats the same
 * profile on every row and so grows several parallel same-shaped channels
 * side by side — gives exactly one coherent course to measure a chord
 * against, which is what the meander and seam tests below need.
 */
function longRiverGeography() {
  const width = 10, height = 1;
  const heights = Int16Array.from({ length: width }, (_, x) => 900 - x * 100);
  const features = new Uint32Array(width).fill(WORLD_FEATURE.river);
  features[width - 1] = 0; // the mouth itself carries no flag; the water ends there, not past it
  return earthWorldGeography({
    entry: { id: 'long-river', title: 'Long river', file: 'long-river.bin', seaLevelMeters: 0, recommended: false },
    raster: { width, height, elevationMeters: heights, koppen: new Uint8Array(width).fill(8), features, seaLevelMeters: 0 },
  }, 10);
}

describe('M15 terrain variety: river meander and variable width', () => {
  it('is measurably non-straight: the course deviates from its own chord', () => {
    const geography = longRiverGeography();
    const config = { ...DEFAULT_CONFIG.world, width: 128, height: 32 };
    const local = createLocalGeography(geography, { originX: 10, originY: 0, comarcasWide: 80, comarcasHigh: 10 }, config);
    // Measure the actual water mask, not hydrology.rivers: `rasterCanonicalRivers`
    // reports one course per incoming confluence arm (deliberately, so a
    // merge is not flattened into a fake single line — see its own comment
    // in Hydrology.ts), so a single named entry can be a short fragment even
    // when the corridor it belongs to runs the length of the window.
    const waterTiles: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < local.hydrology.kind.length; i++) {
      if (local.hydrology.kind[i] === 1) waterTiles.push({ x: i % config.width, y: Math.floor(i / config.width) });
    }
    expect(waterTiles.length, 'need a real water corridor to measure a chord against').toBeGreaterThan(20);
    // The chord runs between the westmost and eastmost water tile (the river
    // flows west to east in this fixture); a straight corridor would sit on
    // that chord everywhere, deviation ~0.
    const start = waterTiles.reduce((a, b) => (a.x <= b.x ? a : b));
    const end = waterTiles.reduce((a, b) => (a.x >= b.x ? a : b));
    const vx = end.x - start.x, vy = end.y - start.y;
    const chordLengthSquared = vx * vx + vy * vy;
    let maxDeviation = 0;
    for (const { x, y } of waterTiles) {
      const t = chordLengthSquared > 0 ? ((x - start.x) * vx + (y - start.y) * vy) / chordLengthSquared : 0;
      const px = start.x + t * vx, py = start.y + t * vy;
      maxDeviation = Math.max(maxDeviation, Math.hypot(x - px, y - py));
    }
    expect(maxDeviation, 'a meandering course should measurably leave its own chord').toBeGreaterThan(0.5);
  });

  it('keeps meander and width agreeing exactly at the shared edge of two adjacent windows', () => {
    const geography = longRiverGeography();
    const config = { ...DEFAULT_CONFIG.world, width: 64, height: 32 };
    const west = createLocalGeography(geography, { originX: 10, originY: 0, comarcasWide: 40, comarcasHigh: 10 }, config);
    const east = createLocalGeography(geography, { originX: 50, originY: 0, comarcasWide: 40, comarcasHigh: 10 }, config);
    // Same tolerance as the pre-existing "keeps a flagged river connected
    // across the edge of adjacent local maps" test above, and for the same
    // reason: hydrologyAt(width, y) and hydrologyAt(0, y) at a shared edge
    // read the LAST tile of one grid and the FIRST tile of the other, which
    // are adjacent but not the identical point — a discrete sampling gap
    // that exists with or without meander or variable width, so this checks
    // the river reaches the edge on both sides and lines up closely, not
    // that it hits the exact same tile row.
    const westEdge = Array.from({ length: config.height }, (_, y) => west.hydrologyAt(config.width, y + 0.5)?.kind ?? null);
    const eastEdge = Array.from({ length: config.height }, (_, y) => east.hydrologyAt(0, y + 0.5)?.kind ?? null);
    expect(west.hydrology.rivers.length).toBeGreaterThan(0);
    expect(westEdge.some(kind => kind === 'fresh'), 'west window must reach its east edge').toBe(true);
    expect(eastEdge.some(kind => kind === 'fresh'), 'east window must reach its west edge').toBe(true);
    const westRows = westEdge.flatMap((kind, y) => kind === 'fresh' ? [y] : []);
    const eastRows = eastEdge.flatMap((kind, y) => kind === 'fresh' ? [y] : []);
    expect(Math.min(...westRows.flatMap(a => eastRows.map(b => Math.abs(a - b)))),
      'the river should line up within a tile or two across the seam').toBeLessThanOrEqual(2);
  });

  it('gives a higher-discharge river more claimed width than a lower one on the same course', () => {
    // Same map, same flow topology (macroFlowDirection and the region
    // downstream graph are untouched); only the discharge reading at one
    // river region is changed, which only feeds halfWidthTilesOf — this
    // isolates width from everything else a real difference in flow could
    // also disturb (course, direction, which tiles are candidates at all).
    const lowGeography = randomWorldGeography('river-width-test', { regionsWide: 16, regionsHigh: 8 });
    const highGeography = randomWorldGeography('river-width-test', { regionsWide: 16, regionsHigh: 8 });
    const regionsWide = lowGeography.map.regionsWide, regionsHigh = lowGeography.map.regionsHigh;
    const comarcasPerRegion = lowGeography.map.width / regionsWide;
    const config = { ...DEFAULT_CONFIG.world, width: 64, height: 64 };
    const span = 4;
    const boundsFor = (regionX: number, regionY: number) => ({
      originX: regionX * comarcasPerRegion + comarcasPerRegion / 2 - span / 2,
      originY: regionY * comarcasPerRegion + comarcasPerRegion / 2 - span / 2,
      comarcasWide: span, comarcasHigh: span,
    });
    // Not every region flagged riverFlow >= 3.2 actually rasterizes water
    // inside a small, region-centred window — the canonical course runs
    // between jittered anchors (riverAnchor), not through the region centre
    // exactly, and isRiverNetworkRegion can reject a locally-flagged region
    // that is not itself part of a connected, flowing network. So the real
    // test for "a good candidate" is simply that the window it produces has
    // water, not that the region's own flag looks promising.
    let target = -1, bounds = boundsFor(0, 0);
    for (let i = 0; i < lowGeography.map.regions.length && target < 0; i++) {
      const x = i % regionsWide, y = Math.floor(i / regionsWide);
      if (x < 2 || x > regionsWide - 3 || y < 2 || y > regionsHigh - 3) continue; // room for a window
      if (lowGeography.map.regions[i]!.riverFlow < 3.2) continue;
      const candidateBounds = boundsFor(x, y);
      const probe = createLocalGeography(lowGeography, candidateBounds, config);
      if (Array.from(probe.hydrology.kind).some(kind => kind === 1)) { target = i; bounds = candidateBounds; }
    }
    expect(target, 'fixture seed must contain a river region whose window actually carries water').toBeGreaterThanOrEqual(0);
    // WorldRegionProfile's readonly modifier is a compile-time guard, not a
    // frozen object; mutating riverFlow in place changes only what
    // dischargeOfRegion reads, not the precomputed downstream/edge graph
    // macroFlowDirection follows, so the course itself cannot move.
    (lowGeography.map.regions[target] as { riverFlow: number }).riverFlow = 3.3;
    (highGeography.map.regions[target] as { riverFlow: number }).riverFlow = 400;

    const low = createLocalGeography(lowGeography, bounds, config);
    const high = createLocalGeography(highGeography, bounds, config);
    const lowWidth = Array.from(low.hydrology.kind).filter(kind => kind === 1).length;
    const highWidth = Array.from(high.hydrology.kind).filter(kind => kind === 1).length;
    expect(lowWidth, 'fixture must actually carry a river through this window').toBeGreaterThan(0);
    expect(highWidth, 'a much higher discharge should claim measurably more water tiles').toBeGreaterThan(lowWidth);
  });
});
