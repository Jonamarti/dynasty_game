/**
 * CLI: who hits whom, and why.
 *
 *   npm run violence -- --scenario century --seed 3
 *
 * Every blow and theft in a run, split by whether it stayed inside a band,
 * whether the victim was a child or kin, and which of `Brain`'s routes to
 * `attack` chose it — plus where opinion ended up inside and between bands.
 * Written for the owner's note that tribes fell on their own children: the
 * health report counts blows *between* peoples and says nothing about blows
 * inside one, which is where that failure lived.
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { SCENARIOS } from './simcheck.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const scenario = SCENARIOS[arg('scenario', 'century')];
if (!scenario) throw new Error('unknown scenario');
const steps = Number(arg('steps', String(scenario.steps)));
const seedArg = process.argv.indexOf('--seed');
const config = seedArg >= 0
  ? { ...scenario.config, seed: Number(process.argv[seedArg + 1]) }
  : scenario.config;

telemetry.reset();
telemetry.enable();
const sim = new Simulation(config);
// --tail N: push every Nth founder into the far tail of greed and aggression,
// to see what the one-in-a-hundred actually do once they exist.
const tailEvery = Number(arg('tail', '0'));
if (tailEvery > 0) {
  sim.people.forEach((p, i) => {
    if (i % tailEvery === 0) { p.traits.greed = 0.97; p.traits.aggression = 0.97; }
  });
}

type Row = { total: number; ownBand: number; child: number; kin: number; ownChild: number };
const rows = new Map<string, Row>();
const row = (k: string): Row => {
  let r = rows.get(k);
  if (!r) rows.set(k, r = { total: 0, ownBand: 0, child: 0, kin: 0, ownChild: 0 });
  return r;
};
const samples: string[] = [];
const emit = sim.social.emit.bind(sim.social);
sim.social.emit = ((...args: Parameters<typeof emit>) => {
  const [type, actor, target] = args;
  if (target && ['assault', 'murder', 'theft', 'threaten'].includes(type)) {
    const r = row(type);
    r.total++;
    const same = actor.bandId === target.bandId;
    if (same) r.ownBand++;
    if (target.isChild) r.child++;
    if (same && target.isChild) r.ownChild++;
    if (sim.relationships.kinship(actor.id, target.id) !== 0) r.kin++;
    if (actor.isChild) row(type + '_byChild').total++;
    if (type === 'assault' && target.isChild && samples.length < 12) {
      const rel = sim.relationships.peek(actor.id, target.id);
      samples.push(actor.name + (actor.isChild ? '(child)' : '') + ' b' + actor.bandId + ' -> ' + target.name +
        ' age ' + (target.age / target.daysPerYear).toFixed(1) + 'y b' + target.bandId +
        ' | ' + JSON.stringify(rel) + ' | their deeds: ' +
        target.chronicle.filter(c => c.kind === 'did').map(c => c.deed?.type ?? c.text).join(',') +
        ' | attacker remembers: ' + actor.memory.all().filter(m => m.actorId === target.id).map(m => m.type + (m.firsthand ? '' : '(told)')).join(','));
    }
  }
  return emit(...args);
}) as typeof emit;

for (let i = 0; i < steps; i++) sim.step();

console.log(scenario.name + ' seed ' + (config.seed ?? 'default') + ', ' + steps + ' steps');
console.log('deed       total  ownBand  child  ownChild  kin');
for (const [k, r] of rows) {
  console.log(k.padEnd(10) + String(r.total).padStart(6) + String(r.ownBand).padStart(9) +
    String(r.child).padStart(7) + String(r.ownChild).padStart(10) + String(r.kin).padStart(5));
}
console.log(samples.join('\n'));
const counts = telemetry.snapshot();
console.log('');
for (const key of Object.keys(counts).sort()) {
  if (/^attack_|^death_|^steal_|^caught_|^defend_|^correct|^abandoned_corrected|^harm_/.test(key)) console.log(key.padEnd(34) + counts[key]);
}

const alive = sim.people.filter(p => p.alive);
let inN = 0, inSum = 0, inHostile = 0, outN = 0, outSum = 0, outHostile = 0;
for (const a of alive) for (const b of alive) {
  if (a === b) continue;
  const o = sim.relationships.opinion(a.id, b.id);
  if (a.bandId === b.bandId) { inN++; inSum += o; if (o < -20) inHostile++; }
  else { outN++; outSum += o; if (o < -20) outHostile++; }
}
console.log('');
console.log('opinion inside bands:  mean ' + (inSum / Math.max(1, inN)).toFixed(1) + ', ' + inHostile + '/' + inN + ' below -20');
console.log('opinion between bands: mean ' + (outSum / Math.max(1, outN)).toFixed(1) + ', ' + outHostile + '/' + outN + ' below -20');
const agg = sim.people.map(p => p.traits.aggression).sort((a, b) => a - b);
console.log('aggression over everyone who lived: median ' + agg[agg.length >> 1]!.toFixed(2) +
  ', share above 0.5: ' + (agg.filter(a => a > 0.5).length / agg.length * 100).toFixed(0) + '%');
for (const trait of ['greed', 'aggression'] as const) {
  const tail = sim.people.filter(p => p.traits[trait] > 0.9);
  console.log(trait + ' past 0.9: ' + tail.length + ' of ' + sim.people.length + ' who lived' +
    (tail.length ? ' (e.g. ' + tail.slice(0, 5).map(p => p.traits[trait].toFixed(2) + (p.alive ? '' : '†')).join(' ') + ')' : ''));
}
