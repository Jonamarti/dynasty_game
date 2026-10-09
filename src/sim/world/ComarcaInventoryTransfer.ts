/**
 * M15 phase 34: one-shot escrow for caller-selected physical inventories.
 * It preserves item identities and Inventory's exact spoilage carry. It does
 * not itself wire the compact runtime's aggregate ration stock.
 */
import { Inventory, ITEMS, validateInventoryTransferState, type InventoryTransferState } from '../entities/Item.ts';
import { RATION_NUTRITION } from './ResourceProfile.ts';
import { fromObjectGraph, registerGraphPrototype, toObjectGraph, type ObjectGraph } from '../persistence/GraphRecords.ts';

export const COMARCA_INVENTORY_TRANSFER_VERSION = 1 as const;

export interface ComarcaInventorySource {
  readonly sourceId: string;
  readonly inventory: Inventory;
}

export interface ComarcaInventoryTransferRecord {
  readonly recordType: 'ComarcaInventoryTransferRecord';
  readonly version: typeof COMARCA_INVENTORY_TRANSFER_VERSION;
  readonly sources: readonly { readonly sourceId: string; readonly graph: ObjectGraph }[];
}

interface EscrowSource {
  readonly sourceId: string;
  readonly destination: Inventory;
  readonly escrow: Inventory;
}

export interface ComarcaInventoryRationPriority {
  readonly sourceId: string;
  readonly itemId: string;
}

export interface ComarcaInventoryRationRemoval {
  readonly sourceId: string;
  readonly itemId: string;
  /** Inventory item count removed; fractional counts follow Inventory.remove. */
  readonly count: number;
  readonly nutrition: number;
}

export interface ComarcaInventoryRationReport {
  readonly requestedRations: number;
  readonly consumedRations: number;
  readonly consumedNutrition: number;
  readonly unmetRations: number;
  readonly removals: readonly ComarcaInventoryRationRemoval[];
}

// EntityRecords normally registers this prototype when its codec is imported.
// Registering it here keeps this narrower codec independently usable as well.
registerGraphPrototype('Inventory', Inventory);

function fail(message: string): never { throw new TypeError(`Invalid comarca inventory transfer: ${message}`); }
function validSourceId(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function validateInventory(inventory: Inventory): InventoryTransferState {
  if (!(inventory instanceof Inventory)) fail('source is not an Inventory');
  const state = validateInventoryTransferState(inventory.transferSnapshot());
  let nutrition = 0;
  for (const [id, count] of state.stacks) {
    if (!Object.hasOwn(ITEMS, id)) fail(`unknown item ${id}`);
    const amount = count * ITEMS[id]!.nutrition;
    if (!Number.isFinite(amount) || !Number.isFinite(nutrition + amount)) fail('nutrition total is not finite');
    nutrition += amount;
  }
  for (const [id] of state.spoilage) if (!Object.hasOwn(ITEMS, id)) fail(`unknown spoilage item ${id}`);
  if (!Number.isFinite(RATION_NUTRITION) || RATION_NUTRITION <= 0 || !Number.isFinite(nutrition / RATION_NUTRITION)) fail('ration total is not finite');
  return state;
}
function nextDownPositive(value: number): number {
  if (value <= 0) return 0;
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, value);
  bits.setBigUint64(0, bits.getBigUint64(0) - 1n);
  return bits.getFloat64(0);
}
function totalNutrition(inventories: readonly Inventory[]): number {
  let total = 0;
  for (const inventory of inventories) {
    for (const [id, count] of inventory.entries()) {
      const amount = count * ITEMS[id]!.nutrition;
      if (!Number.isFinite(amount) || !Number.isFinite(total + amount)) fail('aggregate nutrition total is not finite');
      total += amount;
    }
  }
  if (!Number.isFinite(total / RATION_NUTRITION)) fail('aggregate ration total is not finite');
  return total;
}
function validateSources(sources: readonly ComarcaInventorySource[]): void {
  if (!Array.isArray(sources) || sources.length === 0) fail('at least one explicit source is required');
  const ids = new Set<string>();
  const inventories = new Set<Inventory>();
  for (const source of sources) {
    if (!source || !validSourceId(source.sourceId)) fail('source id must be a non-empty string');
    if (ids.has(source.sourceId)) fail(`duplicate source id ${source.sourceId}`);
    if (!(source.inventory instanceof Inventory)) fail(`source ${source.sourceId} is not an Inventory`);
    if (inventories.has(source.inventory)) fail('the same Inventory cannot be transferred twice');
    ids.add(source.sourceId);
    inventories.add(source.inventory);
  }
}

/**
 * A detached, explicitly scoped inventory escrow. JSON records preserve the
 * escrow graph, but source resolution remains the caller's responsibility;
 * this class does not claim global authority over cloned records.
 */
export class ComarcaInventoryTransfer {
  private restored = false;

  private constructor(private readonly sources: EscrowSource[]) {}

