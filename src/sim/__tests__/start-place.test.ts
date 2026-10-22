import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeWorldRaster } from '../world/WorldBinary.ts';
import { earthWorldGeography, randomWorldGeography, type EarthWorldGeography } from '../world/WorldGeography.ts';
import { findGlobeStart, worldTerrainOf } from '../world/WorldTerrain.ts';
import {
  MIN_FRESH_TILES, MIN_LAND_SHARE, findNearestStart, findStartInRegion, findWateredGlobeStart, isCoastalRegion, isStart, localWorldConfig,
  measureWindow, regionWater, startInComarca,
} from '../world/StartPlace.ts';
import { WorldState } from '../world/WorldState.ts';
import { gridFromGeography, regionOfStart } from '../world/PeopleWorld.ts';
import { fromWorldStateRecord, toWorldStateRecord } from '../persistence/WorldStateRecords.ts';
import { toWorldTerrainRecord } from '../persistence/WorldRecords.ts';

const SPAN = 4;
const config = localWorldConfig();
const SEEDS = ['wp-a', 'wp-b', 'wp-c', 'wp-d', 'wp-e', 'wp-f'];
const randomGeographies = new Map<string, ReturnType<typeof randomWorldGeography>>();

function randomGeography(seed: string): ReturnType<typeof randomWorldGeography> {
  let geography = randomGeographies.get(seed);
  if (!geography) {
    geography = randomWorldGeography(seed);
    randomGeographies.set(seed, geography);
  }
  return geography;
}

function earth(): EarthWorldGeography {
  const raster = decodeWorldRaster(new Uint8Array(readFileSync(resolve('public/world/earth-12000-bce.bin'))));
  return earthWorldGeography({ entry: { id: 'earth-12000-bce', title: 'Earth', file: 'earth-12000-bce.bin', seaLevelMeters: -60, recommended: true }, raster }, 10);
}

// Both Earth test groups query the same read-only atlas; decoding it twice at
// module load added setup cost without giving either group an isolated world.
const earthGeography = earth();

describe('m16-forest-start-has-local-drinking-water', () => {
  it('accepts a small spring as drinking water rather than requiring a wide river', () => {
    expect(isStart({ fresh: 1, land: 1 })).toBe(true);
    expect(isStart({ fresh: 0, land: 1 })).toBe(false);
  });

  it('provides a real source in the selected humid forest comarca, without moving the start', () => {
    for (const x of [475, 476, 477]) {
      const chosen = startInComarca(earthGeography, x, 115, config);
      expect(chosen, `forest comarca ${x},115`).not.toBeNull();
      expect(chosen!.x).toBe(x + 0.5);
      expect(chosen!.report.fresh).toBeGreaterThan(0);
    }
    const chosen = startInComarca(earthGeography, 475, 115, config)!;
    const sim = new WorldState({ seed: 728083595, population: { bands: 1, peoplePerBand: 4 } },
      { geography: earthGeography, start: chosen, comarcasWide: 1, comarcasHigh: 1, peoples: false }).current;
    expect(sim.world.freshShore.length).toBeGreaterThan(0);
    expect(sim.world.freshShore.some(bank => sim.world.isWalkable(bank.x, bank.y))).toBe(true);
  });

  it('saves the exact small source and lets a thirsty person drink after loading', () => {
    const chosen = startInComarca(earthGeography, 475, 115, config)!;
    const state = new WorldState({ seed: 728083595, population: { bands: 1, peoplePerBand: 4 } },
      { geography: earthGeography, start: chosen, comarcasWide: 1, comarcasHigh: 1, peoples: false });
    const sim = state.current;
    const person = sim.people.find(p => !p.isChild)!;
    sim.possess(person);
    const bank = sim.world.freshShore[0]!;
    person.x = bank.x + 0.5; person.y = bank.y + 0.5; person.needs.thirst = 70;
    expect(sim.order(person, 'drink', bank)).toBe(true);
    const record = JSON.stringify(toWorldStateRecord(state));
    const restored = fromWorldStateRecord(JSON.parse(record));
    expect(JSON.stringify(toWorldStateRecord(restored))).toBe(record);
    for (let tick = 0; tick < 2 * sim.config.time.ticksPerDay; tick++) { sim.step(); restored.current.step(); }
    expect(sim.peopleById.get(person.id)!.needs.thirst).toBeLessThan(70);
    // Full entity-graph continuation is tracked separately by the inherited
    // E5 regression. Here compare every terrain field, including the exact
    // spring and its banks, and the player's real drinking result.
    expect(toWorldTerrainRecord(restored.current.world)).toEqual(toWorldTerrainRecord(sim.world));
    expect(restored.current.peopleById.get(person.id)!.needs.thirst).toBe(sim.peopleById.get(person.id)!.needs.thirst);
  }, 15000);
});

