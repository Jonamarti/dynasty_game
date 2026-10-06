/**
 * CLI: feed `PeopleSim`'s demography the per-person food the DETAILED run actually had, season by season, and see
 * whether it then collapses as the detailed world did. 32c `lean` investigation: it separates "the model's
 * machinery (curve, starvation hazard, uniform cohorts, no cold) cannot collapse" from "the model was handed the wrong
 * supply". The supply ratio of season k is forced to s_k = rations fed / person-days in the detailed run's season k
 * (tools/people-trajectory.ts), by returning a region whose supply is s_k times the model's current population.
 *
 *   npx vite-node tools/people-replay.ts -- <traj.json> <variant> [scale=1]
 *
 * `scale` multiplies every s_k (a sensitivity probe, not a fit). Founders are the detailed run's, rebuilt without stepping.
 */
import { readFileSync } from 'node:fs';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import { SCENARIOS } from './simcheck.ts';
import { PeopleSim, emptyCohorts, ageBandOfYears, populationOf, PEOPLE_SEASONS } from '../src/sim/world/PeopleSim.ts';
import { demography, type SeasonReport } from '../src/sim/world/PeopleDemography.ts';
import type { DayRow } from './people-trajectory.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
const { rows, seeds } = JSON.parse(readFileSync(args[0]!, 'utf8')) as { rows: DayRow[]; seeds: string[] };
const variant = args[1] ?? 'lean';
const scale = Number(args.find(a => a.startsWith('scale='))?.slice(6) ?? 1);
const scenario = SCENARIOS[variant]!;
const STREAMS = 20;

for (const seed of seeds) {
  const r = rows.filter(x => x.seed === seed);
  const nSeasons = Math.ceil(r.length / 10);
  const s: number[] = [], detailedPop: number[] = [];
  for (let k = 0; k < nSeasons; k++) {
    const c = r.slice(k * 10, k * 10 + 10);
    const pd = c.reduce((a, x) => a + x.personDays, 0), rat = c.reduce((a, x) => a + x.rations, 0);
    s.push(pd > 0 ? scale * rat / pd : 1); detailedPop.push(c.at(-1)!.pop);
  }
  const config = { ...makeConfig(scenario.config), seed };
  const sim = scenario.create?.(config) ?? new Simulation(config);
  const cohorts = emptyCohorts();
  for (const p of sim.people) if (p.alive) (p.sex === 'male' ? cohorts.male : cohorts.female)[ageBandOfYears(p.years)]!++;
  const dpy = sim.people[0]?.daysPerYear ?? 40;
  const mean = new Array<number>(nSeasons).fill(0);
  let extinct = 0, final = 0, births = 0, fertile = 0;
  for (let k = 0; k < STREAMS; k++) {
    let season = 0;
    const reports: SeasonReport[] = [];
    const ps = new PeopleSim(`replay-${variant}-${seed}-${k}`, { ticksPerDay: 240, daysPerSeason: dpy / 4 },
      [demography({ regionOf: people => ({ rationsPerComarcaDay: Object.fromEntries(PEOPLE_SEASONS.map(n => [n, (s[Math.min(season, nSeasons - 1)] ?? 1) * Math.max(1, populationOf(people))])) as never }) },
        rep => { reports.push(rep); season++; })]);
    const people = ps.found({ cohorts: structuredClone(cohorts), comarcas: 1, techs: [] });
    ps.advanceTo(scenario.steps);
    reports.forEach((rep, i) => { if (i < nSeasons) { mean[i]! += rep.population / STREAMS; births += rep.births; fertile += rep.fertileWomen / 4; } });
    const pop = populationOf(people); final += pop / STREAMS; if (pop === 0) extinct++;
  }
  const f = (a: number[], d = 1) => a.map(x => x.toFixed(d)).join(' ');
  console.log(`\n${variant} ${seed} (scale ${scale}): founders ${populationOf({ cohorts } as never)}`);
  console.log('  detailed s per season :', f(s, 2));
  console.log('  detailed pop at close :', detailedPop.join(' '));
  console.log('  model pop (mean of 20):', f(mean));
  console.log(`  model births per fertile woman-year ${(births / Math.max(1e-9, fertile)).toFixed(3)} (detailed T4 was 0.982 pooled over the three seeds)`);
  console.log(`  model final mean ${final.toFixed(1)}, extinct ${extinct}/${STREAMS}; detailed final ${detailedPop.at(-1)}`);
}
