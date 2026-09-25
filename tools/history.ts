import type { Simulation } from '../src/sim/core/Simulation.ts';
import { ADULT_YEARS, type Person } from '../src/sim/entities/Person.ts';
import { TECH, type Tech } from '../src/sim/knowledge/Tech.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { malnutrition } from '../src/sim/core/Macros.ts';

export interface DropEpisode { bandId: number; peak: number; started: number; recoveredAt: number | null }
export interface WarPair { a: number; b: number; days: number[] }
export interface HistoryReport {
  days: number; populationYears: number; dailyPopulation: Record<number, number[]>; drawdowns: number[]; recoveries: DropEpisode[];
  bandLost: Record<string, number>; worldLost: boolean; selfDestroyed: number; inBandKills: number;
  violentAdultDeaths: number; adultDeaths: number; blowRepeat: number; blowRepeatUnanswered: number; warPairs: WarPair[];
  fireBy: number | null; adoptionDays: number[]; adoptionNotReached: number; malnutrition: number;
  proteinNutrition: number; totalNutrition: number;
}

interface AdoptionStart { day: number; adultsAtStart: number; hit: boolean }
const pairKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
const causeClass = (cause: string) => cause === 'murder' ? 'violence' :
  ['starvation', 'dehydration', 'exposure'].includes(cause) ? 'need' : 'other';

/** Daily read-only cohort observer. Its samples never enter Simulation state or draw from an RNG. */
export class HistoryWatch {
  private days = 0;
  private populationYears = 0;
  private readonly dailyPopulation: Record<number, number[]> = {};
  private readonly peaks = new Map<number, number>();
  private readonly drawdowns = new Map<number, number>();
  private readonly recoveries: DropEpisode[] = [];
  private readonly activeDrop = new Map<number, DropEpisode>();
  private readonly deaths: { day: number; bandId: number; cause: string; adult: boolean }[] = [];
  private readonly countedDeaths = new Set<number>();
  private readonly bandPeak = new Map<number, number>();
  private readonly bandLost: Record<string, number> = { violence: 0, need: 0, other: 0, absorbed: 0 };
  private readonly killCounts = new Map<number, number>();
  private readonly warDays = new Map<string, WarPair>();
  private readonly adoptionStarts = new Map<string, AdoptionStart>();
  private readonly adoptionDays: number[] = [];
  private adoptionNotReached = 0;
  private fireBy: number | null;
  private readonly knownAtStart: number;
  private lastEventId = 0;
  private malnutritionSum = 0;
  private malnutritionSamples = 0;
  private adultDeaths = 0;
  private violentAdultDeaths = 0;

  constructor(private readonly sim: Simulation) {
    this.knownAtStart = sim.knownTech.has('firemaking') ? 0 : -1;
    this.fireBy = this.knownAtStart === 0 ? 0 : null;
  }

