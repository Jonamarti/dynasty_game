/**
 * The ground as something that can be used up.
 *
 * M8.2, and the owner's note of 2026-09-14: *ground fertility, exhaustion,
 * compost, crop rotation, burying fish*. The rule the plan set for this pass is
 * that **`farming` may not ship without soil** — a field that ignores the
 * ground is declared-but-inert content, and soil that nothing reads is the same
 * defect from the other side — so this file and `entities/Field.ts` ship
 * together and each is the other's reason to exist.
 *
 * ## Three layers, because the remedies are different
 *
 * A single "fertility" number can only ever be spent and refilled, which makes
 * compost, manure, fallow and rotation four skins on one mechanism. They are
 * not the same thing in the ground and they should not be the same number here:
 *
 *  - **`fertility`** (in `World`, untouched) — parent material and climate.
 *    Innate, never written. It is also what berry bushes have always grown out
 *    of, and repointing it at a live value would move every bush in every saved
 *    seed.
 *  - **`soilTexture`** — sand at 0, loam at 1. Immutable in this tier: it sets
 *    how much of each pool the ground can hold and how fast rain washes the
 *    fast pool out. `marling` is the only thing that will ever raise it.
 *  - **`soilOrganic`** — humus. The slow pool. Tilling burns it, compost and
 *    middens build it, and it is what a fallow year is actually restoring.
 *  - **`soilNutrient`** — what a crop eats. The fast pool. Reaping takes it,
 *    rain leaches it out of sandy ground, and the slow pool refills it.
 *
 * **Tilling burns organic; reaping eats nutrient.** That split is the whole
 * design: a field worked hard for one season is short of nutrient and recovers
 * in a few weeks, and a field worked hard for ten years is short of humus and
 * does not recover in the lifetime of the person who exhausted it.
 *
 * ## What it costs to run
 *
 * Nothing per tick, ever. Drawdown is event-driven — sowing and reaping write
 * the tiles the actor is standing on — and recovery sweeps `active`, the set of
 * tiles known to be away from equilibrium, once a day, dropping each tile as it
 * settles. A world where nobody farms has an empty set and pays for a `size`
 * check a day. `Simulation.spoilFood` and `workTraps` already have exactly this
 * shape, and for the same reason.
 *
 * ## Determinism
 *
 * Not one draw anywhere in this file. Texture is sampled from the moisture
 * noise object the world already built, at a shifted offset, which costs zero
 * `RNG` draws and so cannot shift a seed; everything else is arithmetic over
 * event-driven state. `active` is a `Set<number>` walked in insertion order,
 * which is deterministic in JavaScript and is the same property the trap sweep
 * relies on.
 */

/** Sand holds nothing and loam holds a lot. Clamped so neither extreme is absurd. */
export const TEXTURE_MIN = 0.25;
export const TEXTURE_MAX = 0.95;

/**
 * What one sowing burns out of the slow pool, per tile of the field.
 *
 * Breaking ground exposes humus to the air and it oxidises — which is why
 * ploughing ruined more soil than any harvest ever did. Sized against the
 * recovery rate below rather than chosen: a plot sown every year loses about
 * 0.03 of humus a year net of what the ground rebuilds, which is a fifth of a
 * typical ceiling over fifteen years and about the working life of a field in
 * shifting cultivation. That is the story `composting` exists to change.
 */
export const TILL_ORGANIC_COST = 0.035;

/**
 * What one harvest takes out of the fast pool, per tile.
 *
 * Much larger than the organic cost, and it is meant to be: this is the number
 * a farmer feels inside one lifetime rather than across three. Against the
 * refill rate below it takes most of a year to come back, so one harvest a year
 * is roughly sustainable and two are not — which is exactly the decision a
 * `calendar` and a `crop_rotation` are going to be about.
 */
export const REAP_NUTRIENT_COST = 0.22;

/**
 * How fast humus rebuilds toward what the climate will carry, per day.
 *
 * Very slow, and it has to be. The first version ran at 0.0035 — a fortnight to
 * undo a sowing — and the consequence was measured in the `farmers` scenario:
 * after nine harvests over three years the worked ground stood at 97.3% of its
 * resting state, which is a soil model that costs nothing and therefore says
 * nothing. Humus is built over decades in the real world and a fallow year is
 * genuinely not enough to restore an exhausted field; at 0.0004 a day the
 * ground gives back about a sixth of a sowing a year, so fallow is a brake on
 * exhaustion rather than a cure for it, and the cure is `composting`.
 */
