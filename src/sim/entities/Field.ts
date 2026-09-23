/**
 * A sown plot, and what happens to it between sowing and harvest.
 *
 * M8.2's first half, and the oldest open entry in `next-steps.md`: `farming`
 * was removed from `TECHS` because it gated an entire era while changing
 * nothing on the ground, and the rule since has been that it may not come back
 * until fields exist. This is the file that makes it true, and `core/Soil.ts`
 * is the other half — a field that ignores the ground would be the same defect
 * wearing a different hat.
 *
 * ## Why a field is a building, and the crop is a passenger
 *
 * A field is placed, sited by the band planner near the camp, worked until it
 * is finished, owned by a band, walked to, drawn on the map and refused where
 * it cannot stand. `Building` already does every one of those things, and a
 * second entity would have meant a second planner branch, a second placement
 * test, a second reach helper and a second renderer pass — four pairs of
 * implementations of the same idea, which is exactly what `AGENTS.md` says not
 * to write. So the plot is a `BuildingDef` with `field: true`, and the crop
 * standing on it is this object, hanging off `Building.crop` the way
 * `yieldCarry` hangs off a trap.
 *
 * The crop is the part a building genuinely does not have: a stage, a growth
 * fraction and a day it was sown. Keeping it here rather than as four more
 * fields on `Building` means `Building.ts` stays free of farming, and this file
 * can be read as the whole of what a crop does.
 *
 * ## Two verbs, not three
 *
 * The plan named `till`, `sow` and `reap`. What shipped is sowing and reaping,
 * with the tilling folded into them: **building the plot is the first
 * breaking of the ground, and every sowing breaks it again.** The reason is the
 * scorer rather than the fiction — three verbs the AI has to perform in order,
 * each competing against foraging on proximity, is three chances for a band to
 * leave a field half made, and the traps that stood full for fifty trap-days
 * are what that failure looks like in this project. Tilling is still a real
 * cost in the soil, paid at `Soil.till` on every tile of the plot at every
 * sowing; it simply is not a verb somebody can forget to do. A separate `till`
 * returns with `crop_rotation`, where deciding *not* to sow is the mechanism.
 */

/** What is standing on a plot. */
export type CropStage =
  /** Bare, worked ground. Ready to take seed. */
  | 'fallow'
  /** Sown and coming up. */
  | 'growing'
  /** Ready, and going over if nobody comes. */
  | 'ripe';

/** Grain it costs to sow one plot, and what a person must be carrying. */
export const SOW_SEED = 4;

/**
 * Compost one spreading puts into a plot.
 *
 * Four, against a heap that makes about one load a day: keeping a field in
 * heart is a few days of somebody's year, which is the right price for undoing
 * a decade of taking. Here rather than in `ActionSystem` because the scorer
 * needs it too — a person who cannot carry a spreading's worth should not be
 * walking to a field to discover it.
 */
export const SPREAD_LOAD = 4;

/**
 * How much of a crop's growth a midsummer day delivers.
 *
 * Measured against the actual season curve rather than reasoned about, and the
 * first attempt was wrong because of it. `TimeManager.growth` is zero for
 * **half** of the forty-day year and peaks at 0.71, summing to about 9.6 over
 * the whole growing half; at the 0.085 this started at, a crop sown on the
 * first day of spring reached 0.82 by the first frost, stalled in the ground
 * all winter and came in the following spring. Three harvests in three years
 * across two bands is what that looked like from the report.
 *
 * At 0.2 a crop sown in early spring is in ear in about ten growing days, which
 * leaves the ripe window in high summer and occasionally allows a second sowing
 * in a good year. A crop sown late still overwinters, which is what winter
 * wheat is and costs nothing to model — see `advance`.
 */
const GROWTH_PER_DAY = 0.2;

/**
 * Days a ripe crop stands before it is lost.
 *
 * It has to be possible to lose one. A harvest that waits for ever is a store
 * with extra steps, and the thing that makes a field different from a storage
 * pit is that it has a week in which somebody has to come. Long enough that an
 * ordinary band manages it, short enough that a band in a bad winter does not.
 */
const RIPE_DAYS = 8;