  /** Validate every source and build every graph clone before emptying any source. */
  static take(sources: readonly ComarcaInventorySource[]): ComarcaInventoryTransfer {
    validateSources(sources);
    const states = sources.map(source => validateInventory(source.inventory));
    // Graph hydration preserves every own Inventory field, including Map order and version.
    const escrow = sources.map(source => fromObjectGraph(toObjectGraph(source.inventory), 'Inventory', 'inventory transfer graph') as Inventory);
    totalNutrition(escrow);
    // Preflight every source first: a late stale/overflowing source cannot leave an earlier one empty.
    for (let i = 0; i < sources.length; i++) sources[i]!.inventory.assertCanTakeTransferState(states[i]!);
    for (let i = 0; i < sources.length; i++) sources[i]!.inventory.takeTransferState(states[i]!);
    return new ComarcaInventoryTransfer(sources.map((source, i) => ({
      sourceId: source.sourceId, destination: source.inventory, escrow: escrow[i]!,
    })));
  }

  get sourceIds(): readonly string[] { return this.sources.map(source => source.sourceId); }

  /** Exact edible nutrition and ration-equivalent views over the typed stock. */
  nutrition(sourceId?: string): number {
    return totalNutrition(this.sources.filter(source => sourceId === undefined || source.sourceId === sourceId).map(source => source.escrow));
  }

  rations(sourceId?: string): number { return this.nutrition(sourceId) / RATION_NUTRITION; }

  /** Consume an explicit quantity from a named source, using Inventory.remove semantics. */
  consume(sourceId: string, itemId: string, count: number): number {
    this.assertOpen();
    if (!Number.isFinite(count) || count <= 0) throw new RangeError('transfer consumption must be finite and positive');
    if (!Object.hasOwn(ITEMS, itemId)) throw new RangeError(`unknown transfer item ${itemId}`);
    const source = this.sources.find(row => row.sourceId === sourceId);
    if (!source) throw new RangeError(`unknown transfer source ${sourceId}`);
    if (Math.min(source.escrow.count(itemId), count) > 0 && source.escrow.version >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('inventory version cannot advance for transfer consumption');
    }
    return source.escrow.remove(itemId, count);
  }

  /**
   * Withdraw a finite ration demand from explicitly ordered edible stacks.
   * Every edible stack in escrow must appear exactly once in `priority`, so a
   * caller cannot accidentally get an implicit fallback order. All validation
   * and version increments are checked before the first stack is changed.
   */
  consumeRations(rations: number, priority: readonly ComarcaInventoryRationPriority[]): ComarcaInventoryRationReport {
    this.assertOpen();
    if (!Number.isFinite(rations) || rations < 0) throw new RangeError('ration demand must be finite and non-negative');
    if (!Array.isArray(priority)) throw new TypeError('ration priority must be an array');

    const sourceById = new Map(this.sources.map(source => [source.sourceId, source]));
    const seen = new Set<string>();
    const ordered: { source: EscrowSource; itemId: string; nutrition: number }[] = [];
    for (const row of priority) {
      if (!row || typeof row !== 'object' || !validSourceId(row.sourceId) || typeof row.itemId !== 'string' || !row.itemId) {
        throw new TypeError('ration priority rows require a source id and item id');
      }
      const key = `${row.sourceId}\u0000${row.itemId}`;
      if (seen.has(key)) throw new RangeError(`duplicate ration priority ${row.sourceId}/${row.itemId}`);
      const source = sourceById.get(row.sourceId);
      if (!source) throw new RangeError(`unknown transfer source ${row.sourceId}`);
      if (!Object.hasOwn(ITEMS, row.itemId)) throw new RangeError(`unknown ration priority item ${row.itemId}`);
      const item = ITEMS[row.itemId]!;
      if (!Number.isFinite(item.nutrition) || item.nutrition <= 0) {
        throw new RangeError(`ration priority item ${row.itemId} is not edible`);
      }
      seen.add(key);
      ordered.push({ source, itemId: row.itemId, nutrition: item.nutrition });
    }

    // Refuse a partial policy: even an item omitted near the end must not make
    // the earlier selections consume stock before the omission is discovered.
    for (const source of this.sources) {
      for (const [itemId, count] of validateInventory(source.escrow).stacks) {
        if (count > 0 && ITEMS[itemId]!.nutrition > 0 && !seen.has(`${source.sourceId}\u0000${itemId}`)) {
          throw new RangeError(`ration priority is missing ${source.sourceId}/${itemId}`);
        }
      }
    }

    const requestedNutrition = rations * RATION_NUTRITION;
    if (!Number.isFinite(requestedNutrition)) throw new RangeError('ration demand nutrition is not finite');
    let consumedNutrition = 0;
    const planned: ComarcaInventoryRationRemoval[] = [];
    const removalsPerSource = new Map<EscrowSource, number>();
    for (const row of ordered) {
      const remainingNutrition = Math.max(0, requestedNutrition - consumedNutrition);
      if (remainingNutrition <= 0) break;
      const available = row.source.escrow.count(row.itemId);
      if (available <= 0) continue;
      let count = Math.min(available, remainingNutrition / row.nutrition);
      if (!Number.isFinite(count) || count <= 0) continue;
      let nutrition = count * row.nutrition;
      // Floating division followed by multiplication can round above the demand.
      // Step down only in that case; report the nutrition actually removed.
      while (nutrition > remainingNutrition && count > 0) {
        count = nextDownPositive(count);
        nutrition = count * row.nutrition;
      }
      if (count <= 0 || (count < available && available - count === available)) continue;
      if (!Number.isFinite(nutrition) || !Number.isFinite(consumedNutrition + nutrition)) {
        throw new RangeError('ration consumption nutrition is not finite');
      }
      planned.push({ sourceId: row.source.sourceId, itemId: row.itemId, count, nutrition });
      removalsPerSource.set(row.source, (removalsPerSource.get(row.source) ?? 0) + 1);
      consumedNutrition += nutrition;
    }

    for (const [source, count] of removalsPerSource) {
      const state = validateInventory(source.escrow);
      if (state.version > Number.MAX_SAFE_INTEGER - count) {
        throw new RangeError('inventory version cannot advance for ration consumption');
      }
    }

    for (const removal of planned) {
      const source = sourceById.get(removal.sourceId)!;
      const taken = source.escrow.remove(removal.itemId, removal.count);
      if (taken !== removal.count) throw new RangeError('inventory changed during ration consumption');
    }

    const consumedRations = consumedNutrition / RATION_NUTRITION;
    return {
      requestedRations: rations,
      consumedRations,
      consumedNutrition,
      unmetRations: Math.max(0, rations - consumedRations),
      removals: planned,
    };
  }

