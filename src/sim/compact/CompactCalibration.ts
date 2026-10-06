/**
 * Read-only instrument: what the *detailed* model gives a person, per day,
 * M15 phase 32b.
 *
 * The compact level may not invent how much a person eats or drinks: a made-up
 * coefficient hands survival out or takes it away (docs/m15_phase32b_compact.md).
 * This watch measures it instead, from a running `Simulation`, without a hook in
 * the game and without drawing a number from any stream — it only reads state
 * after each completed step, so a measured run is bit-identical to an unmeasured
 * one (tested).
 *
 * What it records, for every person-day in which the person was present at both
 * ends of the day:
 *
 * - **Relief of hunger and thirst, as a ratio of the day's drift.** The needs
 *   clock raises each need by a known amount per tick (`hungerRate` × the
 *   lactation/nursling factor; `thirstRate` × exertion × heat). Whatever the
 *   person *did* — ate from the pack, foraged, nursed, drank at the river, ate a
 *   berry's water — shows as the need coming back down against that drift. So
 *   `relief = min(100, need_before + drift) − need_after` per tick (the needs clock
 *   clamps at 100: a person pinned there, starving, got *nothing*, and without the clamp
 *   would read as fully relieved) is the effective intake in need units, and `relief / drift` over the day is 1 for a person who just
 *   sustains themselves, 0 for a person who got nothing. Relief the clamp at zero
 *   throws away is not counted (a full belly gains nothing from a spare berry),
 *   which is the right quantity for the compact model: it needs what the body
 *   *absorbed*. The true nominal nutrition eaten (the macro ledger) is kept beside
 *   it so the two can be compared.
 * - **Conditioned on the need at the start of the day**, in four bins. A hungry
 *   person eats more than a sated one — the Brain does that — so an unconditional
 *   mean would feed a starving compact person as if they were comfortable. The
 *   conditional distribution keeps the feedback and keeps the bad tail (people do
 *   starve in the detailed model, about 65% of its deaths) rather than averaging it
 *   away.
 * - **Where the day went**: the number of ticks per coarse agenda (`goalOf`).
 * - **Mortality by age** (person-years at risk and deaths per bucket and cause) and
 *   **births per fertile woman-year**, by season.
 *
 * Honest limits, printed with the table: the ratio is an estimate whose per-tick
 * drift for thirst assumes the action seen at the end of the previous step was the
 * one the clock used, and the temperature of the current tick; cold, poison and
 * hunger-factor hooks beyond lactation/nursling are not modelled in the drift (they
 * move the denominator by a few percent at most). Samples are person-days of a few
 * seeds of cheap scenarios, not a cohort of twenty; a bin with fewer than
 * `MIN_BIN_SAMPLES` is reported as thin and the compact model refuses to use it.
 */
import type { Simulation } from '../core/Simulation.ts';
import type { Person } from '../entities/Person.ts';
import { thirstDriftPerTick } from '../systems/NeedsSystem.ts';
import { isLactating, isNursling } from '../entities/LifeStage.ts';
import { nurslingHungerFactor } from '../ai/Nursing.ts';
import { ADULT_YEARS } from '../entities/Person.ts';
import { goalOf, type CompactGoalKind } from './CompactPerson.ts';

export type RateSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type RateGroup = 'nursling' | 'child' | 'adult';
export type NeedKind = 'hunger' | 'thirst';

/** Day-start need, in four equal bins of 25. */
export const NEED_BINS = 4;
export const MIN_BIN_SAMPLES = 30;
/** The quantiles kept for a distribution: 0, 5, 10, ... 100 per cent (21 values). */
export const QUANTILE_STEPS = 21;

export function needBin(level: number): number {
  return Math.max(0, Math.min(NEED_BINS - 1, Math.floor(level / (100 / NEED_BINS))));
}

export function groupOf(person: Person, childhood: Simulation['config']['childhood']): RateGroup {
  if (isNursling(person, childhood)) return 'nursling';
  return person.years < ADULT_YEARS ? 'child' : 'adult';
}

export const AGE_BUCKETS: readonly { readonly name: string; readonly from: number; readonly to: number }[] = [
  { name: '0-1', from: 0, to: 1 }, { name: '1-5', from: 1, to: 5 }, { name: '5-14', from: 5, to: 14 },
  { name: '14-30', from: 14, to: 30 }, { name: '30-45', from: 30, to: 45 },
  { name: '45-60', from: 45, to: 60 }, { name: '60+', from: 60, to: Infinity },
];
export function ageBucketOf(years: number): number {
  for (let i = 0; i < AGE_BUCKETS.length; i++) if (years < AGE_BUCKETS[i]!.to) return i;
  return AGE_BUCKETS.length - 1;
}

