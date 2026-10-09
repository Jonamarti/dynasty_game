import { describe, expect, it } from 'vitest';
import { toWorldStateRecord, fromWorldStateRecord } from '../persistence/WorldStateRecords.ts';
import { earthWorldGeography, randomWorldGeography } from '../world/WorldGeography.ts';
import type { LoadedWorldMap } from '../world/WorldAtlas.ts';
import { WorldState } from '../world/WorldState.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { findGlobeStart } from '../world/WorldTerrain.ts';
import { comarcaIdentityAt } from '../persistence/TileLedger.ts';


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

  it('retains a detached comarca book through root save/load and migrates older roots to an empty book', () => {
    const geography = randomWorldGeography('ledger-root', { regionsWide: 8, regionsHigh: 4 });
    const state = new WorldState(config, { geography, start: { x: 23.5, y: 15.5 }, peoples: false });
    const entry = state.tileLedger.capture(state);
    const record = JSON.parse(JSON.stringify(toWorldStateRecord(state)));
    const restored = fromWorldStateRecord(record);
    expect(restored.tileLedger.toRecord()).toEqual(state.tileLedger.toRecord());
    expect(restored.frontier.active).toEqual(record.frontier.active);
    record.tileLedger.entries[0].terrain.tiles.fertility[0] = 0;
    expect(restored.tileLedger.at(entry.identity)).toEqual(entry);
    for (const version of [1, 2, 3, 4]) {
      const old = JSON.parse(JSON.stringify(toWorldStateRecord(state)));
      old.version = version;
      if (version < 4) delete old.frontier;
      delete old.traffic;
      if (version < 3) delete old.tileLedger;
      if (version === 1) delete old.peoples;
      const migrated = fromWorldStateRecord(old);
      expect(migrated.traffic.partyRecords).toHaveLength(0);
      expect(migrated.tileLedger.toRecord().entries).toHaveLength(version >= 3 ? 1 : 0);
      expect(toCheckpointRecord(migrated.current)).toEqual(toCheckpointRecord(state.current));
    }
  });

  it('saves and resumes root-owned traffic from a mid-journey v5 checkpoint', () => {
    const { state, actorId, destination } = trafficRootFixture();
    const first = JSON.parse(JSON.stringify(toWorldStateRecord(state)));
    expect(first.version).toBe(5);
    expect(first.traffic.parties).toHaveLength(1);
    expect(first.traffic.parties[0].lastAdvancedTick).toBe(state.current.time.tick);
    expect(first.traffic.parties[0].arrivalTick).toBeGreaterThan(state.current.time.tick);
    expect(first.traffic.parties[0].party.roster.activePersonIds).toContain(actorId);

    const resumed = fromWorldStateRecord(first);
    expect(toWorldStateRecord(resumed)).toEqual(toWorldStateRecord(state));
    for (let tick = 0; tick < 28; tick++) {
      state.current.step(); state.advancePeoples();
      resumed.current.step(); resumed.advancePeoples();
      expect(toWorldStateRecord(resumed)).toEqual(toWorldStateRecord(state));
    }
    expect(resumed.traffic.partyRecords[0]?.party).toBeNull();
    const destinationOwner = resumed.frontier.parkedAt(comarcaIdentityAt(resumed.geography, destination.cx, destination.cy));
    expect(destinationOwner?.roster.activePersonIds).toContain(actorId);
  }, 30_000);

  it('rejects v5 traffic with duplicate ownership, a future clock, a foreign map, or an allocator below transit IDs', () => {
    const { record, actorId } = trafficRootFixture();
    const activeId = record.simulation.roster.activePersonIds.find((id: number) => id !== actorId)!;

    const duplicate = JSON.parse(JSON.stringify(record));
    duplicate.traffic.parties[0].party.roster.activePersonIds.push(activeId);
    expect(() => fromWorldStateRecord(duplicate)).toThrow(/two owners|active person reference|checkpoint ownership/i);

    const futureClock = JSON.parse(JSON.stringify(record));
    futureClock.traffic.tick = record.traffic.tick + 1;
    expect(() => fromWorldStateRecord(futureClock)).toThrow(/traffic.*clock|clock.*traffic|root.*date/i);

    const futureParty = JSON.parse(JSON.stringify(record));
    futureParty.traffic.parties[0].lastAdvancedTick = record.simulation.lastAdvancedTick + 1;
    expect(() => fromWorldStateRecord(futureParty)).toThrow(/traffic.*date|traffic.*clock|party.*tick|lastAdvanced/i);

    const foreignMap = JSON.parse(JSON.stringify(record));
    foreignMap.traffic.parties[0].destination.seed = 'foreign-map';
    expect(() => fromWorldStateRecord(foreignMap)).toThrow(/traffic.*map|map.*traffic|geography|identity/i);

    const reusedAllocator = JSON.parse(JSON.stringify(record));
    reusedAllocator.simulation.ids.next.person = actorId;
    expect(() => fromWorldStateRecord(reusedAllocator)).toThrow(/traffic.*id|allocator|allocation|person.*id/i);
  }, 30_000);

  it('rejects a root book from another geography or a future local date', () => {
    const geography = randomWorldGeography('ledger-root-check', { regionsWide: 8, regionsHigh: 4 });
    const state = new WorldState(config, { geography, start: { x: 23.5, y: 15.5 }, peoples: false });
    state.tileLedger.capture(state);
    const record = JSON.parse(JSON.stringify(toWorldStateRecord(state)));
    record.tileLedger.entries[0].identity.seed = 'alien';
    expect(() => fromWorldStateRecord(record)).toThrow(/ledger geography/i);
    const future = JSON.parse(JSON.stringify(toWorldStateRecord(state)));
    future.tileLedger.entries[0].lastAdvancedTick = 1;
    future.tileLedger.entries[0].objects.lastAdvancedTick = 1;
    expect(() => fromWorldStateRecord(future)).toThrow(/ledger date/i);
  });

});

function trafficRootFixture() {
  const seed = 'root-v5-traffic-midjourney';
  const geography = randomWorldGeography(seed, { regionsWide: 24, regionsHigh: 12 });
  const start = findGlobeStart(geography, 4)!;
  const origin = { cx: Math.floor(start.x), cy: Math.floor(start.y) };
  const state = new WorldState({
    seed, population: { bands: 1, peoplePerBand: 6 }, time: { ticksPerDay: 8 },
    world: { width: 32, height: 32 },
  }, { geography, start: { x: origin.cx + .5, y: origin.cy + .5 }, comarcasWide: 1, comarcasHigh: 1, peoples: false });
  const width = geography.map.width;
  const target = [[origin.cx + 1, origin.cy], [origin.cx - 1, origin.cy], [origin.cx, origin.cy + 1], [origin.cx, origin.cy - 1]]
    .map(([cx, cy]) => ({ cx: (cx! + width) % width, cy: cy! }))
    .find(point => point.cy >= 0 && point.cy < geography.map.height && geography.profileAt(point.cx, point.cy).biome !== 'ocean')!;
  const actor = [...state.current.people].sort((a, b) => b.id - a.id).find(person => person.alive && !person.isPlayer)!;
  const destination = comarcaIdentityAt(geography, target.cx, target.cy);
  state.traffic.dispatchParty(state, {
    kind: 'caravan', actorId: actor.id, travellerIds: [actor.id], destination,
    destinationBandId: actor.bandId + 1, durationTicks: 24,
  });
  for (let i = 0; i < 3; i++) { state.current.step(); state.advancePeoples(); }
  const record = JSON.parse(JSON.stringify(toWorldStateRecord(state)));
  return { state, destination: target, actorId: actor.id, record };
}
