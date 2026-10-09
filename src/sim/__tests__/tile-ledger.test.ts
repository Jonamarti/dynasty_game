import { describe, expect, it } from 'vitest';
import { WorldState } from '../world/WorldState.ts';
import { earthWorldGeography, randomWorldGeography, type WorldGeography } from '../world/WorldGeography.ts';
import type { LoadedWorldMap } from '../world/WorldAtlas.ts';
import { TileLedger } from '../persistence/TileLedger.ts';
import { toWorldTerrainRecord } from '../persistence/WorldRecords.ts';
import { toWorldObjectRecord } from '../persistence/WorldObjectRecords.ts';
import { Corpse } from '../entities/Corpse.ts';
import { ItemPile } from '../entities/ItemPile.ts';
import { BUILDINGS, Building } from '../entities/Building.ts';

function earth() {
  const loaded: LoadedWorldMap = {
    entry: { id: 'tile-ledger-earth', title: 'Tile ledger', file: 'tile-ledger-earth.bin', seaLevelMeters: 0, recommended: false },
    raster: { width: 4, height: 2, elevationMeters: Int16Array.from({ length: 8 }, () => 120),
      koppen: Uint8Array.from({ length: 8 }, () => 4), features: Uint32Array.from({ length: 8 }, () => 0), seaLevelMeters: 0 },
  };
  return earthWorldGeography(loaded, 1);
}

function state(geography: WorldGeography = earth(), start = { x: 1.5, y: 0.5 }, bands = 0) {
  return new WorldState({ seed: 'tile-ledger', population: { bands }, time: { ticksPerDay: 6 }, world: {
    width: 24, height: 18, chunkSize: 6, treeDensity: 0.04, berryBushes: 6,
    flintOutcrops: 0, deadwood: 0, reedBeds: 0, clayBanks: 0, fishingSpots: 0,
    wildGrainPatches: 0, gameHerds: 0, predators: 0,
  } }, { geography, start, peoples: false });
}

const walkableIndex = (world: WorldState['current']['world']) => world.walkable.findIndex(tile => tile === 1);