interface Snapshot { hunger: number; thirst: number; action: string; eaten: number }
interface DayState {
  hungerStart: number; thirstStart: number; season: RateSeason; group: RateGroup; bandId: number;
  hungerDrift: number; hungerRelief: number; thirstDrift: number; thirstRelief: number;
  eaten: number; ticks: number; goals: Record<CompactGoalKind, number>; drinkTicks: number;
}

export interface PersonDay {
  readonly season: RateSeason; readonly group: RateGroup;
  /** The band the person belonged to at the start of the day: the aggregate a capacity is read over. */
  readonly bandId: number;
  readonly hungerBin: number; readonly thirstBin: number;
  /** relief / drift over the day, uncapped. */
  readonly hungerRatio: number; readonly thirstRatio: number;
  /** Nominal nutrition eaten, per tick of drift-equivalent (same units as hunger). */
  readonly eaten: number; readonly hungerDrift: number;
  readonly goals: Record<CompactGoalKind, number>; readonly drinkTicks: number; readonly ticks: number;
}

export interface MortalityRow { personYears: number; deaths: number; causes: Record<string, number> }

export class RateWatch {
  readonly days: PersonDay[] = [];
  readonly mortality: MortalityRow[] = AGE_BUCKETS.map(() => ({ personYears: 0, deaths: 0, causes: {} }));
  /** Births by season, with fertile woman-years by season (ages 16-45). */
  readonly births: Record<RateSeason, { births: number; womanYears: number }> = {
    spring: { births: 0, womanYears: 0 }, summer: { births: 0, womanYears: 0 },
    autumn: { births: 0, womanYears: 0 }, winter: { births: 0, womanYears: 0 },
  };
  private prev = new Map<number, Snapshot>();
  private day = new Map<number, DayState>();
  private readonly known = new Set<number>();
  private readonly dead = new Set<number>();
  private lastCensusTick = 0;
  private primed = false;

  constructor(private readonly sim: Simulation) {
    for (const p of sim.peopleById.values()) this.known.add(p.id);
  }

  private snapshot(p: Person): Snapshot {
    const m = p.macroIntakeToday;
    return { hunger: p.needs.hunger, thirst: p.needs.thirst, action: p.order ?? p.action, eaten: m.fat + m.protein + m.carb };
  }

  /** Call once after every `sim.step()`. */
  observe(): void {
    const sim = this.sim;
    const tick = sim.time.tick;
    const tpd = sim.config.time.ticksPerDay;
    const cfg = sim.config.needs;
    const childhood = sim.config.childhood;
    if (!this.primed) {
      for (const p of sim.people) if (p.alive) this.prev.set(p.id, this.snapshot(p));
      this.primed = true;
      this.startDay(tick);
      return;
    }
    const temperature = sim.time.temperature;
    const nurslingFactor = nurslingHungerFactor(childhood.feedsPerDay, tpd, cfg.hungerRate);
    const next = new Map<number, Snapshot>();
    for (const p of sim.people) {
      if (!p.alive) continue;
      const now = this.snapshot(p);
      next.set(p.id, now);
      const before = this.prev.get(p.id);
      const st = this.day.get(p.id);
      if (!before || !st) continue;
      const factor = isLactating(p, sim.peopleById, childhood) ? 1 + childhood.lactationHunger
        : isNursling(p, childhood) ? nurslingFactor : 1;
      const hDrift = cfg.hungerRate * factor;
      const tDrift = thirstDriftPerTick(cfg, before.action, temperature);
      st.hungerDrift += hDrift;
      st.thirstDrift += tDrift;
      st.hungerRelief += Math.max(0, Math.min(100, before.hunger + hDrift) - now.hunger);
      st.thirstRelief += Math.max(0, Math.min(100, before.thirst + tDrift) - now.thirst);
      // The macro ledger resets at the day boundary: a drop means "restart from the new value".
      st.eaten += now.eaten >= before.eaten ? now.eaten - before.eaten : now.eaten;
      st.ticks++;
      st.goals[goalOf(p, tick).kind]++;
      if ((p.order ?? p.action) === 'drink') st.drinkTicks++;
    }
    this.prev = next;
    if (tick % tpd === 0) { this.closeDay(tick); this.census(tick); this.startDay(tick); }
  }

  private startDay(tick: number): void {
    const sim = this.sim;
    this.day = new Map();
    const season = sim.time.season;
    for (const p of sim.people) {
      if (!p.alive) continue;
      this.day.set(p.id, {
        hungerStart: p.needs.hunger, thirstStart: p.needs.thirst, season, group: groupOf(p, sim.config.childhood), bandId: p.bandId,
        hungerDrift: 0, hungerRelief: 0, thirstDrift: 0, thirstRelief: 0, eaten: 0, ticks: 0,
        goals: { obtain_food: 0, build: 0, care: 0, travel: 0, idle: 0 }, drinkTicks: 0,
      });
    }
    void tick;
  }

