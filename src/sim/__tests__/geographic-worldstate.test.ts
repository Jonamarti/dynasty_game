import { describe, expect, it } from 'vitest';
import { IdSpace } from '../core/IdSpace.ts';
import { Simulation } from '../core/Simulation.ts';
import { geographicResourceAvailable } from '../world/GeographicResources.ts';
import { earthWorldGeography, randomWorldGeography } from '../world/WorldGeography.ts';
import type { LoadedWorldMap } from '../world/WorldAtlas.ts';
import { WorldState } from '../world/WorldState.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

function earth(options: { features?: number; elevation?: number; climate?: number } = {}) {
  const { features = 0, elevation = 100, climate = 0 } = options;
  const loaded: LoadedWorldMap = {
    entry: { id: 'resource-gate', title: 'Resource gate', file: 'resource-gate.bin',
      seaLevelMeters: 0, recommended: false },
    raster: {
      width: 4, height: 2,
      elevationMeters: Int16Array.from({ length: 8 }, () => elevation),
      koppen: Uint8Array.from({ length: 8 }, () => climate),
      features: Uint32Array.from({ length: 8 }, () => features), seaLevelMeters: 0,
    },
  };
  return earthWorldGeography(loaded, 10);
}

function geographicStart(geography = earth()) {
  return { geography, start: { x: 20, y: 10 } };
}

describe('geographic WorldState construction', () => {
  it('rejects populated starts before an allocator or simulation stream advances', () => {
    const ids = new IdSpace();
    const before = ids.snapshot();
    expect(() => new Simulation({ population: { bands: 1 } }, ids, {
      geography: earth(), x: 20, y: 10,
    })).toThrow(/freshwater.*population\.bands = 0/i);
    expect(ids.snapshot()).toEqual(before);
  });

  it('builds an unpopulated geographic inspection world and checkpoints its continuation', () => {
    const config = {
      seed: 'geographic-inspection',
      population: { bands: 0 },
      time: { ticksPerDay: 6 },
      world: { width: 32, height: 24, treeDensity: 0, berryBushes: 18,
        flintOutcrops: 0, deadwood: 0, reedBeds: 0, clayBanks: 0,
        fishingSpots: 0, wildGrainPatches: 0, gameHerds: 2, predators: 0 },
    };
    const state = new WorldState(config, geographicStart());
    expect(state.geography.kind).toBe('earth');
    expect(state.current.people).toHaveLength(0);
    expect(state.current.animals.length).toBeGreaterThan(0);
    expect(state.current.nodes.filter(node => node.kind === 'berries').length).toBeGreaterThan(0);
    const record = toCheckpointRecord(state.current);
    const restored = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(record)));
    for (let i = 0; i < 12; i++) {
      state.current.step();
      restored.step();
    }
    expect(toCheckpointRecord(restored)).toEqual(toCheckpointRecord(state.current));
  });

  it('gates actual cereal and flint placement on regional provenance while preserving generic spawns', () => {
    const config = {
      seed: 'geographic-resource-gates', population: { bands: 0 },
      world: { width: 48, height: 48, treeDensity: 0.08, berryBushes: 22,
        flintOutcrops: 36, deadwood: 18, reedBeds: 0, clayBanks: 0,
        fishingSpots: 0, wildGrainPatches: 36, gameHerds: 2, predators: 0 },
    };
    const cereal = new WorldState(config, geographicStart(earth({ features: 1 << 2 })));
    const noCereal = new WorldState(config, geographicStart(earth()));
    expect(cereal.current.nodes.filter(node => node.kind === 'wild_grain').length).toBeGreaterThan(0);
    expect(noCereal.current.nodes.filter(node => node.kind === 'wild_grain')).toHaveLength(0);
    expect(cereal.current.nodes.filter(node => node.kind === 'flint')).toHaveLength(0);
    expect(noCereal.current.animals.map(animal => [animal.species, animal.x, animal.y]))
      .toEqual(cereal.current.animals.map(animal => [animal.species, animal.x, animal.y]));
    const generic = (sim: Simulation) => sim.nodes
      .filter(node => node.kind === 'berries' || node.kind === 'sticks')
      .map(node => [node.kind, node.x, node.y, node.amount]);
    expect(generic(cereal.current)).toEqual(generic(noCereal.current));

    const flint = new WorldState(config, geographicStart(earth({ features: 1 << 14, elevation: 700 })));
    const noFlint = new WorldState(config, geographicStart(earth({ elevation: 700 })));
    expect(flint.current.nodes.filter(node => node.kind === 'flint').length).toBeGreaterThan(0);
    expect(noFlint.current.nodes.filter(node => node.kind === 'flint')).toHaveLength(0);
    expect(flint.current.animals.map(animal => [animal.species, animal.x, animal.y]))
      .toEqual(noFlint.current.animals.map(animal => [animal.species, animal.x, animal.y]));
  });

  it('requires finite in-range coordinates, permits empty ocean inspections, and gates only explicit resources', () => {
    const map = randomWorldGeography('resource-gates', { regionsWide: 8, regionsHigh: 4 });
    expect(() => new WorldState({ population: { bands: 0 } }, {
      geography: map, start: { x: Number.NaN, y: 2 },
    })).toThrow(/finite and inside/i);
    expect(() => new WorldState({ population: { bands: 0 } }, {
      geography: map, start: { x: map.map.width, y: 2 },
    })).toThrow(/finite and inside/i);
    expect(() => new WorldState({ population: { bands: 0 } }, {
      geography: map, start: { x: 2, y: 0 },
    })).toThrow(/crosses a map pole/i);
    expect(() => new WorldState({ population: { bands: 0 } }, {
      geography: map, start: { x: 2, y: 2 }, comarcasWide: 0,
    })).toThrow(/positive and finite/i);

    const ocean = earth({ elevation: -1000 });
    const waterWorld = new WorldState({ population: { bands: 0 }, world: {
      width: 24, height: 20, treeDensity: 0, berryBushes: 0, flintOutcrops: 0,
      deadwood: 0, reedBeds: 0, clayBanks: 0, fishingSpots: 0,
      wildGrainPatches: 0, gameHerds: 0, predators: 0,
    } }, geographicStart(ocean));
    expect(waterWorld.current.people).toHaveLength(0);
    expect(waterWorld.current.world.countBiomes().water).toBe(24 * 20);

    const unsupported = earth();
    expect(geographicResourceAvailable(unsupported, 20, 10, 'wild_grain')).toBe(false);
    expect(geographicResourceAvailable(unsupported, 20, 10, 'flint')).toBe(false);
    const supported = earth({ features: (1 << 2) | (1 << 14) });
    expect(geographicResourceAvailable(supported, 20, 10, 'wild_grain')).toBe(true);
    expect(geographicResourceAvailable(supported, 20, 10, 'flint')).toBe(true);
    expect(geographicResourceAvailable(earth({ features: 1 << 7 }), 20, 10, 'wild_grain')).toBe(false);
  });
});
