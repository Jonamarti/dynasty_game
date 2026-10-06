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
 * - **scaled by what the band can do**: there is no single rate (docs/
 *   m15_phase32b_compact.md §4: `lean` and `craft` differ by 2-3x in what is
 *   eaten against what is needed). The aggregate capacity is read from a recent
 *   window of the band's own days as `observed relief / what the table expects for
 *   those same days` (`scaleFrom`). Carrying, tools, climate and storage all act
 *   through that one measured number rather than through coefficients written here.
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
  MIN_BIN_SAMPLES, NEED_BINS, needBin, rateKey, QUANTILE_STEPS,
  type NeedKind, type PersonDay, type RateGroup, type RateSeason, type RateTable,
} from './CompactCalibration.ts';

export class IntakeUnmeasured extends Error {
  constructor(key: string) { super(`no measured intake for ${key}: the compact model will not invent one`); }
}

export interface BandScale { readonly hunger: number; readonly thirst: number }

export class IntakeModel {
  constructor(private readonly table: RateTable, private readonly minSamples = MIN_BIN_SAMPLES) {}

  /** The populated bin nearest to `bin` for this cell, or throws. */
  private cell(season: RateSeason, group: RateGroup, need: NeedKind, level: number) {
    const want = needBin(level);
    for (let d = 0; d < NEED_BINS; d++) {
      for (const bin of d === 0 ? [want] : [want - d, want + d]) {
        if (bin < 0 || bin >= NEED_BINS) continue;
        const entry = this.table[rateKey(season, group, need, bin)];
        if (entry && entry.n >= this.minSamples) return entry;
      }
    }
    throw new IntakeUnmeasured(rateKey(season, group, need, want));
  }

  /** The relief ratio at probability `u` (0..1), linearly interpolated between kept quantiles. */
  sample(season: RateSeason, group: RateGroup, need: NeedKind, level: number, u: number): number {
    const q = this.cell(season, group, need, level).q;
    const pos = Math.max(0, Math.min(1, u)) * (QUANTILE_STEPS - 1);
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return q[lo]! + (q[hi]! - q[lo]!) * (pos - lo);
  }

  /** What the table expects, on average, for a person in that state. */
  expected(season: RateSeason, group: RateGroup, need: NeedKind, level: number): number {
    return this.cell(season, group, need, level).mean;
  }

  /**
   * The band's capacity relative to the table: observed day relief over the table's
   * expectation for those same person-days. 1 means "like the pooled measurement".
   * Needs at least `minSamples` days; fewer is too thin to read a band by and throws.
   */
  scaleFrom(days: readonly PersonDay[]): BandScale {
    if (days.length < this.minSamples) throw new IntakeUnmeasured(`a band window of ${days.length} person-days`);
    const sum = (need: NeedKind) => {
      let seen = 0, expect = 0;
      for (const d of days) {
        const bin = need === 'hunger' ? d.hungerBin : d.thirstBin;
        seen += need === 'hunger' ? d.hungerRatio : d.thirstRatio;
        expect += this.expected(d.season, d.group, need, bin * (100 / NEED_BINS) + 1);
      }
      return expect > 0 ? seen / expect : 1;
    };
    return { hunger: sum('hunger'), thirst: sum('thirst') };
  }

  /**
   * Draw a day's plan. Two draws from the person's own stream, always both, in this
   * order, so the stream advances the same whatever the table says.
   */
  plan(season: RateSeason, group: RateGroup, hunger: number, thirst: number, scale: BandScale, rng: RNG, day: number) {
    const uHunger = rng.next();
    const uThirst = rng.next();
    return {
      day,
      hunger: Math.max(0, this.sample(season, group, 'hunger', hunger, uHunger) * scale.hunger),
      thirst: Math.max(0, this.sample(season, group, 'thirst', thirst, uThirst) * scale.thirst),
    };
  }
}
