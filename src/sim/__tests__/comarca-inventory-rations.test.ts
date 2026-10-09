import { describe, expect, it } from 'vitest';
import { Inventory } from '../entities/Item.ts';
import { advanceCompactBandFoodDay, type CompactBandFoodWorkRate } from '../compact/CompactBandFood.ts';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { comarcaResourceProfile, RATION_NUTRITION } from '../world/ResourceProfile.ts';
import { ComarcaInventoryTransfer, type ComarcaInventoryRationPriority } from '../world/ComarcaInventoryTransfer.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function setEscrowVersion(record: ReturnType<ComarcaInventoryTransfer['toRecord']>, version: number): void {
  const rootValue = record.sources[0]!.graph.root;
  const root = typeof rootValue === 'object' && rootValue !== null && 'ref' in rootValue
    ? record.sources[0]!.graph.nodes[rootValue.ref]
    : undefined;
  if (!root || root.kind !== 'object') throw new Error('Inventory graph root must be an object');
  const field = root.fields.find(([name]) => name === 'version');
  if (!field) throw new Error('Inventory graph has no version field');
  field[1] = version;
}

describe('ComarcaInventoryTransfer.consumeRations', () => {
  it('uses the caller order, preserves typed fractional counts and spoilage carry through JSON return', () => {
    const pack = new Inventory();
    pack.add('berries', 2);
    pack.spoil(600, () => 1);
    const store = new Inventory();
    store.add('meal', 2);
    store.add('sticks', 5);
    const destinations = new Map([['pack', pack], ['store', store]]);
    const transfer = ComarcaInventoryTransfer.take([
      { sourceId: 'pack', inventory: pack }, { sourceId: 'store', inventory: store },
    ]);
    const priority: ComarcaInventoryRationPriority[] = [
      { sourceId: 'pack', itemId: 'berries' }, { sourceId: 'store', itemId: 'meal' },
    ];
    const result = transfer.consumeRations(3, priority);
    expect(result.requestedRations).toBe(3);
    expect(result.consumedRations).toBeCloseTo(3, 12);
    expect(result.unmetRations).toBeCloseTo(0, 12);
    expect(result.removals[0]).toMatchObject({ sourceId: 'pack', itemId: 'berries', count: 2, nutrition: 28 });
    expect(result.removals[1]!.sourceId).toBe('store');
    expect(result.removals[1]!.itemId).toBe('meal');
    expect(result.removals[1]!.count).toBeGreaterThan(0);
    expect(result.consumedNutrition).toBeLessThanOrEqual(3 * RATION_NUTRITION);
    expect(result.consumedNutrition).toBeCloseTo(3 * RATION_NUTRITION, 10);
    expect(transfer.nutrition()).toBeCloseTo(96 - result.consumedNutrition, 10);

    const restored = ComarcaInventoryTransfer.fromRecord(wire(transfer.toRecord()), id => destinations.get(id));
    restored.restore();
    expect(pack.count('berries')).toBeCloseTo(0, 12);
    expect(store.count('meal')).toBeCloseTo(2 - result.removals[1]!.count, 12);
    expect(store.count('sticks')).toBe(5);
    expect(pack.transferSnapshot().spoilage).toEqual([['berries', 0.5]]);
  });

  it('validates the whole explicit priority before consuming, even after demand is covered or when demand is zero', () => {
    const inventory = new Inventory(); inventory.add('berries', 2); inventory.add('meal', 1);
    const transfer = ComarcaInventoryTransfer.take([{ sourceId: 'food', inventory }]);
    const before = transfer.nutrition();
    expect(() => transfer.consumeRations(0.1, [
      { sourceId: 'food', itemId: 'berries' },
      { sourceId: 'missing', itemId: 'meal' },
    ])).toThrow(/unknown transfer source/);
    expect(() => transfer.consumeRations(0, [
      { sourceId: 'food', itemId: 'berries' },
      { sourceId: 'food', itemId: 'meal' },
      { sourceId: 'food', itemId: 'meal' },
    ])).toThrow(/duplicate ration priority/);
    expect(() => transfer.consumeRations(0, [{ sourceId: 'food', itemId: 'berries' }])).toThrow(/missing food\/meal/);
    expect(transfer.nutrition()).toBe(before);
  });

  it('preflights all increments when one source has multiple removals', () => {
    const inventory = new Inventory(); inventory.add('berries', 1); inventory.add('meal', 1);
    const transfer = ComarcaInventoryTransfer.take([{ sourceId: 'food', inventory }]);
    const record = wire(transfer.toRecord());
    setEscrowVersion(record, Number.MAX_SAFE_INTEGER - 1);
    const hydrated = ComarcaInventoryTransfer.fromRecord(record, () => inventory);
    const before = hydrated.nutrition();
    expect(() => hydrated.consumeRations(10, [
      { sourceId: 'food', itemId: 'berries' }, { sourceId: 'food', itemId: 'meal' },
    ])).toThrow(/version cannot advance/);
    expect(hydrated.nutrition()).toBe(before);
  });

  it('reports unmet rations for scarce stock and leaves non-food materials untouched', () => {
    const inventory = new Inventory(); inventory.add('berries', 0.5); inventory.add('sticks', 4);
    const transfer = ComarcaInventoryTransfer.take([{ sourceId: 'camp', inventory }]);
    const result = transfer.consumeRations(3, [{ sourceId: 'camp', itemId: 'berries' }]);
    expect(result.removals).toEqual([{ sourceId: 'camp', itemId: 'berries', count: 0.5, nutrition: 7 }]);
    expect(result.consumedNutrition).toBe(7);
    expect(result.unmetRations).toBeCloseTo(3 - 7 / RATION_NUTRITION, 12);
    transfer.restore();
    expect(inventory.count('berries')).toBe(0);
    expect(inventory.count('sticks')).toBe(4);
  });

  it('rejects duplicate selections, unknown items, and non-finite or negative demands atomically', () => {
    const inventory = new Inventory(); inventory.add('berries', 1); inventory.add('meal', 1);
    const transfer = ComarcaInventoryTransfer.take([{ sourceId: 'camp', inventory }]);
    const before = transfer.nutrition();
    expect(() => transfer.consumeRations(1, [
      { sourceId: 'camp', itemId: 'berries' }, { sourceId: 'camp', itemId: 'berries' },
      { sourceId: 'camp', itemId: 'meal' },
    ])).toThrow(/duplicate ration priority/);
    expect(() => transfer.consumeRations(1, [
      { sourceId: 'camp', itemId: 'berries' }, { sourceId: 'camp', itemId: 'unknown' },
      { sourceId: 'camp', itemId: 'meal' },
    ])).toThrow(/unknown ration priority item/);
    expect(() => transfer.consumeRations(Number.NaN, [])).toThrow(/finite and non-negative/);
    expect(() => transfer.consumeRations(-1, [])).toThrow(/finite and non-negative/);
    expect(transfer.nutrition()).toBe(before);
  });

  it('does not report food consumed when a tiny fractional removal cannot change the stored count', () => {
    const inventory = new Inventory(); inventory.add('berries', 10_000_000_000);
    const transfer = ComarcaInventoryTransfer.take([{ sourceId: 'store', inventory }]);
    const before = transfer.rations();
    const result = transfer.consumeRations(1e-10, [{ sourceId: 'store', itemId: 'berries' }]);
    expect(result.consumedNutrition).toBe(0);
    expect(result.consumedRations).toBe(0);
    expect(result.unmetRations).toBe(1e-10);
    expect(result.removals).toEqual([]);
    expect(transfer.rations()).toBe(before);
    transfer.restore();
    expect(inventory.count('berries')).toBe(10_000_000_000);
  });

  it('keeps physical withdrawal equal to the daily ledger withdrawal and leaves its reported stock', () => {
    const pack = new Inventory(); pack.add('berries', 2);
    const store = new Inventory(); store.add('meal', 2); store.add('sticks', 4);
    const destinations = new Map([['pack', pack], ['store', store]]);
    const transfer = ComarcaInventoryTransfer.take([
      { sourceId: 'pack', inventory: pack }, { sourceId: 'store', inventory: store },
    ]);
    const geography = randomWorldGeography('comarca-ration-ledger-bridge');
    const profile = comarcaResourceProfile(geography, 320, 200);
    const empty: CompactBandFoodWorkRate = { workerDays: 0, rationsPerWorkerDay: 0, requires: [] };
    const day = advanceCompactBandFoodDay({ day: 0, stockRations: transfer.rations(), storageCapacityRations: 100 }, {
      day: 1, season: 'summer', population: 3, demandRations: 3, profile, techs: [],
      work: { gather: empty, fish: empty, game: empty },
    });
    const priority = [
      { sourceId: 'pack', itemId: 'berries' }, { sourceId: 'store', itemId: 'meal' },
    ];
    const physical = transfer.consumeRations(day.report.withdrawn, priority);
    expect(physical.consumedNutrition).toBeLessThanOrEqual(day.report.withdrawn * RATION_NUTRITION);
    expect(physical.consumedRations).toBeCloseTo(day.report.withdrawn, 12);
    expect(transfer.rations()).toBeCloseTo(day.state.stockRations, 12);
    expect(day.report.stock).toBe(day.state.stockRations);

    const restored = ComarcaInventoryTransfer.fromRecord(wire(transfer.toRecord()), id => destinations.get(id));
    restored.restore();
    const remainingNutrition = pack.count('berries') * 14 + store.count('meal') * 34;
    expect(remainingNutrition).toBeCloseTo(day.state.stockRations * RATION_NUTRITION, 10);
    expect(store.count('sticks')).toBe(4);
  });

  it('uses the explicit priority order to choose which typed foods remain', () => {
    const firstPack = new Inventory(); firstPack.add('berries', 1);
    const firstStore = new Inventory(); firstStore.add('meal', 1); firstStore.add('sticks', 1);
    const berriesFirst = ComarcaInventoryTransfer.take([
      { sourceId: 'pack', inventory: firstPack }, { sourceId: 'store', inventory: firstStore },
    ]);
    const secondPack = new Inventory(); secondPack.add('berries', 1);
    const secondStore = new Inventory(); secondStore.add('meal', 1); secondStore.add('sticks', 1);
    const mealFirst = ComarcaInventoryTransfer.take([
      { sourceId: 'pack', inventory: secondPack }, { sourceId: 'store', inventory: secondStore },
    ]);
    const berriesOrder = [{ sourceId: 'pack', itemId: 'berries' }, { sourceId: 'store', itemId: 'meal' }];
    const mealOrder = [...berriesOrder].reverse();
    const a = berriesFirst.consumeRations(2, berriesOrder);
    const b = mealFirst.consumeRations(2, mealOrder);
    berriesFirst.restore();
    mealFirst.restore();
    expect(a.consumedNutrition).toBeLessThanOrEqual(2 * RATION_NUTRITION);
    expect(b.consumedNutrition).toBeLessThanOrEqual(2 * RATION_NUTRITION);
    expect(firstPack.count('berries')).not.toBe(secondPack.count('berries'));
    expect(firstStore.count('meal')).not.toBe(secondStore.count('meal'));
    expect(firstStore.count('sticks')).toBe(1);
    expect(secondStore.count('sticks')).toBe(1);
  });
});