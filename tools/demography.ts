import { ADULT_YEARS, type Person } from '../src/sim/entities/Person.ts';

export interface Demography {
  births: number;
  fertileWomen: number;
  fertileWomanYears: number;
  underOne: { deaths: number; eligible: number; censored: number };
  underFive: { deaths: number; eligible: number; censored: number };
  deaths: number;
  deathAgeYears: number;
  causes: Record<string, number>;
}

/**
 * Read-only observer: no hooks into birth/death and no draws from any stream.
 * Mortality counts a death as soon as its outcome is known and censors only
 * living children who have not had enough follow-up. Founders enter death
 * statistics but not the observed birth cohorts.
 */
export class DemographyWatch {
  private readonly founders: Set<number>;
  private readonly births = new Map<number, number>();
  private readonly fertile = new Set<number>();
  private fertileWomanYears = 0;
  private lastObservedTick = 0;

  constructor(people: Iterable<Person>, private readonly ticksPerDay: number) {
    const founders = Array.from(people);
    this.founders = new Set(founders.map(p => p.id));
  }

  /**
   * Called on the day boundary. Exposure uses the living population at that endpoint.
   * Pregnancy is part of reproductive exposure, not a reason to remove a woman
   * from the denominator; canBearChildren deliberately excludes pregnancy.
   */
  observe(people: Iterable<Person>, tick: number): void {
    const elapsedTicks = Math.max(0, tick - this.lastObservedTick);
    this.lastObservedTick = Math.max(this.lastObservedTick, tick);
    for (const p of people) {
      if (!this.founders.has(p.id) && !this.births.has(p.id)) this.births.set(p.id, tick);
      if (p.alive && p.sex === 'female' && p.years >= ADULT_YEARS + 2 && p.years < 45) {
        this.fertile.add(p.id);
        this.fertileWomanYears += elapsedTicks / (this.ticksPerDay * p.daysPerYear);
      }
    }
  }

  finish(people: Iterable<Person>, tick: number): Demography {
    // Include the final partial day, when births and deaths can still occur.
    this.observe(people, tick);
    const result: Demography = {
      births: this.births.size, fertileWomen: this.fertile.size,
      fertileWomanYears: this.fertileWomanYears,
      underOne: { deaths: 0, eligible: 0, censored: 0 },
      underFive: { deaths: 0, eligible: 0, censored: 0 },
      deaths: 0, deathAgeYears: 0, causes: {},
    };
    for (const p of people) {
      if (!p.alive) {
        result.deaths++;
        // Person.years is rounded down; age retains the fraction of a year.
        result.deathAgeYears += p.age / p.daysPerYear;
        // Combat stores a sentence naming the killer. A demographic cause is
        // murder, not one separate disease-like category per attacker.
        const cause = p.causeOfDeath?.startsWith('killed by ') ? 'murder' : p.causeOfDeath ?? 'unknown';
        result.causes[cause] = (result.causes[cause] ?? 0) + 1;
      }
      const bornAt = this.births.get(p.id);
      if (bornAt === undefined) continue;
      for (const [years, cohort] of [[1, result.underOne], [5, result.underFive]] as const) {
        // A death before the age limit is already a complete outcome, even if
        // the cohort has not yet had a full year/five years to mature. Only a
        // living child without enough follow-up is right-censored.
        if (!p.alive || tick - bornAt >= years * p.daysPerYear * this.ticksPerDay) {
          cohort.eligible++;
          if (!p.alive && p.age / p.daysPerYear < years) cohort.deaths++;
        } else cohort.censored++;
      }
    }
    return result;
  }
}

/** Pool counts and exposure, never average percentages from unequal worlds. */
export function formatDemography(rows: Demography[]): string {
  const sum = (pick: (r: Demography) => number) => rows.reduce((n, r) => n + pick(r), 0);
  const ratio = (n: number, d: number) => d === 0 ? 'n/a' : (n / d).toFixed(3);
  const mortality = (key: 'underOne' | 'underFive') => {
    const died = sum(r => r[key].deaths), eligible = sum(r => r[key].eligible);
    return ratio(died, eligible) + ' (' + died + '/' + eligible + '; ' +
      sum(r => r[key].censored) + ' births awaiting follow-up)';
  };
  const causes: Record<string, number> = {};
  for (const r of rows) for (const [cause, n] of Object.entries(r.causes)) causes[cause] = (causes[cause] ?? 0) + n;
  return '  DEMOGRAPHY ' + sum(r => r.births) + ' births / ' + sum(r => r.fertileWomen) +
    ' fertile women = ' + ratio(sum(r => r.births), sum(r => r.fertileWomen)) +
    ' births/woman; ' + ratio(sum(r => r.births), sum(r => r.fertileWomanYears)) +
    ' births/woman-year (' + sum(r => r.fertileWomanYears).toFixed(3) + ' woman-years)' +
    ' · mortality <1y ' + mortality('underOne') + ' · <5y ' + mortality('underFive') +
    ' · mean age at death ' + ratio(sum(r => r.deathAgeYears), sum(r => r.deaths)) +
    'y (' + sum(r => r.deaths) + ' deaths) · causes ' +
    (Object.entries(causes).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => k + '=' + n).join(', ') || 'none');
}
