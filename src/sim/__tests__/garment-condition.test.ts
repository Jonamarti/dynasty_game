import { describe, expect, it } from 'vitest';
import { Inventory, validateInventoryTransferState } from '../entities/Item.ts';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { reconcileCarry } from '../core/Carry.ts';

describe('garment condition ownership foundation', () => {
  it('moves one physical garment with its condition and banked repair work', () => {
    const pack = new Inventory();
    pack.add('wool_cloak', 2);
    const [worn, pristine] = pack.garmentUnitsOf('wool_cloak');
    expect(worn?.wear).toBe(1);
    expect(pack.setGarmentUnitCondition(worn!.unitId, 0.42, 73)).toBe(true);

    const moved = pack.takeGarmentUnit('wool_cloak');
    expect(moved).toMatchObject({ unitId: worn!.unitId, wear: 0.42, repairProgress: 73 });
    expect(pack.count('wool_cloak')).toBe(1);
    expect(pack.garmentUnitsOf('wool_cloak')).toEqual([pristine]);

    const store = new Inventory();
    store.putGarmentUnit(moved!);
    expect(store.count('wool_cloak')).toBe(1);
    expect(store.garmentUnitsOf('wool_cloak')).toEqual([moved]);
  });

  it('includes unit state in validated transfer records and restores it exactly', () => {
    const source = new Inventory();
    source.add('hide_cape', 1);
    const unit = source.garmentUnitsOf()[0]!;
    source.setGarmentUnitCondition(unit.unitId, 0.1, 140);
    const record = JSON.parse(JSON.stringify(source.transferSnapshot()));

    const destination = new Inventory();
    destination.restoreTransferState(record);
    expect(destination.garmentUnitsOf()).toEqual(source.garmentUnitsOf());
    expect(() => destination.setGarmentUnitCondition(unit.unitId, 1.1, 0)).toThrow();
    expect(() => validateInventoryTransferState({ ...record,
      garmentUnits: [{ ...record.garmentUnits[0], repairProgress: 141 }],
    })).toThrow(/invalid identity, condition, or repair progress/);
    expect(() => validateInventoryTransferState({ ...record, garmentUnits: [] }))
      .toThrow(/garment units do not match garment counts/);
  });

  it('hydrates legacy count-only transfer records as pristine garments', () => {
    const legacy = validateInventoryTransferState({
      version: 3,
      stacks: [['hide_cape', 2], ['berries', 4]],
      spoilage: [],
    });
    expect(legacy.garmentUnits).toHaveLength(2);
    expect(legacy.garmentUnits.every(unit => unit.wear === 1 && unit.repairProgress === 0)).toBe(true);
  });

  it('preserves a garment across drop and pickup, and clears only its exact worn reference', () => {
    const sim = new Simulation({ seed: 'garment-pile-transfer', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 } });
    const person = sim.livingPeople()[0]!;
    person.inventory.add('wool_cloak', 1);
    changeGarment(person, 'wool_cloak', 'wear_garment');
    const worn = person.equipment.cloak!;
    person.inventory.setGarmentUnitCondition(worn.unitId!, 0.31, 96);

    const pile = sim.drop(person, 'wool_cloak', 1)!;
    expect(person.equipment.cloak).toBeUndefined();
    expect(pile.contents.garmentUnitsOf('wool_cloak')).toMatchObject([
      { unitId: worn.unitId, wear: 0.31, repairProgress: 96 },
    ]);
    expect(sim.takeFromPile(person, pile, 'wool_cloak', 1)).toBe(1);
    expect(person.inventory.garmentUnitsOf('wool_cloak')).toMatchObject([
      { unitId: worn.unitId, wear: 0.31, repairProgress: 96 },
    ]);
  });

  it('preserves the same garment through store, persisted inventory state, and withdrawal', () => {
    const sim = new Simulation({ seed: 'garment-store-transfer', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 } });
    const person = sim.livingPeople()[0]!;
    person.inventory.add('fur_hat', 1);
    const unit = person.inventory.garmentUnitsOf('fur_hat')[0]!;
    expect(person.inventory.setGarmentUnitCondition(unit.unitId, 0.36, 88)).toBe(true);

    let store: import('../entities/Building.ts').Building | null = null;
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
      store = sim.place('storage_pit', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
      if (store) break;
    }
    expect(store).not.toBeNull();
    store!.complete = true;

    expect(sim.storeItem(person, store!, 'fur_hat', 1)).toBe(1);
    expect(person.inventory.count('fur_hat')).toBe(0);
    const persisted = validateInventoryTransferState(JSON.parse(JSON.stringify(store!.store.transferSnapshot())));
    expect(persisted.garmentUnits).toEqual([{ ...unit, wear: 0.36, repairProgress: 88 }]);
    const loaded = new Inventory();
    loaded.restoreTransferState(persisted);
    expect(loaded.garmentUnitsOf('fur_hat')).toEqual(persisted.garmentUnits);
    store!.store.takeTransferState(persisted);
    store!.store.restoreTransferState(persisted);
    expect(sim.takeItem(person, store!, 'fur_hat', 1)).toBe(1);
    expect(person.inventory.garmentUnitsOf('fur_hat')).toEqual(persisted.garmentUnits);
  });

  it('re-keys a local unit collision when merging inventories without changing condition', () => {
    const source = new Inventory();
    source.add('fur_hat', 1);
    const sourceUnit = source.garmentUnitsOf()[0]!;
    source.setGarmentUnitCondition(sourceUnit.unitId, 0.27, 44);
    const destination = new Inventory();
    destination.add('fur_hat', 1);

    expect(source.transferTo(destination, 'fur_hat', 1)).toBe(1);
    const merged = destination.garmentUnitsOf('fur_hat');
    expect(merged).toHaveLength(2);
    expect(merged.find(unit => unit.wear === 0.27)).toMatchObject({ wear: 0.27, repairProgress: 44 });
    expect(new Set(merged.map(unit => unit.unitId)).size).toBe(2);
  });

  it('drops only unpacked garment units when carry reconciliation sheds excess', () => {
    const person = new Person('Overloaded', 8, 8, 0, new RNG('garment-overflow'));
    person.age = 30 * 80;
    person.inventory.add('wool_cloak', 12);
    const worn = person.inventory.garmentUnitsOf('wool_cloak')[0]!;
    person.equipment.cloak = { item: 'wool_cloak', count: 1, unitId: worn.unitId };
    person.inventory.setGarmentUnitCondition(worn.unitId, 0.58, 21);
    const drops: { count: number; units?: readonly { unitId: string; wear: number; repairProgress: number }[] }[] = [];

    reconcileCarry(person, DEFAULT_CONFIG.carry, (_x, _y, _id, count, units) => drops.push({ count, units }));

    expect(person.equipment.cloak?.unitId).toBe(worn.unitId);
    expect(person.inventory.ownsGarmentUnit('wool_cloak', worn.unitId)).toBe(true);
    expect(drops.length).toBeGreaterThan(0);
    expect(drops.every(drop => drop.count === drop.units?.length)).toBe(true);
    expect(drops.flatMap(drop => drop.units ?? []).some(unit => unit.unitId === worn.unitId)).toBe(false);
  });
});
