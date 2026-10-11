import { describe, expect, it } from 'vitest';
import { Inventory, validateInventoryTransferState } from '../entities/Item.ts';

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
});
