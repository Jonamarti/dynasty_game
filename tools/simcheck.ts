/**
 * Headless simulation harness (library).
 *
 * Runs the simulation with no renderer, samples it on a schedule, and prints a
 * world health report: population over time, an event histogram, the action
 * distribution, and a set of named checks that say whether the world behaves
 * the way the design intends.
 *
 * This is the fast feedback loop, and it is the difference between "it compiles
 * and renders" and "people actually eat". Reach for it before the browser.
 *
 * Side-effect free so tests and the CLIs can import it. The CLIs are
 * `tools/headless.ts` (one scenario) and `tools/scenarios.ts` (all of them).
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import type { DeepPartial, SimConfig } from '../src/sim/core/Config.ts';

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export interface Scenario {
  name: string;
  description: string;
  config: DeepPartial<SimConfig>;
  /** Simulation steps to run. One step is one step — no amplification. */
  steps: number;
}

export const SCENARIOS: Record<string, Scenario> = {
  tiny: {
    name: 'tiny',
    description: 'Small island, one band. Quick smoke run.',
    config: {
      seed: 'tiny',
      world: { width: 64, height: 64, berryBushes: 60, flintOutcrops: 20, deadwood: 40, gameAnimals: 12 },
      population: { bands: 1, peoplePerBand: 8 },
    },
    steps: 2000,
  },
  band: {
    name: 'band',
    description: 'The M1 default: two bands sharing an island.',
    config: { seed: 'band' },
    steps: 3000,
  },
  crowded: {
    name: 'crowded',
    description: 'Four bands, thin forage. Stresses competition for resources.',
    config: {
      seed: 'crowded',
      world: { berryBushes: 90, gameAnimals: 15 },
      population: { bands: 4, peoplePerBand: 18 },
    },
    steps: 3000,
  },
  century: {
    name: 'century',
    description:
      'Twenty in-game years at speed. The only scenario long enough to say ' +
      'anything about births, marriages, inheritance and whether a population ' +
      'can actually sustain itself across generations.',
    config: { seed: 'century' },
    steps: 40000,
  },
  'harsh-winter': {
    name: 'harsh-winter',
    description:
      'Six-day seasons, so a full winter passes inside the run, at a cold rate ' +
      'that killed every band outright before shelter existed. Passing it now ' +
      'means people noticed the cold, walked to a hut, and waited the night out.',
    config: {
      seed: 'winter',
      time: { daysPerSeason: 6 },
      needs: { coldRate: 0.16 },
    },
    steps: 4000,
  },
};

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

export interface Sample {
  tick: number;
  day: number;
  population: number;
  avgHunger: number;
  avgThirst: number;
  avgFatigue: number;
  avgCold: number;
  avgCompany: number;
  avgHealth: number;
  resources: number;
  foodInWorld: number;
  depletedNodes: number;
  stored: number;
  chiefs: number;
  era: string;
  techKnown: number;
  fireKeepers: number;
  outcasts: number;
  trees: number;
  matureTrees: number;
  seedlings: number;
  fruitOnTrees: number;
  children: number;
  elders: number;
  married: number;
  avgAge: number;
  households: number;
  outOfBounds: number;
  nonFinite: number;
  onUnwalkable: number;
}

export interface Check {
  id: string;
  ok: boolean;
  detail: string;
  /**
   * True when the scenario never created the conditions the check tests — a
   * summer run cannot say anything about shelter, and a single band cannot
   * say anything about how people treat strangers. Reporting that honestly
   * beats both a silent pass, which hides a broken check, and a failure, which
   * trains you to ignore red.
   */
  skipped?: boolean;
}

export interface Report {
  scenario: string;
  seed: string;
  stepsRequested: number;
  stepsSimulated: number;
  wallClockMs: number;
  stepsPerSecond: number;
  samples: Sample[];
  telemetry: Record<string, number>;
  actionTotals: Record<string, number>;
  relationships: { viewers: number; edges: number; positive: number; negative: number };
  buildings: { total: number; complete: number; stored: number };
  normsByBand: { band: string; theft: number; murder: number }[];
  biomes: Record<string, number>;
  spatial: { cells: number; items: number; maxBucket: number };
  checks: Check[];
}

