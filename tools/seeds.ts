/**
 * The same scenario across many seeds, for questions one run cannot answer.
 *
 * `sim:check` runs one world and asks thirty-odd yes/no questions about it.
 * That catches anything structural, and it is the right first tool. What it
 * cannot catch is a change that makes the world *worse on average*, because a
 * single long run is chaotic: two runs of different code produce wildly
 * different islands, and `population-persists` sits near enough its threshold
 * that it flips on changes that had nothing to do with food.
 *
 * This exists because of a real miss. People were starving to death beside
 * storage pits holding fourteen hundred items — `take` was gated behind
 * "carrying no food at all", and in winter everybody always holds a berry or
 * two, so stored food went in and never came out. Every one of the named checks
 * passed. Across ten seeds the difference was unmissable: mean survival over two
 * in-game years went from 40% to 59% when the gate was fixed, and the two seeds
 * that had collapsed outright stopped collapsing.
 *
 * Worth knowing before adding a check instead: the obvious ones do not work
 * here. Withdrawals as a share of deposits is *higher* in the broken world
 * (48-53%) than the fixed one (38%), and the starvation counts overlap. The
 * signal is in the mean across seeds, which is what this measures.
 *
 *   npm run sim:seeds
 *   npm run sim:seeds -- --scenario harsh-winter --seeds 20
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { SCENARIOS, thousands } from './simcheck.ts';

interface SeedResult {
  seed: string;
  peak: number;
  end: number;
  born: number;
  starvedInfants: number;
  starvedChildren: number;
  starvedAdults: number;
}

/** Ages at or below this are wholly dependent: they are fed or they die. */
const INFANT_YEARS = 5;

function runSeed(scenarioName: string, seed: string, steps: number): SeedResult {
  const scenario = SCENARIOS[scenarioName];
  if (!scenario) throw new Error('unknown scenario: ' + scenarioName);

  const sim = new Simulation({ ...scenario.config, seed });
  let peak = 0;
  let born = 0;
  const startingIds = new Set(sim.people.map(p => p.id));

  for (let i = 0; i < steps; i++) {
    sim.step();
    peak = Math.max(peak, sim.livingPeople().length);
  }

  let starvedInfants = 0;
  let starvedChildren = 0;
  let starvedAdults = 0;
  // `peopleById` keeps the dead; the live array does not. Grudges outlive
  // people, and so do the records this reads.
  for (const person of sim.peopleById.values()) {
    if (!startingIds.has(person.id)) born++;
    if (person.alive || person.causeOfDeath !== 'starvation') continue;
    if (person.years <= INFANT_YEARS) starvedInfants++;
    else if (person.isChild) starvedChildren++;
    else starvedAdults++;
  }

  return {
    seed,
    peak,
    end: sim.livingPeople().length,
    born,
    starvedInfants,
    starvedChildren,
    starvedAdults,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf('--' + name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const scenarioName = flag('scenario') ?? 'century';
  const count = Number(flag('seeds') ?? 10);
  const scenario = SCENARIOS[scenarioName];
  if (!scenario) {
    console.error('unknown scenario "' + scenarioName + '"');
    console.error('available: ' + Object.keys(SCENARIOS).join(', '));
    process.exit(1);
    return;
  }
  const steps = Number(flag('steps') ?? scenario.steps);

  // Named rather than numbered: adjacent numeric seeds are the case the RNG is
  // most likely to correlate on, and these are the seeds the docs quote.
  const pool = [
    'century', 'alpha', 'beta', 'gamma', 'delta',
    'eps', 'zeta', 'eta', 'theta', 'iota',
    'kappa', 'lambda', 'mu', 'nu', 'xi',
    'omicron', 'pi', 'rho', 'sigma', 'tau',
  ];
  const seeds = Array.from({ length: count }, (_, i) => pool[i % pool.length] + (i >= pool.length ? String(i) : ''));

  console.log('');
  console.log('SEED COHORT  -  scenario "' + scenarioName + '", ' + seeds.length +
    ' seeds, ' + thousands(steps) + ' steps each');
  console.log('='.repeat(78));
  console.log('  seed      peak   end    survived   born   starved: infant child adult');

  const results: SeedResult[] = [];
  const started = Date.now();
  for (const seed of seeds) {
    const r = runSeed(scenarioName, seed, steps);
    results.push(r);
    const pct = r.peak === 0 ? 0 : Math.round((r.end / r.peak) * 100);
    console.log(
      '  ' + r.seed.padEnd(10) +
      String(r.peak).padStart(4) + String(r.end).padStart(6) +
      (pct + '%').padStart(11) + String(r.born).padStart(7) +
      String(r.starvedInfants).padStart(17) +
      String(r.starvedChildren).padStart(7) + String(r.starvedAdults).padStart(6)
    );
  }

  const sum = (pick: (r: SeedResult) => number) => results.reduce((n, r) => n + pick(r), 0);
  const totalPeak = sum(r => r.peak);
  const totalEnd = sum(r => r.end);
  const collapsed = results.filter(r => r.peak > 0 && r.end / r.peak < 0.25).length;

  console.log('='.repeat(78));
  console.log(
    '  MEAN SURVIVAL ' + ((totalEnd / Math.max(1, totalPeak)) * 100).toFixed(1) + '%' +
    '   ·  ' + collapsed + '/' + results.length + ' collapsed below a quarter' +
    '   ·  ' + sum(r => r.born) + ' born'
  );
  console.log(
    '  starved: ' + sum(r => r.starvedInfants) + ' infants (' + INFANT_YEARS +
    ' or under), ' + sum(r => r.starvedChildren) + ' older children, ' +
    sum(r => r.starvedAdults) + ' adults'
  );
  console.log('  ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
  console.log('');
}

main();
