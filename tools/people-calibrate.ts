/**
 * CLI: measure, in the detailed model, what `PeopleSim`'s demography must reproduce
 * (M15 phase 32c, mechanism 2). Deterministic; cheap scenarios, a few seeds.
 *
 *   npx vite-node tools/people-calibrate.ts -- <variant,variant,...> <seed,seed,...> [out.json] [emit.ts]
 *
 * Variants: `lean`, `craft`, and `leankit` (= `lean` with its founders knowing the foraging kit,
 * plant_lore + cooking + firemaking), so that the food multiplier of a kit is *measured* in one world,
 * not assumed. Per variant and season it prints and stores, over adult person-days unless said:
 *
 * - rations per calendar day: sum over every person-day of (nominal nutrition eaten / that day's
 *   hunger drift) / calendar days. A "ration" is one person's daily need, so this is how many
 *   people's needs the comarca actually fed;
 * - mean population (person-days / calendar days);
 * - `s`, the adult ratio eaten/drift, the supply side of the capacity curve;
 * - `hungryZero`, the share of adult days that began hungry (need bin >= 1) and brought no relief
 *   (the quantity `CompactIntake` reads as band capacity), and `hungryShare`, the share of adult
 *   days that began hungry;
 * - starvation deaths and person-years, births and fertile woman-years.
 *
 * Not for `century`/`generations` (AGENTS.md: no heavy verification until M15 closes).
 */
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import { SCENARIOS } from './simcheck.ts';
import { RateWatch, ZERO_RELIEF, type PersonDay, type RateSeason } from '../src/sim/compact/CompactCalibration.ts';

const SEASONS: RateSeason[] = ['spring', 'summer', 'autumn', 'winter'];
const KIT = ['firemaking', 'plant_lore', 'cooking'];

const args = process.argv.slice(2).filter(a => a !== '--');
const variants = (args[0] ?? 'lean').split(',');
const seeds = (args[1] ?? 'alpha').split(',');
const out = args.find(a => a.endsWith('.json'));

interface SeasonAcc {
  days: number; rations: number; personDays: number;
  adultEaten: number; adultDrift: number; hungryDays: number; hungryZeroDays: number; adultDays: number;
}
const blank = (): Record<RateSeason, SeasonAcc> => Object.fromEntries(SEASONS.map(s => [s, {
  days: 0, rations: 0, personDays: 0, adultEaten: 0, adultDrift: 0, hungryDays: 0, hungryZeroDays: 0, adultDays: 0,
}])) as Record<RateSeason, SeasonAcc>;

function scenarioFor(variant: string) {
  if (variant === 'leankit') {
    const lean = SCENARIOS.lean!;
    return { ...lean, config: { ...lean.config, population: { ...lean.config.population, startingTech: KIT } } };
  }
  const sc = SCENARIOS[variant];
  if (!sc) { console.error('unknown variant ' + variant); process.exit(2); }
  return sc;
}

const result: Record<string, unknown> = {};
for (const variant of variants) {
  const scenario = scenarioFor(variant);
  const acc = blank();
  let starvation = 0, deaths = 0, personYears = 0, births = 0, womanYears = 0, initialPop = 0, finalPop = 0;
  for (const seed of seeds) {
    const config = { ...makeConfig(scenario.config), seed };
    const sim = scenario.create?.(config) ?? new Simulation(config);
    if (scenario.create) scenario.setup?.(sim);
    const watch = new RateWatch(sim);
    watch.observe();
    initialPop += sim.people.filter(p => p.alive).length;
    const tpd = sim.config.time.ticksPerDay;
    let season = sim.time.season as RateSeason;
    const t0 = Date.now();
    for (let i = 0; i < scenario.steps; i++) {
      sim.step(); watch.observe();
      if (sim.time.tick % tpd === 0) { acc[season].days++; season = sim.time.season as RateSeason; }
    }
    finalPop += sim.people.filter(p => p.alive).length;
    for (const d of watch.days as PersonDay[]) {
      const a = acc[d.season];
      a.personDays++;
      a.rations += d.eaten / d.hungerDrift;
      if (d.group === 'adult') {
        a.adultDays++; a.adultEaten += d.eaten; a.adultDrift += d.hungerDrift;
        if (d.hungerBin >= 1) { a.hungryDays++; if (d.hungerRatio < ZERO_RELIEF) a.hungryZeroDays++; }
      }
    }
    for (const row of watch.mortality) {
      personYears += row.personYears; deaths += row.deaths; starvation += row.causes.starvation ?? 0;
    }
    for (const s of SEASONS) { births += watch.births[s].births; womanYears += watch.births[s].womanYears; }
    console.log(`${variant} seed ${seed}: ${scenario.steps} steps, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  const f = (v: number, d = 3) => Number.isFinite(v) ? Number(v.toFixed(d)) : null;
  const seasons = Object.fromEntries(SEASONS.map(s => {
    const a = acc[s];
    return [s, {
      calendarDays: a.days,
      rationsPerDay: f(a.rations / a.days, 2), meanPopulation: f(a.personDays / a.days, 2),
      adultSupplyRatio: f(a.adultEaten / a.adultDrift, 3),
      hungryZero: f(a.hungryZeroDays / a.hungryDays), hungryShare: f(a.hungryDays / a.adultDays), hungryDays: a.hungryDays, adultDays: a.adultDays,
    }];
  }));
  result[variant] = {
    seeds, initialPopulation: initialPop / seeds.length, finalPopulation: finalPop / seeds.length, seasons,
    starvationDeaths: starvation, deaths, personYears: f(personYears, 1), births, womanYears: f(womanYears, 1),
    starvationPerPersonYear: f(starvation / personYears), birthsPerWomanYear: f(births / womanYears),
  };
  console.log(`\n${variant}: season  rations/day  meanPop  s      hungryZero  hungryShare  (hungry days)`);
  for (const s of SEASONS) {
    const r = (seasons as Record<string, Record<string, number | null>>)[s]!;
    console.log(`  ${s.padEnd(7)} ${String(r.rationsPerDay).padEnd(12)} ${String(r.meanPopulation).padEnd(8)} ${String(r.adultSupplyRatio).padEnd(6)} ${String(r.hungryZero).padEnd(11)} ${String(r.hungryShare).padEnd(12)} ${r.hungryDays}`);
  }
  const rec = result[variant] as Record<string, number>;
  console.log(`  starvation ${rec.starvationDeaths}/${rec.deaths} deaths in ${rec.personYears} person-years = ${rec.starvationPerPersonYear}/yr; births ${rec.births} / ${rec.womanYears} woman-years = ${rec.birthsPerWomanYear}`);
}
if (out) { writeFileSync(out, JSON.stringify({ variants, seeds, result }, null, 1)); console.log('wrote ' + out); }
