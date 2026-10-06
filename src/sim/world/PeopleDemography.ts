/**
 * Growing and shrinking: births and deaths of a people by cohort. M15 phase 32c, mechanism 2.
 *
 * Once per season, from the people's own stream, in this fixed order:
 *
 * 1. **Deaths**, per age band and sex, from the cohort as it stood: starvation (`PeopleCapacity`: the region's
 *    supply times the techniques, against the population) and old age (the very hazard `LifeSystem` rolls,
 *    integrated over the lifespan distribution a `Person` is drawn from), combined as independent causes.
 * 2. **War and disease**, if the owner gives a source for them (`DemographyEnv.losses`): persons lost,
 *    spread over the cohorts in proportion. No mechanism writes them yet, so there is no field for them on a
 *    people: that would be declared content nobody reads.
 * 3. **Ageing**: one twentieth of every band (five years, a quarter of a year) moves up a band.
 * 4. **Births**: fertile women (16-44) times the measured rate per fertile woman-year, scaled by how hungry the
 *    people is, a quarter of a year of it; newborns are half girls, and enter band 0 after ageing.
 *
 * Draws are binomial counts (exact Bernoulli below 200, the usual normal approximation above, both from the
 * people's stream), so the same seed gives the same people whatever else exists.
 *
 * What it does not do, and the correspondence says so: no infant-specific mortality (a baby starves at the
 * adult hazard), no cold, no health (the old-age hazard is the healthy one), no war or disease of its own.
 */
import type { RNG } from '../core/RNG.ts';
import { LIFESPAN_MEAN_YEARS, LIFESPAN_SD_YEARS } from '../entities/Person.ts';
import { oldAgeChancePerDay } from '../systems/LifeSystem.ts';
import { AGE_BANDS, AGE_BAND_YEARS, SEASONS_PER_YEAR, populationOf, type People, type PeopleSeason, type SeasonMechanism } from './PeopleSim.ts';
import { capacityAt, supplyRatioOf, starvationHazardPerDay, type PeopleRegion } from './PeopleCapacity.ts';
import { MEASURED_TOTALS } from './PeopleMeasured.ts';

/** Measured in 32b, `craft` (a healthy band): births per fertile woman-year, 38 in 39.8 woman-years. */
export const FED_BIRTHS_PER_WOMAN_YEAR: number = MEASURED_TOTALS.craft.birthsPerWomanYear;
/** The hungry share of that measured band; the rate is scaled relative to it. */
const FED_HUNGRY_SHARE = 0.24;
/** Centre of the hungry bins (25-100) of the need clock, as the conception condition `1 - hunger / 140` sees it. */
const HUNGRY_NEED = 62.5;
/** Weight of each band in the fertile count (ages 16 to 44: `Person.canBearChildren`). */
export const FERTILE_WEIGHT: readonly number[] = Array.from({ length: AGE_BANDS }, (_, b) => b === 3 ? 0.8 : b >= 4 && b <= 8 ? 1 : 0);

const conditionAt = (hungryShare: number) => 1 - hungryShare * (HUNGRY_NEED / 140);

/** Births per fertile woman-year at a hungry share: the fed rate, scaled by the conception condition. */
export function birthsPerWomanYear(hungryShare: number): number {
  return FED_BIRTHS_PER_WOMAN_YEAR * conditionAt(hungryShare) / conditionAt(FED_HUNGRY_SHARE);
}

// ---- old age, integrated over lifespans -----------------------------------

const oldAgeTables = new Map<number, Float64Array>();
/**
 * Per-day chance of dying of old age at each whole year of age, for somebody alive at that age, over the
 * lifespans a `Person` is drawn from (sum of three uniforms, as `RNG.gaussian`), healthy. Cached by length of year.
 */
export function oldAgeHazardByYear(daysPerYear: number): Float64Array {
  const cached = oldAgeTables.get(daysPerYear);
  if (cached) return cached;
  const GRID = 12, BINS = 64;
  // Lifespan classes: the 3-uniform sum on a grid, binned.
  const weight = new Float64Array(BINS), life = new Float64Array(BINS);
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) for (let k = 0; k < GRID; k++) {
    const u = (i + 0.5) / GRID + (j + 0.5) / GRID + (k + 0.5) / GRID - 1.5;
    const years = LIFESPAN_MEAN_YEARS + u * Math.SQRT2 * LIFESPAN_SD_YEARS;
    const bin = Math.max(0, Math.min(BINS - 1, Math.floor(((u + 1.5) / 3) * BINS)));
    weight[bin]! += 1; life[bin]! += years;
  }
  for (let b = 0; b < BINS; b++) if (weight[b]! > 0) life[b]! /= weight[b]!;
  const years = 101;
  const out = new Float64Array(years);
  const alive = Float64Array.from(weight);
  for (let y = 0; y < years; y++) {
    let hazardSum = 0, aliveSum = 0;
    for (let d = 0; d < daysPerYear; d++) {
      const age = y * daysPerYear + d;
      for (let b = 0; b < BINS; b++) {
        if (alive[b]! <= 0) continue;
        const h = oldAgeChancePerDay(age, life[b]! * daysPerYear, daysPerYear, false);
        hazardSum += alive[b]! * h; aliveSum += alive[b]!;
        alive[b]! *= 1 - h;
      }
    }
    out[y] = aliveSum > 0 ? hazardSum / aliveSum : 0.5;
  }
  oldAgeTables.set(daysPerYear, out);
  return out;
}

