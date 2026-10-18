import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { World } from '../core/World.ts';
import { isWetSubsoil } from '../core/Earth.ts';
import type { LocalGeographySource } from '../world/LocalGeography.ts';
import { fromWorldTerrainRecord, toWorldTerrainRecord } from '../persistence/WorldRecords.ts';

function mapWorld(riverAtWestEdge = false): World {
  const config = { ...DEFAULT_CONFIG.world, width: 5, height: 4, waterLevel: 0.5 };
  const geography = {
    kind: 'earth',
    bounds: { originX: 0, originY: 0, comarcasWide: 1, comarcasHigh: 1 },
    profileAtLocal: () => ({}) as never,
    sample(x: number, y: number) {
      const river = riverAtWestEdge && Math.floor(x) === 0 && Math.floor(y) === 2;
      const elevation = river ? 0.45 : 0.6;
      return { profile: {} as never, elevation, moisture: 0.2, land: !river };
    },
    hydrologyAt(x: number, y: number) {
      return riverAtWestEdge && Math.floor(x) === 0 && Math.floor(y) === 2
        ? { kind: 'fresh' as const, surface: 0.62 }
        : null;
    },
    hydrology: {} as never,
  } as LocalGeographySource;
  return new World(config, new RNG('m16-edge-is-not-shore'), geography);
}

describe('M16 map-world edges are not sea', () => {
  it('does not turn a dry map perimeter into shore, shallow water, or wet subsoil', () => {
    const world = mapWorld();

    expect(world.shoreTiles).toEqual([]);
    expect(world.isShallow(-1, 1)).toBe(false);
    expect(world.isShore(0, 1)).toBe(false);
    expect(isWetSubsoil(world, 0, 1)).toBe(false);
  });

  it('does not wrap west-edge fresh water onto the east edge', () => {
    const world = mapWorld(true);

    expect(world.isFreshWater(0, 2)).toBe(true);
    expect(world.isFreshShore(4, 1)).toBe(false);
  });

  it('keeps the classic island edge water behavior', () => {
    const world = new World({ ...DEFAULT_CONFIG.world, width: 20, height: 20 }, new RNG('m16-classic-edge'));
    const edge = Array.from({ length: world.height }, (_, y) => ({ x: 0, y }))
      .find(({ x, y }) => world.isWalkable(x, y));

    expect(edge).toBeDefined();
    expect(world.isShallow(-1, edge!.y)).toBe(true);
    expect(world.isShore(edge!.x, edge!.y)).toBe(true);
  });

  it('saves the edge contract and migrates older terrain records as classic islands', () => {
    const map = mapWorld();
    const restoredMap = fromWorldTerrainRecord(JSON.parse(JSON.stringify(toWorldTerrainRecord(map))));
    expect(restoredMap.isShore(0, 1)).toBe(false);

    const legacy = JSON.parse(JSON.stringify(toWorldTerrainRecord(map)));
    legacy.version = 3;
    delete legacy.outsideIsSea;
    const restoredLegacy = fromWorldTerrainRecord(legacy);
    expect(restoredLegacy.isShore(0, 1)).toBe(true);
  });
});
