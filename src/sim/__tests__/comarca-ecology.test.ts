import { describe, expect, it } from 'vitest';
import { WorldState } from '../world/WorldState.ts';
import { earthWorldGeography, type WorldGeography } from '../world/WorldGeography.ts';
import type { LoadedWorldMap } from '../world/WorldAtlas.ts';
import { TileLedger } from '../persistence/TileLedger.ts';
import { ComarcaEcology } from '../world/ComarcaEcology.ts';
import { BUILDINGS, Building } from '../entities/Building.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { Tree } from '../entities/Tree.ts';
import { Animal } from '../entities/Animal.ts';
import { RNG } from '../core/RNG.ts';

function geography(): WorldGeography {
  const loaded: LoadedWorldMap = {
    entry: { id: 'ecology-test', title: 'Ecology test', file: 'ecology-test.bin', seaLevelMeters: 0, recommended: false },
    raster: { width: 4, height: 2, elevationMeters: Int16Array.from({ length: 8 }, () => 120),
      koppen: Uint8Array.from({ length: 8 }, () => 4), features: Uint32Array.from({ length: 8 }, () => 0), seaLevelMeters: 0 },
  };
  return earthWorldGeography(loaded, 1);
}

function initial() {
  const geo = geography();
  const state = new WorldState({ seed: 'ecology-test', population: { bands: 0 }, time: { ticksPerDay: 6, daysPerSeason: 2 }, world: {
    width: 24, height: 18, chunkSize: 6, treeDensity: 0, berryBushes: 0,
    flintOutcrops: 0, deadwood: 0, reedBeds: 0, clayBanks: 0, fishingSpots: 0,
    wildGrainPatches: 0, gameHerds: 0, predators: 0,
  } }, { geography: geo, start: { x: 1.5, y: 0.5 }, peoples: false });
  const sim = state.current;
  const ledger = new TileLedger();
  const entry = ledger.capture(state);
  return { geo, sim, state, entry };
}

function berry(sim: ReturnType<typeof initial>['sim'], amount: number) {
  const node = new ResourceNode('berries', 5, 5, new RNG(22), sim.ids);
  node.species = 'rosehip'; node.amount = amount;
  sim.nodes.push(node); sim.nodesById.set(node.id, node);
  return node;
}

