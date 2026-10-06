/**
 * What a region can feed, and what that does to the people living on it. M15 phase 32c, mechanism 2.
 *
 * Two things come out of this file, and they are the same number seen from two sides:
 *
 * 1. **`PeopleDemography`'s hunger**: the share of hungry days with no food at all (`hungryZero`), the share
 *    of people who are hungry, and from them the starvation hazard.
 * 2. **The band capacity of the compact level (32b)**: `bandCapacityOf` returns the `BandCapacity` that
 *    `CompactIntake` reads (`hungryZero`), *for any season of the year and from the region alone*. 32b ended
 *    with "the compact model is only valid while somebody hands it the capacity of the period; the capacity of
 *    the coming season is the people model's job" (docs/m15_phase32b_compact.md section 5); this is that function.
 *
 * ## The model, and which parts were measured
 *
 * `supply = comarcas * rationsPerComarcaDay[season] * foodMultiplier(techs)` rations a day (a ration is one
 * person's daily need), and `s = supply / population`. The measured points use the same quantity: the rations a
 * world's comarca fed per day over its mean population (a first version put the adult eaten/drift ratio on the
 * axis, which is a different number; tools/people-correspond.ts exposed it). The detailed game was measured, in three worlds and
 * four seasons each (tools/people-calibrate.ts), for what `s` meant in terms of days: the share of days that
 * began hungry that brought nothing (`hungryZero`) and the share of days that began hungry (`hungryShare`).
 * Those twelve points, pooled by pool-adjacent-violators into a monotone curve, are `capacityAt`. Two ends are
 * *not* measured and are fixed by logic, not by data: at `s = 0` nobody eats (`hungryZero = hungryShare = 1`,
 * straight line to the first measured point), and above the richest measured `s` the curve is held flat.
 *
 * A hungry person starves when `STARVATION_DAYS` days in a row bring nothing. 32b measured that a person with
 * hunger and thirst at 0 dies between tick 1,961 and 2,127 (8.2 to 8.9 days at 240 ticks a day); the hazard is
 * that run's chance of starting on a given day, `(1 - z) z^K`, for the hungry share. It is *derived*, not
 * fitted, and tools/people-correspond.ts compares it with the measured starvation rate. It stops growing at its
 * maximum (`z = K / (K + 1)`, 0.889) because the formula counts runs that *start*, and a people that is past it
 * is dying faster than it can say; no measured point is past z = 0.81, so that is extrapolation.
 */
import { MEASURED_CAPACITY_POINTS, MEASURED_KIT, MEASURED_REGIONS, type CapacityPoint } from './PeopleMeasured.ts';
import type { BandCapacity } from '../compact/CompactIntake.ts';
import { populationOf, type People, type PeopleSeason, type TechSet } from './PeopleSim.ts';
import type { Tech } from '../knowledge/Tech.ts';

/** Days without any food that kill: measured in 32b (ticks 1,961-2,127 of 240 a day). */
export const STARVATION_DAYS = 8;

export interface CurvePoint { readonly s: number; readonly hungryZero: number; readonly hungryShare: number }

/** Weighted pool-adjacent-violators for a non-increasing fit. */
function poolNonIncreasing(values: readonly number[], weights: readonly number[]): number[] {
  const blocks: { sum: number; w: number; n: number }[] = [];
  values.forEach((v, i) => {
    blocks.push({ sum: v * weights[i]!, w: weights[i]!, n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]!, a = blocks[blocks.length - 2]!;
      if (a.sum / a.w >= b.sum / b.w) break; // already non-increasing
      blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, w: a.w + b.w, n: a.n + b.n });
    }
  });
  return blocks.flatMap(b => new Array<number>(b.n).fill(b.sum / b.w));
}

/** The measured points, sorted by `s`, with both columns made monotone (more food, fewer empty days). */
export function buildCurve(points: readonly CapacityPoint[]): CurvePoint[] {
  const sorted = [...points].sort((a, b) => a.s - b.s);
  const w = sorted.map(p => p.hungryDays);
  const hz = poolNonIncreasing(sorted.map(p => p.hungryZero), w);
  const hs = poolNonIncreasing(sorted.map(p => p.hungryShare), w);
  return sorted.map((p, i) => ({ s: p.s, hungryZero: hz[i]!, hungryShare: hs[i]! }));
}
export const CAPACITY_CURVE: readonly CurvePoint[] = buildCurve(MEASURED_CAPACITY_POINTS);

