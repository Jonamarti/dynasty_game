import { Simulation } from '../src/sim/core/Simulation.ts';
import { CohesionWatch, formatCohesion } from './cohesion.ts';
import { SCENARIOS } from './simcheck.ts';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? fallback : args[i + 1] ?? fallback;
};
// vite-node consumes unknown long-option names and forwards their values as
// positional arguments through the package script's `--` delimiter.
const scenarioName = flag('scenario', args[0] ?? 'century');
const scenario = SCENARIOS[scenarioName];
if (!scenario) throw new Error('unknown scenario: ' + scenarioName);
const sim = new Simulation({ ...scenario.config, seed: flag('seed', args[2] ?? 'century') });
const steps = Number(flag('steps', args[1] ?? String(scenario.steps)));
const watch = new CohesionWatch(sim);
for (let i = 0; i < steps; i++) {
  sim.step();
  if (sim.time.tick % 40 === 0) watch.observe();
}
console.log(formatCohesion([watch.finish()]));
