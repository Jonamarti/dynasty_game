import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { World } from '../core/World.ts';
import { fromWorldTerrainRecord, toWorldTerrainRecord } from '../persistence/WorldRecords.ts';
import type { LocalGeographySource } from '../world/LocalGeography.ts';

function geographicWorld(): World {
  const config = { ...DEFAULT_CONFIG.world, width: 5, height: 3, waterLevel: 0.5, wadeDepth: 0.04, swimDepth: 0.2 };
  const geography = {
    kind: 'earth',
    bounds: { originX: 0, originY: 0, comarcasWide: 1, comarcasHigh: 1 },
    profileAtLocal: () => ({}) as never,
    sample(x: number, _y: number) {
      const elevation = Math.floor(x) === 4 ? 0.3 : 0.6;
      return { profile: {} as never, elevation, moisture: 0.5, land: elevation >= config.waterLevel };
    },
    hydrologyAt(x: number, y: number) {
      return Math.floor(x) === 1 && Math.floor(y) === 1 ? { kind: 'fresh' as const, surface: 0.62 } : null;
    },
    hydrology: {} as never,
  } as LocalGeographySource;
  return new World(config, new RNG('water-model-no-rng'), geography);
}

describe('local freshwater and saltwater semantics', () => {
  it('separates potable river tiles and banks from sea tiles and banks', () => {
    const world = geographicWorld();

    expect(world.biomeAt(1, 1)).toBe('river');
    expect(world.isFreshWater(1, 1)).toBe(true);
    expect(world.isDrinkingWater(1, 1)).toBe(true);
    expect(world.isFreshShore(1, 1)).toBe(true);
    expect(world.freshShore.some(tile => tile.x === 1 && tile.y === 2)).toBe(true);

    expect(world.isWater(4, 1)).toBe(true);
    expect(world.isSaltWater(4, 1)).toBe(true);
    expect(world.isDrinkingWater(4, 1)).toBe(false);
    expect(world.isSaltShore(3, 1)).toBe(true);
    expect(world.isFreshShore(3, 1)).toBe(false);
  });

  it('keeps geographic water classes and raised river surfaces through terrain records', () => {
    const world = geographicWorld();
    const record = toWorldTerrainRecord(world);
    expect(record.version).toBe(2);
    const restored = fromWorldTerrainRecord(JSON.parse(JSON.stringify(record)));

    expect(toWorldTerrainRecord(restored)).toEqual(record);
    expect(restored.depthAt(1, 1)).toBeCloseTo(0.02);
    expect(restored.isDrinkingWater(1, 1)).toBe(true);
    expect(restored.isDrinkingWater(4, 1)).toBe(false);
  });

  it('fills a dug trench from the bordering freshwater source and keeps its surface', () => {
    const world = geographicWorld();
    world.dig(1, 2, 0.03);

    expect(world.biomeAt(1, 2)).toBe('river');
    expect(world.isFreshWater(1, 2)).toBe(true);
    expect(world.isSaltWater(1, 2)).toBe(false);
    expect(world.depthAt(1, 2)).toBeCloseTo(0.05);
    expect(world.isWalkable(1, 2)).toBe(false);
    const record = toWorldTerrainRecord(world);
    const restored = fromWorldTerrainRecord(JSON.parse(JSON.stringify(record)));
    expect(toWorldTerrainRecord(restored)).toEqual(record);
    expect(restored.depthAt(1, 2)).toBeCloseTo(0.05);
    expect(restored.isDrinkingWater(1, 2)).toBe(true);
  });

  it('rejects a record that relabels salt sea as non-water', () => {
    const record = JSON.parse(JSON.stringify(toWorldTerrainRecord(geographicWorld())));
    record.tiles.waterKind[9] = 0;
    expect(() => fromWorldTerrainRecord(record)).toThrow(/water kind and biome disagree/);

    const saltRiver = JSON.parse(JSON.stringify(toWorldTerrainRecord(geographicWorld())));
    saltRiver.tiles.waterKind[6] = 2;
    expect(() => fromWorldTerrainRecord(saltRiver)).toThrow(/water kind and biome disagree/);
  });

  it('retains the v1 terrain shape and potable legacy island water', () => {
    const world = new World({ ...DEFAULT_CONFIG.world, width: 20, height: 20 }, new RNG('classic-water-model'));
    const record = toWorldTerrainRecord(world);
    expect(record.version).toBe(1);
    expect(record.tiles).not.toHaveProperty('waterKind');
    const waterIndex = world.biome.findIndex(value => value === 0);
    const x = waterIndex % world.width;
    const y = Math.floor(waterIndex / world.width);
    expect(world.isDrinkingWater(x, y)).toBe(true);
    expect(world.saltShore).toEqual([]);
  });

  it('rejects sea surfaces that disagree with the runtime sea level', () => {
    const raisedSea = JSON.parse(JSON.stringify(toWorldTerrainRecord(geographicWorld())));
    raisedSea.tiles.waterSurface[9] = 10;
    expect(() => fromWorldTerrainRecord(raisedSea)).toThrow(/saltwater surface must match sea level/);
  });

  it('keeps the classic map edge as potable water for trench flooding', () => {
    const config = { ...DEFAULT_CONFIG.world, width: 20, height: 20, waterLevel: -10 };
    const world = new World(config, new RNG('classic-edge-water'));
    const edge = Array.from({ length: world.height }, (_, y) => ({ x: 0, y }))
      .find(({ x, y }) => world.biomeAt(x, y) !== 'rock');
    expect(edge).toBeDefined();
    const needed = world.elevation[world.index(edge!.x, edge!.y)]! - config.waterLevel + 0.01;
    world.dig(edge!.x, edge!.y, needed);

    expect(world.biomeAt(edge!.x, edge!.y)).toBe('water');
    expect(world.isDrinkingWater(edge!.x, edge!.y)).toBe(true);
  });
});
