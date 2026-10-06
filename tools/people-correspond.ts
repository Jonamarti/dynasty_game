/**
 * CLI: does `PeopleSim`'s demography correspond to the detailed model? M15 phase 32c, mechanism 2.
 *
 *   npx vite-node tools/people-correspond.ts -- <variant> <seed,seed,...> [out.json]
 *
 * Seeds must be ones the curve was NOT measured on (the curve used alpha,beta,gamma): use delta,eps,zeta.
 * Not the 20-seed cohort: that gate (`peoples-match-bands`) is deferred by the owner and is not claimed here.
 *
 * TOLERANCES, written before the first measurement and not moved afterwards (docs/m15_phase32c_peoples.md):
 *
 *  T1 capacity   For each season with at least 30 hungry adult days pooled over the seeds, the share of
 *                hungry days with no relief that the model *predicts* (region of the measured world, divided
 *                by the detailed mean population of that season) is within 0.15 of the one the detailed run
 *                *had*. At least 3 of the 4 seasons must pass.
 *  T2 population Mean final population of 20 PeopleSim streams started from the founders' cohorts is within
 *                35 % of the detailed mean over the seeds (a small closed comarca, 100 days or 2.5 years).
 *                Absolute figures and extinctions are printed beside it: a ratio alone is not fidelity.
 *  T3 starvation Starvation deaths per person-year of the model within a factor of 2 of the detailed one when
 *                the detailed one has at least 20 deaths to be measured with.
 *  T4 births     Births per fertile woman-year of the model within 0.20 of the detailed run's (its own
 *                interval at these sizes is about that wide).
 */
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import { SCENARIOS } from './simcheck.ts';
import { RateWatch, ZERO_RELIEF, type PersonDay, type RateSeason } from '../src/sim/compact/CompactCalibration.ts';
import { PeopleSim, closeUnderRequires, emptyCohorts, ageBandOfYears, populationOf, PEOPLE_SEASONS } from '../src/sim/world/PeopleSim.ts';
import { demography, type SeasonReport } from '../src/sim/world/PeopleDemography.ts';
import { capacityAt, measuredRegion } from '../src/sim/world/PeopleCapacity.ts';
import type { Tech } from '../src/sim/knowledge/Tech.ts';

const T1 = 0.15, T1_MIN_HUNGRY_DAYS = 30, T1_SEASONS_NEEDED = 3;
const T2 = 0.35, T3_FACTOR = 2, T3_MIN_DEATHS = 20, T4 = 0.2, STREAMS = 20;

const args = process.argv.slice(2).filter(a => a !== '--');
const variant = (args[0] ?? 'lean') as 'lean' | 'craft';
const seeds = (args[1] ?? 'delta').split(',');
const out = args.find(a => a.endsWith('.json'));
const scenario = SCENARIOS[variant]!;
const techs = closeUnderRequires((scenario.config.population?.startingTech ?? []) as Tech[]);

const acc = Object.fromEntries(PEOPLE_SEASONS.map(s => [s, { days: 0, personDays: 0, hungry: 0, zero: 0 }])) as Record<RateSeason, { days: number; personDays: number; hungry: number; zero: number }>;
let detailedFinal = 0, detailedInitial = 0, deaths = 0, starvation = 0, personYears = 0, births = 0, womanYears = 0;
const founders: ReturnType<typeof emptyCohorts>[] = [];
let steps = 0, dpy = 40;

for (const seed of seeds) {
  const config = { ...makeConfig(scenario.config), seed };
  const sim = scenario.create?.(config) ?? new Simulation(config);
  if (scenario.create) scenario.setup?.(sim);
  steps = scenario.steps; dpy = sim.people[0]?.daysPerYear ?? 40;
  const cohorts = emptyCohorts();
  for (const p of sim.people) if (p.alive) (p.sex === 'male' ? cohorts.male : cohorts.female)[ageBandOfYears(p.years)]!++;
  founders.push(cohorts);
  detailedInitial += sim.people.filter(p => p.alive).length;
  const watch = new RateWatch(sim); watch.observe();
  const tpd = sim.config.time.ticksPerDay;
  let season = sim.time.season as RateSeason;
  for (let i = 0; i < steps; i++) {
    sim.step(); watch.observe();
    if (sim.time.tick % tpd === 0) { acc[season].days++; season = sim.time.season as RateSeason; }
  }
  detailedFinal += sim.people.filter(p => p.alive).length;
  for (const d of watch.days as PersonDay[]) {
    const a = acc[d.season]; a.personDays++;
    if (d.group === 'adult' && d.hungerBin >= 1) { a.hungry++; if (d.hungerRatio < ZERO_RELIEF) a.zero++; }
  }
  for (const row of watch.mortality) { personYears += row.personYears; deaths += row.deaths; starvation += row.causes.starvation ?? 0; }
  for (const s of PEOPLE_SEASONS) { births += watch.births[s].births; womanYears += watch.births[s].womanYears; }
  console.log(`detailed ${variant} ${seed}: ${sim.people.filter(p => p.alive).length} alive of ${cohorts.male.reduce((a, b) => a + b, 0) + cohorts.female.reduce((a, b) => a + b, 0)}`);
}

