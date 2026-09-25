import type { Simulation } from '../src/sim/core/Simulation.ts';
import { ADULT_YEARS, type Person } from '../src/sim/entities/Person.ts';

export const NIGHT_NEAR = 15;

export interface Cohesion {
  nightSamples: number; nightNearHome: number; nightFar25: number; nightFar45: number;
  nightSleeping: number; nightResting: number; nightActions: Record<string, number>;
  dayDistances: number[]; childDistances: number[]; childFar12: number; childFar30: number; childSamples: number;
}

/** Read-only cohort observer. Baseline anchor is deliberately the band's camp, before Anchor.ts exists. */
export class CohesionWatch {
  private readonly data: Cohesion = { nightSamples: 0, nightNearHome: 0, nightFar25: 0, nightFar45: 0,
    nightSleeping: 0, nightResting: 0, nightActions: {}, dayDistances: [], childDistances: [],
    childFar12: 0, childFar30: 0, childSamples: 0 };
  constructor(private readonly sim: Simulation) {}
  observe(sim = this.sim): void {
    for (const p of sim.livingPeople()) {
      const band = sim.bands.find(b => b.id === p.bandId);
      if (!band || band.outcast) continue;
      const d = Math.hypot(p.x - band.homeX, p.y - band.homeY);
      if (sim.time.isNight) {
        if (p.age >= ADULT_YEARS * p.daysPerYear) {
          this.data.nightSamples++; if (d < NIGHT_NEAR) this.data.nightNearHome++;
          if (d > 25) this.data.nightFar25++; if (d > 45) this.data.nightFar45++;
          if (p.action === 'sleep') this.data.nightSleeping++;
          if (p.action === 'rest') this.data.nightResting++;
          this.data.nightActions[p.action] = (this.data.nightActions[p.action] ?? 0) + 1;
        }
      } else this.data.dayDistances.push(d);
      if (!p.isChild || p.years >= 10) continue;
      const parents = [p.motherId, p.fatherId].map(id => id === null ? undefined : sim.peopleById.get(id))
        .filter(q => q?.alive) as Person[];
      if (!parents.length) continue;
      const pd = Math.min(...parents.map(q => Math.hypot(q.x - p.x, q.y - p.y)));
      this.data.childSamples++; this.data.childDistances.push(pd);
      if (pd > 12) this.data.childFar12++; if (pd > 30) this.data.childFar30++;
    }
  }
  finish(): Cohesion { return this.data; }
}

const quantile = (xs: number[], q: number): number | null => {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))]!;
};
export function formatCohesion(rows: Cohesion[]): string {
  const sum = (k: keyof Cohesion) => rows.reduce((n, r) => n + (typeof r[k] === 'number' ? r[k] as number : 0), 0);
  const ratio = (n: number, d: number) => d ? (n / d).toFixed(3) : 'n/a';
  const day = rows.flatMap(r => r.dayDistances), kids = rows.flatMap(r => r.childDistances);
  const actions: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.nightActions)) actions[k] = (actions[k] ?? 0) + v;
  const top = Object.entries(actions).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, v]) => k + ':' + ratio(v, sum('nightSamples'))).join(',');
  const fmt = (x: number | null) => x === null ? 'n/a' : x.toFixed(1);
  return '  HOME night near<15 ' + ratio(sum('nightNearHome'), sum('nightSamples')) + ' far>25 ' +
    ratio(sum('nightFar25'), sum('nightSamples')) + ' far>45 ' + ratio(sum('nightFar45'), sum('nightSamples')) +
    ' sleep ' + ratio(sum('nightSleeping'), sum('nightSamples')) + ' rest ' + ratio(sum('nightResting'), sum('nightSamples')) +
    ' · actions ' + (top || 'n/a') + ' · day distance median/p90/max ' + fmt(quantile(day, .5)) + '/' +
    fmt(quantile(day, .9)) + '/' + fmt(day.length ? day.reduce((m, d) => Math.max(m, d), -Infinity) : null) + ' · child-parent median/p90 ' +
    fmt(quantile(kids, .5)) + '/' + fmt(quantile(kids, .9)) + ' far>12 ' + ratio(sum('childFar12'), sum('childSamples')) +
    ' far>30 ' + ratio(sum('childFar30'), sum('childSamples'));
}