/** The curve at a supply ratio. Linear between points; to (0, 1, 1) below the first; flat above the last. */
export function capacityAt(s: number, curve: readonly CurvePoint[] = CAPACITY_CURVE): { hungryZero: number; hungryShare: number } {
  const first = curve[0]!, last = curve[curve.length - 1]!;
  if (!(s > 0)) return { hungryZero: 1, hungryShare: 1 };
  if (s >= last.s) return { hungryZero: last.hungryZero, hungryShare: last.hungryShare };
  if (s <= first.s) {
    const t = s / first.s;
    return { hungryZero: 1 + (first.hungryZero - 1) * t, hungryShare: 1 + (first.hungryShare - 1) * t };
  }
  let i = 1;
  while (curve[i]!.s < s) i++;
  const a = curve[i - 1]!, b = curve[i]!;
  const t = b.s === a.s ? 0 : (s - a.s) / (b.s - a.s);
  return { hungryZero: a.hungryZero + (b.hungryZero - a.hungryZero) * t, hungryShare: a.hungryShare + (b.hungryShare - a.hungryShare) * t };
}

/** Per-day chance that a hungry person begins a run of `STARVATION_DAYS` empty days: `(1 - z) z^K`, held at its maximum past it. */
export function starvationRunChance(hungryZero: number, days = STARVATION_DAYS): number {
  const z = Math.min(hungryZero, days / (days + 1));
  return (1 - z) * Math.pow(z, days);
}

/** Per-day starvation hazard of a person of the people, at a supply ratio. */
export function starvationHazardPerDay(s: number, curve?: readonly CurvePoint[]): number {
  const c = capacityAt(s, curve);
  return c.hungryShare * starvationRunChance(c.hungryZero);
}

// ---------------------------------------------------------------------------
// Region and technique
// ---------------------------------------------------------------------------

/** What one comarca of a region feeds, in rations a day, for a people that knows nothing that helps. */
export interface PeopleRegion {
  readonly rationsPerComarcaDay: Readonly<Record<PeopleSeason, number>>;
}

/** A region read off one of the measured worlds (`lean`, `craft`): what its one comarca fed. */
export function measuredRegion(variant: 'lean' | 'craft' | 'leankit'): PeopleRegion {
  return { rationsPerComarcaDay: { ...MEASURED_REGIONS[variant].rationsPerDay } };
}

/**
 * Multiplier of a people's techniques on what a comarca feeds. **Only one thing was measured**: the foraging
 * kit (`MEASURED_KIT`), the same world with and without it. A people that holds the whole kit gets that ratio;
 * every other technique counts as 1, which is *conservative and not a finding* (farming, herding and storage
 * surely matter and nothing here measures them; `docs/m15_phase32c_peoples.md`). Not interpolated for a partial
 * kit: one measurement has no slope.
 */
export function foodMultiplier(techs: TechSet): number {
  return MEASURED_KIT.techs.every(t => techs.has(t as Tech)) ? MEASURED_KIT.multiplier : 1;
}

export function suppliedRations(people: Pick<People, 'comarcas' | 'techs'>, region: PeopleRegion, season: PeopleSeason): number {
  return people.comarcas * region.rationsPerComarcaDay[season] * foodMultiplier(people.techs);
}

/** Rations per person per day. Infinite for an empty people (nobody to feed). */
export function supplyRatioOf(people: People, region: PeopleRegion, season: PeopleSeason): number {
  const population = populationOf(people);
  return population === 0 ? Infinity : suppliedRations(people, region, season) / population;
}

/**
 * The band capacity `CompactIntake` reads, for a people in a given season of the year. This is what the compact
 * level lacked in 32b: it can be asked about the *coming* season, for the people as it is now.
 */
export function bandCapacityOf(people: People, region: PeopleRegion, season: PeopleSeason): BandCapacity {
  return { hungryZero: capacityAt(supplyRatioOf(people, region, season)).hungryZero };
}