describe('ComarcaEcology', () => {
  it('advances physical stocks, crops and forest without restoring depleted nodes or felled trees', () => {
    const { geo, sim, state } = initial();
    const cut = new Tree('oak', 10, 10, 100, 8, sim.ids); cut.standing = false;
    sim.trees.push(cut); sim.treesById.set(cut.id, cut);
    const bush = berry(sim, 0);
    const field = new Building(BUILDINGS.field!, 6, 6, 0, sim.ids);
    field.complete = true; field.durability = field.def.workTicks;
    field.crop!.sow(sim.time.day);
    sim.buildings.push(field); sim.buildingsById.set(field.id, field);
    const entry = new TileLedger().capture(state);
    const ecology = ComarcaEcology.start(entry, { time: sim.time.snapshot().config, spoilRate: 0,
      snowDepth: 0, ids: sim.ids.snapshot() });
    const result = ecology.advanceTo(24, geo);
    const hydrated = TileLedger.fromRecord({ recordType: 'TileLedger', version: 1, entries: [result.entry] })
      .hydrate(result.entry.identity, { tick: 24, day: 9 }, new Map());
    expect(hydrated.objects.treesById.has(cut.id)).toBe(false);
    expect(hydrated.objects.buildingsById.get(field.id)?.crop?.growth).toBeGreaterThan(0);
    expect(hydrated.objects.nodesById.get(bush.id)?.amount).toBeGreaterThanOrEqual(0);
    expect(hydrated.objects.nodesById.get(bush.id)?.amount).toBeLessThan(bush.def.maxAmount);
    expect(result.entry.lastAdvancedTick).toBe(24);
  });

  it('is save/reload invariant across divided advances and profiles current physical stocks', () => {
    const { geo, sim, state } = initial();
    berry(sim, 3);
    const entry = new TileLedger().capture(state);
    const ecology = ComarcaEcology.start(entry, { time: sim.time.snapshot().config, spoilRate: 0,
      snowDepth: 0, ids: sim.ids.snapshot() });
    const startRecord = ecology.toRecord();
    const one = ComarcaEcology.fromRecord(JSON.parse(JSON.stringify(startRecord))).advanceTo(120, geo);
    const part = ComarcaEcology.fromRecord(JSON.parse(JSON.stringify(startRecord))).advanceTo(45, geo);
    const two = ComarcaEcology.fromRecord(JSON.parse(JSON.stringify(part.record))).advanceTo(120, geo);
    expect(two.entry.terrain).toEqual(one.entry.terrain);
    expect(two.entry.objects).toEqual(one.entry.objects);
    expect(two.record.forestRng).toEqual(one.record.forestRng);
    expect(two.record.wildlifeRng).toEqual(one.record.wildlifeRng);
    expect(two.record.ecologyRng).toEqual(one.record.ecologyRng);
    expect(two.record.ids).toEqual(one.record.ids);
    expect(two.profile.physical.berryStock).toBeGreaterThan(0);
    expect(two.profile.physical.berryStock).toBeLessThan(14);
    expect(two.profile.nodes.bushes).toBeLessThanOrEqual(1);
  });

  it('advances wildlife passively on the per-ID stagger and preserves birth carry across reload', () => {
    const { geo, sim, state } = initial();
    const start = sim.world.walkable.findIndex(tile => tile === 1);
    const x = start % sim.world.width, y = Math.floor(start / sim.world.width);
    const target = sim.world.findWalkableNear(x + 7, y + 4, 4)!;
    const animal = new Animal('deer', x, y, 44, new RNG(8), sim.ids);
    animal.alarmedUntil = 100; animal.fleeX = target.x; animal.fleeY = target.y;
    const mate = new Animal('deer', x + 1, y, 44, new RNG(9), sim.ids);
    sim.animals.push(animal, mate); sim.animalsById.set(animal.id, animal); sim.animalsById.set(mate.id, mate);
    const entry = new TileLedger().capture(state);
    const ecology = ComarcaEcology.start(entry, { time: sim.time.snapshot().config, spoilRate: 0,
      snowDepth: 0, ids: sim.ids.snapshot() });
    const startRecord = ecology.toRecord();
    const whole = ComarcaEcology.fromRecord(JSON.parse(JSON.stringify(startRecord))).advanceTo(120, geo);
    const part = ComarcaEcology.fromRecord(JSON.parse(JSON.stringify(startRecord))).advanceTo(18, geo);
    expect(part.record.wildlifeOwed.some(([, carry]) => carry > 0)).toBe(true);
    const resumed = ComarcaEcology.fromRecord(JSON.parse(JSON.stringify(part.record))).advanceTo(120, geo);
    expect(resumed.entry.objects).toEqual(whole.entry.objects);
    const saved = TileLedger.fromRecord({ recordType: 'TileLedger', version: 1, entries: [whole.entry] })
      .hydrate(whole.entry.identity, { tick: 120, day: whole.entry.lastAdvancedDay }, new Map());
    const moved = saved.objects.animalsById.get(animal.id)!;
    expect(Math.hypot(moved.x - x, moved.y - y)).toBeGreaterThan(0);
  });
  it('applies the configured spoil sweep and ruins completed abandoned structures over 60 years', () => {
    const { geo, sim, state } = initial();
    const hut = new Building(BUILDINGS.mud_hut!, 8, 8, 99, sim.ids);
    hut.complete = true; hut.durability = hut.def.workTicks;
    hut.store.add('berries', 20);
    sim.buildings.push(hut); sim.buildingsById.set(hut.id, hut);
    const entry = new TileLedger().capture(state);
    const ecology = ComarcaEcology.start(entry, { time: sim.time.snapshot().config, spoilRate: 10,
      snowDepth: 0, ids: sim.ids.snapshot() });
    const result = ecology.advanceTo(6 * 8 * 61, geo);
    const restored = TileLedger.fromRecord({ recordType: 'TileLedger', version: 1, entries: [result.entry] });
    const hydrated = restored.hydrate(result.entry.identity,
      { tick: 6 * 8 * 61, day: result.entry.lastAdvancedDay }, new Map());
    expect(hydrated.objects.buildingsById.get(hut.id)?.ruined).toBe(true);
    expect(hydrated.objects.buildingsById.get(hut.id)?.store.count('berries')).toBe(0);
  });
});







