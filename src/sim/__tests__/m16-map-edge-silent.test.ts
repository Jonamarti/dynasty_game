import { describe, expect, it } from 'vitest';
import { findGlobeStart } from '../world/WorldTerrain.ts';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { WorldState } from '../world/WorldState.ts';

describe('M16 map edge movement', () => {
  it('does not report deep water when direct movement reaches the map boundary', () => {
    const seed = 'm16-map-edge-silent';
    const geography = randomWorldGeography(seed, { regionsWide: 24, regionsHigh: 12 });
    const start = findGlobeStart(geography, 4)!;
    const state = new WorldState({ seed, population: { bands: 1, peoplePerBand: 5 },
      world: { width: 32, height: 32 } }, {
      geography, start: { x: Math.floor(start.x) + 0.5, y: Math.floor(start.y) + 0.5 },
      comarcasWide: 1, comarcasHigh: 1, peoples: false,
    });
    const sim = state.current;
    const player = sim.possessFirst()!;
    player.x = sim.world.width - 0.1;
    player.y = sim.world.height / 2;
    sim.playerIntent = { dx: 1, dy: 0 };

    sim.step();

    expect(sim.lastRefusal).toBeNull();
    expect(player.x).toBeLessThan(sim.world.width);
    expect(player.x).toBeGreaterThanOrEqual(0);
  });
});
