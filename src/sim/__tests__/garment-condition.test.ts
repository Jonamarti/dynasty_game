import { describe, expect, it } from 'vitest';
import { Inventory, type GarmentUnit, validateInventoryTransferState } from '../entities/Item.ts';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { reconcileCarry } from '../core/Carry.ts';
import { settleEstate } from '../systems/LifeSystem.ts';
import { BUILDINGS, Building } from '../entities/Building.ts';

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

  it('rolls back an entire inventory merge when a garment insertion fails mid-transfer', () => {
    let insertions = 0;
    let failOnce = true;
    class FailingInventory extends Inventory {
      override putGarmentUnit(unit: GarmentUnit): string {
        if (failOnce && ++insertions === 2) {
          failOnce = false;
          throw new Error('simulated insertion failure');
        }
        return super.putGarmentUnit(unit);
      }
    }
    const source = new Inventory();
    source.add('fur_hat', 2);
    source.add('berries', 5);
    source.setGarmentUnitCondition(source.garmentUnitsOf('fur_hat')[0]!.unitId, 0.22, 31);
    const destination = new FailingInventory();
    destination.add('fur_hat', 1);
    destination.add('sticks', 3);
    const sourceBefore = source.transferSnapshot();
    const destinationBefore = destination.transferSnapshot();
    expect(() => source.transferAllTo(destination)).toThrow('simulated insertion failure');
    expect(source.transferSnapshot()).toEqual(sourceBefore);
    expect(destination.transferSnapshot()).toEqual(destinationBefore);

    expect(source.transferAllTo(destination)).toBe(7);
    expect(source.total).toBe(0);
    expect(destination.count('fur_hat')).toBe(3);
    expect(destination.count('berries')).toBe(5);
    expect(destination.garmentUnitsOf('fur_hat').find(unit => unit.wear === 0.22))
      .toMatchObject({ wear: 0.22, repairProgress: 31 });
  });

  it('rejects duplicate physical identity before changing either inventory', () => {
    const source = new Inventory();
    source.add('fur_hat', 2);
    const rows = (source as unknown as { garmentUnits: GarmentUnit[] }).garmentUnits;
    rows[1] = { ...rows[1]!, unitId: rows[0]!.unitId };
    const destination = new Inventory();
    destination.add('sticks', 4);
    const destinationBefore = destination.transferSnapshot();

    expect(() => source.transferAllTo(destination)).toThrow(/duplicate garment unit identity/);
    expect(source.count('fur_hat')).toBe(2);
    expect(source.garmentUnitsOf('fur_hat').map(unit => unit.unitId))
      .toEqual([rows[0]!.unitId, rows[0]!.unitId]);
    expect(destination.transferSnapshot()).toEqual(destinationBefore);
  });

  it('does not partially merge households when a home store garment count is inconsistent', () => {
    const sim = new Simulation({ seed: 'garment-household-merge', world: { width: 64, height: 64 },
      population: { bands: 2, peoplePerBand: 6 } });
    const first = sim.livingPeople().find(person => !person.isChild)!;
    const second = sim.livingPeople().find(person => !person.isChild && person.householdId !== first.householdId)!;
    const elder = first.age >= second.age ? first : second;
    const younger = elder === first ? second : first;
    const targetHouse = sim.householdsById.get(elder.householdId!)!;
    const sourceHouse = sim.householdsById.get(younger.householdId!)!;
    const placeStore = (person: Person) => {
      for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
        const placed = sim.place('storage_pit', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
        if (placed) return placed;
      }
      throw new Error('could not place household storage');
    };
    const targetStore = placeStore(elder);
    const sourceStore = placeStore(younger);
    targetHouse.homeBuildingId = targetStore.id;
    sourceHouse.homeBuildingId = sourceStore.id;
    targetHouse.wealth = 17;
    sourceHouse.wealth = 23;
    targetStore.store.add('fur_hat', 1);
    sourceStore.store.add('fur_hat', 1);
    const sourceUnit = sourceStore.store.garmentUnitsOf('fur_hat')[0]!;
    sourceStore.store.setGarmentUnitCondition(sourceUnit.unitId, 0.19, 52);
    const sourceRows = (sourceStore.store as unknown as { garmentUnits: GarmentUnit[] }).garmentUnits;
    sourceRows.push({ ...sourceUnit, unitId: 'invalid-extra-unit' });

    expect(() => sim.mergeHouseholds(elder, younger)).toThrow(/garment units do not match garment counts/);
    expect(targetHouse.memberIds).not.toContain(younger.id);
    expect(sourceHouse.memberIds).toContain(younger.id);
    expect(targetHouse.wealth).toBe(17);
    expect(sourceHouse.wealth).toBe(23);
    expect(targetStore.store.count('fur_hat')).toBe(1);
    expect(sourceStore.store.count('fur_hat')).toBe(1);

    sourceRows.pop();
    sim.mergeHouseholds(elder, younger);
    expect(targetStore.store.count('fur_hat')).toBe(2);
    expect(sourceStore.store.count('fur_hat')).toBe(0);
    expect(targetStore.store.garmentUnitsOf('fur_hat').find(unit => unit.wear === 0.19))
      .toMatchObject({ wear: 0.19, repairProgress: 52 });
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

  it('inherits exact worn and unworn garment rows without recreating them', () => {
    const deceased = new Person('Deceased', 8, 8, 0, new RNG('estate-garment'));
    const heir = new Person('Heir', 9, 8, 0, new RNG('estate-heir'));
    deceased.inventory.add('wool_cloak', 2);
    const [worn, spare] = deceased.inventory.garmentUnitsOf('wool_cloak');
    deceased.equipment.cloak = { item: 'wool_cloak', count: 1, unitId: worn!.unitId };
    deceased.inventory.setGarmentUnitCondition(worn!.unitId, 0.38, 67);
    deceased.inventory.setGarmentUnitCondition(spare!.unitId, 0.81, 12);
    const before = deceased.inventory.garmentUnitsOf('wool_cloak');

    expect(settleEstate(deceased, heir, null, () => { throw new Error('unexpected drop'); })).toBe(2);
    expect(deceased.inventory.count('wool_cloak')).toBe(0);
    expect(heir.inventory.count('wool_cloak')).toBe(2);
    expect(heir.inventory.garmentUnitsOf('wool_cloak')).toEqual(before);
    expect(heir.inventory.ownsGarmentUnit('wool_cloak', worn!.unitId)).toBe(true);
  });

  it('drops exact garment rows at the deceased feet when there is no heir or home', () => {
    const deceased = new Person('Deceased', 8, 8, 0, new RNG('estate-ground'));
    deceased.inventory.add('fur_hat', 2);
    const [first, second] = deceased.inventory.garmentUnitsOf('fur_hat');
    deceased.inventory.setGarmentUnitCondition(first!.unitId, 0.24, 91);
    deceased.inventory.setGarmentUnitCondition(second!.unitId, 0.73, 9);
    const drops: GarmentUnit[] = [];

    expect(settleEstate(deceased, null, null, (_x, _y, itemId, count, units) => {
      expect(itemId).toBe('fur_hat');
      expect(count).toBe(2);
      drops.push(...(units ?? []));
    })).toBe(2);
    expect(deceased.inventory.count('fur_hat')).toBe(0);
    expect(drops).toEqual([first, second].map((unit, index) => ({ ...unit!, wear: index ? 0.73 : 0.24, repairProgress: index ? 9 : 91 })));
  });

  it('rejects an inconsistent estate before heir or ground ownership changes', () => {
    const deceased = new Person('Deceased', 8, 8, 0, new RNG('estate-invalid'));
    const heir = new Person('Heir', 9, 8, 0, new RNG('estate-invalid-heir'));
    deceased.inventory.add('fur_hat', 1);
    const malformed = deceased.inventory as unknown as { garmentUnits: GarmentUnit[] };
    malformed.garmentUnits.push({ ...malformed.garmentUnits[0]!, unitId: 'extra-row' });
    const dropped: GarmentUnit[] = [];

    expect(() => settleEstate(deceased, heir, null, (_x, _y, _id, _count, units) => dropped.push(...(units ?? []))))
      .toThrow(/garment units do not match garment counts/);
    expect(deceased.inventory.count('fur_hat')).toBe(1);
    expect(heir.inventory.count('fur_hat')).toBe(0);
    expect(dropped).toEqual([]);
  });

  it('sends garment rows to the household home store when there is no heir', () => {
    const deceased = new Person('Deceased', 8, 8, 0, new RNG('estate-home'));
    const home = new Building(BUILDINGS.storage_pit!, 8, 8, 0);
    deceased.inventory.add('fur_hat', 1);
    const unit = deceased.inventory.garmentUnitsOf('fur_hat')[0]!;
    deceased.inventory.setGarmentUnitCondition(unit.unitId, 0.46, 33);

    expect(settleEstate(deceased, null, home, () => { throw new Error('unexpected drop'); })).toBe(1);
    expect(deceased.inventory.count('fur_hat')).toBe(0);
    expect(home.store.garmentUnitsOf('fur_hat')).toMatchObject([{ wear: 0.46, repairProgress: 33 }]);
  });
});
