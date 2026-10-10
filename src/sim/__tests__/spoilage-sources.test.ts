import { afterEach, describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { telemetry } from '../core/Telemetry.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { ItemPile } from '../entities/ItemPile.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

afterEach(() => { telemetry.disable(); telemetry.reset(); });

describe('spoilage source instrument', () => {
  it('learns real own losses, exposes only a visible hand to nearby witnesses and keeps distant people ignorant', () => {
    const sim = new Simulation({ seed: 'spoil-observation', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 }, needs: { spoilRate: 1 } });
    const [owner, witness, distant] = sim.livingPeople();
    for (const person of sim.people) for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    owner!.x = 10; owner!.y = 10; witness!.x = 11; witness!.y = 10;
    distant!.x = 40; distant!.y = 40;
    sim.time.tick = sim.config.time.ticksPerDay / 2;
    sim.peopleHash.rebuild(sim.livingPeople());
    owner!.inventory.add('meat', 100);
    (sim as unknown as { spoilFood(): void }).spoilFood();
    expect(owner!.beliefs.expect('spoils:meat').value).toBeGreaterThan(0);
    expect(witness!.beliefs.expect('spoils:meat').value).toBe(0);
    owner!.equipment.left = { item: 'meat', count: 1 };
    (sim as unknown as { spoilFood(): void }).spoilFood();
    expect(witness!.beliefs.expect('spoils:meat').value).toBeGreaterThan(0);
    expect(distant!.beliefs.expect('spoils:meat').value).toBe(0);
  });

  it('learns a store loss only while an owner can see the store', () => {
    const sim = new Simulation({ seed: 'spoil-store-observation', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 }, needs: { spoilRate: 1 } });
    const [owner, stranger] = sim.livingPeople();
    const store = new Building(BUILDINGS.storage_pit!, 10, 10, owner!.bandId, sim.ids);
    store.complete = true; store.sponsorId = owner!.id; store.store.add('meat', 100);
    sim.buildings.push(store); sim.buildingsById.set(store.id, store);
    owner!.x = stranger!.x = 10; owner!.y = stranger!.y = 10;
    sim.time.tick = sim.config.time.ticksPerDay / 2; sim.peopleHash.rebuild(sim.livingPeople());
    (sim as unknown as { spoilFood(): void }).spoilFood();
    expect(owner!.beliefs.expect('spoils:meat').value).toBeGreaterThan(0);
    expect(stranger!.beliefs.expect('spoils:meat').value).toBe(0);
    owner!.x = owner!.y = 40; sim.peopleHash.rebuild(sim.livingPeople());
    const before = owner!.beliefs.expect('spoils:meat').value;
    (sim as unknown as { spoilFood(): void }).spoilFood();
    expect(owner!.beliefs.expect('spoils:meat').value).toBe(before);
  });

  it('retains fractional dry losses by source without changing any checkpoint state', () => {
    const sim = new Simulation({ seed: 'spoil-sources', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 } });
    for (const person of sim.people) for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
    sim.buildings.length = 0; sim.buildingsById.clear(); sim.piles.length = 0; sim.pilesById.clear();
    sim.people[0]!.inventory.add('meat', 1);
    const store = new Building(BUILDINGS.storage_pit!, 10, 10, sim.people[0]!.bandId, sim.ids);
    store.complete = true; store.store.add('meat', 1);
    store.delivered.add('meat', 1);
    sim.buildings.push(store);
    sim.buildingsById.set(store.id, store);
    const pile = new ItemPile(12, 12, null, 0, sim.ids);
    pile.contents.add('meat', 1); sim.piles.push(pile);
    sim.pilesById.set(pile.id, pile);
    const before = JSON.stringify(toCheckpointRecord(sim));
    telemetry.enable();
    (sim as unknown as { spoilFood(): void }).spoilFood();
    const counts = telemetry.snapshot();
    expect(counts.would_spoil_carried).toBeGreaterThan(0);
    expect(counts.would_spoil_carried).toBeLessThan(1);
    expect(counts.would_spoil_pile).toBe(counts.would_spoil_carried);
    expect(counts.would_spoil_store).toBeLessThan(counts.would_spoil_carried!);
    expect(counts.would_spoil_site).toBe(counts.would_spoil_store);
    expect(counts.would_spoil_carried_meat).toBe(counts.would_spoil_carried);
    expect(counts.would_spoil_carried_nutrition).toBeGreaterThan(0);
    expect(JSON.stringify(toCheckpointRecord(sim))).toBe(before);
  });

  it('reports real removals separately when spoilage is explicitly enabled', () => {
    const sim = new Simulation({ seed: 'spoil-sources-live', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 }, needs: { spoilRate: 1 } });
    for (const person of sim.people) for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
    sim.buildings.length = 0; sim.buildingsById.clear(); sim.piles.length = 0; sim.pilesById.clear();
    sim.people[0]!.inventory.add('meat', 100);
    telemetry.enable();
    (sim as unknown as { spoilFood(): void }).spoilFood();
    const removed = 100 - sim.people[0]!.inventory.count('meat');
    expect(removed).toBeGreaterThan(0);
    expect(telemetry.get('spoiled_carried')).toBe(removed);
    expect(telemetry.get('would_spoil_carried')).toBe(0);
  });
});
