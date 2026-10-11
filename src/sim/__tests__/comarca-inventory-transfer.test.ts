import { describe, expect, it, vi } from 'vitest';
import { Inventory, ITEMS } from '../entities/Item.ts';
import { RATION_NUTRITION } from '../world/ResourceProfile.ts';
import {
  ComarcaInventoryTransfer,
  COMARCA_INVENTORY_TRANSFER_VERSION,
  type ComarcaInventoryTransferRecord,
} from '../world/ComarcaInventoryTransfer.ts';
import { toObjectGraph, type ObjectGraph } from '../persistence/GraphRecords.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function garmentRows(record: ComarcaInventoryTransferRecord): { values: unknown[] } {
  const graph = record.sources[0]!.graph as ObjectGraph;
  const root = graph.nodes[(graph.root as { ref: number }).ref];
  if (!root || root.kind !== 'object') throw new Error('Inventory graph root must be an object');
  const field = root.fields.find(([name]) => name === 'garmentUnits')?.[1];
  if (!field || typeof field !== 'object' || !('ref' in field)) throw new Error('Inventory graph has no garment rows');
  const node = graph.nodes[field.ref];
  if (!node || node.kind !== 'array') throw new Error('Inventory garment rows must be an array');
  return node as { values: unknown[] };
}

function garmentRow(record: ComarcaInventoryTransferRecord, index: number): { fields: [string, unknown][] } {
  const graph = record.sources[0]!.graph as ObjectGraph;
  const ref = garmentRows(record).values[index];
  if (!ref || typeof ref !== 'object' || !('ref' in ref)) throw new Error('Garment row must be an object reference');
  const node = graph.nodes[ref.ref];
  if (!node || node.kind !== 'object') throw new Error('Garment row must be an object');
  return node as { fields: [string, unknown][] };
}

