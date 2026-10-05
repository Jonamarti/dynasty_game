/**
 * Paired 600-step food-news control for M15 phase 27.
 *
 * The ordinary cohort's seed pool is retained, but only seeds with the same
 * nearest-shoal setup available in both source trees are admitted. The final
 * fixture is deliberately applied to both arms so this measures survival
 * under one controlled opportunity, not differences in fixture selection.
 *
 * Run from the repository root with:
 *   npm.cmd exec -- vite-node artifacts/verification/m15-phase27-20261005/paired-food-news.ts
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const baselineRoot = new URL('./baseline/', import.meta.url);
const finalRoot = new URL('./final/', import.meta.url);
const baselinePath = (path: string) => fileURLToPath(new URL(path, baselineRoot));
const finalPath = (path: string) => fileURLToPath(new URL(path, finalRoot));

const [{ Simulation: BaselineSimulation }, { Simulation: FinalSimulation }, { setupFoodNews },
  { SCENARIOS }] = await Promise.all([
  import(baselinePath('src/sim/core/Simulation.ts')),
  import(finalPath('src/sim/core/Simulation.ts')),
  import(finalPath('tools/checkFixtures.ts')),
  import(finalPath('tools/simcheck.ts')),
]);

const scenario = (SCENARIOS as Record<string, any>)['food-news'];
if (!scenario) throw new Error('final simcheck has no food-news scenario');
const pool = ['century', 'alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta', 'eta', 'theta', 'iota',
  'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau'];
const steps = 600;
const target = 20;
const rows: Record<string, unknown>[] = [];
const excluded: Record<string, unknown>[] = [];
const pairedSeeds: string[] = [];
let standardIndex = 0;
let fallbackIndex = 0;
const outputPath = new URL('paired-food-news.jsonl', import.meta.url);
const excludedPath = new URL('paired-food-news-exclusions.json', import.meta.url);
const selectionPath = new URL('paired-food-news-seed-selection.json', import.meta.url);
// A rerun after the corrected final snapshot must not silently append to a
// partial first run or mix cohort versions.
writeFileSync(outputPath, '');
writeFileSync(excludedPath, '');
writeFileSync(selectionPath, '');

function saveSelection(): void {
  const report = {
    scenario: 'food-news', steps, standardPool: pool, pairedSeeds, excluded,
    fixture: 'final/tools/checkFixtures.setupFoodNews applied to both baseline and final simulations',
  };
  writeFileSync(selectionPath, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(excludedPath, JSON.stringify({ scenario: 'food-news', steps, pairedSeeds, excluded }, null, 2) + '\n');
}

function prepare(Simulation: new (config: any) => any, seed: string): any {
  const sim = new Simulation({ ...scenario.config, seed });
  setupFoodNews(sim);
  return sim;
}

function run(sim: any, seed: string, arm: 'baseline' | 'final'): Record<string, unknown> {
  let peak = sim.livingPeople().length;
  for (let tick = 0; tick < steps; tick++) {
    sim.step();
    peak = Math.max(peak, sim.livingPeople().length);
  }
  const end = sim.livingPeople().length;
  return { scenario: 'food-news', seed, steps, peak, end, survival: peak === 0 ? 0 : end / peak * 100, arm };
}

while (rows.filter(row => row.arm === 'baseline').length < target) {
  const seed = standardIndex < pool.length ? pool[standardIndex++] : `food-news-${++fallbackIndex}`;
  let baseline: any = null;
  let final: any = null;
  let baselineError: string | null = null;
  let finalError: string | null = null;
  try { baseline = prepare(BaselineSimulation, seed); }
  catch (error) { baselineError = error instanceof Error ? error.message : String(error); }
  try { final = prepare(FinalSimulation, seed); }
  catch (error) { finalError = error instanceof Error ? error.message : String(error); }

  if (baselineError || finalError) {
    excluded.push({ seed, baseline: baselineError ?? 'valid', final: finalError ?? 'valid' });
    saveSelection();
    console.log(JSON.stringify({ excluded: seed, baseline: baselineError, final: finalError }));
    continue;
  }

  pairedSeeds.push(seed);
  const pair = [run(baseline, seed, 'baseline'), run(final, seed, 'final')];
  rows.push(...pair);
  appendFileSync(outputPath, pair.map(row => JSON.stringify(row)).join('\n') + '\n');
  saveSelection();
  console.log(JSON.stringify({ paired: seed, count: rows.length / 2 }));
}

saveSelection();
console.log(JSON.stringify({ completed: rows.length / 2, excluded: excluded.length }));
