import { describe, expect, it } from 'vitest';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import type { WorldGeographyProfile } from '../world/WorldGeography.ts';
import { comarcaCoastShare, findGlobeStart, worldTerrainOf } from '../world/WorldTerrain.ts';
import { WorldState } from '../world/WorldState.ts';
import type { WorldGeography } from '../world/WorldGeography.ts';

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

  it('uses interpolated local height to split coastal Earth comarcas inside one source region', () => {
    const profile = (elevationAboveSeaMeters: number): WorldGeographyProfile => ({
      kind: 'earth', mapId: 'test', x: 0, y: 0, regionX: 0, regionY: 0,
      region: { id: 0, x: 0, y: 0, latitude: 0, elevationMeters: 0, climateClass: 8,
        features: 0, land: false, water: 'salt' as const },
      latitude: 0, elevationMeters: elevationAboveSeaMeters, elevationAboveSeaMeters,
      climateClass: 8, features: 0, land: false, water: 'salt' as const,
    });
    expect(worldTerrainOf(profile(-2))).toBe('ocean');
    expect(worldTerrainOf(profile(2))).toBe('temperate_forest');
  });

  it('measures mixed land and sea within a comarca for the start-grid coast tint', () => {
    const profile = (elevationAboveSeaMeters: number): WorldGeographyProfile => ({
      kind: 'earth', mapId: 'test', x: 0, y: 0, regionX: 0, regionY: 0,
      region: { id: 0, x: 0, y: 0, latitude: 0, elevationMeters: 0, climateClass: 8,
        features: 0, land: false, water: 'salt' as const },
      latitude: 0, elevationMeters: elevationAboveSeaMeters, elevationAboveSeaMeters,
      climateClass: 8, features: 0, land: false, water: 'salt' as const,
    });
    const coast = {
      kind: 'earth',
      profileAt: (x: number, _y: number) => profile(x < 0.5 ? -2 : 2),
    } as unknown as WorldGeography;
    const inland = { kind: 'earth', profileAt: () => profile(2) } as unknown as WorldGeography;
    expect(comarcaCoastShare(coast, 0, 0)).toBeCloseTo(1 / 3);
    expect(comarcaCoastShare(inland, 0, 0)).toBeNull();
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
