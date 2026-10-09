/**
 * Settle an off-map band's food once per complete day of the real game calendar.
 * No food is produced merely because an advance is split or a save is reloaded.
 * This is a ledger clock, not a second Simulation: bodies, knowledge and terrain
 * changes still belong to the future band driver and boundary integration.
 */
import { TimeManager, type TimeSnapshot, type Season } from '../core/TimeManager.ts';
import {
  advanceCompactBandFoodDay, fromCompactBandFoodRecord, toCompactBandFoodRecord,
  type CompactBandFoodState, type CompactBandFoodRecord, type CompactBandFoodDayInput,
  type CompactBandFoodDayReport,
} from './CompactBandFood.ts';

export interface CompactBandDay {
  /** Calendar date at the boundary ending this day (the food ledger's date). */
  readonly day: number;
  readonly season: Season;
  readonly fromTick: number;
  readonly toTick: number;
}
export type CompactBandDaySupply = Omit<CompactBandFoodDayInput, 'day' | 'season'>;
export interface CompactBandDatedFoodReport extends CompactBandFoodDayReport { readonly tick: number }
export interface CompactBandCalendarRecord {
  readonly recordType: 'CompactBandCalendarRecord';
  readonly version: 1;
  readonly time: TimeSnapshot;
  readonly food: CompactBandFoodRecord;
}

export class CompactBandCalendar {
  private clock: TimeManager;
  private food: CompactBandFoodState;
  private advancing = false;

  constructor(time: TimeSnapshot, food: CompactBandFoodState) {
    this.clock = TimeManager.fromSnapshot(time);
    this.food = fromCompactBandFoodRecord(toCompactBandFoodRecord(food));
    // The ledger dates boundaries, not the season in which the just-ended day began.
    // A partial day's tick therefore has the same ledger day as the previous boundary.
    if (this.food.day !== this.clock.day) throw new RangeError('band food date does not match its clock');
  }

  get tick(): number { return this.clock.tick; }
  get foodState(): CompactBandFoodState { return { ...this.food }; }

  /**
   * The supply reader must be pure: it receives each completed day once, in order,
   * and must read that date's population, labor, territory and measured rates.
   * All validation/settlements finish before this calendar changes. A thrown reader
   * leaves the live ledger and clock untouched, so retry cannot duplicate withdrawals.
   */
  advanceTo(toTick: number, supply: (day: CompactBandDay) => CompactBandDaySupply): CompactBandDatedFoodReport[] {
    if (this.advancing) throw new Error('reentrant compact band advance');
    if (!Number.isSafeInteger(toTick) || toTick < this.clock.tick) throw new RangeError('compact band clock goes backwards');
    const snapshot = this.clock.snapshot();
    const target = TimeManager.fromSnapshot({ ...snapshot, tick: toTick });
    const calendar = TimeManager.fromSnapshot(snapshot);
    const ticksPerDay = snapshot.config.ticksPerDay;
    let food = this.food;
    const reports: CompactBandDatedFoodReport[] = [];
    this.advancing = true;
    try {
      for (let boundary = (Math.floor(snapshot.tick / ticksPerDay) + 1) * ticksPerDay;
        boundary <= toTick; boundary += ticksPerDay) {
        // At midnight the clock has already changed season; production belongs to
        // the day that elapsed, so use the preceding tick (including startDay).
        calendar.tick = boundary - 1;
        const day = food.day + 1;
        const period: CompactBandDay = Object.freeze({ day, season: calendar.season,
          fromTick: boundary - ticksPerDay, toTick: boundary });
        const input = supply(period);
        const settled = advanceCompactBandFoodDay(food, { ...input, day, season: period.season });
        food = settled.state;
        reports.push({ ...settled.report, tick: boundary });
      }
      this.clock = target;
      this.food = food;
      return reports;
    } finally {
      this.advancing = false;
    }
  }

  toRecord(): CompactBandCalendarRecord {
    return { recordType: 'CompactBandCalendarRecord', version: 1,
      time: this.clock.snapshot(), food: toCompactBandFoodRecord(this.food) };
  }

  static fromRecord(input: unknown): CompactBandCalendar {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('invalid band calendar record');
    const raw = input as Partial<CompactBandCalendarRecord>;
    const keys = Object.keys(raw);
    if (keys.length !== 4 || !['recordType', 'version', 'time', 'food'].every(key => Object.hasOwn(raw, key)) ||
      raw.recordType !== 'CompactBandCalendarRecord' || raw.version !== 1) throw new TypeError('invalid band calendar record');
    const clock = TimeManager.fromSnapshot(raw.time);
    return new CompactBandCalendar(clock.snapshot(), fromCompactBandFoodRecord(raw.food));
  }
}
