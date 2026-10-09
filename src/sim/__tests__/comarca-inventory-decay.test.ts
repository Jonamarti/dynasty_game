import { describe, expect, it } from 'vitest';
import { Inventory } from '../entities/Item.ts';
import { ComarcaInventoryTransfer } from '../world/ComarcaInventoryTransfer.ts';
import { ComarcaInventoryDecay, type ComarcaInventoryDecayOptions } from '../world/ComarcaInventoryDecay.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function transferred(items: readonly [string, number][]) {
  const inventory = new Inventory();
  for (const [item, count] of items) inventory.add(item, count);
  return ComarcaInventoryTransfer.take([{ sourceId: 'store', inventory }]).toRecord();
}
function options(transfer = transferred([['berries', 100]]), patch: Partial<ComarcaInventoryDecayOptions> = {}): ComarcaInventoryDecayOptions {
  return {
    transfer, ticksPerDay: 240, tick: 100, lastSweepTick: 0, spoilRate: 1,
    preservation: [{ sourceId: 'store', factor: 1 }], ...patch,
  };
}
function stock(record: ReturnType<ComarcaInventoryDecay['toRecord']>, sourceId = 'store'): Inventory {
  // Decode through the existing transfer resolver, then restore to read exact escrow contents.
  const destinations = new Map(record.transfer.sources.map(row => [row.sourceId, new Inventory()]));
  const transfer = ComarcaInventoryTransfer.fromRecord(record.transfer, id => destinations.get(id));
  transfer.restore();
  return destinations.get(sourceId)!;
}

