import { DEFAULT_CONFIG } from '../src/sim/core/Config.ts';
import type { LoadedWorldMap } from '../src/sim/world/WorldAtlas.ts';
import { WORLD_FEATURE } from '../src/sim/world/WorldFeatureSeeds.ts';

/** Shared geography used by terrain tests and the continental screenshot tour. */
export function createTurnedRiverFixture(): {
  loaded: LoadedWorldMap;
  comarcasPerRegion: number;
  bounds: { originX: number; originY: number; comarcasWide: number; comarcasHigh: number };
  config: typeof DEFAULT_CONFIG.world;
} {
  const width = 8, height = 8;
  const elevations = new Int16Array(width * height).fill(1_100);
  const features = new Uint32Array(width * height);
  // The valley runs east for two cells, turns south, then reaches the sea.
  const channel: Array<[number, number, number]> = [
    [1, 1, 1_200], [2, 1, 1_000], [3, 1, 700],
    [3, 2, 690], [3, 3, 400], [3, 4, -10],
  ];
  for (const [x, y, elevation] of channel) {
    const index = y * width + x;
    elevations[index] = elevation;
    if (elevation > 0) features[index] = WORLD_FEATURE.river;
  }
  return {
    loaded: {
      entry: { id: 'turned-river', title: 'Turned river', file: 'turned-river.bin', seaLevelMeters: 0, recommended: false },
      raster: {
        width, height, elevationMeters: elevations,
        koppen: new Uint8Array(width * height).fill(8), features, seaLevelMeters: 0,
      },
    },
    comarcasPerRegion: 4,
    bounds: { originX: 4, originY: 0, comarcasWide: 20, comarcasHigh: 20 },
    config: { ...DEFAULT_CONFIG.world, width: 80, height: 80 },
  };
}
