import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import type { World as TileWorld } from '../core/World.ts';
import { WorldState } from '../world/WorldState.ts';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { findWateredGlobeStart, localWorldConfig } from '../world/StartPlace.ts';

interface Conversion {
  seed: string | number;
  tick: number;
  tile: number;
  cause: string;
}

function waterMask(world: TileWorld): Uint8Array {
  return Uint8Array.from(world.biome, biome => biome === 0 || biome === 6 ? 1 : 0);
}

function observeFiveDays(seed: string | number, make: () => Simulation, replaceCurrent?: () => Simulation): Conversion[] {
  const conversions: Conversion[] = [];
  let simulation = make();
  let world = simulation.world;
  let thisTickCauses = new Map<number, string>();
  const wrapFloodPath = (target: TileWorld): void => {
    const original = target.floodFrom.bind(target);
    target.floodFrom = (x, y) => {
      const before = waterMask(target);
      const filled = original(x, y);
      if (filled > 0) {
        const after = waterMask(target);
        for (let tile = 0; tile < after.length; tile++) {
          if (!before[tile] && after[tile]) thisTickCauses.set(tile, 'dug trench connected to water');
        }
      }
      return filled;
    };
  };
  wrapFloodPath(world);
  let previous = waterMask(world);
  const ticks = simulation.config.time.ticksPerDay * 5;
  for (let tick = 0; tick < ticks; tick++) {
    thisTickCauses = new Map();
    simulation.step();
    const current = replaceCurrent?.() ?? simulation;
    if (current !== simulation || current.world !== world) {
      // A replaced local world is a comarca installation after travel; its
      // generated water belongs to that location, not to tiles in the old map.
      simulation = current;
      world = simulation.world;
      wrapFloodPath(world);
      previous = waterMask(world);
      continue;
    }
    const after = waterMask(world);
    for (let tile = 0; tile < after.length; tile++) {
      if (!previous[tile] && after[tile]) {
        conversions.push({ seed, tick, tile, cause: thisTickCauses.get(tile) ?? 'unknown' });
      }
    }
    previous = after;
  }
  return conversions;
}

describe('m16-no-sudden-flood', () => {
  it('records a cause for every land tile that becomes water over five days', () => {
    const conversions: Conversion[] = [];
    for (const seed of [1, 2, 3] as const) {
      conversions.push(...observeFiveDays(seed, () => new Simulation({ seed,
        world: { width: 64, height: 64, predators: 0, gameHerds: 0 },
        population: { bands: 1, peoplePerBand: 4 } })));
    }
    for (const seed of ['m16-flood-map-1', 'm16-flood-map-2']) {
      const geography = randomWorldGeography(seed);
      const mapConfig = { seed, world: { width: 64, height: 64, predators: 0, gameHerds: 0 },
        population: { bands: 1, peoplePerBand: 4 } } as const;
      const start = findWateredGlobeStart(geography, 1, localWorldConfig({ width: 64, height: 64 }), seed);
      if (!start) throw new Error(`${seed}: generated map has no watered start`);
      const state = new WorldState(mapConfig, { geography, start: { x: start.x, y: start.y },
        comarcasWide: 1, comarcasHigh: 1, peoples: false });
      conversions.push(...observeFiveDays(seed, () => state.current, () => state.current));
    }
    if (process.env.DYNASTY_TRACE_FLOODS === '1') console.info(JSON.stringify(conversions));
    expect(conversions.filter(conversion => conversion.cause === 'unknown')).toEqual([]);
  }, 15000);
});