describe('ComarcaInventoryTransfer', () => {
  it('round-trips a physical garment through take, food consumption, JSON, and restore', () => {
    const pack = new Inventory();
    pack.add('fur_hat', 1);
    pack.add('berries', 3);
    const original = pack.garmentUnitsOf('fur_hat')[0]!;
    pack.setGarmentUnitCondition(original.unitId, 0.31, 73);
    const transfer = ComarcaInventoryTransfer.take([{ sourceId: 'person:garment-pack', inventory: pack }]);
    expect(pack.garmentUnitsOf()).toEqual([]);

    const checkpoint = wire(transfer.toRecord());
    const decoded = ComarcaInventoryTransfer.fromRecord(checkpoint, id => id === 'person:garment-pack' ? pack : undefined);
    expect(decoded.consume('person:garment-pack', 'berries', 1)).toBe(1);
    const afterFood = wire(decoded.toRecord());
    const restored = ComarcaInventoryTransfer.fromRecord(afterFood, id => id === 'person:garment-pack' ? pack : undefined);
    restored.restore();

    expect(pack.count('berries')).toBe(2);
    expect(pack.garmentUnitsOf('fur_hat')).toEqual([
      { unitId: original.unitId, itemId: 'fur_hat', wear: 0.31, repairProgress: 73 },
    ]);
  });

  it('rolls back all source inventories if a later take throws after extraction', () => {
    const first = new Inventory();
    first.add('fur_hat', 1);
    first.setGarmentUnitCondition(first.garmentUnitsOf('fur_hat')[0]!.unitId, 0.28, 41);
    const second = new Inventory(); second.add('berries', 2);
    const firstUnit = first.garmentUnitsOf('fur_hat')[0]!;
    const originalTake = Inventory.prototype.takeTransferState;
    let calls = 0;
    const takeSpy = vi.spyOn(Inventory.prototype, 'takeTransferState').mockImplementation(function(
      this: Inventory, state,
    ) {
      originalTake.call(this, state);
      if (++calls === 2) throw new Error('simulated escrow extraction failure');
    });
    try {
      expect(() => ComarcaInventoryTransfer.take([
        { sourceId: 'first', inventory: first }, { sourceId: 'second', inventory: second },
      ])).toThrow('simulated escrow extraction failure');
    } finally {
      takeSpy.mockRestore();
    }
    expect(first.garmentUnitsOf('fur_hat')).toEqual([firstUnit]);
    expect(second.count('berries')).toBe(2);
  });

  it('rolls back partially restored destinations and leaves the escrow retryable', () => {
    const pack = new Inventory(); pack.add('fur_hat', 1);
    const initial = pack.garmentUnitsOf('fur_hat')[0]!;
    pack.setGarmentUnitCondition(initial.unitId, 0.42, 109);
    const original = pack.garmentUnitsOf('fur_hat')[0]!;
    const food = new Inventory(); food.add('meal', 1);
    const transfer = ComarcaInventoryTransfer.take([
      { sourceId: 'garments', inventory: pack }, { sourceId: 'food', inventory: food },
    ]);
    const originalRestore = Inventory.prototype.restoreTransferState;
    let calls = 0;
    const restoreSpy = vi.spyOn(Inventory.prototype, 'restoreTransferState').mockImplementation(function(
      this: Inventory, state,
    ) {
      originalRestore.call(this, state);
      if (++calls === 2) throw new Error('simulated escrow restoration failure');
    });
    try {
      expect(() => transfer.restore()).toThrow('simulated escrow restoration failure');
    } finally {
      restoreSpy.mockRestore();
    }
    expect(pack.entries()).toEqual([]);
    expect(food.entries()).toEqual([]);
    expect(pack.garmentUnitsOf()).toEqual([]);
    expect(transfer.nutrition()).toBe(RATION_NUTRITION + ITEMS.meal!.nutrition);
    transfer.restore();
    expect(pack.garmentUnitsOf('fur_hat')).toEqual([original]);
    expect(food.count('meal')).toBe(1);
  });

  it('escrows selected typed stocks, carries spoilage through JSON, and restores once', () => {
    const pack = new Inventory();
    pack.add('berries', 3);
    pack.spoil(600, () => 1); // 0.75 fractional loss carried by this stack.
    const store = new Inventory();
    store.add('meal', 2);
    store.add('grain', 4); // Edible after processing, but nutrition is currently zero.
    const sources = new Map([['person:7:pack', pack], ['building:9:store', store]]);

    const escrow = ComarcaInventoryTransfer.take([
      { sourceId: 'person:7:pack', inventory: pack },
      { sourceId: 'building:9:store', inventory: store },
    ]);
    expect(pack.entries()).toEqual([]);
    expect(store.entries()).toEqual([]);
    expect(escrow.nutrition()).toBe(3 * 14 + 2 * 34);
    expect(escrow.rations()).toBe((3 * 14 + 2 * 34) / RATION_NUTRITION);

    expect(escrow.consume('person:7:pack', 'berries', 1)).toBe(1);
    const restored = ComarcaInventoryTransfer.fromRecord(wire(escrow.toRecord()), id => sources.get(id));
    restored.restore();
    expect(pack.count('berries')).toBe(2);
    expect(pack.count('grain')).toBe(0);
    expect(store.count('meal')).toBe(2);
    expect(store.count('grain')).toBe(4);
    expect(pack.transferSnapshot().spoilage).toEqual([['berries', 0.75]]);
    expect(restored.nutrition()).toBe(2 * 14 + 2 * 34); // Historical escrow view remains inspectable after restore.
    expect(() => restored.consume('person:7:pack', 'berries', 1)).toThrow(/already restored/);
    expect(() => restored.toRecord()).toThrow(/already restored/);
    expect(() => restored.restore()).toThrow(/already restored/);
  });

  it('validates every explicit source and rejects duplicate IDs or Inventory aliases before mutation', () => {
    const first = new Inventory(); first.add('berries', 2);
    const second = new Inventory(); second.add('meal', 1);
    expect(() => ComarcaInventoryTransfer.take([
      { sourceId: 'same', inventory: first }, { sourceId: 'same', inventory: second },
    ])).toThrow(/duplicate source id/);
    expect(() => ComarcaInventoryTransfer.take([
      { sourceId: 'one', inventory: first }, { sourceId: 'two', inventory: first },
    ])).toThrow(/same Inventory/);
    expect(first.count('berries')).toBe(2);
    expect(second.count('meal')).toBe(1);
  });

  it('rejects an invalid later source without partially emptying earlier sources', () => {
    const first = new Inventory(); first.add('berries', 2);
    const invalid = new Inventory(); invalid.add('not-an-item', 1);
    expect(() => ComarcaInventoryTransfer.take([
      { sourceId: 'first', inventory: first }, { sourceId: 'invalid', inventory: invalid },
    ])).toThrow(/unknown item/);
    expect(first.count('berries')).toBe(2);
    expect(invalid.count('not-an-item')).toBe(1);
  });

  it('checks every return destination before changing any of them', () => {
    const first = new Inventory(); first.add('berries', 2);
    const second = new Inventory(); second.add('meal', 1);
    const transfer = ComarcaInventoryTransfer.take([
      { sourceId: 'first', inventory: first }, { sourceId: 'second', inventory: second },
    ]);
    second.add('sticks', 1);
    expect(() => transfer.restore()).toThrow(/not empty/);
    expect(first.entries()).toEqual([]);
    expect(second.entries()).toEqual([['sticks', 1]]);
    second.remove('sticks', 1);
    transfer.restore();
    expect(first.count('berries')).toBe(2);
    expect(second.count('meal')).toBe(1);
  });

  it('uses Inventory.remove carry semantics and a JSON clone has no global authority claim', () => {
    const inventory = new Inventory();
    inventory.add('berries', 2);
    inventory.spoil(600, () => 1); // fractional carry survives remove unchanged.
    const transfer = ComarcaInventoryTransfer.take([{ sourceId: 'pack', inventory }]);
    const cloned = ComarcaInventoryTransfer.fromRecord(wire(transfer.toRecord()), () => inventory);
    expect(cloned.consume('pack', 'berries', 2)).toBe(2);
    expect(cloned.nutrition()).toBe(0);
    cloned.restore();
    expect(inventory.entries()).toEqual([]);
    expect(inventory.transferSnapshot().spoilage).toEqual([['berries', 0.5]]);
    expect(() => transfer.restore()).toThrow(/not empty/);
  });
  it('rejects corrupt JSON graphs, missing source resolution, and aliased resolver results without mutation', () => {
    const first = new Inventory(); first.add('berries', 2);
    const second = new Inventory(); second.add('meal', 1);
    const transfer = ComarcaInventoryTransfer.take([
      { sourceId: 'first', inventory: first }, { sourceId: 'second', inventory: second },
    ]);
    const record = wire(transfer.toRecord());
    expect(() => ComarcaInventoryTransfer.fromRecord(record, id => id === 'first' ? first : undefined)).toThrow(/did not resolve/);
    expect(first.entries()).toEqual([]);
    expect(second.entries()).toEqual([]);
    expect(() => ComarcaInventoryTransfer.fromRecord(record, () => first)).toThrow(/same Inventory/);
    const corrupt = wire(record);
    const node = corrupt.sources[0]!.graph.nodes[0]!;
    if (node.kind === 'object') node.prototype = 'UnregisteredInventory';
    expect(() => ComarcaInventoryTransfer.fromRecord(corrupt, id => id === 'first' ? first : second)).toThrow(/prototype|graph/);
    expect(first.entries()).toEqual([]);
    expect(second.entries()).toEqual([]);
  });

  it('rejects malformed, missing, and duplicate garment condition rows in JSON escrow', () => {
    const source = new Inventory();
    source.add('fur_hat', 2);
    const [first, second] = source.garmentUnitsOf('fur_hat');
    source.setGarmentUnitCondition(first!.unitId, 0.25, 19);
    source.setGarmentUnitCondition(second!.unitId, 0.75, 91);
    const transfer = ComarcaInventoryTransfer.take([{ sourceId: 'garments', inventory: source }]);
    const resolve = (id: string) => id === 'garments' ? source : undefined;

    const malformed = wire(transfer.toRecord());
    const wear = garmentRow(malformed, 0).fields.find(([name]) => name === 'wear')!;
    wear[1] = 1.5;
    expect(() => ComarcaInventoryTransfer.fromRecord(malformed, resolve)).toThrow(/invalid identity, condition, or repair progress/);

    const missing = wire(transfer.toRecord());
    garmentRows(missing).values.pop();
    expect(() => ComarcaInventoryTransfer.fromRecord(missing, resolve)).toThrow(/do not match garment counts/);

    const duplicate = wire(transfer.toRecord());
    const firstId = garmentRow(duplicate, 0).fields.find(([name]) => name === 'unitId')![1];
    garmentRow(duplicate, 1).fields.find(([name]) => name === 'unitId')![1] = firstId;
    expect(() => ComarcaInventoryTransfer.fromRecord(duplicate, resolve)).toThrow(/duplicate garment unit identity/);
    expect(source.entries()).toEqual([]);
    expect(source.garmentUnitsOf()).toEqual([]);
  });

  it('detects stale stack or carry snapshots before extraction', () => {
    const inventory = new Inventory();
    inventory.add('berries', 2);
    const expected = inventory.transferSnapshot();
    inventory.add('apple', 1); // The version and stack state both changed after the snapshot.
    expect(() => inventory.takeTransferState(expected)).toThrow(/changed before transfer/);
    expect(inventory.count('berries')).toBe(2);
    expect(inventory.count('apple')).toBe(1);

    const carrySnapshot = inventory.transferSnapshot();
    inventory.spoil(600, () => 1); // Changes carry without changing Inventory.version.
    expect(() => inventory.takeTransferState(carrySnapshot)).toThrow(/changed before transfer/);
    expect(inventory.transferSnapshot().spoilage).toEqual([['berries', 0.5], ['apple', 0.1]]);
  });

  it('preflights version overflow for every source and every destination', () => {
    const first = new Inventory(); first.add('berries', 1);
    const overflow = new Inventory(); overflow.add('meal', 1);
    (overflow as unknown as { version: number }).version = Number.MAX_SAFE_INTEGER;
    expect(() => ComarcaInventoryTransfer.take([
      { sourceId: 'first', inventory: first }, { sourceId: 'overflow', inventory: overflow },
    ])).toThrow(/version cannot advance/);
    expect(first.count('berries')).toBe(1);
    expect(overflow.count('meal')).toBe(1);

    const a = new Inventory(); a.add('berries', 1);
    const b = new Inventory(); b.add('meal', 1);
    const transfer = ComarcaInventoryTransfer.take([{ sourceId: 'a', inventory: a }, { sourceId: 'b', inventory: b }]);
    (b as unknown as { version: number }).version = Number.MAX_SAFE_INTEGER;
    expect(() => transfer.restore()).toThrow(/version cannot advance/);
    expect(a.entries()).toEqual([]);
    expect(b.entries()).toEqual([]);
    (b as unknown as { version: number }).version = Number.MAX_SAFE_INTEGER - 1;
    transfer.restore();
    expect(a.count('berries')).toBe(1);
    expect(b.count('meal')).toBe(1);
  });

  it('rejects non-finite nutrition before extraction and while hydrating a corrupt record', () => {
    const huge = new Inventory(); huge.add('meat', Number.MAX_VALUE);
    expect(() => ComarcaInventoryTransfer.take([{ sourceId: 'huge', inventory: huge }])).toThrow(/nutrition total is not finite/);
    expect(huge.count('meat')).toBe(Number.MAX_VALUE);
    const corrupt = {
      recordType: 'ComarcaInventoryTransferRecord', version: COMARCA_INVENTORY_TRANSFER_VERSION,
      sources: [{ sourceId: 'huge', graph: toObjectGraph(huge) }],
    };
    const destination = new Inventory();
    expect(() => ComarcaInventoryTransfer.fromRecord(corrupt, () => destination)).toThrow(/nutrition total is not finite/);
    expect(destination.entries()).toEqual([]);
  });
  it('preflights aggregate nutrition across sources before extraction and record hydration', () => {
    const first = new Inventory(); first.add('meat', Number.MAX_VALUE / 40);
    const second = new Inventory(); second.add('meat', Number.MAX_VALUE / 40);
    expect(() => ComarcaInventoryTransfer.take([
      { sourceId: 'first', inventory: first }, { sourceId: 'second', inventory: second },
    ])).toThrow(/aggregate nutrition total is not finite/);
    expect(first.count('meat')).toBe(Number.MAX_VALUE / 40);
    expect(second.count('meat')).toBe(Number.MAX_VALUE / 40);

    const record = {
      recordType: 'ComarcaInventoryTransferRecord', version: COMARCA_INVENTORY_TRANSFER_VERSION,
      sources: [
        { sourceId: 'first', graph: toObjectGraph(first) },
        { sourceId: 'second', graph: toObjectGraph(second) },
      ],
    };
    const destinations = new Map([['first', new Inventory()], ['second', new Inventory()]]);
    expect(() => ComarcaInventoryTransfer.fromRecord(record, id => destinations.get(id))).toThrow(/aggregate nutrition total is not finite/);
    expect(destinations.get('first')!.entries()).toEqual([]);
    expect(destinations.get('second')!.entries()).toEqual([]);
  });

  it('rejects a consumption that would overflow the escrow Inventory version', () => {
    const source = new Inventory(); source.add('berries', 1);
    const packet = ComarcaInventoryTransfer.take([{ sourceId: 'pack', inventory: source }]);
    const record = wire(packet.toRecord());
    const node = record.sources[0]!.graph.nodes[0]!;
    if (node.kind !== 'object') throw new Error('Inventory graph root must be an object');
    const version = node.fields.find(field => field[0] === 'version');
    if (!version) throw new Error('Inventory graph has no version field');
    version[1] = Number.MAX_SAFE_INTEGER;
    const escrow = ComarcaInventoryTransfer.fromRecord(record, () => source);
    expect(() => escrow.consume('pack', 'berries', 1)).toThrow(/version cannot advance/);
    expect(escrow.nutrition()).toBe(14);
    expect(source.entries()).toEqual([]);
  });
});
