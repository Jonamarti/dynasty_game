/**
 * M15 phase 34: detached, dated spoilage for a transferred physical portfolio.
 * This owns only the escrow record; it neither moves live inventories nor
 * reconciles aggregate compact rations with item withdrawals.
 */
import { Inventory, ITEMS, validateInventoryTransferState } from '../entities/Item.ts';
import {
  ComarcaInventoryTransfer, COMARCA_INVENTORY_TRANSFER_VERSION,
  type ComarcaInventoryTransferRecord,
} from './ComarcaInventoryTransfer.ts';
import { fromObjectGraph, registerGraphPrototype, toObjectGraph } from '../persistence/GraphRecords.ts';

export const COMARCA_INVENTORY_DECAY_VERSION = 1 as const;
export interface ComarcaInventoryPreservation {
  readonly sourceId: string;
  readonly factor: number;
}
export interface ComarcaInventoryDecayRecord {
  readonly recordType: 'ComarcaInventoryDecayRecord';
  readonly version: typeof COMARCA_INVENTORY_DECAY_VERSION;
  readonly transfer: ComarcaInventoryTransferRecord;
  readonly ticksPerDay: number;
  readonly tick: number;
  readonly lastSweepTick: number;
  readonly spoilRate: number;
  readonly preservation: readonly ComarcaInventoryPreservation[];
}
export interface ComarcaInventoryDecayOptions {
  readonly transfer: ComarcaInventoryTransferRecord;
  readonly ticksPerDay: number;
  readonly tick: number;
  readonly lastSweepTick: number;
  readonly spoilRate: number;
  readonly preservation: readonly ComarcaInventoryPreservation[];
}
export interface ComarcaInventoryDecaySweep {
  readonly tick: number;
  readonly lostBySource: readonly {
    readonly sourceId: string;
    readonly items: readonly { readonly itemId: string; readonly count: number }[];
  }[];
}

const RECORD_KEYS = ['recordType', 'version', 'transfer', 'ticksPerDay', 'tick', 'lastSweepTick', 'spoilRate', 'preservation'].sort();
const TRANSFER_KEYS = ['recordType', 'version', 'sources'].sort();
const PRESERVATION_KEYS = ['sourceId', 'factor'].sort();

