/**
 * CLI: measure, in the detailed model, what the compact level will have to
 * reproduce (M15 phase 32b). Deterministic; one scenario, a handful of seeds.
 *
 *   npx vite-node tools/compact-rates.ts -- <scenario> <seed,seed,...> [steps] [out.json]
 *
 * Positional on purpose: vite-node strips the names of unknown flags. Prints the
 * relief table (day-level need relief as a ratio of drift, conditioned on the
 * need at the start of the day), the time shares by agenda, births per fertile
 * woman-year and mortality by age, each with its sample size.
 *
 * Do not point this at `century`/`generations` cohorts: it is meant for the cheap
 * `lean` and `craft` scenarios and one to three seeds (AGENTS.md: no heavy
 * verification until M15 closes).
 */
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import { SCENARIOS } from './simcheck.ts';
import {
  RateWatch, buildRateTable, rateKey, AGE_BUCKETS, NEED_BINS, MIN_BIN_SAMPLES,
  type PersonDay, type RateSeason, type RateGroup, type MortalityRow,
} from '../src/sim/compact/CompactCalibration.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
// A comma list pools several scenarios into one table (`lean,craft`); an explicit step count applies to all.
const scenarioNames = (args[0] ?? 'lean').split(',');
const seeds = (args[1] ?? 'alpha').split(',');
const stepsArg = args[2] && /^\d+$/.test(args[2]) ? Number(args[2]) : null;
const out = args.find(a => a.endsWith('.json'));
const emit = args.find(a => a.endsWith('.ts'));
const scenarioName = scenarioNames.join('+');
const steps = stepsArg ?? 'default';

const days: PersonDay[] = [];
const mortality: MortalityRow[] = AGE_BUCKETS.map(() => ({ personYears: 0, deaths: 0, causes: {} }));
const births = { spring: { births: 0, womanYears: 0 }, summer: { births: 0, womanYears: 0 },
  autumn: { births: 0, womanYears: 0 }, winter: { births: 0, womanYears: 0 } } as Record<RateSeason, { births: number; womanYears: number }>;