const ORGANIC_RECOVERY_PER_DAY = 0.0004;

/**
 * How fast the fast pool refills from the slow one, per day.
 *
 * Twenty times the humus rate and still not fast: a harvest's 0.22 takes the
 * better part of a forty-day year to come back. That gap between the two pools
 * is the whole reason there are two — a field rested for a season is ready
 * again, and a field rested for a season *every* year still dies slowly.
 */
const NUTRIENT_RECOVERY_PER_DAY = 0.008;

/** How much of the fast pool sandy ground loses to rain each day, at texture 0. */
const LEACH_PER_DAY = 0.012;

/**
 * Below this effective fertility no ground will carry a crop worth the seed.
 *
 * An absolute floor, for ground that was poor to begin with. It is *not*
 * sufficient on its own, and the reason is arithmetic: effective fertility
 * never falls below `fertility * 0.35`, so on rich parent material — 0.68 is
 * ordinary on this island — a plot worked until both pools are empty still
 * reads 0.24 and would never be refused. A field that has lost everything a
 * crop can actually draw on has to be refusable wherever it stands, which is
 * what `SPENT_SHARE` below is for.
 */
export const SPENT_BELOW = 0.22;

/**
 * And below this share of what the same ground carries untouched.
 *
 * The relative half, and the one that actually fires in play. A plot that has
 * lost more than half of what it once had is a plot whose humus is gone; it is
 * also a statement a player can act on, because the panel says the same thing
 * in the same words.
 */
export const SPENT_SHARE = 0.55;

/**
 * Whether ground this worn should be sown at all.
 *
 * One predicate, three callers — `doSow`'s refusal, the planner's placement
 * test and the panel — because a player told the ground is finished and an
 * action that sows it anyway is the kind of disagreement this project has
 * shipped before.
 */
export function isGroundSpent(effective: number, resting: number): boolean {
  return effective < SPENT_BELOW || effective < resting * SPENT_SHARE;
}

/** Below this distance from equilibrium a tile is settled and leaves `active`. */
const SETTLED = 0.002;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * The soil of one world: two immutable layers and two that get used up.
 *
 * Owned by `World` and constructed from its arrays, rather than four more
 * fields on `World` itself, because the arithmetic below is a subject of its
 * own and `World` is already the file every system imports. The arrays stay
 * flat and parallel, indexed the same way as every other per-tile array in the
 * project — `y * width + x` — so a future WASM port is still a memcpy.
 */
export class Soil {
  /** Sand ↔ loam. Never written in this tier; `marling` is what will. */
  readonly texture: Float32Array;
  /** Humus: the slow pool. */
  readonly organic: Float32Array;
  /** What a crop actually eats: the fast pool. */
  readonly nutrient: Float32Array;

  /**
   * Tiles away from equilibrium, and therefore the only ones the daily sweep
   * has to look at.
   *
   * A few hundred entries on a world with three farming bands, against 16,384
   * tiles. The set is walked in insertion order and nothing in the sweep draws,
   * so two runs of the same build recover the same ground in the same order.
   */
  readonly active = new Set<number>();

