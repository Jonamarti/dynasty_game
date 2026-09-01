/**
 * CLI: follow one person and print why they did what they did.
 *
 *   npm run why
 *   npm run why -- --scenario band --person 3 --from 1500 --to 1560
 *
 * The single most useful question in a simulation like this is "why did she do
 * that?", and the honest answer is the utility score table. This dumps it tick
 * by tick alongside the person's needs, so a behaviour that looks insane from
 * the outside can be traced to the number that caused it.
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { lastScores } from '../src/sim/ai/Brain.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { SCENARIOS } from './simcheck.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const scenario = SCENARIOS[arg('scenario', 'band')];
if (!scenario) throw new Error('unknown scenario');

const personIndex = Number(arg('person', '0'));
const from = Number(arg('from', '0'));
const to = Number(arg('to', String(from + 60)));

telemetry.reset();
telemetry.enable();

const sim = new Simulation(scenario.config);
const subject = sim.people[personIndex];
if (!subject) throw new Error('no person at index ' + personIndex);

console.log('Following ' + subject.name + ' (id ' + subject.id + ') from step ' + from + ' to ' + to);
console.log('');
console.log(
  ['step', 'action', 'hung', 'thir', 'tire', 'hp', 'inv', 'tgt', 'scores'].join('\t')
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
      scores,
    ].join('\t')
  );
}

if (!subject.alive) console.log('\n' + subject.name + ' died of ' + subject.causeOfDeath);