describe('ComarcaInventoryDecay', () => {
  it('applies one full detailed-style sweep at each midnight, including the first after a partial-day handoff', () => {
    const decay = ComarcaInventoryDecay.start(options());
    expect(decay.advanceTo(239)).toEqual([]);
    expect(decay.lastSweepTick).toBe(0);
    const reports = decay.advanceTo(480);
    expect(reports.map(row => row.tick)).toEqual([240, 480]);
    expect(stock(decay.toRecord()).count('berries')).toBe(81);
    expect(decay.lastSweepTick).toBe(480);
  });

  it('matches repeated Inventory.spoil calls and stays identical across split advances and JSON restore', () => {
    const transfer = transferred([['berries', 10]]);
    const continuous = ComarcaInventoryDecay.start(options(transfer, { spoilRate: 1 }));
    const split = ComarcaInventoryDecay.start(options(transfer, { spoilRate: 1 }));
    continuous.advanceTo(240 * 20);
    split.advanceTo(240 * 7);
    const restored = ComarcaInventoryDecay.fromRecord(wire(split.toRecord()));
    restored.advanceTo(240 * 20);
    expect(restored.toRecord()).toEqual(continuous.toRecord());

    const direct = new Inventory(); direct.add('berries', 10);
    for (let day = 0; day < 20; day++) direct.spoil(240, () => 1);
    expect(stock(continuous.toRecord()).count('berries')).toBe(direct.count('berries'));
  });

  it('advances midnight sweeps separately instead of batching elapsed time', () => {
    const transfer = transferred([['berries', 10]]);
    const decay = ComarcaInventoryDecay.start(options(transfer, { spoilRate: 0.2 }));
    const sweeps = decay.advanceTo(240 * 10);
    expect(sweeps).toHaveLength(10);

    const daily = new Inventory(); daily.add('berries', 10);
    for (let day = 0; day < 10; day++) daily.spoil(240 * 0.2, () => 1);
    const batched = new Inventory(); batched.add('berries', 10); batched.spoil(240 * 0.2 * 10, () => 1);
    expect(stock(decay.toRecord()).count('berries')).toBe(daily.count('berries'));
    expect(daily.count('berries')).toBeGreaterThan(batched.count('berries'));
  });

  it('keeps stock and orphan fractional carry unchanged when spoilRate is zero', () => {
    const inventory = new Inventory(); inventory.add('berries', 3); inventory.spoil(600, () => 1);
    inventory.remove('berries', 3); // The carry outlives its stack in the existing Inventory contract.
    inventory.add('meal', 2);
    const transfer = ComarcaInventoryTransfer.take([{ sourceId: 'store', inventory }]).toRecord();
    const decay = ComarcaInventoryDecay.start(options(transfer, { spoilRate: 0 }));
    const before = decay.toRecord().transfer;
    expect(decay.advanceTo(480).map(row => row.tick)).toEqual([240, 480]);
    expect(decay.toRecord().transfer).toEqual(before);
    const unchanged = stock(decay.toRecord()).transferSnapshot();
    expect(unchanged.stacks).toEqual([['meal', 2]]);
    expect(unchanged.spoilage).toEqual([['berries', 0.75]]);
  });

  it('uses each explicit source preservation factor and preserves source order', () => {
    const first = new Inventory(); first.add('berries', 100);
    const second = new Inventory(); second.add('berries', 100);
    const transfer = ComarcaInventoryTransfer.take([
      { sourceId: 'open', inventory: first }, { sourceId: 'cellar', inventory: second },
    ]).toRecord();
    const decay = ComarcaInventoryDecay.start(options(transfer, {
      preservation: [{ sourceId: 'open', factor: 1 }, { sourceId: 'cellar', factor: 4 }],
    }));
    decay.advanceTo(240);
    const record = decay.toRecord();
    expect(stock(record, 'open').count('berries')).toBe(90);
    expect(stock(record, 'cellar').count('berries')).toBe(98);
  });

  it('rejects invalid anchors, incomplete factors, malformed records, and backwards time', () => {
    const transfer = transferred([['berries', 2]]);
    expect(() => ComarcaInventoryDecay.start(options(transfer, { lastSweepTick: 240 }))).toThrow(/latest midnight/);
    expect(() => ComarcaInventoryDecay.start(options(transfer, { preservation: [] }))).toThrow(/every transfer source/);
    expect(() => ComarcaInventoryDecay.start(options(transfer, { preservation: [{ sourceId: 'store', factor: Number.NaN }] }))).toThrow(/finite/);
    const decay = ComarcaInventoryDecay.start(options(transfer));
    expect(() => decay.advanceTo(99)).toThrow(/backwards/);
    const corrupt = { ...decay.toRecord(), extra: true };
    expect(() => ComarcaInventoryDecay.fromRecord(corrupt)).toThrow(/unknown or missing fields/);
  });

  it('rejects carry overflow before a fully depleted stack can hide it, without publishing prior source changes', () => {
    const ordinary = new Inventory(); ordinary.add('berries', 100);
    const huge = new Inventory(); huge.add('meat', Number.MAX_VALUE / 40);
    const transfer = ComarcaInventoryTransfer.take([
      { sourceId: 'ordinary', inventory: ordinary }, { sourceId: 'huge', inventory: huge },
    ]).toRecord();
    const decay = ComarcaInventoryDecay.start(options(transfer, {
      preservation: [{ sourceId: 'ordinary', factor: 1 }, { sourceId: 'huge', factor: 0.05 }],
      ticksPerDay: 1, tick: 0, lastSweepTick: 0, spoilRate: 1e308,
    }));
    const before = decay.toRecord();
    expect(() => decay.advanceTo(1)).toThrow(/carry overflow/);
    expect(decay.toRecord()).toEqual(before);
  });


  it('rejects an overflowing spoil life even when the preservation factor itself is finite', () => {
    const decay = ComarcaInventoryDecay.start(options(transferred([['berries', 10]]), {
      preservation: [{ sourceId: 'store', factor: 1e308 }],
    }));
    const before = decay.toRecord();
    expect(() => decay.advanceTo(240)).toThrow(/life overflow/);
    expect(decay.toRecord()).toEqual(before);
  });

  it('rejects Inventory cache-version overflow without publishing the sweep', () => {
    const transfer = transferred([['berries', 100]]);
    const record = wire(transfer);
    const root = record.sources[0]!.graph.nodes[0]!;
    if (root.kind !== 'object') throw new Error('Inventory graph root must be an object');
    const version = root.fields.find(field => field[0] === 'version');
    if (!version) throw new Error('Inventory graph has no version field');
    version[1] = Number.MAX_SAFE_INTEGER;
    const decay = ComarcaInventoryDecay.start(options(record));
    const before = decay.toRecord();
    expect(() => decay.advanceTo(240)).toThrow(/version/);
    expect(decay.toRecord()).toEqual(before);
  });
});
