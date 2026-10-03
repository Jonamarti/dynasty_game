import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { BUILDINGS, Building } from '../entities/Building.ts';
import { ItemPile } from '../entities/ItemPile.ts';
import { Corpse } from '../entities/Corpse.ts';
import { Inscription, INSCRIPTIONS } from '../entities/Inscription.ts';
import { fromWorldObjectRecord, toWorldObjectRecord } from '../persistence/WorldObjectRecords.ts';

function world(): Simulation {
  return new Simulation({ seed: 'phase28-world-objects', world: { width: 48, height: 48, berryBushes: 40,
    flintOutcrops: 10, deadwood: 20, gameHerds: 4 }, population: { bands: 2, peoplePerBand: 4 } });
}
function addBuilding(sim: Simulation, defId: string, x: number, y: number): Building {
  const owner = sim.bands[0]!.id;
  const building = new Building(BUILDINGS[defId]!, x, y, owner, sim.ids);
  sim.buildings.push(building);
  sim.buildingsById.set(building.id, building);
  return building;
}

describe('WorldObjectRecord', () => {
  it('round-trips every entity collection, map identity, nested state and class behavior', () => {
    const sim = world();
    const field = addBuilding(sim, 'field', 10, 10);
    field.crop!.sow(sim.time.day);
    field.progress = 71;
    const trap = addBuilding(sim, 'snare', 15, 10);
    trap.yieldCarry = 0.375;
    const pen = addBuilding(sim, 'pen', 20, 10);
    pen.byproductCarry.set('milk', 0.25);

    const person = sim.people[0]!;
    const pile = new ItemPile(12, 12, person.id, sim.time.tick, sim.ids);
    pile.contents.add('berries', 8);
    sim.piles.push(pile); sim.pilesById.set(pile.id, pile);
    const corpse = new Corpse(person, sim.time.tick, true, sim.ids);
    sim.corpses.push(corpse); sim.corpsesById.set(corpse.id, corpse);
    const inscription = new Inscription(INSCRIPTIONS.ochre, 14, 14, person, sim.time.tick, sim.ids);
    inscription.begin('firemaking'); inscription.progress = 23;
    sim.inscriptions.push(inscription); sim.inscriptionsById.set(inscription.id, inscription);

    const idsBefore = JSON.stringify(sim.ids.snapshot());
    const rngBefore = JSON.stringify(sim.rng.snapshot());
    const source = toWorldObjectRecord(sim);
    expect(JSON.stringify(sim.ids.snapshot())).toBe(idsBefore);
    expect(JSON.stringify(sim.rng.snapshot())).toBe(rngBefore);
    const wire = JSON.parse(JSON.stringify(source));
    const restored = fromWorldObjectRecord(wire, sim.peopleById);

    expect(restored.lastAdvancedTick).toBe(sim.time.tick);
    for (const kind of ['nodes', 'buildings', 'trees', 'piles', 'corpses', 'animals', 'inscriptions'] as const) {
      expect(restored[kind].map(item => item.id)).toEqual(sim[kind].map(item => item.id));
      const map = restored[`${kind}ById` as const] as Map<number, { id: number }>;
      expect([...map.keys()]).toEqual([...sim[`${kind}ById` as const].keys()]);
      for (const item of restored[kind]) expect(map.get(item.id)).toBe(item);
    }
    const restoredField = restored.buildingsById.get(field.id)!;
    expect(restoredField).toBeInstanceOf(Building);
    expect(restoredField.crop).not.toBeNull();
    expect(restoredField.crop!.stage).toBe(field.crop!.stage);
    expect(restoredField.contains(10, 10)).toBe(true);
    expect(restored.buildingsById.get(trap.id)!.yieldCarry).toBe(0.375);
    expect(restored.buildingsById.get(pen.id)!.byproductCarry.get('milk')).toBe(0.25);
    expect(restored.pilesById.get(pile.id)!.contents.count('berries')).toBe(8);
    expect(restored.corpsesById.get(corpse.id)!.person).toBe(person);
    expect(restored.inscriptionsById.get(inscription.id)!.unfinished).toBe(true);
    expect(restored.inscriptionsById.get(inscription.id)!.progress).toBe(23);
    expect(JSON.stringify(toWorldObjectRecord(sim))).toBe(JSON.stringify(source));
  });

  it('keeps source, JSON record and hydrated graph independent', () => {
    const sim = world();
    const record = toWorldObjectRecord(sim);
    const first = sim.nodes[0]!;
    const oldAmount = first.amount;
    const wire = JSON.parse(JSON.stringify(record));
    const restored = fromWorldObjectRecord(wire);
    restored.nodes[0]!.amount += 1;
    expect(first.amount).toBe(oldAmount);
    const cloneAgain = fromWorldObjectRecord(JSON.parse(JSON.stringify(record)));
    expect(cloneAgain.nodes[0]!.amount).toBe(oldAmount);
    expect(restored.nodes[0]).not.toBe(first);
  });

  it('rejects stale array/map indexes, bad references, ticks and unknown graph fields', () => {
    const sim = world();
    const record = toWorldObjectRecord(sim);
    const wrongTick = structuredClone(record) as any;
    wrongTick.lastAdvancedTick = -1;
    expect(() => fromWorldObjectRecord(wrongTick)).toThrow(/Invalid world object record/);

    sim.nodesById.delete(sim.nodes[0]!.id);
    expect(() => toWorldObjectRecord(sim)).toThrow(/array and map disagree/);
    sim.nodesById.set(sim.nodes[0]!.id, sim.nodes[0]!);

    const badGraph = structuredClone(record) as any;
    badGraph.graph.nodes[0].surprise = true;
    expect(() => fromWorldObjectRecord(badGraph)).toThrow(/unknown or missing fields/);
    const dangling = structuredClone(record) as any;
    dangling.graph.root = { ref: 99999 };
    expect(() => fromWorldObjectRecord(dangling)).toThrow(/dangling reference/);

    const duplicateMapKey = structuredClone(record) as any;
    const indexed = duplicateMapKey.graph.nodes.find((node: any) => node.kind === 'map' && node.entries.length > 0);
    indexed.entries.push(structuredClone(indexed.entries[0]));
    expect(() => fromWorldObjectRecord(duplicateMapKey)).toThrow(/duplicate map key/);

    const withPerson = world();
    const person = withPerson.people[0]!;
    const corpse = new Corpse(person, withPerson.time.tick, false, withPerson.ids);
    withPerson.corpses.push(corpse); withPerson.corpsesById.set(corpse.id, corpse);
    const unrepresentableTypedValue = JSON.parse(JSON.stringify(toWorldObjectRecord(withPerson))) as any;
    const typed = unrepresentableTypedValue.graph.nodes.find((node: any) => node.kind === 'typed');
    typed.type = 'Uint8Array';
    typed.values = [256];
    expect(() => fromWorldObjectRecord(unrepresentableTypedValue)).toThrow(/unrepresentable typed node/);
  });
});
