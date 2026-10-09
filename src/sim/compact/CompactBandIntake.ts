/**
 * Finite daily intake quotas for a compact band, M15 phase 1c.
 *
 * Harvest and need are measured elsewhere. This class applies a caller's explicit per-person quotas to the
 * measured compact-body intake requests; it invents neither a harvest rate nor a ration-to-need conversion.
 * Day numbers are elapsed, zero-based days: `floor((tick - 1) / ticksPerDay)`.
 */
import type { CompactPerson } from './CompactPerson.ts';

export const COMPACT_BAND_INTAKE_VERSION = 1 as const;
export type CompactWaterAvailability = number | 'unbounded';

export interface CompactBandIntakeAllocation {
  readonly personId: number;
  readonly foodQuota: number;
  readonly waterQuota: CompactWaterAvailability;
}
export interface CompactBandIntakeAllocationRecord extends CompactBandIntakeAllocation {
  readonly foodUsed: number;
  readonly waterUsed: number;
}
export interface CompactBandIntakeDay {
  readonly day: number;
  /** Aggregate hunger-relief budget, in the same units as CompactBody's callback. */
  readonly foodBudget: number;
  /** A missing water source is represented as 0; 'unbounded' requires a real unlimited source. */
  readonly waterAvailability: CompactWaterAvailability;
  /** Explicit allocations; no hidden equal-share policy. */
  readonly allocations: readonly CompactBandIntakeAllocation[];
}
export interface CompactBandIntakeRecord {
  readonly recordType: 'CompactBandIntakeRecord';
  readonly version: typeof COMPACT_BAND_INTAKE_VERSION;
  readonly ticksPerDay: number;
  readonly day: number | null;
  readonly foodBudget: number;
  readonly waterAvailability: CompactWaterAvailability;
  readonly allocations: readonly CompactBandIntakeAllocationRecord[];
}
export interface CompactBandIntakeReport {
  readonly day: number | null;
  readonly foodBudget: number;
  readonly foodQuota: number;
  readonly foodUsed: number;
  readonly foodRemaining: number;
  readonly waterAvailability: CompactWaterAvailability;
  readonly waterQuota: CompactWaterAvailability;
  readonly waterUsed: number;
  readonly waterRemaining: CompactWaterAvailability;
  readonly personCount: number;
}
export interface CompactRationRelief { readonly hunger: number; readonly thirst: number }

const RECORD_KEYS = ['recordType', 'version', 'ticksPerDay', 'day', 'foodBudget', 'waterAvailability', 'allocations'].sort();
const ALLOCATION_KEYS = ['personId', 'foodQuota', 'waterQuota', 'foodUsed', 'waterUsed'].sort();

function nonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative`);
}
function safeDay(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a safe non-negative integer`);
}
function waterAmount(value: CompactWaterAvailability, label: string): void {
  if (value !== 'unbounded') nonNegative(value, label);
}
function exactKeys(value: object, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || actual.some((key, i) => key !== keys[i])) throw new RangeError(`${label} fields do not match v1`);
}

/** Owns one active day plan. All named bodies must be advanced in day order before the next plan begins. */
export class CompactBandIntake {
  readonly ticksPerDay: number;
  private currentDay: number | null = null;
  private foodBudget = 0;
  private waterAvailability: CompactWaterAvailability = 0;
  private readonly allocations = new Map<number, { foodQuota: number; foodUsed: number; waterQuota: CompactWaterAvailability; waterUsed: number }>();

  constructor(options: { readonly ticksPerDay: number }) {
    if (!Number.isSafeInteger(options.ticksPerDay) || options.ticksPerDay <= 0) throw new RangeError('ticksPerDay must be a positive safe integer');
    this.ticksPerDay = options.ticksPerDay;
  }