/** Chance that a member of a band dies of old age in a season of `days` days (the band's middle age; 60+ at 62). */
export function oldAgeSeasonChance(band: number, days: number, daysPerYear: number): number {
  const age = band === AGE_BANDS - 1 ? 62 : Math.floor(band * AGE_BAND_YEARS + AGE_BAND_YEARS / 2);
  const h = oldAgeHazardByYear(daysPerYear)[Math.min(100, age)]!;
  return 1 - Math.pow(1 - h, days);
}

// ---- draws -----------------------------------------------------------------

/** Binomial(n, p) from one stream: exact below 200 trials, normal approximation above. */
export function binomial(n: number, p: number, rng: RNG): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n < 200) { let k = 0; for (let i = 0; i < n; i++) if (rng.next() < p) k++; return k; }
  const mean = n * p, sd = Math.sqrt(n * p * (1 - p));
  // Box-Muller from two uniforms of the same stream (always two draws, so the stream advances evenly).
  const u1 = Math.max(rng.next(), 1e-12), u2 = rng.next();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.min(n, Math.round(mean + sd * z)));
}

// ---- the mechanism ------------------------------------------------------------

export interface DemographyEnv {
  /** The region a people lives in: what one comarca feeds. */
  readonly regionOf: (people: People) => PeopleRegion;
  /** Persons lost this season to war and to disease. Nothing writes these yet; a source is the owner's to give. */
  readonly losses?: (people: People, season: PeopleSeason) => { readonly war: number; readonly disease: number };
}

/** What a season did to one people, for whoever wants to measure it (never read by the model itself). */
export interface SeasonReport {
  readonly peopleId: number; readonly season: number; readonly seasonOfYear: PeopleSeason;
  readonly supplyRatio: number; readonly fertileWomen: number; readonly births: number; readonly starved: number; readonly oldAge: number; readonly lost: number;
  readonly population: number;
}

export function demography(env: DemographyEnv, report?: (r: SeasonReport) => void): SeasonMechanism {
  return ctx => {
    const { people, seasonOfYear } = ctx;
    const rng = people.rng;
    const days = ctx.sim.clock.daysPerSeason;
    const daysPerYear = days * SEASONS_PER_YEAR;
    const region = env.regionOf(people);
    const s = supplyRatioOf(people, region, seasonOfYear);
    const hazard = Number.isFinite(s) ? starvationHazardPerDay(s) : 0;
    const pStarve = 1 - Math.pow(1 - hazard, days);

    // 1. deaths from the cohorts as they stood
    let starved = 0, oldAge = 0;
    for (const side of [people.cohorts.male, people.cohorts.female]) {
      for (let b = 0; b < AGE_BANDS; b++) {
        const n = side[b]!;
        if (n === 0) continue;
        const pOld = oldAgeSeasonChance(b, days, daysPerYear);
        const dead = binomial(n, 1 - (1 - pStarve) * (1 - pOld), rng);
        // Attribute by the share of each cause in the combined chance (for the report only).
        const total = pStarve + pOld;
        const fromStarvation = total > 0 ? Math.round(dead * pStarve / total) : 0;
        starved += fromStarvation; oldAge += dead - fromStarvation;
        side[b] = n - dead;
      }
    }

    // 2. war and disease, in proportion over the cohorts
    let lost = 0;
    const external = env.losses?.(people, seasonOfYear);
    if (external) {
      const want = Math.max(0, Math.floor(external.war + external.disease));
      const population = populationOf(people);
      if (want > 0 && population > 0) {
        const p = Math.min(1, want / population);
        for (const side of [people.cohorts.male, people.cohorts.female]) {
          for (let b = 0; b < AGE_BANDS; b++) {
            const dead = binomial(side[b]!, p, rng);
            side[b]! -= dead; lost += dead;
          }
        }
      }
    }

    // 3. ageing: a twentieth of each band moves up (five years of a quarter-year season each)
    for (const side of [people.cohorts.male, people.cohorts.female]) {
      const moves: number[] = [];
      for (let b = 0; b < AGE_BANDS - 1; b++) moves.push(binomial(side[b]!, 1 / (AGE_BAND_YEARS * SEASONS_PER_YEAR), rng));
      for (let b = 0; b < AGE_BANDS - 1; b++) { side[b]! -= moves[b]!; side[b + 1]! += moves[b]!; }
    }

    // 4. births
    let fertile = 0;
    for (let b = 0; b < AGE_BANDS; b++) fertile += people.cohorts.female[b]! * FERTILE_WEIGHT[b]!;
    const hungryShare = Number.isFinite(s) ? capacityAt(s).hungryShare : 0;
    const rate = birthsPerWomanYear(hungryShare) / SEASONS_PER_YEAR;
    const births = binomial(Math.round(fertile), rate, rng);
    const boys = binomial(births, 0.5, rng);
    people.cohorts.male[0]! += boys; people.cohorts.female[0]! += births - boys;

    report?.({ peopleId: people.id, season: ctx.season, seasonOfYear, supplyRatio: s, fertileWomen: fertile, births, starved, oldAge, lost, population: populationOf(people) });
  };
}