/**
 * Grain off a whole plot at perfect ground, by a perfect hand.
 *
 * Measured against the alternatives rather than chosen. A plot at middling
 * fertility worked by an ordinary hand comes out around 45 grain: raw, that is
 * poor food and about twice a berry bush; ground at the quern it is fifteen
 * meals and roughly a third of what a snare line brings in over the same
 * season. A field is therefore worth having and is not a replacement for
 * foraging, which is the right proportion for the first agriculture in the
 * world — and the part that actually changes a band's life is that **grain
 * does not spoil**. A band that farms can hold a winter's food in a form the
 * winter cannot take back.
 *
 * The first figure tried was 48 and it was measured too low: three harvests
 * across three years of the `farmers` scenario came to 63 grain against 1,803
 * berries, which is a curiosity rather than a technology.
 */
const BASE_YIELD = 110;

/** The crop standing on one plot. */
export class Crop {
  stage: CropStage = 'fallow';
  /** 0 to 1. Only moves while `growing`, and only in a growing season. */
  growth = 0;
  /** Day it was sown, and the day it ripened. -1 for never. */
  sownDay = -1;
  ripeDay = -1;
  /** What the last harvest off this plot came to, for the panel. */
  lastYield = 0;
  /** Harvests taken, and harvests lost standing. Both are worth showing. */
  harvests = 0;
  lost = 0;

  get isFallow(): boolean {
    return this.stage === 'fallow';
  }

  get isRipe(): boolean {
    return this.stage === 'ripe';
  }

  sow(day: number): void {
    this.stage = 'growing';
    this.growth = 0;
    this.sownDay = day;
    this.ripeDay = -1;
  }

  /**
   * A day of weather on a standing crop. Returns true if it was lost today.
   *
   * `growth` is the season's — 0 in deep winter and 1 at midsummer, the same
   * number berry bushes regrow on — so a crop sown too late simply stops, sits
   * out the winter in the ground and comes on again in spring. That is what
   * winter wheat is, it costs nothing to model, and it is a great deal kinder
   * than killing the crop outright for a sowing decision the player made in
   * good faith.
   */
  advance(day: number, seasonGrowth: number): boolean {
    if (this.stage === 'growing') {
      this.growth = Math.min(1, this.growth + GROWTH_PER_DAY * seasonGrowth);
      if (this.growth >= 1) {
        this.stage = 'ripe';
        this.ripeDay = day;
      }
      return false;
    }
    if (this.stage === 'ripe' && day - this.ripeDay >= RIPE_DAYS) {
      this.stage = 'fallow';
      this.growth = 0;
      this.lost++;
      return true;
    }
    return false;
  }

  /**
   * Trampled and torn up — M11 phase 17c, the field a raid ruins. Whatever
   * was standing is lost, counted with the harvests lost to standing too
   * long, and the plot is bare; `Building.ruined` is what keeps it from
   * being sown again until somebody mends it. The soil is not touched: it
   * already has its own way of wearing out (`soil-is-drawn-down`), and a
   * raid is a season lost, not the ground ruined.
   */
  trampled(): void {
    if (this.stage !== 'fallow') this.lost++;
    this.stage = 'fallow';
    this.growth = 0;
    this.sownDay = -1;
    this.ripeDay = -1;
  }

  /** Taken off. The plot goes back to bare ground. */
  reaped(yielded: number): void {
    this.stage = 'fallow';
    this.growth = 0;
    this.lastYield = yielded;
    this.harvests++;
    this.sownDay = -1;
    this.ripeDay = -1;
  }

  /** How close to the harvest, 0 to 1, for the bar on the map. */
  get ripeness(): number {
    return this.stage === 'ripe' ? 1 : this.growth;
  }
}

/**
 * What one harvest comes to.
 *
 * Three terms and no draw: the ground, the hand and the grasp of the
 * technology. Deterministic on purpose — a harvest is the payoff of a season's
 * commitment, and a random one would make the whole mechanism unreadable to a
 * player trying to work out whether their field is getting worse. It *is*
 * getting worse, and they should be able to see it in the number.
 */
export function harvestYield(
  effectiveFertility: number, skillFactor: number, techPower: number
): number {
  return Math.max(0, Math.round(
    BASE_YIELD * effectiveFertility * (0.55 + skillFactor * 0.45) * techPower
  ));
}

/** Days a ripe crop will stand, for the panel and the tests. */
export const RIPE_WINDOW_DAYS = RIPE_DAYS;