/** 23529 -> "23,529", independent of the machine's locale. */
export function thousands(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function isBad(n: number): boolean {
  return !Number.isFinite(n);
}

function sample(sim: Simulation): Sample {
  const living = sim.livingPeople();
  let outOfBounds = 0;
  let nonFinite = 0;
  let onUnwalkable = 0;

  for (const person of living) {
    if (isBad(person.x) || isBad(person.y) || isBad(person.health)) nonFinite++;
    else if (
      person.x < 0 || person.y < 0 ||
      person.x > sim.world.width - 1 || person.y > sim.world.height - 1
    ) outOfBounds++;
    else if (!sim.world.isWalkable(person.x, person.y)) onUnwalkable++;
  }

  const stats = sim.stats();
  return {
    tick: stats.tick,
    day: stats.day,
    population: stats.population,
    avgHunger: stats.avgHunger,
    avgThirst: stats.avgThirst,
    avgFatigue: stats.avgFatigue,
    avgCold: stats.avgCold,
    avgCompany: stats.avgCompany,
    avgHealth: stats.avgHealth,
    resources: stats.resources,
    foodInWorld: stats.foodInWorld,
    depletedNodes: stats.depletedNodes,
    stored: stats.stored,
    chiefs: stats.chiefs,
    era: stats.era,
    techKnown: stats.techKnown,
    fireKeepers: stats.fireKeepers,
    outcasts: stats.outcasts,
    trees: stats.trees,
    matureTrees: stats.matureTrees,
    seedlings: stats.seedlings,
    fruitOnTrees: stats.fruitOnTrees,
    children: stats.children,
    elders: stats.elders,
    married: stats.married,
    avgAge: stats.avgAge,
    households: stats.households,
    outOfBounds,
    nonFinite,
    onUnwalkable,
  };
}

// ---------------------------------------------------------------------------
// Checks — each encodes an expectation from the design
// ---------------------------------------------------------------------------

function buildChecks(sim: Simulation, samples: Sample[], base: Omit<Report, 'checks'>): Check[] {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });
  const skip = (id: string, detail: string) => checks.push({ id, ok: true, detail, skipped: true });

  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const tel = base.telemetry;

  add(
    'no-nan',
    samples.every(s => s.nonFinite === 0),
    'worst sample had ' + Math.max(...samples.map(s => s.nonFinite)) + ' non-finite fields'
  );

  add(
    'people-in-bounds',
    samples.every(s => s.outOfBounds === 0),
    'worst sample had ' + Math.max(...samples.map(s => s.outOfBounds)) +
      ' people outside a ' + sim.world.width + 'x' + sim.world.height + ' world'
  );

  add(
    'people-on-land',
    samples.every(s => s.onUnwalkable === 0),
    'worst sample had ' + Math.max(...samples.map(s => s.onUnwalkable)) +
      ' people standing in water or on rock'
  );

  // Survival means different things over different spans.
  //
  // Over a season, losing a third of a band is a symptom and the check should
  // say so — the original version accepted a band of thirty dwindling to nine
  // and called it healthy. Over twenty years, though, *everyone* who started
  // will have died of old age, and demanding that two thirds of them still be
  // breathing is asking the wrong question entirely. A long run is healthy if
  // the line continues: people are still being born, and the population has not
  // been in freefall.
  const runYears = (last.day - first.day) / 80;
  if (runYears < 2) {
    add('people-survive',
      last.population >= Math.ceil(first.population * 0.67),
      last.population + '/' + first.population + ' alive at step ' + last.tick +
        ' (need ' + Math.ceil(first.population * 0.67) + ' over ' +
        (last.day - first.day) + ' days)');
  } else {
    const peak = Math.max(...samples.map(s => s.population));
    add('population-persists',
      last.population > 0 &&
      last.population >= Math.max(4, Math.ceil(peak * 0.35)) &&
      (tel.birth ?? 0) > 0,
      last.population + ' alive after ' + runYears.toFixed(0) + ' years ' +
        '(peaked at ' + peak + ', ' + (tel.birth ?? 0) + ' born); need ' +
        Math.max(4, Math.ceil(peak * 0.35)) + ' and at least one birth');
  }

  const deaths = Object.entries(tel)
    .filter(([k]) => k.startsWith('death_'))
    .map(([k, v]) => k.slice(6) + '=' + v);
  add(
    'deaths-explained',
    deaths.length === 0 || last.population > 0,
    deaths.length === 0 ? 'nobody died' : deaths.join(' ')
  );

  add(
    'people-drink',
    (tel.drink ?? 0) > 0,
    'drink=' + (tel.drink ?? 0)
  );

  const harvests =
    (tel.harvest_berries ?? 0) + (tel.harvest_game ?? 0) +
    (tel.harvest_wood ?? 0) + (tel.harvest_flint ?? 0);
  add(
    'people-harvest',
    harvests > 0,
    'berries=' + (tel.harvest_berries ?? 0) + ' game=' + (tel.harvest_game ?? 0) +
      ' wood=' + (tel.harvest_wood ?? 0) + ' flint=' + (tel.harvest_flint ?? 0)
  );

  add(
    'people-eat',
    (tel.eat ?? 0) > 0,
    'eat=' + (tel.eat ?? 0)
  );

  const actions = Object.keys(base.actionTotals);
  add(
    'ai-uses-many-actions',
    actions.length >= 4,
    actions.length + ' distinct actions observed: ' +
      Object.entries(base.actionTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => k + '=' + v)
        .join(' ')
  );

  add(
    'needs-not-pinned',
    last.avgHunger < 95 && last.avgThirst < 95 && last.avgCold < 95 && last.avgCompany < 95,
    'final avgHunger=' + last.avgHunger.toFixed(1) +
      ' avgThirst=' + last.avgThirst.toFixed(1) +
      ' avgCold=' + last.avgCold.toFixed(1) +
      ' avgCompany=' + last.avgCompany.toFixed(1)
  );

  // Health is the integral of everything going wrong. Needs can look fine on
  // average while a slow drain kills the band, which is exactly what a
  // mis-phased season did before this check existed.
  add(
    'health-holds-up',
    last.avgHealth > 60,
    'final avgHealth=' + last.avgHealth.toFixed(1) + ' (floor is 60)'
  );

  // The three checks below are the ones that say the core idea works. They are
  // worth more than every survival check put together: a world where people eat
  // and drink but never form an opinion of each other is not this game.

  const deeds = Object.entries(tel)
    .filter(([k]) => k.startsWith('event_'))
    .reduce((sum, [, v]) => sum + v, 0);
  if (deeds === 0) {
    // A handful of people spread thin across a big island may genuinely never
    // do anything to each other. That is a fact about the scenario, not a
    // broken witness system, and saying so beats a red light nobody trusts.
    skip('events-witnessed', 'nobody did anything to anybody in this run');
  } else {
    add('events-witnessed',
      (tel.witnessed ?? 0) > 0,
      'deeds=' + deeds + ' witnessed=' + (tel.witnessed ?? 0) +
        ' unwitnessed=' + (tel.unwitnessed ?? 0));
  }

  add(
    'people-talk',
    (tel.conversation ?? 0) > 0,
    'conversations=' + (tel.conversation ?? 0)
  );

  // A deed known to one person reaching someone who never saw it. This is the
  // whole rumor mechanism in a single number.
  // Below a handful of deeds the run genuinely cannot tell "gossip is broken"
  // from "nothing happened worth repeating" — with three deeds in a peaceable
  // world, everyone who would care was standing there and saw it themselves.
  if (deeds < 5 || (tel.conversation ?? 0) === 0) {
    skip('rumor-propagates',
      'too little to tell (' + deeds + ' deeds, ' + (tel.conversation ?? 0) +
      ' conversations)');
  } else {
    add('rumor-propagates',
      (tel.rumor_spread ?? 0) > 0,
      'stories passed on=' + (tel.rumor_spread ?? 0));
  }

  // Everyone liking everyone equally means norms and memory are doing no work.
  // The world should sort itself into friends and enemies on its own.
  const relationshipSummary =
    base.relationships.edges + ' relationships across ' + base.relationships.viewers +
    ' people: ' + base.relationships.positive + ' warm, ' +
    base.relationships.negative + ' hostile';
  if (sim.bands.length < 2) {
    // With one band everyone is kin and a stranger, which the out-group bias
    // exists to distinguish, never appears. Divergence would then require
    // somebody to misbehave, which a small quiet run may simply never do.
    skip('opinions-diverge', 'only one band; nothing to be a stranger to. ' + relationshipSummary);
  } else {
    add('opinions-diverge',
      base.relationships.positive > 0 && base.relationships.negative > 0,
      relationshipSummary);
  }

  // Construction is a long chain — notice a site, work out what it lacks, walk
  // to a reed bed, harvest, walk back, deliver, repeat, then work. A break
  // anywhere in it looks like nothing happening at all, so the check asserts
  // that materials actually arrive rather than only that huts appear.
  add(
    'materials-delivered',
    (tel.materials_delivered ?? 0) > 0,
    'delivered=' + (tel.materials_delivered ?? 0) +
      ' sites=' + base.buildings.total +
      ' finished=' + base.buildings.complete
  );

  // The winter payoff. Before buildings, cold at this rate emptied the map and
  // the scenario had to be tuned down to a rate nobody would notice. Passing
  // now means the whole chain works: gather reeds and clay, haul them, build
  // the hut, notice the cold, and go inside.
  const peakCold = Math.max(...samples.map(s => s.avgCold));
  if (peakCold < 15) {
    skip('shelter-answers-cold', 'never got cold (peak avgCold ' + peakCold.toFixed(1) + ')');
  } else {
    add('shelter-answers-cold',
      (tel.sheltering ?? 0) > 0 && last.avgCold < 80,
      'ticks spent sheltering=' + (tel.sheltering ?? 0) +
        ' final avgCold=' + last.avgCold.toFixed(1));
  }

  // Wild food used to be scenery: two hundred bushes regrowing at a flat rate
  // all year meant the island's total never moved, whatever anyone did to it.
  // Nothing was scarce, so nothing was worth storing, fighting over or moving
  // camp for. This asserts that people actually eat into the landscape.
  // A harvest that ends after one handful is both absurd to watch and useless
  // as an economy. If work never ends for a reason, it is ending for no reason.
  const workEnded = Object.entries(tel)
    .filter(([k]) => k.startsWith('work_ended_'))
    .map(([k, v]) => k.slice(11) + '=' + v);
  add(
    'work-runs-in-stretches',
    workEnded.length > 0,
    workEnded.length > 0 ? workEnded.join(' ') : 'no stretch of work ever ended'
  );

  add(
    'foraging-bites',
    Math.max(...samples.map(s => s.depletedNodes)) > 0,
    'most bushes stripped at once: ' + Math.max(...samples.map(s => s.depletedNodes)) +
      '; wild food went from ' + Math.round(first.foodInWorld) +
      ' to ' + Math.round(last.foodInWorld)
  );

  // Generations. A run long enough to contain them must contain them: a world
  // where nobody marries and nobody is born is a diorama, not a dynasty game.
  const years = Math.floor((last.day - first.day) / 80);
  if (years < 2) {
    skip('generations-turn-over',
      'run covers only ' + (last.day - first.day) + ' days; too short to say');
  } else {
    add('generations-turn-over',
      (tel.marriage ?? 0) > 0 && (tel.birth ?? 0) > 0,
      'over ' + years + ' years: ' + (tel.courtship ?? 0) + ' courtships, ' +
        (tel.marriage ?? 0) + ' marriages, ' + (tel.conception ?? 0) + ' conceptions, ' +
        (tel.birth ?? 0) + ' births, ' + (tel.succession ?? 0) + ' successions');
  }

  // The wood is the one resource in this game that keeps time in years. These
  // two checks are what stop it becoming scenery again: trees must actually be
  // useful (felled and picked), and the stand must not silently vanish or
  // silently explode over a long run.
  const fellings = tel.tree_felled ?? 0;
  const picked = Object.entries(tel)
    .filter(([k]) => k.startsWith('picked_'))
    .reduce((sum, [, v]) => sum + v, 0);
  add(
    'forest-is-used',
    fellings > 0 || picked > 0,
    fellings + ' trees felled, ' + (tel.wood_cut ?? 0) + ' timber cut, ' +
      picked + ' fruit picked'
  );

  add(
    'forest-persists',
    last.trees > 0 && last.trees < 12000,
    'stand went from ' + first.trees + ' to ' + last.trees +
      ' (' + last.matureTrees + ' grown, ' + last.seedlings + ' seedlings); ' +
      (tel.tree_seeded ?? 0) + ' seeded, ' + (tel.tree_died_old ?? 0) + ' died of age'
  );

  // A band that cannot choose a leader or decide to build is a colour on a
  // sprite, not a society. These say the band is acting as a body.
  add(
    'bands-have-chiefs',
    last.chiefs > 0 || last.population === 0,
    last.chiefs + ' chiefs for ' + last.population + ' people; ' +
      (tel.chief_chosen ?? 0) + ' changes of leadership'
  );

  const planned = Object.entries(tel)
    .filter(([k]) => k.startsWith('band_planned_'))
    .reduce((sum, [, v]) => sum + v, 0);
  if ((last.day - first.day) < 30) {
    skip('bands-decide-to-build', 'run too short for a band to plan anything');
  } else {
    add('bands-decide-to-build',
      planned > 0,
      planned + ' sites marked out by bands themselves (player placed none)');
  }

  // Knowledge is the M4 spine. These say it is alive rather than declared:
  // things get worked out, they get handed on, and the world can be described
  // by what its people collectively know.
  const discovered = Object.entries(tel)
    .filter(([k]) => k.startsWith('discovered_'))
    .map(([k, v]) => k.slice(11) + '=' + v);
  const taught = Object.entries(tel)
    .filter(([k]) => k.startsWith('taught_'))
    .reduce((sum, [, v]) => sum + v, 0);
  const observed = Object.entries(tel)
    .filter(([k]) => k.startsWith('observed_'))
    .reduce((sum, [, v]) => sum + v, 0);

  if ((last.day - first.day) < 30) {
    skip('knowledge-is-found', 'run too short for anyone to work anything out');
    skip('knowledge-is-passed-on', 'run too short to teach anything');
  } else {
    add('knowledge-is-found',
      discovered.length > 0,
      discovered.length > 0 ? discovered.join(' ') : 'nobody worked anything out');

    // The one that matters. Discovery without transmission is a dead end: the
    // thing dies with whoever found it and the world never changes.
    add('knowledge-is-passed-on',
      taught + observed > 0,
      taught + ' taught deliberately, ' + observed + ' picked up by watching; ' +
        (tel.teaching_failed ?? 0) + ' lessons that did not take');
  }

  add(
    'population-bounded',
    Math.max(...samples.map(s => s.population)) < 5000,
    'peak population ' + Math.max(...samples.map(s => s.population))
  );

  // The spatial hash exists precisely so that this never degenerates back into
  // a linear scan. A bucket holding most of the population means the cell size
  // is wrong for the clustering, and query cost has quietly gone quadratic.
  add(
    'spatial-hash-spreads',
    base.spatial.items === 0 || base.spatial.maxBucket <= Math.max(8, base.spatial.items * 0.5),
    'largest bucket holds ' + base.spatial.maxBucket + ' of ' + base.spatial.items +
      ' items across ' + base.spatial.cells + ' cells'
  );

  add(
    'world-has-land',
    (base.biomes.grass ?? 0) + (base.biomes.forest ?? 0) > sim.world.width * sim.world.height * 0.08,
    'grass=' + (base.biomes.grass ?? 0) + ' forest=' + (base.biomes.forest ?? 0) +
      ' water=' + (base.biomes.water ?? 0)
  );

  add(
    'perf-budget',
    base.stepsPerSecond > 2000,
    thousands(base.stepsPerSecond) + ' steps/s with ' + first.population + ' people (floor is 2,000)'
  );

  return checks;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function runScenario(scenario: Scenario, stepsOverride?: number): Report {
  telemetry.reset();
  telemetry.enable();

  const steps = stepsOverride ?? scenario.steps;
  const sim = new Simulation(scenario.config);

  const samples: Sample[] = [sample(sim)];
  const sampleEvery = Math.max(1, Math.floor(steps / 10));

  // Accumulated across the whole run, not just sampled: a behaviour that shows
  // up only briefly still counts as the AI having used it.
  const actionTotals: Record<string, number> = {};

  const started = Date.now();
  for (let i = 1; i <= steps; i++) {
    sim.step();
    // Every step, not every sample: a behaviour that only ever runs for a few
    // ticks at a time is still the AI using it, and sparse sampling misses it.
    for (const person of sim.livingPeople()) {
      actionTotals[person.action] = (actionTotals[person.action] ?? 0) + 1;
    }
    if (i % sampleEvery === 0 || i === steps) samples.push(sample(sim));
  }
  const wallClockMs = Math.max(1, Date.now() - started);

  const base: Omit<Report, 'checks'> = {
    scenario: scenario.name,
    seed: String(scenario.config.seed ?? 'default'),
    stepsRequested: steps,
    stepsSimulated: sim.time.tick,
    wallClockMs,
    stepsPerSecond: Math.round((sim.time.tick / wallClockMs) * 1000),
    samples,
    telemetry: telemetry.snapshot(),
    actionTotals,
    biomes: sim.world.countBiomes(),
    spatial: sim.peopleHash.stats(),
    relationships: sim.relationships.stats(),
    buildings: {
      total: sim.buildings.length,
      complete: sim.buildings.filter(b => b.complete).length,
      stored: sim.buildings.reduce((sum, b) => sum + b.store.total, 0),
    },
    normsByBand: sim.bands.map(b => ({
      band: b.name,
      theft: b.norms.theft,
      murder: b.norms.murder,
    })),
  };

  telemetry.disable();
  return { ...base, checks: buildChecks(sim, samples, base) };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatReport(r: Report): string {
  const lines: string[] = [];
  const pad = (s: string, n: number) => s.padEnd(n);

  lines.push('');
  lines.push('WORLD HEALTH REPORT  -  scenario "' + r.scenario + '"  seed "' + r.seed + '"');
  lines.push('='.repeat(78));
  lines.push(
    r.stepsSimulated + ' steps in ' + r.wallClockMs + 'ms  (' +
    thousands(r.stepsPerSecond) + ' steps/s)'
  );
  lines.push('');

  lines.push('POPULATION OVER TIME');
  lines.push(
    '  ' + pad('step', 8) + pad('day', 6) + pad('alive', 7) +
    pad('hunger', 8) + pad('thirst', 8) + pad('tired', 8) + pad('cold', 7) + pad('lonely', 8) +
    pad('health', 8) + pad('food', 7) + pad('bare', 6) + pad('store', 7) + pad('trees', 7) + pad('grown', 7) + pad('fruit', 7) + pad('kids', 6) + pad('wed', 5) + pad('age', 6) + pad('oob', 5)
  );
  for (const s of r.samples) {
    lines.push(
      '  ' + pad(String(s.tick), 8) + pad(String(s.day), 6) + pad(String(s.population), 7) +
      pad(s.avgHunger.toFixed(1), 8) + pad(s.avgThirst.toFixed(1), 8) +
      pad(s.avgFatigue.toFixed(1), 8) + pad(s.avgCold.toFixed(1), 7) +
      pad(s.avgCompany.toFixed(1), 8) +
      pad(s.avgHealth.toFixed(1), 8) +
      pad(String(Math.round(s.foodInWorld)), 7) + pad(String(s.depletedNodes), 6) +
      pad(String(s.stored), 7) + pad(String(s.trees), 7) + pad(String(s.matureTrees), 7) +
      pad(String(s.fruitOnTrees), 7) + pad(String(s.children), 6) + pad(String(s.married), 5) +
      pad(s.avgAge.toFixed(0), 6) + pad(String(s.outOfBounds + s.onUnwalkable), 5)
    );
  }
  lines.push('');

  lines.push('EVENTS');
  const events = Object.entries(r.telemetry).sort((a, b) => b[1] - a[1]);
  if (events.length === 0) lines.push('  (none recorded)');
  for (const [k, v] of events) lines.push('  ' + pad(k, 24) + v);
  lines.push('');

  lines.push('ACTIONS (summed over samples)');
  const actions = Object.entries(r.actionTotals).sort((a, b) => b[1] - a[1]);
  if (actions.length === 0) lines.push('  (none recorded)');
  for (const [k, v] of actions) lines.push('  ' + pad(k, 24) + v);
  lines.push('');

  lines.push('KNOWLEDGE');
  lines.push('  era: ' + (r.samples[r.samples.length - 1]?.era ?? '?') +
    '  ·  ' + (r.samples[r.samples.length - 1]?.techKnown ?? 0) + ' things known to somebody' +
    '  ·  ' + (r.samples[r.samples.length - 1]?.fireKeepers ?? 0) + ' can make fire');
  if ((r.telemetry.era_advanced ?? 0) > 0 || (r.telemetry.era_lost ?? 0) > 0) {
    lines.push('  ' + (r.telemetry.era_advanced ?? 0) + ' advances, ' +
      (r.telemetry.era_lost ?? 0) + ' relapses');
  }
  lines.push('');

  lines.push('BANDS');
  lines.push('  ' + (r.samples[r.samples.length - 1]?.chiefs ?? 0) + ' chiefs  ·  ' +
    (r.samples[r.samples.length - 1]?.outcasts ?? 0) + ' outcast  ·  ' +
    (r.telemetry.exiled ?? 0) + ' exiled  ·  ' +
    (r.telemetry.order_obeyed ?? 0) + ' orders obeyed, ' +
    (r.telemetry.order_refused ?? 0) + ' refused');
  lines.push('');

  lines.push('BUILDINGS');
  lines.push(
    '  ' + r.buildings.complete + ' of ' + r.buildings.total +
    ' finished  ·  ' + r.buildings.stored + ' items in store'
  );
  lines.push('');

  lines.push('RELATIONSHIPS');
  lines.push(
    '  ' + r.relationships.edges + ' edges across ' + r.relationships.viewers +
    ' people  ·  ' + r.relationships.positive + ' warm  ·  ' +
    r.relationships.negative + ' hostile'
  );
  for (const n of r.normsByBand) {
    lines.push(
      '  ' + pad(n.band, 22) + 'theft tolerance ' + n.theft.toFixed(2) +
      '   murder ' + n.murder.toFixed(2)
    );
  }
  lines.push('');

  lines.push('TERRAIN');
  lines.push('  ' + Object.entries(r.biomes).map(([k, v]) => k + '=' + v).join('  '));
  lines.push('');

  lines.push('CHECKS');
  for (const c of r.checks) {
    const verdict = c.skipped ? 'n/a ' : c.ok ? 'PASS' : 'FAIL';
    lines.push('  ' + verdict + '  ' + pad(c.id, 24) + c.detail);
  }
  lines.push('');

  const failed = r.checks.filter(c => !c.ok);
  const skippedCount = r.checks.filter(c => c.skipped).length;
  lines.push('='.repeat(78));
  lines.push(
    failed.length === 0
      ? 'ALL ' + (r.checks.length - skippedCount) + ' APPLICABLE CHECKS PASSED' +
        (skippedCount > 0 ? '  (' + skippedCount + ' not applicable)' : '')
      : failed.length + '/' + r.checks.length + ' CHECKS FAILED: ' +
        failed.map(c => c.id).join(', ')
  );
  lines.push('');

  return lines.join('\n');
}
