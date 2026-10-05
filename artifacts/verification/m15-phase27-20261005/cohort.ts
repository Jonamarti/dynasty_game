import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const baseline = process.argv.includes('--baseline');
const root = process.cwd().replaceAll('\\', '/') + '/artifacts/verification/m15-phase27-20261005/' + (baseline ? 'baseline/' : 'final/');
const { Simulation } = await import(root + 'src/sim/core/Simulation.ts');
const { SCENARIOS } = await import(root + 'tools/simcheck.ts');
const pool = ['century', 'alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau'];
const worker = Number(process.argv.find(a => a.startsWith('--worker='))?.split('=')[1] ?? 0);
const workers = Number(process.argv.find(a => a.startsWith('--workers='))?.split('=')[1] ?? 1);
const arm = baseline ? 'baseline' : 'final';
const previous = new URL(`./${arm}-cohort.jsonl`, import.meta.url);
const done = new Set(existsSync(previous) ? readFileSync(previous, 'utf8').trim().split('\n').filter(Boolean).map(line => {
  const r = JSON.parse(line); return r.scenario + ':' + r.seed;
}) : []);
const output = new URL(`./${arm}-cohort-worker${worker}.jsonl`, import.meta.url);
let caseIndex = 0;
for (const scenario of Object.values(SCENARIOS) as any[]) {
  // The paired cost gate covers the 28 pre-existing matrix scenarios. The new
  // shallows mechanism fixture has no pre-change counterpart.
  if (scenario.slow || scenario.name === 'shallows') continue;
  if (scenario.name === 'food-news') { caseIndex += pool.length; continue; }
  for (const seed of pool) {
    const assigned = caseIndex++ % workers === worker;
    if (!assigned || done.has(scenario.name + ':' + seed)) continue;
    const sim = new Simulation({ ...scenario.config, seed });
    scenario.setup?.(sim);
    let peak = sim.people.length;
    for (let i = 0; i < scenario.steps; i++) {
      sim.step();
      peak = Math.max(peak, sim.people.length);
    }
    const row = { scenario: scenario.name, seed, steps: scenario.steps, peak, end: sim.people.length, survival: sim.people.length / peak * 100 };
    appendFileSync(output, JSON.stringify(row) + '\n');
    console.log(JSON.stringify(row));
  }
}
