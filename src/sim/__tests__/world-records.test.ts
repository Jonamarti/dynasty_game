import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { World } from '../core/World.ts';
import { fromWorldTerrainRecord, toWorldTerrainRecord } from '../persistence/WorldRecords.ts';
import { auditRegions } from '../../../tools/regions.ts';

function world(rng = new RNG('phase28-terrain-ledger')): World {
  return new World({ ...DEFAULT_CONFIG.world, width: 24, height: 18, chunkSize: 6 }, rng);
}

describe('WorldTerrainRecord', () => {
  it('roundtrips every terrain and soil field through JSON and restores working prototypes and aliases', () => {
    const original = world();
    const tile = original.walkable.findIndex(value => value === 1);
    const x = tile % original.width;
    const y = Math.floor(tile / original.width);
    original.soil.till(tile);
    original.soil.enrich(tile, 0.04);
    original.soil.reap(tile + 1);
    original.dig(x, y, 0.025);
    original.graze(x, y, 0.1);

    const wire = JSON.parse(JSON.stringify(toWorldTerrainRecord(original)));
    const restored = fromWorldTerrainRecord(wire);
    expect(restored).toBeInstanceOf(World);
    expect(restored.soil).toBeInstanceOf(original.soil.constructor);
    expect((restored.soil as unknown as { fertility: Float32Array }).fertility).toBe(restored.fertility);
    expect(restored.soil.active).toEqual(original.soil.active);
    expect(restored.regionSizes).toEqual(original.regionSizes);
    expect(restored.shoreTiles).toEqual(original.shoreTiles);
    expect(restored.heightAt(x, y)).toBe(original.heightAt(x, y));
    expect(restored.effectiveFertilityAt(x, y)).toBe(original.effectiveFertilityAt(x, y));
    expect(JSON.stringify(toWorldTerrainRecord(restored))).toBe(JSON.stringify(wire));

    const soilTile = [...restored.soil.active][0]!;
    restored.soil.recover(2);
    original.soil.recover(2);
    expect(restored.soil.organic[soilTile]).toBe(original.soil.organic[soilTile]);
    restored.dig(x, y, 0.01);
    original.dig(x, y, 0.01);
    expect(toWorldTerrainRecord(restored)).toEqual(toWorldTerrainRecord(original));

    const bridge = Array.from({ length: restored.width * restored.height }, (_, i) => i).find(i => {
      const xx = i % restored.width;
      const yy = Math.floor(i / restored.width);
      return restored.isWalkable(xx, yy) && restored.isWalkable(xx - 1, yy) && restored.isWalkable(xx + 1, yy) &&
        restored.isWalkable(xx, yy - 1) && restored.isWalkable(xx, yy + 1);
    });
    expect(bridge).toBeDefined();
    const bx = bridge! % restored.width;
    const by = Math.floor(bridge! / restored.width);
    restored.setWalkable(bx, by, false);
    original.setWalkable(bx, by, false);
    expect(auditRegions(restored).ok).toBe(true);
    restored.setWalkable(bx, by, true);
    original.setWalkable(bx, by, true);
    expect(auditRegions(restored).ok).toBe(true);
    expect(toWorldTerrainRecord(restored)).toEqual(toWorldTerrainRecord(original));
  });

  it('keeps the record, hydrated world, and source world independent', () => {
    const original = world();
    const record = toWorldTerrainRecord(original);
    const before = original.elevation[0];
    record.tiles.elevation[0] = 123;
    expect(original.elevation[0]).toBe(before);
    const json = JSON.parse(JSON.stringify(toWorldTerrainRecord(original)));
    const restored = fromWorldTerrainRecord(json);
    restored.offset[0] = 9;
    restored.soil.till(0);
    expect(original.offset[0]).toBe(0);
    expect(original.soil.active.has(0)).toBe(false);
    expect(json.tiles.offset[0]).toBe(0);
    expect(json.soil.active).toEqual([]);
  });

  it('rejects malformed versions, arrays, indexes, region ledgers and unknown fields', () => {
    const valid = JSON.parse(JSON.stringify(toWorldTerrainRecord(world())));
    expect(() => fromWorldTerrainRecord({ ...valid, version: 2 })).toThrow(/v1/);
    expect(() => fromWorldTerrainRecord({ ...valid, extra: true })).toThrow(/unknown or missing/);
    const incompleteConfig = structuredClone(valid);
    delete incompleteConfig.config.pitDepth;
    expect(() => fromWorldTerrainRecord(incompleteConfig)).toThrow(/unknown or missing/);
    const unknownConfig = structuredClone(valid);
    unknownConfig.config.futureField = 1;
    expect(() => fromWorldTerrainRecord(unknownConfig)).toThrow(/unknown or missing/);
    const mismatchedConfig = structuredClone(valid);
    mismatchedConfig.config.width++;
    expect(() => fromWorldTerrainRecord(mismatchedConfig)).toThrow(/dimensions disagree/);
    const unsafeConfig = structuredClone(valid);
    unsafeConfig.config.slopeCost = -1;
    expect(() => fromWorldTerrainRecord(unsafeConfig)).toThrow(/range slopeCost/);
    const invalidWadingDepth = structuredClone(valid);
    invalidWadingDepth.config.wadeDepth = invalidWadingDepth.config.swimDepth;
    expect(() => fromWorldTerrainRecord(invalidWadingDepth)).toThrow(/water depth thresholds/);
    const invalidWetDuration = structuredClone(valid);
    invalidWetDuration.config.wetTicks = 0.5;
    expect(() => fromWorldTerrainRecord(invalidWetDuration)).toThrow(/range wetTicks/);
    const invalidDrownThreshold = structuredClone(valid);
    invalidDrownThreshold.config.drownAt = 101;
    expect(() => fromWorldTerrainRecord(invalidDrownThreshold)).toThrow(/range drownAt/);
    const shortArray = structuredClone(valid);
    shortArray.tiles.moisture.pop();
    expect(() => fromWorldTerrainRecord(shortArray)).toThrow(/moisture array/);
    const sparseArray = structuredClone(valid);
    delete sparseArray.tiles.moisture[0];
    expect(() => fromWorldTerrainRecord(sparseArray)).toThrow(/moisture array/);
    const inexactFloat = structuredClone(valid);
    inexactFloat.tiles.elevation[0] = 0.1;
    expect(() => fromWorldTerrainRecord(inexactFloat)).toThrow(/elevation array/);
    const invalidBiome = structuredClone(valid);
    invalidBiome.tiles.biome[0] = 255;
    expect(() => fromWorldTerrainRecord(invalidBiome)).toThrow(/biome array/);
    const overflowRegion = structuredClone(valid);
    overflowRegion.tiles.region[0] = 2_147_483_648;
    expect(() => fromWorldTerrainRecord(overflowRegion)).toThrow(/region array/);
    const regionWithoutWalkability = structuredClone(valid);
    const landTile = regionWithoutWalkability.tiles.walkable.findIndex((value: number) => value === 1);
    regionWithoutWalkability.tiles.walkable[landTile] = 0;
    expect(() => fromWorldTerrainRecord(regionWithoutWalkability)).toThrow(/walkability and region labels/);
    const disconnectedLabel = structuredClone(valid);
    const connectedTile = disconnectedLabel.tiles.walkable.findIndex((value: number) => value === 1);
    const otherTile = disconnectedLabel.tiles.walkable.findIndex((value: number, i: number) => value === 1 && Math.abs(i - connectedTile) > 3);
    const oldLabel = disconnectedLabel.tiles.region[otherTile];
    const newLabel = disconnectedLabel.nextRegionId;
    disconnectedLabel.tiles.region[otherTile] = newLabel;
    const oldSize = disconnectedLabel.regionSizes.find(([id]: [number, number]) => id === oldLabel);
    oldSize[1]--;
    disconnectedLabel.regionSizes.push([newLabel, 1]);
    disconnectedLabel.nextRegionId++;
    expect(() => fromWorldTerrainRecord(disconnectedLabel)).toThrow(/split a connected component/);
    const mergedIslands = structuredClone(valid);
    const count = mergedIslands.width * mergedIslands.height;
    mergedIslands.tiles.walkable = Array(count).fill(0);
    mergedIslands.tiles.region = Array(count).fill(-1);
    const islandA = mergedIslands.width * 2 + 2;
    const islandB = mergedIslands.width * 10 + 10;
    mergedIslands.tiles.biome[islandA] = 1;
    mergedIslands.tiles.biome[islandB] = 1;
    mergedIslands.tiles.walkable[islandA] = 1;
    mergedIslands.tiles.walkable[islandB] = 1;
    mergedIslands.tiles.region[islandA] = 0;
    mergedIslands.tiles.region[islandB] = 0;
    mergedIslands.regionSizes = [[0, 2]];
    mergedIslands.nextRegionId = 1;
    expect(() => fromWorldTerrainRecord(mergedIslands)).toThrow(/merge disconnected components/);
    const invalidActive = structuredClone(valid);
    invalidActive.soil.active = [valid.width * valid.height];
    expect(() => fromWorldTerrainRecord(invalidActive)).toThrow(/active soil tiles/);
    const inconsistentRegions = structuredClone(valid);
    inconsistentRegions.regionSizes[0][1]++;
    expect(() => fromWorldTerrainRecord(inconsistentRegions)).toThrow(/region labels and sizes disagree/);
    const duplicateShore = structuredClone(valid);
    duplicateShore.shoreTiles.push({ ...duplicateShore.shoreTiles[0] });
    expect(() => fromWorldTerrainRecord(duplicateShore)).toThrow(/duplicate shore tile/);
  });

  it('does not consume the world RNG and rejects broken source ownership/aliases', () => {
    const rng = new RNG('phase28-no-extra-draws');
    const source = world(rng);
    const before = rng.snapshot();
    const record = toWorldTerrainRecord(source);
    fromWorldTerrainRecord(JSON.parse(JSON.stringify(record)));
    expect(rng.snapshot()).toEqual(before);

    (source.soil as unknown as { fertility: Float32Array }).fertility = new Float32Array(source.fertility.length);
    expect(() => toWorldTerrainRecord(source)).toThrow(/alias diverges/);
    const cleanSource = world();
    Object.defineProperty(cleanSource, 'futureCache', { value: [], enumerable: true });
    expect(() => toWorldTerrainRecord(cleanSource)).toThrow(/state shape changed/);
  });
});