describe('where a game may begin: with fresh water to drink (phase 33)', () => {
  it('the old pick (open temperate country by its flags) often had no water at all: the bug this guards', () => {
    // Measured against the build that made four dead worlds in a row: unless some seed here ended up with too little water the
    // test below proves nothing, so it asserts the failure exists.
    const dry = SEEDS.filter(seed => {
      const geography = randomGeography(seed);
      const start = findGlobeStart(geography, SPAN);
      return start === null || measureWindow(geography, start.x, start.y, SPAN, config).fresh < MIN_FRESH_TILES;
    });
    expect(dry.length).toBeGreaterThan(0);
  });

  it('every generated world begins where a measured river or lake runs, on mostly dry land', () => {
    for (const seed of SEEDS) {
      const geography = randomGeography(seed);
      const start = findWateredGlobeStart(geography, SPAN, config, seed);
      expect(start, seed).not.toBeNull();
      const report = measureWindow(geography, start!.x, start!.y, SPAN, config);
      expect(isStart(report), `${seed}: ${JSON.stringify(report)}`).toBe(true);
    }
  });

  it('and the simulation built there has water to drink and a band to drink it', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const geography = randomGeography(seed);
      const start = findWateredGlobeStart(geography, SPAN, config, seed)!;
      const state = new WorldState({ seed, population: { bands: 1, peoplePerBand: 6 } },
        { geography, start: { x: start.x, y: start.y }, comarcasWide: SPAN, comarcasHigh: SPAN, peoples: false });
      expect(state.current.world.freshShore.length, seed).toBeGreaterThan(40);
      expect(state.current.livingPeople().length).toBeGreaterThan(0);
    }
  });

  it('is a function of the seed, and different seeds begin in different places and kinds of country', () => {
    const where = (seed: string) => {
      // Build independently on each call so the repeated-seed assertion still
      // proves that a fresh map from the same seed chooses the same start.
      const geography = randomWorldGeography(seed);
      const start = findWateredGlobeStart(geography, SPAN, config, seed)!;
      return { x: start.x, y: start.y, terrain: worldTerrainOf(geography.profileAt(start.x, start.y)) };
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
    const geography = randomGeography(seed);
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
  const geography = earthGeography;

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
    expect(regionWater(geography, 50, 13)).toBe('none');
    const start = findNearestStart(geography, 50, 13, SPAN, config, 2)!;
    expect(start).not.toBeNull();
    expect(isStart(start.report)).toBe(true);
    expect(Math.max(Math.abs(start.region.x - 50), Math.abs(start.region.y - 13))).toBeLessThanOrEqual(2);
  });

  it('the middle of the Sahara has no water within two regions, and says so rather than begin there', () => {
    expect(findNearestStart(geography, 52, 17, SPAN, config, 2)).toBeNull();
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

  it('an explicit comarca is measured and becomes the exact local start; an open-sea comarca is refused', () => {
    const suggested = findStartInRegion(geography, 30, 24, 1, config)!;
    const cx = Math.floor(suggested.x), cy = Math.floor(suggested.y);
    const chosen = startInComarca(geography, cx, cy, config)!;
    expect(chosen).toMatchObject({ x: cx + 0.5, y: cy + 0.5, region: { x: 30, y: 24 } });
    expect(isStart(chosen.report)).toBe(true);
    expect(startInComarca(geography, 55, 245, config)).toBeNull();

    const state = new WorldState({ seed: 'wp-explicit-comarca', population: { bands: 1, peoplePerBand: 6 } },
      { geography, start: { x: chosen.x, y: chosen.y }, comarcasWide: 1, comarcasHigh: 1 });
    expect(state.initialGeographicStart?.start).toEqual({ x: cx + 0.5, y: cy + 0.5 });
    const reserved = regionOfStart(gridFromGeography(geography)!, chosen);
    expect(state.peoples!.regions.has(reserved)).toBe(true);
    expect([...state.peoples!.regionOfPeople.values()]).not.toContain(reserved);
    expect(state.current.world.freshShore.length).toBeGreaterThan(0);
  });
});

describe('M15 "begin anywhere" (2026-10-07): a coastal region is selectable, and a start without water is a choice', () => {
  const geography = earthGeography;

  it('a coastal region is told apart from open ocean: both are classed "ocean", only one borders dry land', () => {
    // 46,10 sits on a coastline in the fixture atlas (verified by scanning the whole globe for a region whose own centre
    // samples as ocean but whose dry-fallback window still comes back mixed, below). 5,24 is the open sea already used by
    // "the open sea is not a place to begin" above — nothing around it for two rings, which is why that test still finds
    // nothing even with `findStartInRegion`'s own early exit unchanged.
    expect(worldTerrainOf(geography.profileAt(46 * 10 + 5, 10 * 10 + 5))).toBe('ocean');
    expect(isCoastalRegion(geography, 46, 10)).toBe(true);
    expect(worldTerrainOf(geography.profileAt(5 * 10 + 5, 24 * 10 + 5))).toBe('ocean');
    expect(isCoastalRegion(geography, 5, 24)).toBe(false);
  });

  it('a coastal region still gives a dry-land start with both shore and sea in view', () => {
    // Both the normal and dry fallback searches may use land next to a coastal
    // region, whose own atlas centre samples as ocean.
    // Detailed British rivers now provide water where the coarse atlas omitted it.
    expect(findStartInRegion(geography, 46, 10, SPAN, config)?.report.fresh).toBeGreaterThanOrEqual(MIN_FRESH_TILES);
    const dry = findStartInRegion(geography, 46, 10, SPAN, config, { requireWater: false })!;
    expect(dry).not.toBeNull();
    expect(dry.region).toEqual({ x: 46, y: 10 });
    // Mixed, not merely "found some land somewhere": this is the window a player actually lands in, and it holds both
    // the ground to live on and the sea the region was chosen for.
    expect(dry.report.land).toBeGreaterThanOrEqual(MIN_LAND_SHARE);
    expect(dry.report.land).toBeLessThan(0.9);
  });

  it('true open ocean has no dry fallback either: there is nothing within reach to fall back to', () => {
    expect(findStartInRegion(geography, 5, 24, SPAN, config, { requireWater: false })).toBeNull();
  });

  it('a region with no water nearby gets a dry-land start on request, land only, never invented water', () => {
    // 52,17 is the same Sahara-ish region "the middle of the Sahara has no water within two regions" already uses: no
    // river or lake within two rings of regions, so `findNearestStart` (the water-requiring search) refuses it. The
    // dry fallback is the "Begin here anyway" button's door: it still has to find solid ground, but it must not pretend
    // there is water where there measurably is none.
    expect(findNearestStart(geography, 52, 17, SPAN, config, 2)).toBeNull();
    const dry = findStartInRegion(geography, 52, 17, SPAN, config, { requireWater: false })!;
    expect(dry).not.toBeNull();
    expect(dry.region).toEqual({ x: 52, y: 17 });
    expect(dry.report.land).toBeGreaterThanOrEqual(MIN_LAND_SHARE);
  });
});

describe('one comarca per map (owner, 2026-10-08)', () => {
  it('a start for a one-comarca map is the middle of a whole comarca, measured, with fresh water in it', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const geography = randomGeography(seed);
      const start = findWateredGlobeStart(geography, 1, config, seed);
      expect(start, seed).not.toBeNull();
      // The map IS a comarca of the globe: its origin is a whole comarca, not a window straddling four of them.
      expect(start!.x - 0.5, seed).toBe(Math.round(start!.x - 0.5));
      expect(start!.y - 0.5, seed).toBe(Math.round(start!.y - 0.5));
      expect(isStart(measureWindow(geography, start!.x, start!.y, 1, config)), seed).toBe(true);
    }
  });

  it('the simulation built there is that one comarca: every tile is in it', () => {
    const seed = SEEDS[0]!;
    const geography = randomGeography(seed);
    const start = findWateredGlobeStart(geography, 1, config, seed)!;
    const state = new WorldState({ seed, population: { bands: 1, peoplePerBand: 6 } },
      { geography, start: { x: start.x, y: start.y }, comarcasWide: 1, comarcasHigh: 1, peoples: false });
    const sim = state.current;
    const here = { cx: Math.floor(start.x), cy: Math.floor(start.y) };
    for (const [x, y] of [[0, 0], [127.9, 0], [0, 127.9], [64, 64], [127.9, 127.9]] as const) {
      expect(sim.comarcaAtTile(x, y)).toEqual(here);
    }
    expect(sim.livingPeople().length).toBeGreaterThan(0);
  });
});