  observe(sim = this.sim): void {
    this.days++;
    const alive = sim.livingPeople();
      this.populationYears += alive.length / Math.max(1, sim.time.daysPerYear);
    const counts = new Map<number, number>();
    for (const band of sim.bands) {
      if (band.outcast) continue;
      const count = alive.reduce((n, p) => n + Number(p.bandId === band.id), 0);
      counts.set(band.id, count);
      (this.dailyPopulation[band.id] ??= []).push(count);
      const peak = Math.max(this.bandPeak.get(band.id) ?? 0, count);
      this.bandPeak.set(band.id, peak);
      const prevPeak = this.peaks.get(band.id) ?? 0;
      const nextPeak = Math.max(prevPeak, count);
      this.peaks.set(band.id, nextPeak);
      if (nextPeak >= 6) this.drawdowns.set(band.id, Math.max(this.drawdowns.get(band.id) ?? 0, (nextPeak - count) / nextPeak));
      const episode = this.activeDrop.get(band.id);
      if (episode && count >= episode.peak * .75) {
        episode.recoveredAt = this.days;
        this.activeDrop.delete(band.id);
      } else if (!episode && nextPeak >= 6 && count <= nextPeak * .6) {
        const drop = { bandId: band.id, peak: nextPeak, started: this.days, recoveredAt: null };
        this.recoveries.push(drop); this.activeDrop.set(band.id, drop);
      }
    }

    for (const p of sim.peopleById.values()) {
      if (p.alive || this.countedDeaths.has(p.id)) continue;
      this.countedDeaths.add(p.id);
      const cause = p.causeOfDeath?.startsWith('killed by ') ? 'murder' : p.causeOfDeath ?? 'unknown';
      const adult = p.age / p.daysPerYear >= ADULT_YEARS;
      this.deaths.push({ day: this.days, bandId: p.bandId, cause, adult });
      if (adult) { this.adultDeaths++; if (cause === 'murder') this.violentAdultDeaths++; }
    }

    if (this.fireBy === null && sim.knownTech.has('firemaking')) this.fireBy = this.days;
    const events = sim.social.recent.filter(e => e.id > this.lastEventId);
    for (const event of events) {
      this.lastEventId = Math.max(this.lastEventId, event.id);
      if (event.type !== 'assault' && event.type !== 'murder') continue;
      const actor = sim.peopleById.get(event.actorId);
      const victimBand = event.victimBandId;
      if (!actor || victimBand === null) continue;
      if (event.type === 'murder' && actor.bandId === victimBand) {
        this.killCounts.set(victimBand, (this.killCounts.get(victimBand) ?? 0) + 1);
      }
      if (actor.bandId !== victimBand) {
        const key = pairKey(actor.bandId, victimBand);
        let pair = this.warDays.get(key);
        if (!pair) { pair = { a: Math.min(actor.bandId, victimBand), b: Math.max(actor.bandId, victimBand), days: [] }; this.warDays.set(key, pair); }
        const eventDay = Math.floor(event.tick / sim.config.time.ticksPerDay);
        if (pair.days.at(-1) !== eventDay) pair.days.push(eventDay);
      }
    }

    const deathsByBand = new Map<number, number>();
    for (const d of this.deaths) if (d.day === this.days) deathsByBand.set(d.bandId, (deathsByBand.get(d.bandId) ?? 0) + 1);
    for (const [bandId, count] of counts) {
      if (count !== 0 || (this.dailyPopulation[bandId]?.length ?? 0) < 2) continue;
      const previous = this.dailyPopulation[bandId]![this.dailyPopulation[bandId]!.length - 2]!;
      if (previous === 0) continue;
      const recentDeaths = this.deaths.filter(d => d.bandId === bandId && d.day > this.days - 30 && d.day <= this.days);
      if (recentDeaths.length === 0) { this.bandLost.absorbed++; continue; }
      const causes: Record<string, number> = {};
      for (const d of recentDeaths) causes[causeClass(d.cause)] = (causes[causeClass(d.cause)] ?? 0) + 1;
      const dominant = Object.entries(causes).sort((a, b) => b[1] - a[1])[0]![0]!;
      this.bandLost[dominant]++;
    }

    // Discovery-to-adoption interval, by technology and band. Counts adults only,
    // consistent with Simulation.knownTech's world-level rule.
    for (const band of sim.bands) {
      if (band.outcast) continue;
      const members = alive.filter(p => p.bandId === band.id && isAdult(p));
      if (!members.length) continue;
      for (const tech of Object.keys(TECH) as Tech[]) {
        const holders = members.filter(p => p.knownTech.has(tech)).length;
        const key = `${band.id}:${tech}`;
        if (holders >= 2 && !this.adoptionStarts.has(key)) this.adoptionStarts.set(key, { day: this.days, adultsAtStart: members.length, hit: false });
        const start = this.adoptionStarts.get(key);
        if (start && !start.hit && holders >= Math.ceil(members.length / 2)) {
          start.hit = true; this.adoptionDays.push(this.days - start.day);
        }
      }
    }
    this.malnutritionSum += alive.reduce((n, p) => n + malnutrition(p), 0);
    this.malnutritionSamples += alive.length;
  }

  finish(sim = this.sim): HistoryReport {
    for (const start of this.adoptionStarts.values()) if (!start.hit) this.adoptionNotReached++;
    const telemetrySnapshot = telemetry.snapshot();
    const totalNutrition = telemetrySnapshot.diet_nutrition_total ?? 0;
    const proteinNutrition = telemetrySnapshot.diet_nutrition_protein ?? 0;
    const repeat = telemetrySnapshot.blow_repeat ?? 0;
    const ownKills = [...this.killCounts.values()].reduce((a, b) => a + b, 0);
    const selfDestroyed = [...this.killCounts.entries()].filter(([id, kills]) => kills >= (this.peaks.get(id) ?? 0) * .5).length;
    return {
      days: this.days, populationYears: this.populationYears, dailyPopulation: this.dailyPopulation,
      drawdowns: [...this.drawdowns.values()], recoveries: this.recoveries,
      bandLost: this.bandLost, worldLost: sim.livingPeople().length === 0, selfDestroyed,
      inBandKills: ownKills, violentAdultDeaths: this.violentAdultDeaths, adultDeaths: this.adultDeaths,
      blowRepeat: repeat, blowRepeatUnanswered: telemetrySnapshot.blow_repeat_unanswered ?? 0,
      warPairs: [...this.warDays.values()], fireBy: this.fireBy, adoptionDays: this.adoptionDays,
      adoptionNotReached: this.adoptionNotReached,
      malnutrition: this.malnutritionSamples ? this.malnutritionSum / this.malnutritionSamples : 0,
      proteinNutrition, totalNutrition,
    };
  }
}