  constructor(
    private readonly width: number,
    private readonly fertility: Float32Array,
    /** The moisture noise the world already built, sampled at a shifted offset. */
    texture: (x: number, y: number) => number
  ) {
    const n = fertility.length;
    const height = n / width;
    this.texture = new Float32Array(n);
    this.organic = new Float32Array(n);
    this.nutrient = new Float32Array(n);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const grain = clamp01(texture(x, y));
        this.texture[i] = TEXTURE_MIN + grain * (TEXTURE_MAX - TEXTURE_MIN);
        // Ground nobody has touched is at its own equilibrium, which is what
        // makes the first harvest off virgin soil the good one.
        this.organic[i] = this.organicCeiling(i);
        this.nutrient[i] = this.nutrientCeiling(i);
      }
    }
  }

  /**
   * The humus this ground carries when nothing has disturbed it.
   *
   * Innate fertility sets it and texture holds it: the same rainfall builds
   * more humus in loam than in sand because sand does not keep it.
   */
  private organicCeiling(i: number): number {
    return clamp01(this.fertility[i]! * (0.55 + this.texture[i]! * 0.45));
  }

  /**
   * What the fast pool settles to, given how much humus is under it.
   *
   * The slow pool feeds the fast one — that is what mineralisation is — so a
   * field whose humus has been burnt out by twenty years of tilling cannot hold
   * a good harvest even in the season after a fallow. It is the whole reason
   * the two pools are separate numbers.
   */
  private nutrientCeiling(i: number): number {
    return clamp01(this.organic[i]! * (0.4 + this.texture[i]! * 0.4));
  }

  /**
   * What a crop standing on this tile actually has to grow in.
   *
   * The weights are the plan's: innate ground, humus and available nutrient at
   * roughly a third each, so no single layer can carry a field on its own and
   * no single layer can kill it outright. A player who never learns any remedy
   * still gets something off good ground — worse every year, which is the
   * pressure — and a composted field on poor ground is worth working.
   */
  effectiveFertility(i: number): number {
    return clamp01(
      this.fertility[i]! * 0.35 + this.organic[i]! * 0.35 + this.nutrient[i]! * 0.3
    );
  }

  /**
   * What this tile would come to if nobody had ever broken it.
   *
   * The baseline half of every statement anybody makes about exhaustion. A
   * field reading 0.31 says nothing on its own — thin ground and ruined ground
   * look identical from that number — and 0.31 against a resting 0.52 is the
   * whole story. Both the panel and `soil-is-drawn-down` read this rather than
   * each deriving their own idea of what good ground looks like.
   */
  restingFertility(i: number): number {
    const organic = this.organicCeiling(i);
    const nutrient = clamp01(organic * (0.4 + this.texture[i]! * 0.4));
    return clamp01(this.fertility[i]! * 0.35 + organic * 0.35 + nutrient * 0.3);
  }

  /** True once this tile is too worn to be worth sowing into. */
  isSpent(i: number): boolean {
    return isGroundSpent(this.effectiveFertility(i), this.restingFertility(i));
  }

  /** Breaking the ground: burns humus, and wakes the tile up. */
  till(i: number): void {
    this.organic[i] = clamp01(this.organic[i]! - TILL_ORGANIC_COST);
    // The fast pool's ceiling moves with the slow one, so a tilled tile is out
    // of equilibrium on both counts even though only one was written.
    this.active.add(i);
  }

  /** Taking the crop off: eats the fast pool. */
  reap(i: number): void {
    this.nutrient[i] = clamp01(this.nutrient[i]! - REAP_NUTRIENT_COST);
    this.active.add(i);
  }

  /**
   * Putting something back: humus, from compost, muck or a buried midden.
   *
   * One entry point rather than one per remedy, because `composting`,
   * `middening` and `manuring` differ in *where the material comes from* and in
   * nothing else once it is in the ground. Four call sites doing the same
   * arithmetic slightly differently is how the four remedies would drift apart.
   */
  enrich(i: number, organic: number): void {
    this.organic[i] = clamp01(this.organic[i]! + organic);
    this.active.add(i);
  }

  /**
   * A day of weather and biology, over the tiles that are away from rest.
   *
   * Returns how many tiles were looked at, which is what the health report
   * counts: a farming world whose active set is empty has either settled or
   * stopped working, and those are worth telling apart.
   */
  recover(days: number): number {
    if (this.active.size === 0) return 0;
    const looked = this.active.size;
    const settled: number[] = [];

    for (const i of this.active) {
      const organicCeiling = this.organicCeiling(i);
      const organic = this.organic[i]!;
      if (organic < organicCeiling) {
        this.organic[i] = Math.min(
          organicCeiling, organic + ORGANIC_RECOVERY_PER_DAY * days
        );
      }

      const nutrientCeiling = this.nutrientCeiling(i);
      const nutrient = this.nutrient[i]!;
      if (nutrient < nutrientCeiling) {
        this.nutrient[i] = Math.min(
          nutrientCeiling, nutrient + NUTRIENT_RECOVERY_PER_DAY * days
        );
      } else if (nutrient > nutrientCeiling) {
        // Above what the ground can hold, which is where a heavy dressing of
        // compost leaves it. Sand lets it go in a fortnight; loam keeps most of
        // it. This is the one place texture is felt as a *loss* rather than as
        // a ceiling, and it is why middening a sandbank is poor practice.
        const leach = LEACH_PER_DAY * (1 - this.texture[i]!) * days;
        this.nutrient[i] = Math.max(nutrientCeiling, nutrient - leach);
      }

      const restOrganic = Math.abs(this.organic[i]! - organicCeiling) < SETTLED;
      const restNutrient = Math.abs(this.nutrient[i]! - this.nutrientCeiling(i)) < SETTLED;
      if (restOrganic && restNutrient) settled.push(i);
    }

    for (const i of settled) this.active.delete(i);
    return looked;
  }

  index(x: number, y: number): number {
    return (y | 0) * this.width + (x | 0);
  }
}