describe('TileLedger', () => {
  it('roundtrips terrain, soil and changed objects through a detached JSON snapshot', () => {
    const source = state();
    const sim = source.current;
    const tile = walkableIndex(sim.world);
    sim.world.soil.till(tile);
    sim.world.soil.enrich(tile, 0.04);
    sim.world.dig(tile % sim.world.width, Math.floor(tile / sim.world.width), 0.025);
    const pile = new ItemPile(4, 4, null, sim.time.tick, sim.ids);
    pile.contents.add('bone', 3);
    sim.piles.push(pile);
    sim.pilesById.set(pile.id, pile);

    const ledger = new TileLedger();
    const entry = ledger.capture(source);
    expect(entry.identity).toMatchObject({ kind: 'earth', mapId: 'tile-ledger-earth', cx: 1, cy: 0 });
    const json = JSON.parse(JSON.stringify(ledger.toRecord()));
    const restored = TileLedger.fromRecord(json);
    const identity = entry.identity;
    const hydrated = restored.hydrate(identity, { tick: sim.time.tick, day: sim.time.day }, sim.peopleById);

    expect(toWorldTerrainRecord(hydrated.world)).toEqual(entry.terrain);
    expect(hydrated.objects.pilesById.get(pile.id)?.contents.count('bone')).toBe(3);
    expect(hydrated.world).not.toBe(sim.world);
    hydrated.world.soil.recover(2);
    expect(toWorldTerrainRecord(sim.world)).toEqual(entry.terrain);
    const detachedRead = restored.at(identity)!;
    detachedRead.terrain.tiles.offset[0] = 999;
    expect(restored.at(identity)!.terrain.tiles.offset[0]).toBe(entry.terrain.tiles.offset[0]);
  });

  it('binds corpses to canonical retained people and returns fresh object graphs', () => {
    const source = state(earth(), { x: 1.5, y: 0.5 }, 1);
    const sim = source.current;
    const person = sim.people[0]!;
    person.alive = false;
    const corpse = new Corpse(person, sim.time.tick, false, sim.ids);
    sim.corpses.push(corpse);
    sim.corpsesById.set(corpse.id, corpse);

    const ledger = new TileLedger();
    const entry = ledger.capture(source);
    const fromJson = TileLedger.fromRecord(JSON.parse(JSON.stringify(ledger.toRecord())));
    const hydrated = fromJson.hydrate(entry.identity, { tick: sim.time.tick, day: sim.time.day }, sim.peopleById);
    expect(hydrated.objects.corpsesById.get(corpse.id)?.person).toBe(person);
    expect(hydrated.objects.corpsesById.get(corpse.id)).not.toBe(corpse);
    expect(JSON.stringify(toWorldObjectRecord(sim).graph)).toBe(JSON.stringify(entry.objects.graph));
  });

  it('keys entries by geography and comarca and advances each revision monotonically', () => {
    const geography = randomWorldGeography('other-world', { regionsWide: 4, regionsHigh: 2 });
    const first = state(geography, { x: 1.5, y: 1.5 });
    const ledger = new TileLedger();
    const initial = ledger.capture(first);
    const second = state(geography, { x: 2.5, y: 1.5 });
    const adjacent = ledger.capture(second);
    expect(ledger.toRecord().entries).toHaveLength(2);
    expect(ledger.at(initial.identity)?.identity).toEqual(initial.identity);
    expect(adjacent.identity).toMatchObject({ kind: 'random', seed: 'other-world', cx: 2, cy: 1 });

    first.current.step();
    const later = ledger.capture(first);
    expect(later.revision).toBe(initial.revision + 1);
    expect(() => ledger.update({ ...initial, revision: later.revision + 1 })).toThrow(/backwards in time/);
  });

  it('rejects wrong dates, other geographies, duplicate identities and partial comarca windows', () => {
    const source = state();
    const ledger = new TileLedger();
    const entry = ledger.capture(source);
    expect(() => ledger.hydrate(entry.identity, { tick: 1, day: 0 }, source.current.peopleById)).toThrow(/date/);
    expect(ledger.at({ ...entry.identity, cx: 2 })).toBeNull();
    const duplicate = JSON.parse(JSON.stringify(ledger.toRecord()));
    duplicate.entries.push(duplicate.entries[0]);
    expect(() => TileLedger.fromRecord(duplicate)).toThrow(/duplicate comarca/);
    expect(() => new TileLedger().capture(state(earth(), { x: 2, y: 1 }))).toThrow(/aligned/);
    expect(() => new TileLedger().capture(state(randomWorldGeography('window'), { x: 1.5, y: 1.5 }, 0))).not.toThrow();
  });

  it('preserves banked building progress and rejects malformed indexes or progress', () => {
    const source = state(earth(), { x: 1.5, y: 0.5 }, 1);
    const sim = source.current;
    const building = new Building(BUILDINGS.storage_pit!, 8, 8, sim.bands[0]!.id, sim.ids);
    building.progress = 42;
    sim.buildings.push(building);
    sim.buildingsById.set(building.id, building);
    const ledger = new TileLedger();
    const entry = ledger.capture(source);
    const hydrated = ledger.hydrate(entry.identity, { tick: sim.time.tick, day: sim.time.day }, sim.peopleById);
    expect(hydrated.objects.buildingsById.get(building.id)?.progress).toBe(42);

    const badIndex = structuredClone(entry) as any;
    const graph = badIndex.objects.graph;
    const rootRef = graph.root.ref;
    const indexRef = graph.nodes[rootRef].fields.find(([name]: [string]) => name === 'buildingsById')?.[1].ref;
    graph.nodes[indexRef].entries.push(structuredClone(graph.nodes[indexRef].entries[0]));
    expect(() => new TileLedger().update(badIndex)).toThrow(/duplicate map key/);

    const badProgress = structuredClone(entry) as any;
    const progressGraph = badProgress.objects.graph;
    const progressRoot = progressGraph.nodes[progressGraph.root.ref];
    const listRef = progressRoot.fields.find(([name]: [string]) => name === 'buildings')?.[1].ref;
    const buildingRef = progressGraph.nodes[listRef].values[0].ref;
    const progress = progressGraph.nodes[buildingRef].fields.find(([name]: [string]) => name === 'progress');
    progress[1] = Number.NaN;
    expect(() => new TileLedger().update(badProgress)).toThrow(/invalid building/);
  });});
