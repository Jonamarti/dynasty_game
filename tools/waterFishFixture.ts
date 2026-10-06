import { DEFAULT_CONFIG } from '../src/sim/core/Config.ts';
import { IdSpace } from '../src/sim/core/IdSpace.ts';
import { Simulation } from '../src/sim/core/Simulation.ts';
import type { DeepPartial, SimConfig } from '../src/sim/core/Config.ts';
import type { LoadedWorldMap } from '../src/sim/world/WorldAtlas.ts';
import { earthWorldGeography } from '../src/sim/world/WorldGeography.ts';
import { WORLD_FEATURE } from '../src/sim/world/WorldFeatureSeeds.ts';

/** Continental test coast with a freshwater course and a narrow salt shoal. */
export function waterFishGeography() {
  const heights = [1000, 750, 500, 250, 100, -10, -20, -30];
  const width = 8, height = 4;
  const loaded: LoadedWorldMap = {
    entry: { id: 'water-fish-test', title: 'Water fish test', file: 'water-fish-test.bin',
      seaLevelMeters: 0, recommended: false },
    raster: {
      width, height,
      elevationMeters: Int16Array.from({ length: width * height }, (_, i) => heights[i % width]!),
      koppen: new Uint8Array(width * height).fill(8),
      features: Uint32Array.from({ length: width * height }, (_, i) => i % width < 5 ? WORLD_FEATURE.river : 0),
      seaLevelMeters: 0,
    },
  };
  return earthWorldGeography(loaded, 10);
}

/** Inland bowl with no river flags, used to isolate lake-bank fishing. */
export function waterLakeGeography() {
  const width = 16, height = 16;
  const elevationMeters = new Int16Array(width * height).fill(160);
  const features = new Uint32Array(width * height);
  // A closed depression at region (8, 8), above sea level. The bowl occupies
  // neighboring source cells so its interpolated rim contains walkable shallows.
  for (let y = 6; y <= 10; y++) for (let x = 6; x <= 10; x++) {
    const radius = Math.max(Math.abs(x - 8), Math.abs(y - 8));
    elevationMeters[y * width + x] = radius === 0 ? 20 : radius === 1 ? 70 : 120;
  }
  features[8 * width + 8] = WORLD_FEATURE.lake;
  const loaded: LoadedWorldMap = {
    entry: { id: 'water-lake-test', title: 'Water lake test', file: 'water-lake-test.bin',
      seaLevelMeters: 0, recommended: false },
    raster: {
      width, height, elevationMeters,
      koppen: new Uint8Array(width * height).fill(8), features, seaLevelMeters: 0,
    },
  };
  return earthWorldGeography(loaded, 4);
}

/** Small real Simulation so tests cover `spawnFish` and its dedicated stream. */
export function createWaterFishSimulation(seed: string, overrides: DeepPartial<SimConfig> = {}): Simulation {
  const world = {
    ...DEFAULT_CONFIG.world,
    width: 64, height: 48,
    // The shelf is under 20 m deep. Keep this explicit to exercise wadeable
    // coast fish without changing the thresholds in ordinary game worlds.
    wadeDepth: 0.05, swimDepth: 0.12,
    fishingSpots: 2, berryBushes: 0, flintOutcrops: 0, deadwood: 0,
    reedBeds: 0, clayBanks: 0, gameHerds: 0, predators: 0, wildGrainPatches: 0,
  };
  return new Simulation({
    ...overrides,
    seed,
    world: { ...world, ...overrides.world },
    population: { ...DEFAULT_CONFIG.population, bands: 1, peoplePerBand: 4, ...overrides.population },
  }, new IdSpace(), {
    geography: waterFishGeography(),
    x: 40,
    y: 20,
    comarcasWide: 60,
    comarcasHigh: 20,
  });
}

/** Isolated lake start; no river candidates or salt coast are in this map. */
export function createWaterLakeSimulation(seed: string, overrides: DeepPartial<SimConfig> = {}): Simulation {
  const world = {
    ...DEFAULT_CONFIG.world,
    width: 64, height: 64,
    wadeDepth: DEFAULT_CONFIG.world.wadeDepth, swimDepth: DEFAULT_CONFIG.world.swimDepth,
    fishingSpots: 2, berryBushes: 0, flintOutcrops: 0, deadwood: 0,
    reedBeds: 0, clayBanks: 0, gameHerds: 0, predators: 0, wildGrainPatches: 0,
  };
  return new Simulation({
    ...overrides,
    seed,
    world: { ...world, ...overrides.world },
    population: { ...DEFAULT_CONFIG.population, bands: 1, peoplePerBand: 4, ...overrides.population },
  }, new IdSpace(), {
    geography: waterLakeGeography(),
    x: 34,
    y: 34,
    comarcasWide: 4,
    comarcasHigh: 4,
  });
}
