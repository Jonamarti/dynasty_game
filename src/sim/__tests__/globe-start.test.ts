import { describe, expect, it } from 'vitest';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { findGlobeStart, worldTerrainOf } from '../world/WorldTerrain.ts';
import { WorldState } from '../world/WorldState.ts';

describe('globe start', () => {
  it('is deterministic and lands on dry temperate country', () => {
    const geography = randomWorldGeography('globe-start-seed');
    const a = findGlobeStart(geography, 4);
    const b = findGlobeStart(randomWorldGeography('globe-start-seed'), 4);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    const terrain = worldTerrainOf(geography.profileAt(a!.x, a!.y));
    expect(['temperate_forest', 'grassland', 'steppe']).toContain(terrain);
  });

  it('answers nothing for the classic island', () => {
    expect(worldTerrainOf({ kind: 'legacyIsland' } as never)).toBeNull();
  });

  it('builds a populated world there whose people know the ground they stand on', () => {
    const geography = randomWorldGeography('globe-start-seed');
    const start = findGlobeStart(geography, 4)!;
    const state = new WorldState({ seed: 'globe-start-seed', population: { bands: 1, peoplePerBand: 6 },
      world: { width: 96, height: 96 } }, { geography, start, comarcasWide: 4, comarcasHigh: 4 });
    const player = state.current.possessFirst()!;
    expect(player.worldKnowledge!.size).toBeGreaterThan(0);
    const here = state.current.comarcaAtTile(player.x, player.y)!;
    expect(player.worldKnowledge!.entry(here.cx, here.cy)).toMatchObject({ source: 'seen' });
  });
});
