import { appendFileSync, writeFileSync } from 'node:fs';
import { makeConfig } from '../src/sim/core/Config.ts';
import { Simulation } from '../src/sim/core/Simulation.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { ADULT_YEARS } from '../src/sim/entities/Person.ts';
import { SCENARIOS } from './simcheck.ts';

const SEEDS = [
  'century', 'alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta', 'eta', 'theta', 'iota',
  'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau',
];
const STEPS = 24_000;

type Row = { seed: string; peak: number; end: number; survival: number; adultStarvation: number;
  foodExplore: number; exploreStoppedHungry: number; emptyMemoryWalk: number;
  criticalHungerTicks: number; criticalHungerDamageEquivalent: number; };

const OUTPUT = 'artifacts/m15-hunger-search-cohort-20261016.jsonl';
writeFileSync(OUTPUT, '');

function run(seed: string, allowCriticalFoodSearch: boolean): Row {
  telemetry.reset();
  telemetry.enable();
  const config = makeConfig(SCENARIOS.lean!.config);
  config.seed = seed;
  const sim = new Simulation(config);
  if (!allowCriticalFoodSearch) {
    const actions = (sim as unknown as { actionSystem: { interruption: (...args: any[]) => string | null } }).actionSystem;
    const original = actions.interruption.bind(actions);
    actions.interruption = (person, ctx, opts = {}) => original(person, ctx,
      opts && typeof opts === 'object' ? { ...opts, ignoreHunger: false } : opts);
  }
  let peak = sim.livingPeople().length;
  let criticalHungerTicks = 0;
  for (let i = 0; i < STEPS; i++) {
    sim.step();
    peak = Math.max(peak, sim.livingPeople().length);
    for (const person of sim.peopleById.values()) {
      if (person.alive && person.needs.hunger >= config.needs.criticalThreshold) criticalHungerTicks++;
    }
  }
  const end = sim.livingPeople().length;
  let adultStarvation = 0;
  for (const person of sim.peopleById.values()) {
    if (!person.alive && person.causeOfDeath === 'starvation' && person.years >= ADULT_YEARS) adultStarvation++;
  }
  const counts = telemetry.snapshot();
  telemetry.disable();
  return { seed, peak, end, survival: peak === 0 ? 0 : end / peak * 100, adultStarvation,
    foodExplore: counts.food_exploration_offered ?? 0,
    exploreStoppedHungry: counts.explore_ended_hungry ?? 0,
    emptyMemoryWalk: counts.remembered_empty_walk ?? 0,
    criticalHungerTicks,
    criticalHungerDamageEquivalent: criticalHungerTicks * config.needs.criticalDamage };
}

const before: Row[] = [];
const after: Row[] = [];
for (const seed of SEEDS) {
  const baseline = run(seed, false);
  const treatment = run(seed, true);
  before.push(baseline);
  after.push(treatment);
  const pair = { before: baseline, after: treatment };
  appendFileSync(OUTPUT, JSON.stringify(pair) + '\n');
  console.log(JSON.stringify(pair));
}
const mean = (rows: Row[], key: keyof Row) => rows.reduce((sum, row) => sum + Number(row[key]), 0) / rows.length;
console.log(JSON.stringify({ summary: {
  seeds: SEEDS.length, steps: STEPS,
  beforeSurvival: mean(before, 'survival'), afterSurvival: mean(after, 'survival'),
  beforeAdultStarvation: mean(before, 'adultStarvation'), afterAdultStarvation: mean(after, 'adultStarvation'),
  beforeExploreStoppedHungry: mean(before, 'exploreStoppedHungry'), afterExploreStoppedHungry: mean(after, 'exploreStoppedHungry'),
  beforeEmptyMemoryWalk: mean(before, 'emptyMemoryWalk'), afterEmptyMemoryWalk: mean(after, 'emptyMemoryWalk'),
  beforeCriticalHungerTicks: mean(before, 'criticalHungerTicks'), afterCriticalHungerTicks: mean(after, 'criticalHungerTicks'),
  beforeCriticalHungerDamageEquivalent: mean(before, 'criticalHungerDamageEquivalent'), afterCriticalHungerDamageEquivalent: mean(after, 'criticalHungerDamageEquivalent'),
} }));
