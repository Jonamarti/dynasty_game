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
import { TECH, type Tech } from '../src/sim/knowledge/Tech.ts';
import { JOB_IDS, JOBS, type JobId } from '../src/sim/entities/Job.ts';

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
      world: { width: 64, height: 64, berryBushes: 60, flintOutcrops: 20, deadwood: 40, gameHerds: 5 },
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
      world: { berryBushes: 90, gameHerds: 8 },
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
  craft: {
    name: 'craft',
    description:
      'A band that already knows how to knap and how to fire clay. The only ' +
      'run in the suite in which anything is made rather than gathered: ' +
      'knowledge takes years to work out from nothing, so without a scenario ' +
      'that starts with some, every check about crafted goods and about the ' +
      'designs they unlock would report n/a for ever — and a check that ' +
      'reports nothing is exactly how the granary stayed unbuildable. It ' +
      'carries the spear for the same reason: weapons sit behind hafting and ' +
      'are the only thing in the game made to be used *on* something, so ' +
      'without them here nothing would ever measure an armed blow or an armed ' +
      'hunt.',
    config: {
      seed: 'craft',
      population: {
        bands: 2, peoplePerBand: 12,
        startingTech: ['firemaking', 'hafting', 'pottery', 'spear'],
      },
    },
    steps: 8000,
  },
  scribes: {
    name: 'scribes',
    description:
      'A band that can already write. The only run in which anything is cut ' +
      'into stone or read off it: writing sits behind marking and ' +
      'stoneworking, which no run in the suite reaches from nothing, so ' +
      'without this every check about records would report n/a for ever.',
    config: {
      seed: 'scribes',
      population: {
        bands: 2, peoplePerBand: 12,
        startingTech: ['cordage', 'hafting', 'stoneworking', 'marking', 'writing'],
      },
    },
    // Long enough for somebody to work something *new* out, cut it, and for
    // somebody else to walk over and read it. A shorter run has every literate
    // adult holding the same five technologies, so there is nothing on any
    // stone that anybody lacks and the reading half never fires at all.
    steps: 14000,
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

/**
 * Things that can only be measured *while* the run happens.
 *
 * Displacement and flight are differences between two moments, and a report
 * assembled from the final state cannot see either — an animal that ran ten
 * tiles and came back looks identical to one that never moved.
 */
export interface WildlifeWatch {
  /** Mean tiles an animal covers per in-game day. */
  driftPerDay: number;
  /** Times an animal near a person was further away a few ticks later. */
  fledSuccessfully: number;
  /** Times it was not. Both must happen for flight to mean anything. */
  fledAndStayedClose: number;
  /** Peak fatigue seen on someone asleep, and where it ended up. */
  sleepStarts: number;
  sleepFatigueFalls: number;
}

/**
 * Whether *holding* a job changes what somebody spends their time on,
 * measured per job and against everyone who does not hold that job.
 *
 * Not "employed vs unemployed on any job's actions" — a first version tried
 * that and it was the wrong comparison. `forage` alone is most of everyone's
 * day, employed or not, because it is also how hunger gets answered, so
 * "any job's actions" is dominated by one verb every job-holder and every
 * idler alike spends most of their time on, and a crafter's narrow
 * `craft`/`prototype` slice looked biased *against* by comparison however
 * well the bias term worked. Comparing each job's own holders to everyone
 * else, action by action, controls for that: the question becomes "does a
 * forager forage more than a non-forager does", not "does anybody with a job
 * out-forage a forager".
 */
export interface JobWatch {
  /** Ticks spent by holders of each job, and how many landed on its own actions. */
  holderTicks: Record<JobId, number>;
  holderMatchTicks: Record<JobId, number>;
  /** Ticks spent by everyone *not* holding that job, and the same measure. */
  otherTicks: Record<JobId, number>;
  otherMatchTicks: Record<JobId, number>;
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
  wildlife: WildlifeWatch;
  jobs: JobWatch;
  checks: Check[];
}

/** 23529 -> "23,529", independent of the machine's locale. */
export function thousands(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** One decimal, or "n/a" for a mean with nothing in it. */
function fmt(n: number): string {
  return Number.isNaN(n) ? 'n/a' : n.toFixed(1);
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
    // Asked of the world rather than recomputed here. The hand-written version
    // used `> width - 1`, which is a tile stricter than `World.inBounds` — so
    // somebody standing at x=127.6 on a 128-wide map, on a walkable tile the
    // movement system had just approved, was reported as having escaped the
    // island. Two definitions of "in the world" is one too many.
    else if (!sim.world.inBounds(person.x, person.y)) outOfBounds++;
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

  // `weapons-are-made-and-used` was written here and **deliberately not kept**,
  // for the reason the comment beside `prototypes-can-fail` gives further down.
  //
  // A world check needs the world to produce a sample. Personal crafting does
  // not: a recipe is only ever scored when its ingredients are *already* in the
  // pack, because nothing sends anyone to fetch materials for something they
  // want for themselves — only for a building site. The whole `craft` scenario
  // yields one spear and two hand axes across twenty-four people and eight
  // thousand steps, so whether an armed blow lands in any given run is chance,
  // and a check on it is either flaky or permanently n/a. That gap is recorded
  // in `bugs.md`; it is older than weapons and is why the hand axe has always
  // been rare.
  //
  // The mechanism is asserted deterministically in `combat.test.ts` instead: an
  // armed blow beats a bare one, armour turns part of it, and reach decides who
  // lands first. The counters are still emitted — `armed_blow` and `armed_hunt`
  // read out in the events table — so anybody looking can see how often it
  // actually happens.

  add(
    'people-drink',
    (tel.drink ?? 0) > 0,
    'drink=' + (tel.drink ?? 0)
  );

  // How often somebody actually stops what they are doing and goes to the water.
  //
  // The owner reported people forever going to drink, and nothing in this report
  // could say whether that was true — `people-drink` only asks whether drinking
  // happens at all. `drink` counts ticks spent at the water's edge;
  // `drink_finished` counts trips that ran to the bottom of the thirst, which is
  // the one that answers "how often?".
  //
  // Bounded at both ends on purpose. Zero completed drinks means people are
  // being dragged off the water before they finish, which is its own defect; a
  // high figure is the reported complaint. The ceiling is deliberately generous
  // because thirst now answers to exertion and to summer, so a working
  // population in a hot year is *meant* to drink appreciably more than a
  // resting one in a cold one.
  // Mean population times the span, the same measure `ideas-are-conceived` uses
  // further down. Computed here rather than shared because that one is scoped to
  // the knowledge block and this check runs whether or not anybody had an idea.
  const personDays = Math.max(1,
    samples.reduce((total, sample) => total + sample.population, 0) /
      Math.max(1, samples.length) * Math.max(1, last.day - first.day));
  const drinksPerPersonDay = (tel.drink_finished ?? 0) / personDays;
  if ((last.day - first.day) < 10) {
    skip('drinking-is-paced', 'run too short to say anything about a daily rhythm');
  } else {
    add(
      'drinking-is-paced',
      drinksPerPersonDay > 0 && drinksPerPersonDay < 4,
      (tel.drink_finished ?? 0) + ' drinks finished over ' + Math.round(personDays) +
        ' person-days (' + drinksPerPersonDay.toFixed(2) +
        ' each per day; wanted some, and fewer than 4)'
    );
  }

  // The exemption the owner asked for, in as many words: picking berries is how
  // you stop being hungry, so being hungry must not stop you picking berries.
  // Counted as ticks of work that continued only because the job was answering
  // the need that would otherwise have ended it.
  if ((tel.harvest_berries ?? 0) + (tel.picked_apple ?? 0) === 0) {
    skip('food-work-continues', 'nobody gathered any food in this run');
  } else {
    const gatheredOn = (tel.pushed_on_hunger_forage ?? 0) +
      (tel.pushed_on_hunger_gather ?? 0) + (tel.pushed_on_hunger_pick ?? 0);
    add(
      'food-work-continues',
      gatheredOn > 0,
      gatheredOn + ' ticks of food-gathering continued through hunger that ' +
        'would otherwise have stopped it (' +
        (tel.pushed_on_hunger_hunt ?? 0) + ' hunting)'
    );
  }

  // `harvest_game` is gone: game is not a resource node any more, it is an
  // animal that runs away. Meat arrives through `harvest_meat` and the hunt.
  const harvests =
    (tel.harvest_berries ?? 0) + (tel.harvest_meat ?? 0) +
    (tel.harvest_wood ?? 0) + (tel.harvest_flint ?? 0);
  add(
    'people-harvest',
    harvests > 0,
    'berries=' + (tel.harvest_berries ?? 0) + ' meat=' + (tel.harvest_meat ?? 0) +
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

  // M6b phase 6: a job is a lean on the scorer, not a guarantee, so the
  // question is not whether anyone was assigned one but whether it changed
  // anything. Measured per job against everyone who does *not* hold it —
  // "does a forager forage more than a non-forager" — rather than against
  // people with no job at all: `forage` alone is most of everyone's day,
  // employed or not, since it is also how hunger gets answered, so a version
  // that compared employed-on-their-own-job against unemployed-on-any-job
  // failed by construction, dragged down by narrow jobs like `crafter`
  // whose actions are a small share of anyone's time.
  const totalHolderTicks = JOB_IDS.reduce((sum, id) => sum + base.jobs.holderTicks[id], 0);
  const totalOtherTicks = JOB_IDS.reduce((sum, id) => sum + base.jobs.otherTicks[id], 0);
  if (totalHolderTicks < 200 || totalOtherTicks < 200) {
    skip('jobs-bias-work',
      'too few ticks with a job assigned to compare (' + totalHolderTicks + ' held, ' +
      totalOtherTicks + ' not)');
  } else {
    const holderShare = JOB_IDS.reduce((sum, id) => sum + base.jobs.holderMatchTicks[id], 0) /
      totalHolderTicks;
    const otherShare = JOB_IDS.reduce((sum, id) => sum + base.jobs.otherMatchTicks[id], 0) /
      totalOtherTicks;
    add('jobs-bias-work',
      holderShare > otherShare,
      'holders spent ' + (holderShare * 100).toFixed(1) +
        "% of their time on their own job's work; everyone else spent " +
        (otherShare * 100).toFixed(1) + '% of theirs on that same work'
    );
  }

  // Only a run long enough for `considerRebellion` to have had many chances to
  // fire can say anything about it, which today is `century` alone — the same
  // reason `generations-turn-over` and `bands-decide-to-build` above are
  // gated on span rather than on the scenario's name.
  //
  // Zero is reported as **n/a, not a failure**, and that is a finding rather
  // than a shrug. Across fifteen seeds of this scenario, six of them — 40% —
  // saw no rebellion at all in a full two years, because `defiance` gates
  // every crossing of `REBELLION_THRESHOLD` behind its own roll and a band
  // only gets one attempt a day. That is exactly the shape `AGENTS.md`
  // documents for `prototypes-can-fail`, deleted for the same reason: a rare
  // stochastic event has too small a sample in any one run for a hard
  // pass/fail to mean anything, and the `century` seed's own count moved
  // between 0 and 2 across two unrelated tuning passes in this one while
  // nothing about `considerRebellion` changed. The mechanism itself is
  // asserted deterministically in `band.test.ts` instead — a band built with
  // one member primed to hate its chief, which does not depend on getting
  // lucky. What this check still catches is the ceiling: if rebellion ever
  // does fire, it must not be endemic.
  const rebellions = (tel.rebellion_refused ?? 0) + (tel.rebellion_left ?? 0) +
    (tel.rebellion_challenge_won ?? 0) + (tel.rebellion_challenge_lost ?? 0);
  if (years < 2) {
    skip('rebellion-is-rare-but-happens',
      'run covers only ' + (last.day - first.day) + ' days; too short for rebellion to ' +
      'be expected or ruled out');
  } else if (rebellions === 0) {
    skip('rebellion-is-rare-but-happens',
      'none fired in this run; a rare stochastic event, see band.test.ts for the ' +
      'deterministic assertion');
  } else {
    // "Rare" is bounded from above rather than pinned to a number: a band
    // considers rebellion once a day, so a run this long offers each band on
    // the order of a hundred and fifty chances, and a design that is meant to
    // be rare should use only a handful of them. The ceiling is generous on
    // purpose — `century` is the chaotic scenario `AGENTS.md` warns against
    // over-reading, and this check only needs to catch the gate having come
    // off entirely, not to pin down the exact rate.
    add('rebellion-is-rare-but-happens',
      rebellions < 40,
      rebellions + ' rebellions over ' + years + ' years (' +
        (tel.rebellion_refused ?? 0) + ' refused outright, ' +
        (tel.rebellion_left ?? 0) + ' left, ' +
        (tel.rebellion_challenge_won ?? 0) + ' challenges won, ' +
        (tel.rebellion_challenge_lost ?? 0) + ' lost)');
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

  // A year, not a month.
  //
  // Working a technology out from nothing is conceive, research, prototype,
  // test and prove, and every stage of that is measured in seasons. The gate
  // was thirty days and had never been tested, because until the `craft`
  // scenario landed there was nothing in the suite between twelve days and two
  // years: it was "century only" by accident. A thirty-three-day run reporting
  // "nobody worked anything out" is not a sick world, it is a month.
  if ((last.day - first.day) < 80) {
    skip('knowledge-is-found', 'run covers under a year; too short to work anything out');
  } else {
    add('knowledge-is-found',
      discovered.length > 0,
      discovered.length > 0 ? discovered.join(' ') : 'nobody worked anything out');
  }

  // Transmission keeps the shorter gate. Handing over something you already
  // know takes ninety ticks, not a season, so a month is ample — and this is
  // the check that matters most of the three: discovery without transmission is
  // a dead end, because the thing dies with whoever found it and the world
  // never changes.
  if ((last.day - first.day) < 30) {
    skip('knowledge-is-passed-on', 'run too short to teach anything');
  } else if (sim.knownTech.size === 0) {
    // Nothing existed to hand on. A short run in which nobody has yet worked
    // anything out cannot say whether transmission works.
    skip('knowledge-is-passed-on', 'nobody knew anything worth passing on');
    skip('children-are-taught', 'nobody knew anything worth passing on');
  } else {
    add('knowledge-is-passed-on',
      taught + observed > 0,
      taught + ' taught deliberately, ' + observed + ' picked up by watching; ' +
        (tel.teaching_failed ?? 0) + ' lessons that did not take');

    // The channel phase 4 opened. Children were excluded from knowledge
    // entirely before it: `KnowledgeSystem.daily` skipped them and `Brain`
    // filtered them out of the pupil list, so a parent could not pass anything
    // at all to their own child and every technology had to be re-derived from
    // nothing by each generation.
    const childLessons = tel.child_taught ?? 0;
    const fromKin = tel.child_taught_by_parent ?? 0;
    if (taught === 0) {
      skip('children-are-taught', 'nobody taught anybody anything in this run');
    } else {
      add('children-are-taught',
        childLessons > 0,
        childLessons + ' of ' + taught + ' lessons went to a child, ' +
          fromKin + ' of those from a parent');
    }
  }

  // --- The research lifecycle ----------------------------------------------
  // M6b phase 2 turned discovery from one roll into conceive, research,
  // prototype, test, refine. Every one of those stages is somewhere the chain
  // can silently stop dead, and a chain that stops at stage two looks, from the
  // outside, exactly like a world where nobody is curious.
  const sum = (prefix: string) => Object.entries(tel)
    .filter(([k]) => k.startsWith(prefix))
    .reduce((total, [, v]) => total + v, 0);

  const conceived = sum('conceived_');
  const proven = sum('proven_');
  const sparkRoutes = Object.keys(tel).filter(k => k.startsWith('spark_'));

  // Which technologies were ever thought of at all, and which of them were
  // anything more than a starting point.
  //
  // A root node is one with an empty `requires`: firemaking, cordage,
  // plant_lore and tracking, the four anybody can arrive at knowing nothing.
  // Everything else needs somebody to already hold something, which is the
  // whole of the tree and the only part that measures transmission.
  const conceivedTechs = Object.keys(tel)
    .filter(k => k.startsWith('conceived_'))
    .map(k => k.slice('conceived_'.length))
    .filter(id => id in TECH) as Tech[];
  const beyondRoots = conceivedTechs.filter(id => TECH[id].requires.length > 0);
  const breakthroughsAlone = tel.breakthrough_ponder ?? 0;
  const breakthroughsTogether = tel.breakthrough_discuss ?? 0;
  const prototypes = sum('prototyped_');
  const refined = sum('refined_');
  const adultDays = samples.reduce((total, sample) => total + sample.population, 0) /
    Math.max(1, samples.length) * Math.max(1, last.day - first.day);

  if ((last.day - first.day) < 30) {
    skip('ideas-are-conceived', 'run too short for anybody to have an idea');
    skip('sparks-are-various', 'run too short for more than one route to fire');
    skip('ideas-become-tech', 'run too short to carry an idea to a proven design');
    skip('the-tree-is-climbed', 'run too short to get past the root technologies');
    skip('research-is-social', 'run too short for anybody to argue anything out');
    skip('techs-are-refined', 'run too short to improve a design');
  }
  if ((last.day - first.day) >= 30) {
    // Both bounds matter. Zero means the synthesis table is unsatisfiable in
    // play; a flood means everybody has every idea and the web is decoration.
    const perPersonYear = conceived / Math.max(1, adultDays / 80);
    add('ideas-are-conceived',
      conceived > 0 && perPersonYear < 3,
      conceived + ' ideas conceived (' + perPersonYear.toFixed(2) +
        ' per person-year; wanted some, and fewer than 3)');

    // The web is not one path. If only one spark ever fires, every band arrives
    // at the same technology for the same reason and the whole point of
    // authoring several routes has been lost.
    //
    // It counts *technologies* as well as routes now, and reports both, because
    // counting routes alone was measuring the wrong thing. On the century seed
    // it read "8 distinct spark routes fired" and passed — and all eight
    // belonged to cordage, plant_lore and firemaking, in a world where the
    // other fourteen nodes had never once entered anybody's head. A number that
    // looks healthy on a world where four fifths of the tree never occurs to
    // anyone is the "reassuring and detects nothing" failure that got two
    // checks deleted in the winter pass.
    add('sparks-are-various',
      sparkRoutes.length > 1 && conceivedTechs.length > 1,
      sparkRoutes.length + ' routes into ' + conceivedTechs.length +
        ' technologies: ' + conceivedTechs.join(' '));

    // A completed lifecycle wants a year, for the same reason
    // `knowledge-is-found` does: conceive, research, prototype, test and prove
    // are each measured in seasons. The thirty-day gate above is right for
    // *conception*, which happens in an afternoon, and was never right for
    // this — it simply had nothing between twelve days and two years to fail
    // against until the `craft` scenario landed at thirty-three.
    if (last.day - first.day < 80) {
      skip('ideas-become-tech',
        'run covers under a year; ' + conceived + ' conceived, too soon to prove any');
      skip('the-tree-is-climbed',
        'run covers under a year; too soon to get past the root technologies');
    } else {
      add('ideas-become-tech',
        proven > 0,
        conceived + ' conceived, ' + prototypes + ' built, ' + proven + ' proven, ' +
          (tel.prototype_failed ?? 0) + ' failed their trial');

      // Did anybody get past the four technologies you can arrive at knowing
      // nothing? This is the gate every content tier of M8 is held to: a tier
      // that adds nodes and does not move this has added content no player will
      // ever see.
      //
      // It fails on the century seed today, and deliberately so. That world
      // halves its population inside two years, and the two failures have one
      // cause: it ends with ten people, two technologies known to anybody, and
      // 13 lessons taught and 11 things picked up by watching in two years, so
      // there is nobody holding a prerequisite for anybody else to build on.
      //
      // Read it as a tripwire on the worst case, not as the measurement. One
      // century run cannot resolve this any more than it can resolve the food
      // economy: across the canonical twenty-seed cohort the mean world ends
      // knowing 5.4 technologies and conceives 4.2 past the roots, and this
      // seed is the only one of the twenty that reaches none.
      // `npm run sim:seeds -- --seeds 20` prints that distribution, and is
      // where a change to the pace of discovery should be judged.
      add('the-tree-is-climbed',
        beyondRoots.length > 0,
        beyondRoots.length + ' of ' + conceivedTechs.length +
          ' technologies conceived were past the root nodes' +
          (beyondRoots.length > 0 ? ': ' + beyondRoots.join(' ') : ''));
    }

    // Thinking alone is always available; arguing needs somebody who knows
    // something and is willing to talk. If none of the second ever happens the
    // action is dead weight and the partner terms are untested.
    if (breakthroughsAlone + breakthroughsTogether === 0) {
      skip('research-is-social', 'nobody made a breakthrough at all in this run');
    } else {
      add('research-is-social',
        breakthroughsTogether > 0,
        breakthroughsAlone + ' breakthroughs alone, ' + breakthroughsTogether +
          ' by arguing it out');
    }

    // Proving a design takes several trials that went well, not one.
    //
    // The sharpest available statement of the change, and it detects its own
    // removal exactly: under the old model one good trial proved a design
    // outright, so passed trials and proofs were the same number. Under this one
    // a proof costs `trialsToProve` of them, less whatever credit the failures
    // along the way were worth — so passed trials must strictly exceed proofs
    // wherever anything was proven at all.
    if (proven === 0) {
      skip('trials-accumulate', 'nothing was proven, so nothing was tried more than once');
    } else {
      add('trials-accumulate',
        (tel.prototype_trial_passed ?? 0) > proven,
        (tel.prototype_trial_passed ?? 0) + ' trials went well across ' + proven +
          ' designs proven, ' + (tel.prototype_failed ?? 0) + ' went badly');
    }

    // `prototypes-can-fail` used to live here and has been **deliberately
    // removed**, not moved and not disabled. Do not put it back.
    //
    // It asserted that both trial outcomes occur in a run. A two-year run
    // produces about eight trials at roughly a one-in-three failure rate, so
    // zero failures is ordinary chance — and the century scenario duly reported
    // "8 built, 1 failed" and then "8 built, 0 failed" across a change that
    // never went near the roll. Raising the minimum sample does not save it:
    // the number of trials a run yields is smaller than the number a
    // statistical claim of this kind needs, so every threshold is either flaky
    // or permanently n/a.
    //
    // Both outcomes are asserted deterministically instead, in
    // `research.test.ts` — "can fail a trial and can pass one" drives twelve
    // hopeless prototypers and twelve able ones and insists on seeing each.
    // That is what `AGENTS.md` means by measuring the mechanism rather than the
    // end state.

    if (proven === 0) {
      skip('techs-are-refined', 'nothing was proven, so nothing could be improved');
    } else if (last.day - first.day < 80) {
      // Refinement needs a much longer span than the rest of the lifecycle:
      // prove a design, then keep working on it for a long time afterwards.
      // Thirty days covers the first half and nowhere near the second. The
      // `craft` scenario is what showed this up — its founders start knowing
      // three technologies, so it proves one inside a month and then correctly
      // refines nothing, which the shared thirty-day gate reported as the world
      // being broken. It was the gate that was wrong.
      skip('techs-are-refined', 'run covers under a year; too short to improve a design');
    } else {
      add('techs-are-refined',
        refined > 0,
        refined + ' improvements to proven designs, ' + sum('mastered_') +
          ' carried as far as they go');
    }
  }

  // --- Records --------------------------------------------------------------
  // The fourth channel, and the only one that crosses a death. Writing sits
  // behind marking and stoneworking, which nothing in the suite reaches from
  // nothing, so the `scribes` scenario starts its founders literate.
  const cut = sum('recorded_');
  const read = sum('read_');
  if (!sim.knownTech.has('writing') && cut === 0) {
    skip('records-are-cut', 'nobody in this world can write');
  } else {
    add('records-are-cut',
      cut > 0 && sim.recordedTech.size > 0,
      cut + ' things cut into ' + sim.inscriptions.length + ' records; ' +
        sim.recordedTech.size + ' technologies are written down somewhere, ' +
        read + ' read back off a stone');
  }

  // Reading is deliberately *not* asserted here, and that is a finding rather
  // than an omission. A living teacher is quicker to reach than a stone across
  // the valley, so reading fires when the chain breaks — when the last holder
  // of something is dead, or when a record carries something newly worked out.
  // A fifty-eight-day run has neither, and a run long enough to have both is
  // long enough that `people-survive` is asking a different question. The claim
  // that a record outlives its author, and grants nothing to somebody who
  // cannot read, is asserted deterministically in `transmission.test.ts`.

  // --- Making things ------------------------------------------------------
  // Crafting was one hardcoded hand axe with no interruption check, and the
  // granary asked for six pots that nothing in the world could produce. Both
  // are chains, and a chain is exactly the sort of thing that passes every
  // static test while being impossible to walk end to end.
  const crafted = sum('crafted_');
  const craftInterrupted = tel.craft_interrupted ?? 0;
  if (crafted + craftInterrupted === 0) {
    skip('crafting-is-interruptible', 'nobody made anything in this run');
  } else {
    // `doCraft` was the one long action with no `interruption()` call, so for
    // the 258 ticks a novice spends over an axe nothing could reach them —
    // not thirst, not hunger, not being attacked — and the stretch never
    // reported its ending to the player either. On the build without the fix
    // this number is zero however long the run.
    add('crafting-is-interruptible',
      craftInterrupted > 0,
      crafted + ' things made, ' + craftInterrupted + ' attempts broken off for a need');
  }

  // The granary chain: know pottery, dig clay, make pots, carry them to a site
  // a band marked out for itself, finish it. Every link was broken.
  const pots = tel.crafted_pot ?? 0;
  const granariesPlanned = tel.band_planned_granary ?? 0;
  const potterKnown = sim.knownTech.has('pottery');
  if (!potterKnown) {
    skip('pots-reach-a-granary', 'nobody alive knows how to fire clay');
  } else if (granariesPlanned === 0) {
    // Not a failure on its own: a band only wants the big store once it has
    // filled a small one, which a short or a hungry run never gets to.
    skip('pots-reach-a-granary',
      'pottery is known and ' + pots + ' pots made, but no band needed a granary yet');
  } else {
    // Planning one and never making a pot is the exact state the world was in
    // before this pass, and it is invisible from any other check: the site sits
    // six pots short for ever and simply never finishes.
    add('pots-reach-a-granary',
      pots > 0,
      granariesPlanned + ' granaries marked out, ' + pots + ' pots made, ' +
        (tel.completed_granary ?? 0) + ' finished');
  }

  // Discovery is situated: an idea arrives to somebody in the situation that
  // suggests it. Verified from the routes that actually fired rather than from
  // a correlation, because a two-year run has too few discoveries in it for a
  // correlation to mean anything — a check that looks reassuring and detects
  // nothing is worse than no check.
  if (sparkRoutes.length === 0) {
    skip('discovery-is-situated', 'no idea was conceived in this run');
  } else {
    const cold = sparkRoutes.filter(k => k.startsWith('spark_clothing_') ||
      k.startsWith('spark_firemaking_')).length;
    add('discovery-is-situated',
      conceived === sparkRoutes.reduce((total, k) => total + tel[k]!, 0),
      'every one of ' + conceived + ' ideas came by a named route; ' + cold +
        ' of them into the technologies cold suggests');
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

  // --- M6a: wildlife, families, sleep and the opinion ladder ----------------

  if (sim.animals.length === 0 && (tel.animal_killed ?? 0) === 0) {
    skip('animals-move', 'no animals in this scenario');
    skip('animals-flee', 'no animals in this scenario');
    skip('hunts-succeed-and-fail', 'no animals in this scenario');
  } else {
    // Game used to be a resource node standing still. If the mean drift is near
    // zero the herd system has stopped running and hunting is foraging again.
    add('animals-move',
      base.wildlife.driftPerDay > 2,
      'mean drift ' + base.wildlife.driftPerDay.toFixed(1) + ' tiles/day (floor is 2)');

    const bolts = base.wildlife.fledSuccessfully + base.wildlife.fledAndStayedClose;
    if (bolts === 0) {
      skip('animals-flee', 'no animal was ever spooked in this run');
    } else {
      add('animals-flee',
        base.wildlife.fledSuccessfully > base.wildlife.fledAndStayedClose,
        base.wildlife.fledSuccessfully + ' bolts opened the distance, ' +
          base.wildlife.fledAndStayedClose + ' did not');
    }

    // Both outcomes, deliberately. A hunt that always works is gathering with
    // extra steps, and one that never works is a skill nobody can ever raise.
    const kills = tel.hunt_killed ?? 0;
    const misses = tel.hunt_missed ?? 0;
    // Below a handful of strikes the run genuinely cannot tell "hunting always
    // works" from "four coin flips came up heads" — a blown animal is meant to
    // be easy prey, so a short run of kills is the design, not a broken roll.
    if (kills + misses < 8) {
      skip('hunts-succeed-and-fail',
        'too few strikes to tell (' + kills + ' kills, ' + misses + ' misses)');
    } else {
      add('hunts-succeed-and-fail',
        kills > 0 && misses > 0,
        kills + ' kills, ' + misses + ' misses, ' + (tel.hunt_lost ?? 0) + ' outrun');
    }
  }

  if ((tel.harvest_meat ?? 0) === 0) {
    skip('people-eat-meat', 'no meat entered the world in this run');
  } else {
    add('people-eat-meat',
      (tel.eat ?? 0) > 0,
      (tel.harvest_meat ?? 0) + ' meat taken; ' + (tel.eat ?? 0) + ' meals eaten');
  }

  // A band that keeps planning huts while three stand empty is the failure this
  // guards: the planner used to count structures rather than what they held.
  const perBand = new Map<number, number>();
  for (const building of sim.buildings) {
    if (!building.complete) continue;
    perBand.set(building.ownerBandId, (perBand.get(building.ownerBandId) ?? 0) + 1);
  }
  const livingPerBand = new Map<number, number>();
  for (const person of sim.livingPeople()) {
    livingPerBand.set(person.bandId, (livingPerBand.get(person.bandId) ?? 0) + 1);
  }
  let overbuilt = 0;
  let idleStores = 0;
  for (const [bandId, built] of perBand) {
    // The population a band's structures were built for is its peak, not its
    // survivors: a band of twenty that has dwindled to four is not overbuilt,
    // it is bereaved. Peak population is the only figure available here, so the
    // ceiling is generous by design.
    const peak = Math.max(livingPerBand.get(bandId) ?? 0, 4);
    if (built > Math.ceil(peak / 4) + 6) overbuilt++;
    const stores = sim.buildings.filter(b =>
      b.complete && b.ownerBandId === bandId && b.def.storage >= 100);
    const empty = stores.filter(b => b.store.total < b.def.storage * 0.1).length;
    if (stores.length >= 2 && empty >= 2) idleStores++;
  }
  add('bands-dont-overbuild',
    overbuilt === 0 && idleStores === 0,
    [...perBand.entries()].map(([b, n]) => 'band' + b + '=' + n).join(' ') +
      '; ' + overbuilt + ' over the ceiling, ' + idleStores + ' holding empty stores');

  // The world now opens with families rather than thirty strangers. If this
  // fails, `Founding` has stopped running and every household is one person.
  const multi = sim.households.filter(h => h.memberIds.length > 1).length;
  const kinEdges = sim.livingPeople().filter(p =>
    p.spouseId !== null || p.motherId !== null || p.fatherId !== null ||
    p.childIds.length > 0
  ).length;
  add('families-exist',
    multi > 0 && kinEdges > 0,
    multi + ' households of more than one; ' + kinEdges + ' people with family');

  if (base.wildlife.sleepStarts === 0) {
    skip('sleep-restores', 'nobody had a roof to sleep under in this run');
  } else {
    add('sleep-restores',
      base.wildlife.sleepFatigueFalls > 0,
      base.wildlife.sleepStarts + ' sleeps begun, fatigue fell on ' +
        base.wildlife.sleepFatigueFalls + ' ticks of them');
  }

  // The three-rung ladder, measured rather than asserted: household above band
  // above everyone else. This is what replaced a flat +10 / -14.
  // Below this many pairs the mean is a handful of relationships wearing a
  // statistic's clothes. `M6b` phase 6 gave the "outsider" and "band" tiers a
  // new way to end up thin on `tiny`: a rebellion that ends in someone
  // leaving their band creates the outcast band's first member within the
  // first week of an eight-person world, at which point both tiers sit at
  // five or six pairs and the mean is one bad relationship away from flipping
  // either direction. The other two tiers were already documented as capable
  // of the same failure from a marriage across a band line; this is that
  // comment's fix, not a new problem, and the threshold is set from measuring
  // `tiny` (5-6 pairs, noise) against `century` (in the hundreds, stable).
  const MIN_TIE_PAIRS = 10;
  const opinionOf = (
    pick: (a: { p: typeof sim.people[number] }, b: { p: typeof sim.people[number] }) => boolean
  ): number => {
    let total = 0;
    let n = 0;
    for (const a of sim.livingPeople()) {
      for (const b of sim.livingPeople()) {
        if (a.id === b.id) continue;
        if (!pick({ p: a }, { p: b })) continue;
        if (!sim.relationships.peek(a.id, b.id)) continue;
        total += sim.relationships.opinion(a.id, b.id);
        n++;
      }
    }
    return n < MIN_TIE_PAIRS ? NaN : total / n;
  };
  const kin = opinionOf((a, b) =>
    a.p.householdId !== null && a.p.householdId === b.p.householdId);
  const band = opinionOf((a, b) =>
    a.p.bandId === b.p.bandId && a.p.householdId !== b.p.householdId);
  // Household-mates are excluded here for the same reason they are excluded
  // from `band`: the three categories are meant to be disjoint, and a person
  // cannot be both your household and a stranger. They were not, and it is a
  // real gap rather than a tidiness point — `bandId` is not reassigned on
  // marriage, so somebody who marries across a band line stays an "outsider"
  // to this measurement for the rest of their life while sharing a roof with
  // their spouse. On the century seed, one such marriage plus a band worn down
  // to three survivors was enough to put mean stranger regard above mean band
  // regard and fail a check about a design property that had not changed.
  const outsider = opinionOf((a, b) =>
    a.p.bandId !== b.p.bandId && a.p.householdId !== b.p.householdId);
  const detail =
    'household=' + fmt(kin) + ' band=' + fmt(band) + ' outsider=' + fmt(outsider);
  if (Number.isNaN(kin) || Number.isNaN(band) || Number.isNaN(outsider)) {
    skip('kin-outrank-strangers',
      'not all three kinds of tie have ' + MIN_TIE_PAIRS + '+ pairs here: ' + detail);
  } else {
    add('kin-outrank-strangers', kin > band && band > outsider, detail);
  }

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

  // Wildlife has to be watched as it happens; see `WildlifeWatch`.
  const watch: WildlifeWatch = {
    driftPerDay: 0,
    fledSuccessfully: 0,
    fledAndStayedClose: 0,
    sleepStarts: 0,
    sleepFatigueFalls: 0,
  };
  const zeroPerJob = (): Record<JobId, number> =>
    Object.fromEntries(JOB_IDS.map(id => [id, 0])) as Record<JobId, number>;
  const jobs: JobWatch = {
    holderTicks: zeroPerJob(),
    holderMatchTicks: zeroPerJob(),
    otherTicks: zeroPerJob(),
    otherMatchTicks: zeroPerJob(),
  };
  const lastAnimalPos = new Map<number, { x: number; y: number }>();
  const threatened = new Map<number, { personId: number; distance: number }>();
  const sleeperFatigue = new Map<number, number>();
  let drift = 0;
  const WATCH_EVERY = 20;

  const started = Date.now();
  for (let i = 1; i <= steps; i++) {
    sim.step();
    // Every step, not every sample: a behaviour that only ever runs for a few
    // ticks at a time is still the AI using it, and sparse sampling misses it.
    for (const person of sim.livingPeople()) {
      actionTotals[person.action] = (actionTotals[person.action] ?? 0) + 1;

      // Every job, not just the one this person holds: the control group for
      // "does a forager forage more than a non-forager" is everyone who is
      // not a forager, which includes hunters, builders and the unemployed
      // alike.
      for (const id of JOB_IDS) {
        const onThatJobsWork = JOBS[id].actions.includes(person.action);
        if (person.job === id) {
          jobs.holderTicks[id]++;
          if (onThatJobsWork) jobs.holderMatchTicks[id]++;
        } else {
          jobs.otherTicks[id]++;
          if (onThatJobsWork) jobs.otherMatchTicks[id]++;
        }
      }

      // Sleep: did fatigue actually fall while they were under the roof?
      if (person.action === 'sleep') {
        const before = sleeperFatigue.get(person.id);
        if (before === undefined) {
          watch.sleepStarts++;
          sleeperFatigue.set(person.id, person.needs.fatigue);
        } else if (person.needs.fatigue < before) {
          watch.sleepFatigueFalls++;
          sleeperFatigue.set(person.id, person.needs.fatigue);
        }
      } else {
        sleeperFatigue.delete(person.id);
      }
    }

    if (i % WATCH_EVERY === 0) {
      for (const animal of sim.animals) {
        if (!animal.alive) continue;
        const was = lastAnimalPos.get(animal.id);
        if (was) drift += Math.hypot(animal.x - was.x, animal.y - was.y);
        lastAnimalPos.set(animal.id, { x: animal.x, y: animal.y });

        // Flight: an animal that is bolting should end up further from the
        // person it is running from. Keyed off `alarmed` rather than off
        // proximity, because by the time any sampled tick comes round an animal
        // that noticed somebody is already a dozen tiles away — measured by
        // proximity, the moment of flight is never observable at all.
        //
        // And measured against *that* person, not against whoever is nearest
        // now: on an island with three camps, running away from one band
        // regularly runs you toward another, and "distance to the nearest human
        // being" then reports a successful escape as a failure.
        const earlier = threatened.get(animal.id);
        if (earlier !== undefined) {
          const from = sim.peopleById.get(earlier.personId);
          if (from && from.alive) {
            const now = Math.hypot(from.x - animal.x, from.y - animal.y);
            if (now > earlier.distance) watch.fledSuccessfully++;
            else watch.fledAndStayedClose++;
          }
          threatened.delete(animal.id);
        } else if (animal.alarmed) {
          const near = sim.peopleHash.findNearest(animal.x, animal.y, 40, p => p.alive);
          if (near) {
            threatened.set(animal.id, {
              personId: near.id,
              distance: Math.hypot(near.x - animal.x, near.y - animal.y),
            });
          }
        }
      }
    }

    if (i % sampleEvery === 0 || i === steps) samples.push(sample(sim));
  }
  const wallClockMs = Math.max(1, Date.now() - started);

  const days = Math.max(1, sim.time.tick / sim.config.time.ticksPerDay);
  watch.driftPerDay = sim.animals.length === 0
    ? 0
    : drift / Math.max(1, sim.animals.length) / days;

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
    wildlife: watch,
    jobs,
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
