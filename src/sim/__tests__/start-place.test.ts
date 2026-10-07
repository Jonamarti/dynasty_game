import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeWorldRaster } from '../world/WorldBinary.ts';
import { earthWorldGeography, randomWorldGeography, type EarthWorldGeography } from '../world/WorldGeography.ts';
import { findGlobeStart, worldTerrainOf } from '../world/WorldTerrain.ts';
import {
  MIN_FRESH_TILES, findNearestStart, findStartInRegion, findWateredGlobeStart, isStart, localWorldConfig, measureWindow, regionWater,
} from '../world/StartPlace.ts';
import { WorldState } from '../world/WorldState.ts';

const SPAN = 4;
const config = localWorldConfig();
const SEEDS = ['wp-a', 'wp-b', 'wp-c', 'wp-d', 'wp-e', 'wp-f'];

function earth(): EarthWorldGeography {
  const raster = decodeWorldRaster(new Uint8Array(readFileSync(resolve('public/world/earth-12000-bce.bin'))));
  return earthWorldGeography({ entry: { id: 'earth-12000-bce', title: 'Earth', file: 'earth-12000-bce.bin', seaLevelMeters: -60, recommended: true }, raster }, 10);
}

describe('where a game may begin: with fresh water to drink (phase 33)', () => {
  it('the old pick (open temperate country by its flags) often had no water at all: the bug this guards', () => {
    // Measured against the build that made four dead worlds in a row: unless some seed here ended up with too little water the
    // test below proves nothing, so it asserts the failure exists.
    const dry = SEEDS.filter(seed => {
      const geography = randomWorldGeography(seed);
      const start = findGlobeStart(geography, SPAN);
      return start === null || measureWindow(geography, start.x, start.y, SPAN, config).fresh < MIN_FRESH_TILES;
    });
    expect(dry.length).toBeGreaterThan(0);
  });

  it('every generated world begins where a measured river or lake runs, on mostly dry land', () => {
    for (const seed of SEEDS) {
      const geography = randomWorldGeography(seed);
      const start = findWateredGlobeStart(geography, SPAN, config, seed);
      expect(start, seed).not.toBeNull();
      const report = measureWindow(geography, start!.x, start!.y, SPAN, config);
      expect(isStart(report), `${seed}: ${JSON.stringify(report)}`).toBe(true);
    }
  });

  it('and the simulation built there has water to drink and a band to drink it', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const geography = randomWorldGeography(seed);
      const start = findWateredGlobeStart(geography, SPAN, config, seed)!;
      const state = new WorldState({ seed, population: { bands: 1, peoplePerBand: 6 } },
        { geography, start: { x: start.x, y: start.y }, comarcasWide: SPAN, comarcasHigh: SPAN, peoples: false });
      expect(state.current.world.freshShore.length, seed).toBeGreaterThan(40);
      expect(state.current.livingPeople().length).toBeGreaterThan(0);
    }
  });

  it('is a function of the seed, and different seeds begin in different places and kinds of country', () => {
    const where = (seed: string) => {
      const start = findWateredGlobeStart(randomWorldGeography(seed), SPAN, config, seed)!;
      return { x: start.x, y: start.y, terrain: worldTerrainOf(randomWorldGeography(seed).profileAt(start.x, start.y)) };
    };
    expect(where('wp-a')).toEqual(where('wp-a'));
    const all = SEEDS.map(where);
    expect(new Set(all.map(p => `${p.x},${p.y}`)).size).toBe(SEEDS.length);
    expect(new Set(all.map(p => p.terrain)).size).toBeGreaterThanOrEqual(3);
  });
});

describe('every band camps by the water, and drinks it', () => {
  // `wp-c` is the world that found both defects: three tribes, one river in a corner of the window. The second and third camps were
  // 117 tiles from water (a camp at the west edge looked "past" the edge and saw the east edge's river), and nine children died of
  // thirst in twenty days.
  it('no band is camped away from fresh water, and nobody dies of thirst in a month', () => {
    const seed = 'wp-c';
    const geography = randomWorldGeography(seed);
    const start = findWateredGlobeStart(geography, SPAN, config, seed)!;
    const sim = new WorldState({ seed }, { geography, start: { x: start.x, y: start.y }, comarcasWide: SPAN, comarcasHigh: SPAN, peoples: false }).current;
    expect(sim.bands.length).toBeGreaterThan(1);
    for (const band of sim.bands) {
      let nearest = Infinity;
      for (const bank of sim.world.freshShore) nearest = Math.min(nearest, Math.hypot(bank.x - band.homeX, bank.y - band.homeY));
      expect(nearest, `band at ${band.homeX},${band.homeY}`).toBeLessThan(15);
    }
    for (let i = 0; i < sim.config.time.ticksPerDay * 30; i++) sim.step();
    const thirsty = [...sim.peopleById.values()].filter(p => !p.alive && p.causeOfDeath === 'dehydration');
    expect(thirsty.length).toBe(0);
  }, 120_000);
});

describe('beginning on the Earth', () => {
  const geography = earth();

  it('a region with a river begins in itself, with water measured in the window', () => {
    expect(regionWater(geography, 30, 24)).toBe('river');
    const start = findNearestStart(geography, 30, 24, SPAN, config)!;
    expect(start.region).toEqual({ x: 30, y: 24 });
    expect(isStart(start.report)).toBe(true);
    // The window is inside the region the player chose.
    expect(Math.floor(start.x / 10)).toBe(30);
    expect(Math.floor(start.y / 10)).toBe(24);
  });

  it('a region marked without water moves to the nearest that has some, never farther than the radius', () => {
    expect(regionWater(geography, 48, 12)).toBe('none');
    const start = findNearestStart(geography, 48, 12, SPAN, config, 2)!;
    expect(start).not.toBeNull();
    expect(isStart(start.report)).toBe(true);
    expect(Math.max(Math.abs(start.region.x - 48), Math.abs(start.region.y - 12))).toBeLessThanOrEqual(2);
  });

  it('the middle of the Sahara has no water within two regions, and says so rather than begin there', () => {
    expect(findNearestStart(geography, 49, 20, SPAN, config, 2)).toBeNull();
  });

  it('the open sea is not a place to begin', () => {
    expect(findStartInRegion(geography, 5, 24, SPAN, config)).toBeNull();
  });

  it('the simulation built on a chosen start has water and a band', () => {
    const start = findNearestStart(geography, 30, 24, SPAN, config)!;
    const state = new WorldState({ seed: 'wp-earth', population: { bands: 1, peoplePerBand: 6 } },
      { geography, start: { x: start.x, y: start.y }, comarcasWide: SPAN, comarcasHigh: SPAN, peoples: false });
    expect(state.current.world.freshShore.length).toBeGreaterThan(40);
    expect(state.current.livingPeople().length).toBeGreaterThan(0);
  });
});