function fail(message: string): never { throw new TypeError(`Invalid comarca inventory decay: ${message}`); }
function exactKeys(value: object, expected: readonly string[], label: string): void {
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) fail(`${label} has unknown or missing fields`);
}
function safeTick(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new RangeError(`${label} must be a safe non-negative tick`);
}
function nonNegativeFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative`);
}

registerGraphPrototype('Inventory', Inventory);

function canonicalTransfer(value: unknown): ComarcaInventoryTransferRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('transfer must be a record');
  exactKeys(value, TRANSFER_KEYS, 'transfer');
  const candidate = value as Partial<ComarcaInventoryTransferRecord>;
  if (candidate.recordType !== 'ComarcaInventoryTransferRecord' || candidate.version !== COMARCA_INVENTORY_TRANSFER_VERSION ||
      !Array.isArray(candidate.sources) || candidate.sources.length === 0) fail('expected a non-empty transfer v1 record');
  const targets = new Map<string, Inventory>();
  return ComarcaInventoryTransfer.fromRecord(candidate, sourceId => {
    let target = targets.get(sourceId);
    if (!target) { target = new Inventory(); targets.set(sourceId, target); }
    return target;
  }).toRecord();
}

function validateOptions(input: ComarcaInventoryDecayOptions): ComarcaInventoryDecayRecord {
  if (!input || typeof input !== 'object') throw new TypeError('decay options are required');
  const transfer = canonicalTransfer(input.transfer);
  if (!Number.isSafeInteger(input.ticksPerDay) || input.ticksPerDay <= 0) throw new RangeError('ticksPerDay must be a positive safe integer');
  safeTick(input.tick, 'tick');
  safeTick(input.lastSweepTick, 'lastSweepTick');
  if (input.lastSweepTick !== Math.floor(input.tick / input.ticksPerDay) * input.ticksPerDay) {
    throw new RangeError('lastSweepTick must be the latest midnight at or before tick');
  }
  nonNegativeFinite(input.spoilRate, 'spoilRate');
  if (!Number.isFinite(input.ticksPerDay * input.spoilRate)) throw new RangeError('daily spoilage elapsed ticks must be finite');
  if (!Array.isArray(input.preservation) || input.preservation.length !== transfer.sources.length) fail('preservation must name every transfer source exactly once');
  const preservation: ComarcaInventoryPreservation[] = [];
  for (let i = 0; i < input.preservation.length; i++) {
    const row = input.preservation[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('malformed preservation row');
    exactKeys(row, PRESERVATION_KEYS, 'preservation row');
    if (row.sourceId !== transfer.sources[i]!.sourceId) fail('preservation rows must match transfer source order exactly');
    nonNegativeFinite(row.factor, `preservation factor for ${row.sourceId}`);
    preservation.push({ sourceId: row.sourceId, factor: row.factor });
  }
  return {
    recordType: 'ComarcaInventoryDecayRecord', version: COMARCA_INVENTORY_DECAY_VERSION,
    transfer, ticksPerDay: input.ticksPerDay, tick: input.tick, lastSweepTick: input.lastSweepTick,
    spoilRate: input.spoilRate, preservation,
  };
}

function validateRecord(input: unknown): ComarcaInventoryDecayRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('record must be an object');
  exactKeys(input, RECORD_KEYS, 'record');
  const record = input as Partial<ComarcaInventoryDecayRecord>;
  if (record.recordType !== 'ComarcaInventoryDecayRecord' || record.version !== COMARCA_INVENTORY_DECAY_VERSION) fail('expected v1 record');
  if (!Array.isArray(record.preservation)) fail('preservation must be an array');
  return validateOptions({
    transfer: record.transfer as ComarcaInventoryTransferRecord,
    ticksPerDay: record.ticksPerDay as number,
    tick: record.tick as number,
    lastSweepTick: record.lastSweepTick as number,
    spoilRate: record.spoilRate as number,
    preservation: record.preservation,
  });
}

/**
 * Detached JSON spoilage clock. A midnight ages the current physical stack once,
 * including when ownership began mid-day: those items existed throughout that
 * game day. Aggregate compact consumption is outside this class, so exact
 * correspondence is claimed only when no unobserved stock changes occur.
 */
export class ComarcaInventoryDecay {
  private constructor(private state: ComarcaInventoryDecayRecord) {}

  static start(options: ComarcaInventoryDecayOptions): ComarcaInventoryDecay {
    return new ComarcaInventoryDecay(validateOptions(options));
  }
  static fromRecord(input: unknown): ComarcaInventoryDecay {
    return new ComarcaInventoryDecay(validateRecord(input));
  }

  get tick(): number { return this.state.tick; }
  get lastSweepTick(): number { return this.state.lastSweepTick; }
  toRecord(): ComarcaInventoryDecayRecord { return validateRecord(this.state); }

  /** Apply one detailed-style full-day sweep at each midnight crossed. */
  advanceTo(targetTick: number): readonly ComarcaInventoryDecaySweep[] {
    safeTick(targetTick, 'targetTick');
    if (targetTick < this.state.tick) throw new RangeError('decay clock cannot move backwards');
    if (targetTick === this.state.tick) return [];

    let candidate = this.state.transfer;
    let lastSweepTick = this.state.lastSweepTick;
    const sweeps: ComarcaInventoryDecaySweep[] = [];
    const elapsed = this.state.ticksPerDay * this.state.spoilRate;
    while (true) {
      const boundary = lastSweepTick + this.state.ticksPerDay;
      if (!Number.isSafeInteger(boundary) || boundary > targetTick) break;
      const next = this.applySweep(candidate, boundary, elapsed);
      candidate = next.transfer;
      lastSweepTick = boundary;
      sweeps.push(next.report);
    }
    this.state = validateRecord({ ...this.state, transfer: candidate, tick: targetTick, lastSweepTick });
    return sweeps;
  }

  private applySweep(
    transfer: ComarcaInventoryTransferRecord,
    boundary: number,
    elapsed: number,
  ): { transfer: ComarcaInventoryTransferRecord; report: ComarcaInventoryDecaySweep } {
    const lostBySource: ComarcaInventoryDecaySweep['lostBySource'][number][] = [];
    const sources = transfer.sources.map(row => {
      const inventory = fromObjectGraph(row.graph, 'Inventory', 'inventory decay graph') as Inventory;
      const before = validateInventoryTransferState(inventory.transferSnapshot());
      const factor = this.state.preservation.find(item => item.sourceId === row.sourceId)!.factor;
      if (elapsed > 0) for (const [itemId, count] of before.stacks) {
        const spoilTicks = ITEMS[itemId]?.spoilTicks ?? 0;
        if (spoilTicks <= 0) continue;
        const life = spoilTicks * Math.max(0.05, factor);
        if (!Number.isFinite(life) || life <= 0) throw new RangeError(`spoilage life overflow for ${itemId}`);
        const carried = (before.spoilage.find(([id]) => id === itemId)?.[1] ?? 0) + (elapsed / life) * count;
        // Validate before Inventory.spoil: full depletion otherwise hides Infinity by deleting its carry.
        if (!Number.isFinite(carried) || carried < 0) throw new RangeError(`spoilage carry overflow for ${itemId}`);
      }
      const lost = elapsed > 0 ? inventory.spoil(elapsed, () => factor) : new Map<string, number>();
      validateInventoryTransferState(inventory.transferSnapshot());
      lostBySource.push({
        sourceId: row.sourceId,
        items: [...lost].map(([itemId, count]) => ({ itemId, count })),
      });
      return { sourceId: row.sourceId, graph: toObjectGraph(inventory) };
    });
    const updated: ComarcaInventoryTransferRecord = { ...transfer, sources };
    canonicalTransfer(updated);
    return { transfer: updated, report: { tick: boundary, lostBySource } };
  }
}