const region = measuredRegion(variant);
const pass: Record<string, boolean> = {};

// T1
console.log('\nT1 capacity (predicted from the region and the detailed mean population; tolerance ' + T1 + ')');
let t1 = 0, t1Seasons = 0;
for (const s of PEOPLE_SEASONS) {
  const a = acc[s];
  const meanPop = a.personDays / a.days;
  const predicted = capacityAt(region.rationsPerComarcaDay[s] / meanPop).hungryZero;
  const had = a.hungry > 0 ? a.zero / a.hungry : NaN;
  const ok = a.hungry >= T1_MIN_HUNGRY_DAYS ? Math.abs(predicted - had) <= T1 : null;
  if (ok !== null) { t1Seasons++; if (ok) t1++; }
  console.log(`  ${s.padEnd(7)} meanPop ${meanPop.toFixed(1)}  predicted ${predicted.toFixed(3)}  detailed ${Number.isNaN(had) ? 'n/a' : had.toFixed(3)} (${a.hungry} hungry days)  ${ok === null ? 'too few days' : ok ? 'PASS' : 'FAIL'}`);
}
pass.T1 = t1Seasons >= T1_SEASONS_NEEDED && t1 >= T1_SEASONS_NEEDED;
console.log(`  T1 ${pass.T1 ? 'PASS' : 'FAIL'}: ${t1} of ${t1Seasons} measurable seasons within tolerance (need ${T1_SEASONS_NEEDED})`);

// T2-T4: PeopleSim started from each seed's founders, STREAMS streams each.
let modelFinal = 0, modelRuns = 0, extinct = 0, modelStarved = 0, modelPersonYears = 0, modelBirths = 0, modelFertile = 0;
const finals: number[] = [];
const trajectory = new Map<number, { sum: number; n: number }>();
for (let f = 0; f < founders.length; f++) {
  for (let k = 0; k < STREAMS; k++) {
    const reports: SeasonReport[] = [];
    const sim = new PeopleSim(`corr-${variant}-${seeds[f]}-${k}`, { ticksPerDay: 240, daysPerSeason: dpy / 4 },
      [demography({ regionOf: () => region }, r => reports.push(r))]);
    const people = sim.found({ cohorts: founders[f]!, comarcas: 1, techs });
    sim.advanceTo(steps);
    const pop = populationOf(people);
    finals.push(pop); modelFinal += pop; modelRuns++; if (pop === 0) extinct++;
    let prev = founders[f]!.male.reduce((a, b) => a + b, 0) + founders[f]!.female.reduce((a, b) => a + b, 0);
    for (const r of reports) {
      modelStarved += r.starved; modelBirths += r.births; modelFertile += r.fertileWomen / 4;
      modelPersonYears += (prev + r.population) / 2 / 4;
      { const t = trajectory.get(r.season) ?? { sum: 0, n: 0 }; t.sum += r.population; t.n++; trajectory.set(r.season, t); }
      prev = r.population;
    }
  }
}
const dMean = detailedFinal / seeds.length, mMean = modelFinal / modelRuns;
pass.T2 = Math.abs(mMean / dMean - 1) <= T2;
console.log(`\nT2 population (tolerance +-${T2 * 100} %): detailed final ${dMean.toFixed(1)} (from ${(detailedInitial / seeds.length).toFixed(1)}), model ${mMean.toFixed(1)} over ${modelRuns} runs, ratio ${(mMean / dMean).toFixed(2)}, extinct ${extinct}/${modelRuns}  ${pass.T2 ? 'PASS' : 'FAIL'}`);
console.log('  model mean population by season: ' + [...trajectory.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => (v.sum / v.n).toFixed(1)).join(' '));
const dStarve = starvation / personYears, mStarve = modelStarved / modelPersonYears;
if (starvation >= T3_MIN_DEATHS) {
  pass.T3 = mStarve <= dStarve * T3_FACTOR && mStarve >= dStarve / T3_FACTOR;
  console.log(`T3 starvation per person-year: detailed ${dStarve.toFixed(3)} (${starvation} deaths in ${personYears.toFixed(1)} py), model ${mStarve.toFixed(3)}  ${pass.T3 ? 'PASS' : 'FAIL'}`);
} else {
  console.log(`T3 starvation: detailed has only ${starvation} starvation deaths (${personYears.toFixed(1)} py), below ${T3_MIN_DEATHS}: not judged. Model ${mStarve.toFixed(3)}/yr, detailed ${dStarve.toFixed(3)}/yr`);
}
const dBirth = births / womanYears, mBirth = modelBirths / modelFertile;
pass.T4 = Math.abs(mBirth - dBirth) <= T4;
console.log(`T4 births per fertile woman-year: detailed ${dBirth.toFixed(3)} (${births} in ${womanYears.toFixed(1)}), model ${mBirth.toFixed(3)}  ${pass.T4 ? 'PASS' : 'FAIL'}`);
console.log(`\ndetailed deaths ${deaths}, of them starvation ${starvation}`);
if (out) writeFileSync(out, JSON.stringify({ variant, seeds, pass, dMean, mMean, finals, dStarve, mStarve, dBirth, mBirth, extinct }, null, 1));
