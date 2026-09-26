/**
 * CLI: follow one person and print why they did what they did.
 *
 *   npm run why
 *   npm run why -- band 3 1500 1560
 *   npm run why -- century 0 2780 2840 1
 *
 * The single most useful question in a simulation like this is "why did she do
 * that?", and the honest answer is the utility score table. This dumps it tick
 * by tick alongside the person's needs, so a behaviour that looks insane from
 * the outside can be traced to the number that caused it.
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { lastDrives, lastScores } from '../src/sim/ai/Brain.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { SCENARIOS } from './simcheck.ts';

// `vite-node` consumes long options after the package script's `--` and
// forwards their values positionally (the same behavior handled in
// `tools/seeds.ts`). Keep named arguments for direct execution, and accept the
// positional form for the npm script: scenario, person index, from, to,
// optional seed, optional person id (the id takes precedence over the index).
const positional = process.argv.slice(2).filter(value => value !== '--');

function arg(name: string, fallback: string, position: number): string {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : (positional[position] ?? fallback);
}

const scenario = SCENARIOS[arg('scenario', 'band', 0)];
if (!scenario) throw new Error('unknown scenario');

const personIndex = Number(arg('person', '0', 1));
const from = Number(arg('from', '0', 2));
const to = Number(arg('to', String(from + 60), 3));

telemetry.reset();
telemetry.enable();

// --seed N runs the scenario on another seed, and --id picks by person id
// rather than by founding index — so a case `npm run violence -- --cases`
// names can be followed straight into its score table.
const seed = arg('seed', '', 4);
const sim = new Simulation(seed !== ''
  ? { ...scenario.config, seed: Number(seed) }
  : scenario.config);
const id = arg('id', '', 5);
const subject = id !== ''
  ? sim.people.find(p => p.id === Number(id))
  : sim.people[personIndex];
if (!subject) throw new Error('no such person');

console.log('Following ' + subject.name + ' (id ' + subject.id + ') from step ' + from + ' to ' + to);
console.log('');
console.log(
  ['step', 'action', 'hung', 'thir', 'tire', 'hp', 'inv', 'tgt', 'drives', 'scores'].join('\t')
);

for (let step = 1; step <= to; step++) {
  sim.step();
  if (step < from || !subject.alive) continue;

  // A committed person does not re-score, so the table below is whatever they
  // last decided — not what they would decide now. Saying so out loud saves a
  // great deal of confusion: a woodcutter dying of thirst shows `drink` far
  // down the list because the list is from before they picked up the axe.
  const committed = subject.actionTimer > 0 ? '[committed] ' : '';
  const scores = committed + (lastScores.get(subject.id) ?? [])
    .map(s => s.id + ':' + s.score.toFixed(2))
    .join(' ');
  const drives = Object.entries(lastDrives.get(subject.id) ?? {})
    .map(([name, pressure]) => name + ':' + pressure.toFixed(2)).join(' ');
  const target =
    subject.targetX === null ? '-' :
    Math.round(subject.targetX) + ',' + Math.round(subject.targetY ?? 0) +
      ' d' + subject.distanceTo({ x: subject.targetX, y: subject.targetY ?? 0 }).toFixed(1);

  console.log(
    [
      step,
      subject.action,
      subject.needs.hunger.toFixed(0),
      subject.needs.thirst.toFixed(0),
      subject.needs.fatigue.toFixed(0),
      subject.health.toFixed(0),
      subject.inventory.total,
      target,
      drives,
      scores,
    ].join('\t')
  );
}

if (!subject.alive) console.log('\n' + subject.name + ' died of ' + subject.causeOfDeath);
