/**
 * CLI: the DAY-BY-DAY trajectory of one detailed world, for the question the 32c correspondence left open: why does
 * `lean` collapse from ~37 to ~1 while `PeopleSim` settles near 11? M15 phase 32c, investigation.
 *
 *   npx vite-node tools/people-trajectory.ts -- <variant> <seed,seed,...> <out.json>
 *
 * Per calendar day and seed it stores: population at the day's close, rations fed (sum over complete person-days of
 * eaten / hunger drift), the share of person-time spent on `obtain_food`, hungry adult days and those with no relief,
 * starvation / other deaths and births that day, and the world's food stock (`foodInWorld`, `depletedNodes`).
 * It measures; it concludes nothing. The analysis lives in tools/people-trajectory-report.ts.
 */
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import { SCENARIOS } from './simcheck.ts';
import { RateWatch, ZERO_RELIEF, type PersonDay, type RateSeason } from '../src/sim/compact/CompactCalibration.ts';
import { isFoodKind } from '../src/sim/entities/ResourceNode.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
const variant = args[0] ?? 'lean';
const seeds = (args[1] ?? 'delta').split(',');
const out = args[2];
/** Optional founders override `bands=N`: the same world with fewer bands, to ask how the outcome depends on how many arrive. */
const bandsArg = args.find(a => a.startsWith('bands='));
const base = SCENARIOS[variant]!;
const scenario = bandsArg ? { ...base, config: { ...base.config, population: { ...base.config.population, bands: Number(bandsArg.slice(6)) } } } : base;

export interface DayRow {
  seed: string; day: number; season: RateSeason; pop: number; adults: number; rations: number; personDays: number;
  foraging: number; hungryAdult: number; hungryZero: number;
  starved: number; otherDeaths: number; births: number; food: number; depleted: number;
}
const rows: DayRow[] = [];

for (const seed of seeds) {
  const config = { ...makeConfig(scenario.config), seed };
  const sim = scenario.create?.(config) ?? new Simulation(config);
  if (scenario.create) scenario.setup?.(sim);
  const watch = new RateWatch(sim); watch.observe();
  const tpd = sim.config.time.ticksPerDay;
  let seen = 0, prevStarved = 0, prevDeaths = 0, prevBirths = 0, day = 0;
  let season = sim.time.season as RateSeason;
  for (let i = 0; i < scenario.steps; i++) {
    sim.step(); watch.observe();
    if (sim.time.tick % tpd !== 0) continue;
    day++;
    const today = (watch.days as PersonDay[]).slice(seen); seen = watch.days.length;
    let rations = 0, foraging = 0, ticks = 0, ha = 0, hz = 0, adults = 0;
    for (const d of today) {
      rations += d.eaten / d.hungerDrift; foraging += d.goals.obtain_food; ticks += d.ticks;
      if (d.group === 'adult') { adults++; if (d.hungerBin >= 1) { ha++; if (d.hungerRatio < ZERO_RELIEF) hz++; } }
    }
    let starved = 0, deaths = 0, births = 0;
    for (const m of watch.mortality) { deaths += m.deaths; starved += m.causes.starvation ?? 0; }
    for (const s of ['spring', 'summer', 'autumn', 'winter'] as RateSeason[]) births += watch.births[s].births;
    rows.push({
      seed, day, season, pop: sim.people.filter(p => p.alive).length, adults, rations, personDays: today.length,
      foraging: ticks > 0 ? foraging / ticks : 0, hungryAdult: ha, hungryZero: hz,
      starved: starved - prevStarved, otherDeaths: (deaths - prevDeaths) - (starved - prevStarved), births: births - prevBirths,
      food: sim.nodes.reduce((s, n) => s + (isFoodKind(n) ? n.amount : 0), 0), depleted: sim.nodes.filter(n => n.depleted).length,
    });
    prevStarved = starved; prevDeaths = deaths; prevBirths = births;
    season = sim.time.season as RateSeason;
  }
  void season;
  console.log(`${variant} ${seed}: final ${rows.filter(r => r.seed === seed).at(-1)?.pop}`);
}
if (out) writeFileSync(out, JSON.stringify({ variant, seeds, rows }));
