import { describe, expect, it } from 'vitest';
import { lastScores } from '../ai/Brain.ts';
import { itemCapacityFor } from '../core/Carry.ts';
import { Simulation } from '../core/Simulation.ts';

describe('food access with occupied hands', () => {
  it('offers a targeted material deposit instead of a fruitless forage trip', () => {
    const sim = new Simulation({
      seed: 'unload-for-food',
      world: { width: 48, height: 48, berryBushes: 60, flintOutcrops: 10, deadwood: 20, gameHerds: 0 },
      population: { bands: 1, peoplePerBand: 6 },
    });
    const person = sim.livingPeople()[0]!;
    const bush = sim.nodes.find(node => node.kind === 'berries' && node.amount > 0)!;
    let store = null as ReturnType<typeof sim.place>;
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
      store = sim.place('storage_pit', Math.round(bush.x) + dx!, Math.round(bush.y) + dy!, person.bandId);
      if (store) break;
    }
    expect(store).not.toBeNull();
    store!.complete = true;
    person.x = store!.centerX;
    person.y = store!.centerY;
    for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
    person.inventory.add('berries', 1);
    for (const id of ['sticks', 'flint', 'thatch', 'mud']) {
      const room = person.carryCapacity - person.carrying;
      if (room <= 0) break;
      person.inventory.add(id, Math.min(room, itemCapacityFor(person, sim.config.carry, id)));
    }
    expect(person.carrying).toBe(person.carryCapacity);
    person.needs.hunger = 5;
    person.needs.thirst = 0;
    person.needs.fatigue = 0;
    person.needs.cold = 0;
    person.action = 'idle';
    lastScores.delete(person.id);

    for (let i = 0; i < 100 && store!.store.total === 0; i++) sim.step();

    expect(lastScores.get(person.id)?.some(row => row.id === 'store')).toBe(true);
    expect(lastScores.get(person.id)?.some(row => row.id === 'forage')).toBe(false);
    expect(store!.store.count('sticks')).toBeGreaterThan(0);
    expect(store!.store.count('berries')).toBe(0);
    expect(person.inventory.count('berries')).toBe(1);
    expect(person.carrying).toBeLessThan(person.carryCapacity);

    // With the material gone, the same bush can now put food in the hands.
    sim.possess(person);
    person.x = bush.x;
    person.y = bush.y;
    expect(sim.order(person, 'forage', { nodeId: bush.id })).toBe(true);
    for (let i = 0; i < 60 && person.inventory.count('berries') === 1; i++) sim.step();
    expect(person.inventory.count('berries')).toBeGreaterThan(1);
  });

  it('leaves store food on its shelf when the taker has no carrying room', () => {
    const sim = new Simulation({
      seed: 'full-store-withdrawal',
      world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 },
    });
    const person = sim.possessFirst()!;
    let store = null as ReturnType<typeof sim.place>;
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
      store = sim.place('storage_pit', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
      if (store) break;
    }
    expect(store).not.toBeNull();
    store!.complete = true;
    store!.store.add('berries', 6);
    person.x = store!.centerX;
    person.y = store!.centerY;
    for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
    for (const id of ['sticks', 'flint', 'thatch', 'mud']) {
      const room = person.carryCapacity - person.carrying;
      if (room <= 0) break;
      person.inventory.add(id, Math.min(room, itemCapacityFor(person, sim.config.carry, id)));
    }
    expect(person.carrying).toBe(person.carryCapacity);
    const pilesBefore = sim.piles.length;

    expect(sim.order(person, 'take', { buildingId: store!.id })).toBe(true);
    for (let i = 0; i < 30; i++) sim.step();

    expect(store!.store.count('berries')).toBe(6);
    expect(person.inventory.count('berries')).toBe(0);
    expect(sim.piles.length).toBe(pilesBefore);

    const material = person.inventory.entries().find(([, count]) => count >= 2)![0];
    person.inventory.remove(material, 2);
    expect(sim.order(person, 'take', { buildingId: store!.id })).toBe(true);
    for (let i = 0; i < 30 && person.inventory.count('berries') === 0; i++) sim.step();
    expect(person.inventory.count('berries')).toBe(2);
    expect(store!.store.count('berries')).toBe(4);
    expect(sim.piles.length).toBe(pilesBefore);
  });

  it('stores some of a full food load while retaining a meal for its carrier', () => {
    const sim = new Simulation({
      seed: 'food-hand-reserve',
      world: { width: 48, height: 48, berryBushes: 30 },
      population: { bands: 1, peoplePerBand: 4 },
    });
    const person = sim.livingPeople()[0]!;
    let store = null as ReturnType<typeof sim.place>;
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
      store = sim.place('storage_pit', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
      if (store) break;
    }
    expect(store).not.toBeNull();
    store!.complete = true;
    person.x = store!.centerX;
    person.y = store!.centerY;
    for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
    person.inventory.add('berries', person.carryCapacity);
    person.needs.hunger = 10;
    person.needs.thirst = 0;
    person.needs.fatigue = 0;
    person.needs.cold = 0;
    person.action = 'idle';

    for (let i = 0; i < 100 && store!.store.count('berries') === 0; i++) sim.step();

    expect(store!.store.count('berries')).toBeGreaterThan(0);
    expect(person.inventory.count('berries')).toBeGreaterThan(0);
    expect(person.inventory.count('berries') * 14).toBeGreaterThanOrEqual(person.needs.hunger + 20);
  });

  it('lets a hungry dependent increase a comfortable parent\'s forage drive', () => {
    const scoreFor = (childHunger: number): number => {
      const sim = new Simulation({
        seed: 'forage-for-child',
        world: { width: 48, height: 48, berryBushes: 40 },
        population: { bands: 1, peoplePerBand: 4 },
      });
      const parent = sim.possessFirst()!;
      const child = sim.people.find(person => person.id !== parent.id)!;
      const bush = sim.nodes.find(node => node.kind === 'berries' && node.amount > 0)!;
      parent.childIds = [child.id];
      child.age = 3 * child.daysPerYear;
      child.motherId = parent.id;
      child.bandId = parent.bandId;
      child.x = bush.x;
      child.y = bush.y;
      parent.x = bush.x;
      parent.y = bush.y;
      parent.needs.hunger = 0;
      parent.needs.thirst = 0;
      parent.needs.fatigue = 0;
      parent.needs.cold = 0;
      for (const [id, count] of parent.inventory.entries()) parent.inventory.remove(id, count);
      child.needs.hunger = childHunger;
      lastScores.delete(parent.id);
      for (let i = 0; i < 8; i++) sim.step();
      return lastScores.get(parent.id)?.find(row => row.id === 'forage')?.score ?? 0;
    };
    const calm = scoreFor(0);
    const needy = scoreFor(90);
    expect(needy).toBeGreaterThan(calm);
  });
});