  /**
   * Restore once, only when every original destination is entirely empty.
   * All destinations are checked before the first one is changed.
   */
  restore(): void {
    this.assertOpen();
    const states = this.sources.map(source => {
      const current = validateInventory(source.destination);
      if (current.stacks.length || current.spoilage.length) throw new RangeError(`inventory destination ${source.sourceId} is not empty`);
      return validateInventoryTransferState(source.escrow.transferSnapshot());
    });
    for (let i = 0; i < this.sources.length; i++) this.sources[i]!.destination.assertCanRestoreTransferState(states[i]!);
    for (let i = 0; i < this.sources.length; i++) this.sources[i]!.destination.restoreTransferState(states[i]!);
    this.restored = true;
  }

  toRecord(): ComarcaInventoryTransferRecord {
    this.assertOpen();
    const snapshots = this.sources.map(source => validateInventory(source.escrow));
    totalNutrition(this.sources.map(source => source.escrow));
    for (let i = 0; i < snapshots.length; i++) {
      if (this.sources[i]!.escrow.version !== snapshots[i]!.version) throw new RangeError('inventory escrow changed while recording');
    }
    return {
      recordType: 'ComarcaInventoryTransferRecord', version: COMARCA_INVENTORY_TRANSFER_VERSION,
      sources: this.sources.map(source => ({ sourceId: source.sourceId, graph: toObjectGraph(source.escrow) })),
    };
  }

  /** Resolve persisted source IDs without moving authority or mutating destinations. */
  static fromRecord(input: unknown, resolveInventory: (sourceId: string) => Inventory | undefined): ComarcaInventoryTransfer {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('record must be an object');
    const record = input as Partial<ComarcaInventoryTransferRecord>;
    if (Object.keys(input).length !== 3 || !Object.hasOwn(input, 'recordType') || !Object.hasOwn(input, 'version') || !Object.hasOwn(input, 'sources')) fail('record has unknown or missing fields');
    if (record.recordType !== 'ComarcaInventoryTransferRecord' || record.version !== COMARCA_INVENTORY_TRANSFER_VERSION || !Array.isArray(record.sources) || record.sources.length === 0) fail('expected v1 record');
    const ids = new Set<string>();
    const inventories = new Set<Inventory>();
    const sources: EscrowSource[] = [];
    for (const raw of record.sources) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 2 ||
          !Object.hasOwn(raw, 'sourceId') || !Object.hasOwn(raw, 'graph') || !validSourceId(raw.sourceId)) fail('malformed source row');
      if (ids.has(raw.sourceId)) fail(`duplicate source id ${raw.sourceId}`);
      const destination = resolveInventory(raw.sourceId);
      if (!(destination instanceof Inventory)) fail(`source ${raw.sourceId} did not resolve to an Inventory`);
      if (inventories.has(destination)) fail('source IDs resolved to the same Inventory');
      const escrow = fromObjectGraph(raw.graph, 'Inventory', 'inventory transfer graph') as Inventory;
      validateInventory(escrow);
      ids.add(raw.sourceId);
      inventories.add(destination);
      sources.push({ sourceId: raw.sourceId, destination, escrow });
    }
    totalNutrition(sources.map(source => source.escrow));
    return new ComarcaInventoryTransfer(sources);
  }

  private assertOpen(): void {
    if (this.restored) throw new RangeError('inventory transfer was already restored');
  }
}