  private closeDay(tick: number): void {
    const tpd = this.sim.config.time.ticksPerDay;
    for (const p of this.sim.people) {
      const st = this.day.get(p.id);
      // Only a complete day: present at the start and still alive at the end.
      if (!st || !p.alive || st.ticks < tpd - 1 || st.hungerDrift <= 0 || st.thirstDrift <= 0) continue;
      this.days.push({
        season: st.season, group: st.group, bandId: st.bandId,
        hungerBin: needBin(st.hungerStart), thirstBin: needBin(st.thirstStart),
        hungerRatio: st.hungerRelief / st.hungerDrift, thirstRatio: st.thirstRelief / st.thirstDrift,
        eaten: st.eaten, hungerDrift: st.hungerDrift, goals: st.goals, drinkTicks: st.drinkTicks, ticks: st.ticks,
      });
    }
    void tick;
  }

  /** Daily census: exposure by age bucket, births by season, new deaths. */
  private census(tick: number): void {
    const sim = this.sim;
    const tpd = sim.config.time.ticksPerDay;
    const elapsed = Math.max(0, tick - this.lastCensusTick);
    this.lastCensusTick = tick;
    const season = sim.time.season;
    for (const p of sim.peopleById.values()) {
      const years = p.age / p.daysPerYear;
      if (!this.known.has(p.id)) { this.known.add(p.id); this.births[season].births++; }
      if (p.alive) {
        const exposure = elapsed / (tpd * p.daysPerYear);
        this.mortality[ageBucketOf(years)]!.personYears += exposure;
        if (p.sex === 'female' && p.years >= ADULT_YEARS + 2 && p.years < 45) this.births[season].womanYears += exposure;
      } else if (!this.dead.has(p.id)) {
        this.dead.add(p.id);
        const row = this.mortality[ageBucketOf(years)]!;
        row.deaths++;
        const raw = p.causeOfDeath ?? 'unknown';
        const cause = raw.startsWith('killed by ') ? 'murder' : raw;
        row.causes[cause] = (row.causes[cause] ?? 0) + 1;
      }
    }
  }
}

/** Sorted-sample quantiles at `steps` evenly spaced probabilities (0..1 inclusive). */
export function quantiles(samples: readonly number[], steps = QUANTILE_STEPS): number[] {
  const sorted = [...samples].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    const pos = (i / (steps - 1)) * (sorted.length - 1);
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    out.push(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo));
  }
  return out;
}

/** A day whose relief is below this share of its drift counts as "got nothing". */
export const ZERO_RELIEF = 0.05;
/** Fewer nonzero days than this and the cell keeps no distribution of what a fed day looks like. */
export const MIN_FED_SAMPLES = 10;

export interface RateBin {
  n: number;
  mean: number;
  /** Quantiles of the whole distribution (zeros included). */
  q: number[];
  /** Share of days that brought no relief at all: what a band can or cannot do for somebody who needs food. */
  zero: number;
  /** Number of days with relief, and the quantiles of those only (empty under `MIN_FED_SAMPLES`). */
  nz: number;
  qf: number[];
}
/** `season|group|need|bin` → distribution of the day's relief ratio. */
export type RateTable = Record<string, RateBin>;

export function rateKey(season: RateSeason, group: RateGroup, need: NeedKind, bin: number): string {
  return `${season}|${group}|${need}|${bin}`;
}

/** Fold person-days into the conditional-quantile table. Rounded so the committed file is stable. */
export function buildRateTable(days: readonly PersonDay[]): RateTable {
  const buckets = new Map<string, number[]>();
  const push = (key: string, v: number) => { const a = buckets.get(key); if (a) a.push(v); else buckets.set(key, [v]); };
  for (const d of days) {
    push(rateKey(d.season, d.group, 'hunger', d.hungerBin), d.hungerRatio);
    push(rateKey(d.season, d.group, 'thirst', d.thirstBin), d.thirstRatio);
  }
  const table: RateTable = {};
  const r = (v: number) => Math.round(v * 1000) / 1000;
  for (const key of [...buckets.keys()].sort()) {
    const samples = buckets.get(key)!;
    const fed = samples.filter(v => v >= ZERO_RELIEF);
    table[key] = {
      n: samples.length, mean: r(samples.reduce((a, b) => a + b, 0) / samples.length), q: quantiles(samples).map(r),
      zero: r(1 - fed.length / samples.length), nz: fed.length,
      qf: fed.length >= MIN_FED_SAMPLES ? quantiles(fed).map(r) : [],
    };
  }
  return table;
}
