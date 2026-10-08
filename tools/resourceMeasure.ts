/**
 * Counting what a detailed window actually holds, shared by `tools/compact-resources.ts` (which builds the table
 * from it) and the correspondence test (which checks the profile against it). One counter, so the table and the
 * test cannot measure two different things.
 *
 * The habitat rules are the generator's own (`world/Habitat.ts`); nothing here restates a threshold.
 */
import { readFileSync } from 'node:fs';
import { decodeWorldRaster } from '../src/sim/world/WorldBinary.ts';
import { earthWorldGeography } from '../src/sim/world/WorldGeography.ts';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { IdSpace } from '../src/sim/core/IdSpace.ts';
import { BUSH_SPECIES } from '../src/sim/entities/ResourceNode.ts';
import { PREY_SPECIES } from '../src/sim/entities/Animal.ts';
import { berryHabitat, grainHabitat, herdHabitat, predatorHabitat, GRAIN_FERTILITY_FLOOR } from '../src/sim/world/Habitat.ts';
import { HABITAT_FIELDS, PROFILE_SPAN, type HabitatField } from '../src/sim/world/ResourceProfile.ts';
import type { WorldGeography } from '../src/sim/world/WorldGeography.ts';

export interface MeasuredWindow {
  /** Per comarca (row-major, span by span): tiles of each habitat field. */
  cells: Record<HabitatField, number>[];
  /** Tiles of each habitat field in the whole window. */
  tiles: Record<HabitatField, number>;
  /** What the generator placed. */
  placed: { bushes: number; shoals: number; herds: number; wildGrainStands: number; ironOre: number };
}

/** A detailed window of `span` comarcas centred on the integer comarca corner (x, y), no people. Throws if the map refuses it. */
export function generateWindow(geography: Exclude<WorldGeography, { kind: 'legacyIsland' }>, x: number, y: number,
  seed: string, span = PROFILE_SPAN): Simulation {
  return new Simulation({ seed, population: { bands: 0 } }, new IdSpace(),
    { geography, x, y, comarcasWide: span, comarcasHigh: span });
}

export function measureWindow(sim: Simulation, span = PROFILE_SPAN): MeasuredWindow {
  const world = sim.world;
  const zero = (): Record<HabitatField, number> => Object.fromEntries(HABITAT_FIELDS.map(f => [f, 0])) as Record<HabitatField, number>;
  const cells = Array.from({ length: span * span }, zero);
  const tiles = zero();
  const cellW = world.width / span, cellH = world.height / span;
  const cellAt = (x: number, y: number) => Math.min(span - 1, Math.floor(y / cellH)) * span + Math.min(span - 1, Math.floor(x / cellW));
  const bump = (field: HabitatField, x: number, y: number) => { cells[cellAt(x, y)]![field]++; tiles[field]++; };
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
    const biome = world.biomeAt(x, y);
    const fertility = world.fertilityAt(x, y);
    if (berryHabitat(biome, fertility)) bump('berry', x, y);
    if (grainHabitat(biome, fertility)) bump('grain', x, y);
    if ((biome === 'grass' || biome === 'forest') && fertility > GRAIN_FERTILITY_FLOOR) bump('arable', x, y);
    if (herdHabitat(biome)) bump('herd', x, y);
    // The carrying capacity of the sward (what a herd's ceiling is made of), in tile-equivalents.
    const cap = world.grassCap[world.index(x, y)]!;
    cells[cellAt(x, y)]!.forage += cap; tiles.forage += cap;
    if (predatorHabitat(biome)) bump('predator', x, y);
    if (biome === 'hills') bump('hills', x, y);
    if (biome === 'rock') bump('rock', x, y);
    if (world.isFreshWater(x, y)) bump('freshWater', x, y);
    if (world.isSaltWater(x, y)) bump('saltWater', x, y);
  }
  // The shoals sit on the same list `Simulation.spawnFish` draws from.
  for (const tile of world.shoreTiles) {
    if (!world.isShallow(tile.x, tile.y)) continue;
    if (world.isFreshWater(tile.x, tile.y)) bump('shallowFresh', tile.x, tile.y);
    else if (world.isSaltWater(tile.x, tile.y)) bump('shallowSalt', tile.x, tile.y);
  }
  const food = new Set<string>(BUSH_SPECIES);
  const herds = new Set<number>();
  const prey = new Set<string>(PREY_SPECIES);
  for (const animal of sim.animals) if (prey.has(animal.species)) herds.add(animal.herdId);
  return {
    cells, tiles,
    placed: {
      bushes: sim.nodes.filter(n => n.kind === 'berries' && n.species !== null && food.has(n.species)).length,
      shoals: sim.nodes.filter(n => n.kind === 'fish').length,
      herds: herds.size,
      wildGrainStands: sim.nodes.filter(n => n.kind === 'wild_grain').length,
      ironOre: sim.nodes.filter(n => n.kind === 'iron_ore').length,
    },
  };
}


/** Both committed Earth maps as geographies, read from `public/world/` (no network). Run from the repository root. */
export function earthSources(): { name: string; geography: Exclude<WorldGeography, { kind: 'legacyIsland' }> }[] {
  const manifest = JSON.parse(readFileSync('public/world/manifest.json', 'utf8')) as {
    comarcasPerRegion: number; maps: { id: string; title: string; file: string; seaLevelMeters: number; recommended: boolean }[];
  };
  return manifest.maps.map(entry => {
    const raster = decodeWorldRaster(new Uint8Array(readFileSync(`public/world/${entry.file}`)));
    return { name: entry.id, geography: earthWorldGeography({ entry, raster }, manifest.comarcasPerRegion) };
  });
}
