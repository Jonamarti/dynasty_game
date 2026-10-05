import { describe, expect, it } from 'vitest';
import { toWorldStateRecord, fromWorldStateRecord } from '../persistence/WorldStateRecords.ts';
import { earthWorldGeography, randomWorldGeography } from '../world/WorldGeography.ts';
import type { LoadedWorldMap } from '../world/WorldAtlas.ts';
import { WorldState } from '../world/WorldState.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

const config = {
  seed: 'world-root-record', population: { bands: 0 }, time: { ticksPerDay: 6 },
  world: { width: 20, height: 16, treeDensity: 0, berryBushes: 0, flintOutcrops: 0,
    deadwood: 0, reedBeds: 0, clayBanks: 0, fishingSpots: 0,
    wildGrainPatches: 0, gameHerds: 0, predators: 0 },
};

function earth() {
  const loaded: LoadedWorldMap = {
    entry: { id: 'test-world', title: 'Test world', file: 'test-world.bin', seaLevelMeters: -60, recommended: true },
    raster: { width: 4, height: 3,
      elevationMeters: Int16Array.from([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]),
      koppen: Uint8Array.from({ length: 12 }, (_, i) => i + 1),
      features: Uint32Array.from({ length: 12 }, (_, i) => i), seaLevelMeters: -60 },
  };
  return earthWorldGeography(loaded, 10);
}

describe('WorldState JSON envelope', () => {
  it('retains random map seed, dimensions, placement, and checkpoint continuation', () => {
    const geography = randomWorldGeography('retained-map-seed', { regionsWide: 8, regionsHigh: 4 });
    const start = { geography, start: { x: 23, y: 15 }, comarcasWide: 2.5, comarcasHigh: 3 };
    const original = new WorldState(config, start);
    start.start.x = 24;
    start.comarcasWide = 9;
    const record = JSON.parse(JSON.stringify(toWorldStateRecord(original)));
    expect(record.geography).toEqual({ kind: 'random', seed: 'retained-map-seed', regionsWide: 8, regionsHigh: 4 });
    const restored = fromWorldStateRecord(record);
    expect(restored.initialGeographicStart).toMatchObject({ start: { x: 23, y: 15 }, comarcasWide: 2.5, comarcasHigh: 3 });
    expect(restored.geography.profileAt(23, 15)).toEqual(original.geography.profileAt(23, 15));
    expect(Object.isFrozen(original.initialGeographicStart)).toBe(true);
    expect(Object.isFrozen(original.initialGeographicStart?.start)).toBe(true);
    for (let i = 0; i < 8; i++) { original.current.step(); restored.current.step(); }
    expect(toCheckpointRecord(restored.current)).toEqual(toCheckpointRecord(original.current));
  });

  it('embeds an independent Earth raster and restores the original map identity offline', () => {
    const geography = earth();
    const original = new WorldState(config, { geography, start: { x: 15, y: 12 } });
    const record = toWorldStateRecord(original);
    expect(record.geography.kind).toBe('earth');
    if (record.geography.kind !== 'earth') throw new Error('expected Earth record');
    expect(record.geography.raster.elevationMeters).toHaveLength(12);
    const restored = fromWorldStateRecord(record);
    expect(restored.geography.kind).toBe('earth');
    expect(restored.geography.profileAt(15, 12)).toEqual(original.geography.profileAt(15, 12));
    record.geography.entry.title = 'mutated input';
    expect(restored.geography.kind === 'earth' && restored.geography.entry.title).toBe('Test world');
    record.geography.raster.elevationMeters[0] = -999;
    expect(restored.geography.profileAt(0, 0)).toEqual(original.geography.profileAt(0, 0));
  });

  it('keeps classic checkpoints compatible and rejects malformed or mismatched envelopes', () => {
    const classic = new WorldState(config);
    const record = JSON.parse(JSON.stringify(toWorldStateRecord(classic)));
    const restored = fromWorldStateRecord(record);
    expect(restored.geography.kind).toBe('legacyIsland');
    expect(toCheckpointRecord(restored.current)).toEqual(toCheckpointRecord(classic.current));
    expect(() => fromWorldStateRecord({ ...record, unexpected: true })).toThrow(/unknown or missing fields/i);
    expect(() => fromWorldStateRecord({ ...record, start: { x: 1, y: 1, comarcasWide: 1, comarcasHigh: 1 } }))
      .toThrow(/legacy island cannot have macro placement/i);
    const wrongSea = JSON.parse(JSON.stringify(toWorldStateRecord(new WorldState(config,
      { geography: earth(), start: { x: 15, y: 12 } }))));
    wrongSea.geography.entry.seaLevelMeters = 0;
    expect(() => fromWorldStateRecord(wrongSea)).toThrow(/sea level mismatch/i);

    const geographic = JSON.parse(JSON.stringify(toWorldStateRecord(new WorldState(config,
      { geography: earth(), start: { x: 15, y: 12 } }))));
    delete geographic.geography.raster.koppen[3];
    expect(() => fromWorldStateRecord(geographic)).toThrow(/koppen\[3\]/i);
    const outOfRange = JSON.parse(JSON.stringify(toWorldStateRecord(new WorldState(config,
      { geography: earth(), start: { x: 15, y: 12 } }))));
    outOfRange.geography.raster.elevationMeters[0] = -32769;
    expect(() => fromWorldStateRecord(outOfRange)).toThrow(/elevationMeters\[0\]/i);

    const populated = new WorldState({ seed: 'world-root-populated', population: { bands: 1 } });
    const attached = JSON.parse(JSON.stringify(toWorldStateRecord(populated)));
    attached.geography = { kind: 'random', seed: 'other-map', regionsWide: 8, regionsHigh: 4 };
    attached.start = { x: 10, y: 10, comarcasWide: 1, comarcasHigh: 1 };
    expect(() => fromWorldStateRecord(attached)).toThrow(/populated simulation before freshwater support/i);
    const map = randomWorldGeography('other-map', { regionsWide: 8, regionsHigh: 4 });
    expect(() => WorldState.fromRestored(populated.current, map,
      { geography: map, start: { x: 10, y: 10 } }))
      .toThrow(/populated simulation before freshwater support/i);
    expect(() => WorldState.fromRestored(classic.current, map, null))
      .toThrow(/geography must match its starting placement/i);
  });
});