const isAdult = (p: Person) => p.age / p.daysPerYear >= ADULT_YEARS;
const median = (xs: number[]) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]! : null;
const ratio = (n: number, d: number) => d ? (n / d).toFixed(3) : 'n/a';
export function formatHistory(rows: HistoryReport[]): string {
  const allDrawdowns = rows.flatMap(r => r.drawdowns);
  const allRecoveries = rows.flatMap(r => r.recoveries);
  const recovered = allRecoveries.filter(e => e.recoveredAt !== null);
  const wars = rows.flatMap(r => r.warPairs);
  const episodes: number[] = [], durations: number[] = [];
  let peaceDays = 0, warSpan = 0;
  const totalDays = rows.reduce((n, r) => n + r.days, 0);
  for (const pair of wars) {
    const ds = [...new Set(pair.days)].sort((a, b) => a - b);
    if (!ds.length) continue;
    let first = ds[0]!, previous = ds[0]!;
    for (const day of ds.slice(1)) {
      if (day - previous <= 5) { /* fewer than five quiet days keeps this one episode */ }
      else { episodes.push(1); durations.push(previous - first + 1); first = day; }
      previous = day;
    }
    episodes.push(1); durations.push(previous - first + 1);
    const span = Math.max(1, totalDays - ds[0]! + 1);
    warSpan += span;
    peaceDays += Math.max(0, span - ds.length);
  }
  const sum = (f: (r: HistoryReport) => number) => rows.reduce((n, r) => n + f(r), 0);
  const lost = (kind: string) => rows.reduce((n, r) => n + (r.bandLost[kind] ?? 0), 0);
  const fire = rows.map(r => r.fireBy).filter((x): x is number => x !== null);
  const adoption = rows.flatMap(r => r.adoptionDays);
  const nutrition = sum(r => r.totalNutrition);
  return '  HISTORY drawdown p50/p90/max ' + [0.5, 0.9, 1].map(q => {
    const s = [...allDrawdowns].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * q))]!.toFixed(3) : 'n/a';
  }).join('/') + ' · recovered ' + recovered.length + '/' + allRecoveries.length + ' (median days ' +
    String(median(recovered.map(e => e.recoveredAt! - e.started)) ?? 'n/a') + '; censored ' + (allRecoveries.length - recovered.length) + ')' +
    ' · band lost violence/need/other/absorbed ' + ['violence', 'need', 'other', 'absorbed'].map(lost).join('/') +
    ' · world lost ' + sum(r => Number(r.worldLost)) + '/' + rows.length + ' · self-destroyed ' + sum(r => r.selfDestroyed) +
    ' · in-band kills/1,000 person-years ' + ratio(sum(r => r.inBandKills) * 1000, sum(r => r.populationYears)) +
    ' · violent adult deaths ' + ratio(sum(r => r.violentAdultDeaths), sum(r => r.adultDeaths)) +
    ' · answered ' + ratio(sum(r => r.blowRepeat - r.blowRepeatUnanswered), sum(r => r.blowRepeat)) +
    ' · war episodes/year ' + ratio(episodes.length * 365, totalDays) + ' median days ' + String(median(durations) ?? 'n/a') +
    ' peace share ' + ratio(peaceDays, warSpan) + ' · firemaking first known day ' + (fire.length ? Math.min(...fire) : 'never') +
    ' · adoption median days ' + String(median(adoption) ?? 'n/a') + ' not reached ' + sum(r => r.adoptionNotReached) +
    ' · malnutrition ' + ratio(sum(r => r.malnutrition), rows.length) +
    ' · protein nutrition share ' + ratio(sum(r => r.proteinNutrition), nutrition);
}
