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
  readonly version: 2;
  readonly time: TimeSnapshot;
  readonly food: CompactBandFoodRecord;
  /** First tick owned in the current elapsed day; survives cuts during a partial handoff day. */
  readonly dayStartTick: number;
}

export class CompactBandCalendar {
  private clock: TimeManager;
  private food: CompactBandFoodState;
  private dayStartTick: number;
  private advancing = false;

  constructor(time: TimeSnapshot, food: CompactBandFoodState, dayStartTick = time.tick) {
    this.clock = TimeManager.fromSnapshot(time);
    this.food = fromCompactBandFoodRecord(toCompactBandFoodRecord(food));
    this.dayStartTick = dayStartTick;
    // The ledger dates boundaries, not the season in which the just-ended day began.
    // A partial day's tick therefore has the same ledger day as the previous boundary.
    if (this.food.day !== this.clock.day) throw new RangeError('band food date does not match its clock');
    if (!Number.isSafeInteger(this.dayStartTick) || this.dayStartTick < 0 || this.dayStartTick > this.clock.tick ||
        Math.floor(this.dayStartTick / this.clock.snapshot().config.ticksPerDay) !== Math.floor(this.clock.tick / this.clock.snapshot().config.ticksPerDay)) {
      throw new RangeError('band day start does not match its clock');
    }
  }

  get tick(): number { return this.clock.tick; }
  get foodState(): CompactBandFoodState { return { ...this.food }; }
  get currentDayStartTick(): number { return this.dayStartTick; }

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
    let dayStartTick = this.dayStartTick;
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
          fromTick: Math.max(boundary - ticksPerDay, dayStartTick), toTick: boundary });
        const input = supply(period);
        const durationFactor = (period.toTick - period.fromTick) / ticksPerDay;
        const settled = advanceCompactBandFoodDay(food, { ...input, day, season: period.season, durationFactor });
        food = settled.state;
        reports.push({ ...settled.report, tick: boundary });
        dayStartTick = boundary;
      }
      this.clock = target;
      this.food = food;
      this.dayStartTick = dayStartTick;
      return reports;
    } finally {
      this.advancing = false;
    }
  }

  toRecord(): CompactBandCalendarRecord {
    return { recordType: 'CompactBandCalendarRecord', version: 2,
      time: this.clock.snapshot(), food: toCompactBandFoodRecord(this.food), dayStartTick: this.dayStartTick };
  }

  static fromRecord(input: unknown): CompactBandCalendar {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('invalid band calendar record');
    const raw = input as Record<string, unknown>;
    const keys = Object.keys(raw).sort();
    const v1Keys = ['recordType', 'version', 'time', 'food'].sort();
    const v2Keys = ['recordType', 'version', 'time', 'food', 'dayStartTick'].sort();
    const v1 = raw.version === 1 && keys.length === v1Keys.length && keys.every((key, i) => key === v1Keys[i]);
    const v2 = raw.version === 2 && keys.length === v2Keys.length && keys.every((key, i) => key === v2Keys[i]);
    if ((!v1 && !v2) || raw.recordType !== 'CompactBandCalendarRecord') throw new TypeError('invalid band calendar record');
    const clock = TimeManager.fromSnapshot(raw.time);
    // Legacy calendars were always attached at a boundary, so a mid-day v1 save
    // began its current day at the preceding boundary. V2 keeps the exact handoff tick.
    const ticksPerDay = clock.snapshot().config.ticksPerDay;
    const dayStartTick = v2 ? raw.dayStartTick as number : Math.floor(clock.tick / ticksPerDay) * ticksPerDay;
    return new CompactBandCalendar(clock.snapshot(), fromCompactBandFoodRecord(raw.food), dayStartTick);
  }
}
