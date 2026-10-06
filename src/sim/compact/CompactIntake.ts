/**
 * Eating and drinking for a compact person, from rates MEASURED in the detailed
 * model, M15 phase 32b.
 *
 * `CompactBody` runs the shared needs clock, which only ever raises hunger and
 * thirst. This is the other half: how much of that rise the person's day takes
 * back. It does not simulate foraging, carrying or the pit; it draws, once per
 * calendar day and per need, how much of the day's drift was relieved, from the
 * distribution `RateWatch` measured in the detailed world (`MeasuredRates.ts`):
 *
 * - **conditioned** on the season, the life stage (nursling/child/adult) and the
 *   need at the start of the day (four bins) — a hungry person eats more than a
 *   sated one, and the bad days (relief 0) stay in the distribution;
 * - **split into "got nothing" and "got a meal"**. The day's relief is bimodal: either
 *   no relief at all or a ration of 1-3 days of drift. What a band can do for somebody
 *   who needs food is the *probability* of the first (a good band's hungry day is empty
 *   12-18% of the time, a starving one's more than half); the size of a ration, once
 *   there is one, is the person's appetite and the same everywhere. A first version scaled
 *   the whole distribution by one number and starved a thriving band over 40 days
 *   (docs/m15_phase32b_compact.md §5): a multiplier moves the mean, not the chance of an
 *   empty day, and starvation is a run of empty days.
 * - **the empty-day probability for hungry people comes from the band** (`BandCapacity`,
 *   read by `capacityFrom` from a window of the band's own days that started hungry).
 *   Carrying, tools, climate and storage all act through that one measured number rather
 *   than through coefficients written here. A sated person's empty days (they simply do
 *   not eat) stay with the table: that is appetite, not capacity. Water is read the same way
 *   when the window has enough thirsty days (`thirstyZero`), and left to the table otherwise.
 *
 * Applied continuously, in proportion to each tick's drift, so that an advance cut
 * at any tick equals the uncut one and nothing depends on the order of events in a
 * day. The draw is stored on the person (`IntakePlan`), because the start-of-day
 * need it was conditioned on is gone after the first tick.
 *
 * It refuses rather than invents: a bin with fewer than `MIN_BIN_SAMPLES` falls
 * back to the nearest populated bin of the same season/stage/need, and if there is
 * none it throws `IntakeUnmeasured`.
 */
import type { RNG } from '../core/RNG.ts';
import {
  MIN_BIN_SAMPLES, MIN_FED_SAMPLES, NEED_BINS, ZERO_RELIEF, needBin, rateKey, QUANTILE_STEPS,
  type NeedKind, type PersonDay, type RateBin, type RateGroup, type RateSeason, type RateTable,
} from './CompactCalibration.ts';

export class IntakeUnmeasured extends Error {
  constructor(key: string) { super(`no measured intake for ${key}: the compact model will not invent one`); }
}

/**
 * What the band can do for a member who needs it: the share of days that began hungry (thirsty)
 * and brought no relief at all. `thirstyZero` is absent when the window held too few thirsty days
 * to read; the table's own behaviour for water is then used.
 */
export interface BandCapacity { readonly hungryZero: number; readonly thirstyZero?: number }

/** The lowest start-of-day bin of a need that counts as "hungry"/"thirsty" for reading a band's capacity. */
export const HUNGRY_BIN = 1;

function interpolate(q: readonly number[], u: number): number {
  const pos = Math.max(0, Math.min(1, u)) * (QUANTILE_STEPS - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return q[lo]! + (q[hi]! - q[lo]!) * (pos - lo);
}

export class IntakeModel {
  constructor(private readonly table: RateTable, private readonly minSamples = MIN_BIN_SAMPLES) {}

  /** The populated bin nearest to `level` for this cell that satisfies `ok`, or throws. */
  private cell(season: RateSeason, group: RateGroup, need: NeedKind, level: number, ok: (e: RateBin) => boolean): RateBin {
    const want = needBin(level);
    for (let d = 0; d < NEED_BINS; d++) {
      for (const bin of d === 0 ? [want] : [want - d, want + d]) {
        if (bin < 0 || bin >= NEED_BINS) continue;
        const entry = this.table[rateKey(season, group, need, bin)];
        if (entry && entry.n >= this.minSamples && ok(entry)) return entry;
      }
    }
    throw new IntakeUnmeasured(rateKey(season, group, need, want));
  }

  /** Measured share of empty days for somebody in that state. */
  zeroShare(season: RateSeason, group: RateGroup, need: NeedKind, level: number): number {
    return this.cell(season, group, need, level, () => true).zero;
  }

  /** The ratio of a day that did bring relief, at probability `u` of that distribution. */
  fedRatio(season: RateSeason, group: RateGroup, need: NeedKind, level: number, u: number): number {
    return interpolate(this.cell(season, group, need, level, e => e.nz >= MIN_FED_SAMPLES).qf, u);
  }

  /**
   * One day's relief ratio: empty with the cell's measured probability (or, for a hungry
   * person's hunger, the band's), otherwise a ration drawn from what a fed day looks like.
   * Always takes both numbers, so the stream does not depend on the table.
   */
  sample(season: RateSeason, group: RateGroup, need: NeedKind, level: number, uZero: number, uFed: number,
    capacity?: BandCapacity): number {
    const needy = needBin(level) >= HUNGRY_BIN;
    const fromBand = !capacity || !needy ? undefined : need === 'hunger' ? capacity.hungryZero : capacity.thirstyZero;
    const zero = fromBand ?? this.zeroShare(season, group, need, level);
    if (uZero < zero) return 0;
    return this.fedRatio(season, group, need, level, uFed);
  }

  /**
   * The band's capacity from a window of its own recorded days: the share of days that
   * started hungry (hunger bin >= `HUNGRY_BIN`) and brought no relief, and likewise for thirst.
   * Needs at least `minSamples` hungry days or throws (too thin to read a band by); a thirst
   * reading from fewer than `minSamples` thirsty days is left out rather than guessed.
   */
  capacityFrom(days: readonly PersonDay[]): BandCapacity {
    const hungry = days.filter(d => d.hungerBin >= HUNGRY_BIN);
    if (hungry.length < this.minSamples) {
      throw new IntakeUnmeasured(`a band window of ${hungry.length} hungry person-days`);
    }
    const empty = hungry.filter(d => d.hungerRatio < ZERO_RELIEF).length;
    const thirsty = days.filter(d => d.thirstBin >= HUNGRY_BIN);
    if (thirsty.length < this.minSamples) return { hungryZero: empty / hungry.length };
    return { hungryZero: empty / hungry.length,
      thirstyZero: thirsty.filter(d => d.thirstRatio < ZERO_RELIEF).length / thirsty.length };
  }

  /**
   * Draw a day's plan. Four draws from the person's own stream, always all four and in
   * this order (hunger empty?, hunger ration, thirst empty?, thirst ration).
   */
  plan(season: RateSeason, group: RateGroup, hunger: number, thirst: number, capacity: BandCapacity | undefined,
    rng: RNG, day: number) {
    const uHungerZero = rng.next(), uHungerFed = rng.next();
    const uThirstZero = rng.next(), uThirstFed = rng.next();
    return {
      day,
      hunger: this.sample(season, group, 'hunger', hunger, uHungerZero, uHungerFed, capacity),
      thirst: this.sample(season, group, 'thirst', thirst, uThirstZero, uThirstFed, capacity),
    };
  }
}