  /** Start the next elapsed calendar day once; repeated beginDay cannot renew a consumed quota. */
  beginDay(input: CompactBandIntakeDay): void {
    safeDay(input.day, 'intake day');
    const expected = this.currentDay === null ? input.day : this.currentDay + 1;
    if (!Number.isSafeInteger(expected) || input.day !== expected) throw new RangeError(`intake day must advance once: ${this.currentDay} -> ${input.day}`);
    nonNegative(input.foodBudget, 'food budget');
    waterAmount(input.waterAvailability, 'water availability');
    if (!Array.isArray(input.allocations)) throw new TypeError('intake allocations must be an array');

    const next = new Map<number, { foodQuota: number; foodUsed: number; waterQuota: CompactWaterAvailability; waterUsed: number }>();
    let foodQuota = 0, finiteWaterQuota = 0;
    for (const allocation of input.allocations) {
      if (!allocation || typeof allocation !== 'object') throw new TypeError('intake allocation must be an object');
      if (!Number.isSafeInteger(allocation.personId) || allocation.personId < 0) throw new RangeError('intake person id must be a non-negative safe integer');
      if (next.has(allocation.personId)) throw new RangeError(`duplicate intake person ${allocation.personId}`);
      nonNegative(allocation.foodQuota, 'person food quota');
      waterAmount(allocation.waterQuota, 'person water quota');
      if (allocation.waterQuota === 'unbounded') {
        if (input.waterAvailability !== 'unbounded') throw new RangeError('unbounded person water quota requires an unbounded source');
        // This member has direct access to a source the caller explicitly marked unlimited.
      } else {
        finiteWaterQuota += allocation.waterQuota;
      }
      foodQuota += allocation.foodQuota;
      if (!Number.isFinite(foodQuota) || !Number.isFinite(finiteWaterQuota)) throw new RangeError('intake quotas overflow');
      next.set(allocation.personId, { foodQuota: allocation.foodQuota, foodUsed: 0, waterQuota: allocation.waterQuota, waterUsed: 0 });
    }
    if (foodQuota > input.foodBudget) throw new RangeError('person food quotas exceed daily food budget');
    if (input.waterAvailability !== 'unbounded' && finiteWaterQuota > input.waterAvailability) throw new RangeError('person water quotas exceed daily water availability');

    this.currentDay = input.day;
    this.foodBudget = input.foodBudget;
    this.waterAvailability = input.waterAvailability;
    this.allocations.clear();
    for (const [id, value] of next) this.allocations.set(id, value);
  }

  /** Limit one body's measured need relief to its remaining daily quotas. */
  ration(compact: CompactPerson, tick: number, requestedHungerRelief: number, requestedThirstRelief: number): CompactRationRelief {
    if (!Number.isSafeInteger(tick) || tick < 1) throw new RangeError('ration tick must be a positive safe integer');
    nonNegative(requestedHungerRelief, 'requested hunger relief');
    nonNegative(requestedThirstRelief, 'requested thirst relief');
    const day = Math.floor((tick - 1) / this.ticksPerDay);
    if (this.currentDay === null || day !== this.currentDay) throw new RangeError(`no intake plan for elapsed day ${day}`);
    const allocation = this.allocations.get(compact.person.id);
    if (!allocation) throw new RangeError(`person ${compact.person.id} has no intake allocation for day ${day}`);

    const hunger = Math.min(requestedHungerRelief, allocation.foodQuota - allocation.foodUsed);
    const thirst = allocation.waterQuota === 'unbounded'
      ? requestedThirstRelief
      : Math.min(requestedThirstRelief, allocation.waterQuota - allocation.waterUsed);
    const foodUsed = allocation.foodUsed + hunger;
    const waterUsed = allocation.waterUsed + thirst;
    if (!Number.isFinite(foodUsed) || !Number.isFinite(waterUsed)) throw new RangeError('intake usage overflow');
    allocation.foodUsed = foodUsed;
    allocation.waterUsed = waterUsed;
    return { hunger, thirst };
  }

  /** Detached summary of quota use and remaining budget for the active day. */
  get report(): CompactBandIntakeReport {
    let foodQuota = 0, foodUsed = 0, waterQuota = 0, waterUsed = 0, unboundedQuota = false;
    for (const allocation of this.allocations.values()) {
      foodQuota += allocation.foodQuota;
      foodUsed += allocation.foodUsed;
      waterUsed += allocation.waterUsed;
      if (allocation.waterQuota === 'unbounded') unboundedQuota = true;
      else waterQuota += allocation.waterQuota;
    }
    const waterLimit: CompactWaterAvailability = unboundedQuota ? 'unbounded' : waterQuota;
    const waterRemaining: CompactWaterAvailability = waterLimit === 'unbounded' ? 'unbounded' : Math.max(0, waterLimit - waterUsed);
    return {
      day: this.currentDay, foodBudget: this.foodBudget, foodQuota, foodUsed,
      foodRemaining: Math.max(0, this.foodBudget - foodUsed), waterAvailability: this.waterAvailability,
      waterQuota: waterLimit, waterUsed, waterRemaining, personCount: this.allocations.size,
    };
  }