let personTicks = 0;
for (const name of scenarioNames) {
  const scenario = SCENARIOS[name];
  if (!scenario) { console.error('unknown scenario ' + name); process.exit(2); }
  const n = stepsArg ?? scenario.steps;
  for (const seed of seeds) {
    const config = { ...makeConfig(scenario.config), seed };
    const sim = scenario.create?.(config) ?? new Simulation(config);
    if (scenario.create) scenario.setup?.(sim);
    const watch = new RateWatch(sim);
    watch.observe();
    const t0 = Date.now();
    for (let i = 0; i < n; i++) { sim.step(); watch.observe(); }
    days.push(...watch.days);
    watch.mortality.forEach((row, i) => {
      mortality[i]!.personYears += row.personYears; mortality[i]!.deaths += row.deaths;
      for (const [c, k] of Object.entries(row.causes)) mortality[i]!.causes[c] = (mortality[i]!.causes[c] ?? 0) + k;
    });
    for (const s of Object.keys(births) as RateSeason[]) {
      births[s].births += watch.births[s].births; births[s].womanYears += watch.births[s].womanYears;
    }
    personTicks += watch.days.reduce((k, d) => k + d.ticks, 0);
    console.log(`${name} seed ${seed}: ${n} steps, ${watch.days.length} person-days, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

const table = buildRateTable(days);
const seasons: RateSeason[] = ['spring', 'summer', 'autumn', 'winter'];
const groups: RateGroup[] = ['nursling', 'child', 'adult'];
const f = (v: number, d = 2) => v.toFixed(d);

console.log(`\nSCENARIO ${scenarioName}, seeds ${seeds.join(',')}, ${steps} steps, ${days.length} person-days (${personTicks} person-ticks)`);
for (const need of ['hunger', 'thirst'] as const) {
  console.log(`\nDAY RELIEF/DRIFT, ${need} (mean [p5 p50 p95] n; * = fewer than ${MIN_BIN_SAMPLES} samples)`);
  console.log('season  group     ' + Array.from({ length: NEED_BINS }, (_, b) => `bin${b} (${b * 25}-${b * 25 + 25})`.padEnd(30)).join(''));
  for (const s of seasons) for (const g of groups) {
    const cells = Array.from({ length: NEED_BINS }, (_, b) => {
      const e = table[rateKey(s, g, need, b)];
      return (e ? `${f(e.mean)} [${f(e.q[1]!)} ${f(e.q[10]!)} ${f(e.q[19]!)}] ${e.n}${e.n < MIN_BIN_SAMPLES ? '*' : ''}` : '-').padEnd(30);
    });
    console.log(s.padEnd(8) + g.padEnd(10) + cells.join(''));
  }
}

console.log('\nTIME SHARE BY AGENDA (share of person-ticks), by season and group');
for (const s of seasons) for (const g of groups) {
  const sel = days.filter(d => d.season === s && d.group === g);
  if (sel.length === 0) continue;
  const tot = sel.reduce((n, d) => n + d.ticks, 0);
  const share = (k: keyof PersonDay['goals']) => f(sel.reduce((n, d) => n + d.goals[k], 0) / tot, 3);
  const drink = f(sel.reduce((n, d) => n + d.drinkTicks, 0) / tot, 3);
  console.log(`${s.padEnd(8)}${g.padEnd(10)} n=${String(sel.length).padEnd(6)} food ${share('obtain_food')} build ${share('build')} care ${share('care')} travel ${share('travel')} idle ${share('idle')}  (drink ${drink})`);
}

console.log('\nNOMINAL NUTRITION EATEN vs HUNGER DRIFT (per person-day, adults)');
for (const s of seasons) {
  const sel = days.filter(d => d.season === s && d.group === 'adult');
  if (sel.length === 0) continue;
  const eaten = sel.reduce((n, d) => n + d.eaten, 0) / sel.length;
  const drift = sel.reduce((n, d) => n + d.hungerDrift, 0) / sel.length;
  console.log(`${s.padEnd(8)} eaten ${f(eaten, 1)} hunger-units/day, drift ${f(drift, 1)} (ratio ${f(eaten / drift)})`);
}

console.log('\nBIRTHS PER FERTILE WOMAN-YEAR (age 16-45), by season of birth');
let tb = 0, tw = 0;
for (const s of seasons) {
  const b = births[s]; tb += b.births; tw += b.womanYears;
  console.log(`${s.padEnd(8)} ${b.births} births / ${f(b.womanYears, 1)} woman-years = ${b.womanYears > 0 ? f(b.births / b.womanYears, 3) : 'n/a'}`);
}
console.log(`all      ${tb} births / ${f(tw, 1)} woman-years = ${tw > 0 ? f(tb / tw, 3) : 'n/a'}`);

console.log('\nMORTALITY BY AGE (deaths per person-year)');
for (let i = 0; i < AGE_BUCKETS.length; i++) {
  const m = mortality[i]!;
  const causes = Object.entries(m.causes).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => k + '=' + n).join(', ');
  console.log(`${AGE_BUCKETS[i]!.name.padEnd(6)} ${m.deaths} deaths / ${f(m.personYears, 1)} person-years = ${m.personYears > 0 ? f(m.deaths / m.personYears, 3) : 'n/a'}  ${causes}`);
}

if (out) {
  writeFileSync(out, JSON.stringify({ scenario: scenarioName, seeds, steps, personDays: days.length, table, mortality, births }, null, 1));
  console.log('\nwrote ' + out);
}

if (emit) {
  const header = `/**
 * GENERATED by tools/compact-rates.ts (M15 phase 32b) — do not edit by hand.
 * Scenarios ${scenarioNames.join(', ')}; seeds ${seeds.join(', ')}; ${days.length} person-days.
 * Regenerate with: npx vite-node tools/compact-rates.ts -- ${scenarioNames.join(',')} ${seeds.join(',')} ${emit}
 * Each entry is the distribution (21 quantiles, 0..100 % in steps of 5) of the day's relief
 * as a fraction of the day's drift, conditioned on the need at the start of the day.
 */
import type { RateTable } from './CompactCalibration.ts';

export const MEASURED_SOURCE = ${JSON.stringify({ scenarios: scenarioNames, seeds, personDays: days.length })} as const;

export const MEASURED_RATES: RateTable = ${JSON.stringify(table)};
`;
  writeFileSync(emit, header);
  console.log('wrote ' + emit);
}
