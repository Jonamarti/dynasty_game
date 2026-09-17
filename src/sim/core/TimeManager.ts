/**
 * The world clock: ticks, days, seasons and years, plus the derived quantities
 * (daylight, temperature) that the needs and foraging systems read.
 *
 * Seasons matter more here than in a typical survival game: they are the
 * pressure that drives food storage, migration and — later — the discoveries
 * that a cold winter forces.
 */
import type { TimeConfig } from './Config.ts';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export class TimeManager {
  tick = 0;

  constructor(private readonly config: TimeConfig) {}

  advance(): void {
    this.tick++;
  }

  get day(): number {
    return this.config.startDay + Math.floor(this.tick / this.config.ticksPerDay);
  }

  get dayFraction(): number {
    return (this.tick % this.config.ticksPerDay) / this.config.ticksPerDay;
  }

  get season(): Season {
    const seasonIndex = Math.floor(this.day / this.config.daysPerSeason) % 4;
    return SEASONS[seasonIndex]!;
  }

  /**
   * In-game days in a year — the same clock `Person.daysPerYear` and
   * `Tree.daysPerYear` are constructed with, so the calendar and ageing agree
   * by construction rather than by the coincidence of two constants.
   */
  get daysPerYear(): number {
    return this.config.daysPerSeason * 4;
  }

  get year(): number {
    return Math.floor(this.day / this.daysPerYear);
  }

  /** 0 at midnight, 1 at midday. Drives visibility and foraging yield. */
  get daylight(): number {
    const seasonalPeak = 0.5 + 0.2 * Math.cos((this.yearFraction - 0.375) * Math.PI * 2);
    const solar = Math.sin(this.dayFraction * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    return Math.max(0, Math.min(1, solar * (0.6 + seasonalPeak * 0.8)));
  }

  get isNight(): boolean {
    return this.daylight < 0.25;
  }

  /**
   * Roughly -1 (deep winter night) to 1 (high summer noon).
   *
   * The 0.375 offset puts the peak in mid-summer and the trough in mid-winter,
   * so the curve agrees with the season *labels*. It did not at first: the
   * phase was shifted half a year, which made day 0 of "spring" the coldest
   * moment of the year. Every band quietly froze from the first tick, and
   * because the health report showed only hunger and thirst, it read as an
   * unexplained health decline rather than as winter.
   */
  get temperature(): number {
    const seasonal = Math.cos((this.yearFraction - 0.375) * Math.PI * 2);
    const diurnal = (this.daylight - 0.5) * 0.6;
    return Math.max(-1, Math.min(1, seasonal * 0.7 + diurnal));
  }

  /** Position through the year: 0 at the first day of spring, 1 a year later. */
  private get yearFraction(): number {
    return (this.day % this.daysPerYear) / this.daysPerYear;
  }

  /**
   * How readily anything grows right now, 0-1. Peaks in early summer, and is
   * effectively nil through the winter.
   */
  get growth(): number {
    return Math.max(0, Math.min(1, this.temperature * 0.9 + 0.35));
  }

  /**
   * The same curve with the hour of the day taken out — what the *day* was
   * like, rather than what this instant is like.
   *
   * M9.6 phase 1a, and it exists because of a defect worth recording. Anything
   * that runs every tick samples `growth` right round the clock and averages
   * the diurnal term away for free. The daily block does not: it runs at
   * `tick % ticksPerDay === 0`, which is **midnight**, where `daylight` is 0
   * and `temperature` therefore takes its full diurnal penalty of -0.3, every
   * single day of the year. A per-day consumer reading `growth` is asking what
   * the growing conditions are at the coldest, darkest moment of the day and
   * calling that the day.
   *
   * For the wood that was ruinous rather than merely pessimistic. In mid-autumn
   * the seasonal term is about zero, so midnight `growth` is ~0.08 — under the
   * `max(0.2, growth)` floor in `Tree.advanceDay` — and an oak set about four
   * of its forty acorns in a ten-day autumn. The autumn mast, which is the
   * whole argument for `grinding`, had been a rounding error since M9.5 phase 3
   * halved the seasons. See `docs/bugs.md`.
   *
   * **`growCrops` deliberately still reads `growth`.** M8.2 measured
   * `GROWTH_PER_DAY` against the midnight sample — `Field.ts`'s header quotes
   * the peak as 0.71, which is that sample — so a field calibrated to it is
   * consistent, and moving the input without re-deriving the constant would
   * silently retune farming inside a pass about trees.
   */
  get dailyGrowth(): number {
    const seasonal = Math.max(-1, Math.min(1,
      Math.cos((this.yearFraction - 0.375) * Math.PI * 2) * 0.7));
    return Math.max(0, Math.min(1, seasonal * 0.9 + 0.35));
  }

  label(): string {
    const hour = Math.floor(this.dayFraction * 24);
    const minute = Math.floor((this.dayFraction * 24 - hour) * 60);
    return `Y${this.year} ${this.season} d${this.day % this.daysPerYear} ` +
      `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
}