  /** Detached JSON-compatible record including mid-day usage, so reload cannot renew a quota. */
  toRecord(): CompactBandIntakeRecord {
    return {
      recordType: 'CompactBandIntakeRecord', version: COMPACT_BAND_INTAKE_VERSION,
      ticksPerDay: this.ticksPerDay, day: this.currentDay, foodBudget: this.foodBudget,
      waterAvailability: this.waterAvailability,
      allocations: [...this.allocations.entries()].sort(([a], [b]) => a - b).map(([personId, a]) => ({
        personId, foodQuota: a.foodQuota, foodUsed: a.foodUsed, waterQuota: a.waterQuota, waterUsed: a.waterUsed,
      })),
    };
  }

  /** Restore a strict v1 snapshot; optionally check it against the caller's clock configuration. */
  static fromRecord(value: unknown, ticksPerDay?: number): CompactBandIntake {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('intake record must be an object');
    exactKeys(value, RECORD_KEYS, 'intake record');
    const raw = value as Partial<CompactBandIntakeRecord>;
    if (raw.recordType !== 'CompactBandIntakeRecord' || raw.version !== COMPACT_BAND_INTAKE_VERSION) throw new RangeError('unsupported compact band intake record');
    const restored = new CompactBandIntake({ ticksPerDay: raw.ticksPerDay as number });
    if (ticksPerDay !== undefined && restored.ticksPerDay !== ticksPerDay) throw new RangeError('intake clock configuration does not match');
    if (raw.day === null) {
      if (raw.foodBudget !== 0 || raw.waterAvailability !== 0 || !Array.isArray(raw.allocations) || raw.allocations.length !== 0) {
        throw new RangeError('unstarted intake record must have empty budgets and roster');
      }
      return restored;
    }
    safeDay(raw.day as number, 'intake record day');
    nonNegative(raw.foodBudget as number, 'food budget');
    waterAmount(raw.waterAvailability as CompactWaterAvailability, 'water availability');
    if (!Array.isArray(raw.allocations)) throw new TypeError('intake record allocations must be an array');

    const next = new Map<number, { foodQuota: number; foodUsed: number; waterQuota: CompactWaterAvailability; waterUsed: number }>();
    let foodQuota = 0, foodUsed = 0, finiteWaterQuota = 0, waterUsed = 0;
    for (const allocation of raw.allocations) {
      if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) throw new TypeError('intake allocation record must be an object');
      exactKeys(allocation, ALLOCATION_KEYS, 'intake allocation');
      const { personId, foodQuota: fq, foodUsed: fu, waterQuota: wq, waterUsed: wu } = allocation;
      if (!Number.isSafeInteger(personId) || personId! < 0) throw new RangeError('intake person id must be a non-negative safe integer');
      if (next.has(personId!)) throw new RangeError(`duplicate intake person ${personId}`);
      nonNegative(fq!, 'person food quota'); nonNegative(fu!, 'person food usage');
      waterAmount(wq!, 'person water quota'); nonNegative(wu!, 'person water usage');
      if (fu! > fq!) throw new RangeError('person food usage exceeds quota');
      if (wq === 'unbounded') {
        if (raw.waterAvailability !== 'unbounded') throw new RangeError('unbounded person water quota requires an unbounded source');
      } else {
        finiteWaterQuota += wq as number;
        if (wu! > (wq as number)) throw new RangeError('person water usage exceeds quota');
      }
      foodQuota += fq!; foodUsed += fu!; waterUsed += wu!;
      if (![foodQuota, foodUsed, finiteWaterQuota, waterUsed].every(Number.isFinite)) throw new RangeError('intake record totals overflow');
      next.set(personId!, { foodQuota: fq!, foodUsed: fu!, waterQuota: wq!, waterUsed: wu! });
    }
    if (foodQuota > raw.foodBudget!) throw new RangeError('person food quotas exceed daily food budget');
    if (foodUsed > raw.foodBudget! || (raw.waterAvailability !== 'unbounded' && finiteWaterQuota > raw.waterAvailability!)) {
      throw new RangeError('intake use exceeds its daily budget');
    }
    restored.currentDay = raw.day as number;
    restored.foodBudget = raw.foodBudget as number;
    restored.waterAvailability = raw.waterAvailability as CompactWaterAvailability;
    for (const [id, a] of next) restored.allocations.set(id, a);
    return restored;
  }
}
