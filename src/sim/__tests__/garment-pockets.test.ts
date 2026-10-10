import { describe, expect, it } from 'vitest';
import { makeConfig, DEFAULT_CONFIG } from '../core/Config.ts';
import { capacityFor, itemCapacityFor, reconcileCarry } from '../core/Carry.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { Simulation } from '../core/Simulation.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

const config = makeConfig();

function person(): Person {
  const p = new Person('Pocket carrier', 0, 0, 0, new RNG('garment-pockets'));
  p.age = 20 * p.daysPerYear;
  return p;
}

function clearEquipment(p: Person): void {
  for (const slot of Object.keys(p.equipment)) delete (p.equipment as Record<string, unknown>)[slot];
  p.carryContainerCapacity = 0;
  p.transportCapacity = 0;
}

describe('M15 phase 14c garment pockets', () => {
  it('adds capacity only for a canonically owned, worn garment and small items', () => {
    const p = person();
    p.inventory.add('linen_tunic', 1);
    expect(p.carryCapacity).toBe(10);
    expect(itemCapacityFor(p, config.carry, 'flint')).toBe(3);

    expect(changeGarment(p, 'linen_tunic', 'wear_garment')).toBeNull();
    expect(p.carryCapacity).toBe(14);
    expect(capacityFor(p, config.carry)).toBe(14);
    expect(itemCapacityFor(p, config.carry, 'flint')).toBe(7);
    expect(itemCapacityFor(p, config.carry, 'berries')).toBe(10);

    p.inventory.remove('linen_tunic', 1);
    expect(p.carryCapacity).toBe(10);
    expect(itemCapacityFor(p, config.carry, 'flint')).toBe(3);
  });

  it('reconciles a swap to a smaller pocket and preserves every excess item on the ground', () => {
    const p = person();
    p.inventory.add('linen_tunic', 1);
    p.inventory.add('fur_coat', 1);
    p.inventory.add('flint', 7);
    expect(changeGarment(p, 'linen_tunic', 'wear_garment')).toBeNull();
    expect(changeGarment(p, 'fur_coat', 'wear_garment')).toBeNull();
    const dropped: Array<[string, number]> = [];

    expect(reconcileCarry(p, config.carry,
      (_x, _y, itemId, count) => dropped.push([itemId, count]))).toBe(2);
    expect(p.equipment.torso?.item).toBe('fur_coat');
    expect(p.inventory.count('linen_tunic')).toBe(1);
    expect(p.inventory.count('fur_coat')).toBe(1);
    expect(p.inventory.count('flint')).toBe(5);
    expect(dropped).toEqual([['flint', 2]]);
  });

  it('reconciles on taking off a pocket garment through the committed action', () => {
    const sim = new Simulation({ seed: 'garment-pocket-takeoff', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 2 } });
    sim.possessFirst();
    const p = sim.player!;
    clearEquipment(p);
    for (const [id, count] of p.inventory.entries()) p.inventory.remove(id, count);
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    p.inventory.add('linen_tunic', 1);
    expect(sim.order(p, 'wear_garment', { itemId: 'linen_tunic' })).toBe(true);
    for (let tick = 0; tick < DEFAULT_CONFIG.carry.equipTicks; tick++) sim.step();
    expect(p.equipment.torso?.item).toBe('linen_tunic');
    p.inventory.add('flint', 7);
    expect(sim.order(p, 'take_off_garment', { itemId: 'linen_tunic' })).toBe(true);
    for (let tick = 0; tick < DEFAULT_CONFIG.carry.equipTicks; tick++) sim.step();

    expect(p.equipment.torso).toBeUndefined();
    expect(p.inventory.count('flint')).toBe(3);
    expect(sim.piles.reduce((sum, pile) => sum + pile.contents.count('flint'), 0)).toBe(4);
  });

  it('drops overflow when the last owned pocket garment is dropped, preserving the load in a pile', () => {
    const sim = new Simulation({ seed: 'garment-pocket-drop', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 2 } });
    sim.possessFirst();
    const p = sim.player!;
    clearEquipment(p);
    for (const [id, count] of p.inventory.entries()) p.inventory.remove(id, count);
    p.inventory.add('linen_tunic', 1);
    p.inventory.add('flint', 7);
    expect(changeGarment(p, 'linen_tunic', 'wear_garment')).toBeNull();
    expect(p.carryCapacity).toBe(14);

    const pile = sim.drop(p, 'linen_tunic', 1);
    expect(pile).not.toBeNull();
    expect(p.equipment.torso).toBeUndefined();
    expect(p.carryCapacity).toBe(10);
    expect(p.inventory.count('flint')).toBe(3);
    expect(pile!.contents.count('linen_tunic')).toBe(1);
    expect(pile!.contents.count('flint')).toBe(4);
    expect(p.inventory.count('flint') + pile!.contents.count('flint')).toBe(7);
  });

  it('derives pocket capacity after checkpoint restoration without storing pocket contents', () => {
    const sim = new Simulation({ seed: 'garment-pocket-checkpoint', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 2 } });
    sim.possessFirst();
    const p = sim.player!;
    clearEquipment(p);
    p.inventory.add('linen_tunic', 1);
    p.inventory.add('flint', 5);
    expect(changeGarment(p, 'linen_tunic', 'wear_garment')).toBeNull();

    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(p.id)!;
    expect(restored.equipment.torso?.item).toBe('linen_tunic');
    expect(restored.carryCapacity).toBe(14);
    expect(itemCapacityFor(restored, loaded.config.carry, 'flint')).toBe(7);
    expect(JSON.stringify(restored.equipment)).not.toContain('pocketContents');
  });
});
