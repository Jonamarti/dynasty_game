/**
 * Detailed production observations, not fitted compact-model coefficients.
 * node node_modules/vite-node/dist/cli.mjs tools/compact-food-cohort.ts -- farmers,salters alpha,beta,gamma 40 artifacts/production.json
 * Positional arguments avoid PowerShell/vite-node dropping forwarded flags.
 */
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import { SCENARIOS } from './simcheck.ts';
import { observeFoodProduction } from './foodProductionCohort.ts';
import type { CompactFoodRateWatchRecord } from '../src/sim/compact/CompactFoodRateWatch.ts';

const args = process.argv.slice(2).filter(arg => arg !== '--');
const scenarios = (args[0] ?? 'farmers,salters').split(',');
const seeds = (args[1] ?? 'alpha,beta,gamma').split(',');
const days = Number(args[2] ?? 40);
const output = args[3] ?? 'artifacts/m15-production-cohort.json';
if (!Number.isSafeInteger(days) || days < 1 || seeds.some(seed => seed.length === 0)) {
  throw new RangeError('expected scenario-list seed-list positive-days output.json');
}
for (const name of scenarios) if (!SCENARIOS[name]) throw new Error('unknown scenario: ' + name);
const records: CompactFoodRateWatchRecord[] = [];
const completed: { scenario: string; seed: string }[] = [];
const report = {
  recordType: 'DetailedFoodProductionCohort', version: 1,
  interpretation: 'observed productive work; excludes travel/search; no fitted rates or economy comparison',
  complete: false, scenarios, seeds, daysPerSeed: days, completed, records,
};
for (const name of scenarios) for (const seed of seeds) {
  const scenario = SCENARIOS[name]!;
  const config = { ...makeConfig(scenario.config), seed };
  const sim = scenario.create?.(config) ?? new Simulation(config);
  scenario.setup?.(sim);
  if (!sim.player) sim.headlessFocusBand ??= sim.livingPeople()[0]?.bandId ?? null;
  const started = Date.now();
  records.push(...observeFoodProduction(sim, name, days));
  completed.push({ scenario: name, seed });
  report.complete = completed.length === scenarios.length * seeds.length;
  // Checkpoint results after every completed seed; an interrupted run remains
  // visibly partial through records.length, rather than losing every long run.
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(`${name}/${seed}: ${days} days, ${sim.livingPeople().length} alive, ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
console.log('wrote ' + output);
