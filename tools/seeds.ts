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
 *   npm run sim:seeds -- --size 192     (a bigger island, same food per tile)
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { TECH, type Tech } from '../src/sim/knowledge/Tech.ts';
import { DemographyWatch, formatDemography, type Demography } from './demography.ts';
import { CohesionWatch, formatCohesion, type Cohesion } from './cohesion.ts';
import { HistoryWatch, formatHistory, type HistoryReport } from './history.ts';
import {
  SCENARIOS, thousands, watchConflict, peoplesApart, apartAroundIncidents, type ConflictWatch,
} from './simcheck.ts';

interface SeedResult {
  demography: Demography;
  cohesion: Cohesion;
  history: HistoryReport;
  seed: string;
  peak: number;
  end: number;
  born: number;
  starvedInfants: number;
  starvedChildren: number;
  starvedAdults: number;
  /** Technologies known to somebody still alive at the end. */
  known: number;
  /** Distinct technologies ever conceived that are not root nodes. */
  pastRoots: number;
  /** Lessons taught and things picked up by watching, over the whole run. */
  transmitted: number;
  /** M11 phase 14's measures; see `ConflictWatch`. */
  conflict: ConflictWatch;
  murders: number;
  captives: number;
  escaped: number;
  cameHome: number;
  intervened: number;
  seenByOwner: number;
  coats: number;
  tended: number;
  tamed: number;
  exiled: number;
  adopted: number;
  factionDays: number;
  leftInAHuff: number;
  deaths: number;
  bodiesFound: number;
  investigations: number;
  namedRightly: number;
  namedWrongly: number;
  /** Blows and killings inside one band, and blows by adults on children. */
  assaults: number;
  ownBandBlows: number;
  childBlows: number;
  ownBandThefts: number;
  thefts: number;
}

/** Ages at or below this are wholly dependent: they are fed or they die. */
const INFANT_YEARS = 5;

function runSeed(scenarioName: string, seed: string, steps: number, size: number | null): SeedResult {
  const scenario = SCENARIOS[scenarioName];
  if (!scenario) throw new Error('unknown scenario: ' + scenarioName);

  // Telemetry is off by default and `runScenario` is not what runs here, so
  // the tech columns below would be silently zero without this.
  telemetry.reset();
  telemetry.enable();

  // `--size`: the island's side, with every resource count scaled by the
  // area the way the settings screen scales them (`configFor`), so a bigger
  // island measures room rather than scarcity. Only on scenarios that do not
  // pin their own dimensions — `tiny` quotes its counts for 64 tiles.
  const world = scenario.config.world ?? {};
  const sized = size === null ? {} : {
    world: {
      ...world, width: size, height: size,
      resourceScale: (size * size) / ((world.width ?? 128) * (world.height ?? 128)),
    },
  };
  const sim = new Simulation({ ...scenario.config, ...sized, seed });
  let peak = 0;
  let born = 0;
  const startingIds = new Set(sim.people.map(p => p.id));
  const demography = new DemographyWatch(sim.peopleById.values(), sim.config.time.ticksPerDay);
  const cohesion = new CohesionWatch(sim);
  const history = new HistoryWatch(sim);

  const conflict: ConflictWatch = { blows: 0, blowsNearHome: 0, incidents: 0, apart: [] };
  let lastEventId = 0;
  for (let i = 1; i <= steps; i++) {
    sim.step();
    if (sim.time.tick % 40 === 0) cohesion.observe();
    if (sim.time.tick % sim.config.time.ticksPerDay === 0) history.observe();
    // One census per day is enough for fertility exposure and birth/death
    // cohorts. Scanning the retained dead-person registry on every tick made
    // this read-only report scale with both run length and all prior deaths.
    if (sim.time.tick % sim.config.time.ticksPerDay === 0) {
      demography.observe(sim.peopleById.values(), sim.time.tick);
    }
    peak = Math.max(peak, sim.livingPeople().length);
    watchConflict(sim, conflict, lastEventId);
    const recent = sim.social.recent;
    if (recent.length > 0) lastEventId = Math.max(lastEventId, recent[recent.length - 1]!.id);
    if (i % sim.config.time.ticksPerDay === 0) conflict.apart.push(peoplesApart(sim, conflict.incidents));
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

  // What the world worked out, beside whether it survived.
  //
  // A root node is one with an empty `requires` — firemaking, cordage,
  // plant_lore and tracking — so `pastRoots` counts only the nodes somebody had
  // to already hold something to reach. That is the number the whole of M8
  // moves or fails to, and it belongs here rather than in a single run for the
  // same reason mean survival does: on the century seed it is 0 and on eleven
  // other seeds it is 2 to 6, so one run says nothing at all.
  const counts = telemetry.snapshot();
  const pastRoots = Object.keys(counts)
    .filter(k => k.startsWith('conceived_'))
    .map(k => k.slice('conceived_'.length))
    .filter(id => id in TECH && TECH[id as Tech].requires.length > 0).length;
  const transmitted = Object.entries(counts)
    .filter(([k]) => k.startsWith('taught_') || k.startsWith('observed_'))
    .reduce((n, [, v]) => n + v, 0);

  return {
    demography: demography.finish(sim.peopleById.values(), sim.time.tick),
    cohesion: cohesion.finish(),
    history: history.finish(),
    seed,
    peak,
    end: sim.livingPeople().length,
    born,
    starvedInfants,
    starvedChildren,
    starvedAdults,
    known: sim.knownTech.size,
    pastRoots,
    transmitted,
    conflict,
    murders: counts.event_murder ?? 0,
    // M11 phase 15: captivity and the witness's ladder, read here rather than
    // from one run because a capture is a handful of events a world at most.
    captives: counts.taken_captive ?? 0,
    escaped: counts.escaped ?? 0,
    cameHome: counts.captive_came_home ?? 0,
    intervened: counts.intervened ?? 0,
    seenByOwner: counts.property_deed_seen_by_owner ?? 0,
    // M11 phase 17d: tripwires one event wide in a single run.
    coats: counts.crafted_fur_coat ?? 0,
    tended: counts.tended_ticks ?? 0,
    tamed: counts.animal_tamed ?? 0,
    // M11 phase 17b: phase 5's three rare mechanisms.
    exiled: counts.exiled ?? 0,
    adopted: counts.adopted ?? 0,
    factionDays: counts.faction_days ?? 0,
    leftInAHuff: counts.rebellion_left ?? 0,
    // M11 phase 16.
    deaths: counts.death_settled ?? 0,
    bodiesFound: counts.corpse_first_found ?? 0,
    investigations: counts.investigation_opened ?? 0,
    namedRightly: counts.murder_named_rightly ?? 0,
    namedWrongly: counts.murder_named_wrongly ?? 0,
    assaults: (counts.event_assault ?? 0) + (counts.event_murder ?? 0),
    ownBandBlows: (counts.harm_own_band_assault ?? 0) + (counts.harm_own_band_murder ?? 0),
    childBlows: (counts.harm_child_assault ?? 0) + (counts.harm_child_murder ?? 0),
    ownBandThefts: counts.harm_own_band_theft ?? 0,
    thefts: counts.event_theft ?? 0,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf('--' + name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  // vite-node consumes unknown long-option names after the package script's
  // `--` delimiter and forwards the values positionally.
  const scenarioName = flag('scenario') ?? args[0] ?? 'century';
  const count = Number(flag('seeds') ?? args[1] ?? 10);
  const scenario = SCENARIOS[scenarioName];
  if (!scenario) {
    console.error('unknown scenario "' + scenarioName + '"');
    console.error('available: ' + Object.keys(SCENARIOS).join(', '));
    process.exit(1);
    return;
  }
  const steps = Number(flag('steps') ?? args[2] ?? scenario.steps);
  const sizeValue = flag('size') ?? args[3];
  const size = sizeValue === undefined ? null : Number(sizeValue);

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
    ' seeds, ' + thousands(steps) + ' steps each' + (size === null ? '' : ', island ' + size));
  console.log('='.repeat(78));
  console.log('  seed      peak   end    survived   born   starved: inf chi adu   known past taught');

  const results: SeedResult[] = [];
  const started = Date.now();
  for (const seed of seeds) {
    const r = runSeed(scenarioName, seed, steps, size);
    results.push(r);
    const pct = r.peak === 0 ? 0 : Math.round((r.end / r.peak) * 100);
    console.log(
      '  ' + r.seed.padEnd(10) +
      String(r.peak).padStart(4) + String(r.end).padStart(6) +
      (pct + '%').padStart(11) + String(r.born).padStart(7) +
      String(r.starvedInfants).padStart(14) +
      String(r.starvedChildren).padStart(4) + String(r.starvedAdults).padStart(4) +
      String(r.known).padStart(8) + String(r.pastRoots).padStart(5) +
      String(r.transmitted).padStart(7)
    );
  }

  const sum = (pick: (r: SeedResult) => number) => results.reduce((n, r) => n + pick(r), 0);
  const totalPeak = sum(r => r.peak);
  const totalEnd = sum(r => r.end);
  const collapsed = results.filter(r => r.peak > 0 && r.end / r.peak < 0.25).length;

  console.log(formatDemography(results.map(r => r.demography)));
  console.log(formatCohesion(results.map(r => r.cohesion)));
  console.log(formatHistory(results.map(r => r.history)));

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

  // The climb, across seeds. `the-tree-is-climbed` in `sim:check` is a tripwire
  // on one world; this is the measurement, and the only thing a change to the
  // pace of discovery should be judged on.
  const mean = (pick: (r: SeedResult) => number) =>
    (sum(pick) / Math.max(1, results.length)).toFixed(1);
  const stuck = results.filter(r => r.pastRoots === 0).length;
  console.log(
    '  MEAN ' + mean(r => r.known) + ' technologies known at the end, ' +
    mean(r => r.pastRoots) + ' conceived past the root nodes, ' +
    mean(r => r.transmitted) + ' passed on   ·  ' +
    stuck + '/' + results.length + ' never got past a root node'
  );

  // M11 phase 14: where the blows between peoples land, and whether the
  // peoples move apart after them. Pooled rather than averaged per seed, so a
  // seed with three blows cannot weigh the same as one with three hundred.
  const blows = sum(r => r.conflict.blows);
  const near = sum(r => r.conflict.blowsNearHome);
  const drifts = results
    .map(r => apartAroundIncidents(r.conflict))
    .filter(d => !Number.isNaN(d.before) && !Number.isNaN(d.after));
  const drifted = drifts.filter(d => d.after > d.before).length;
  const meanDrift = drifts.length === 0 ? NaN
    : drifts.reduce((n, d) => n + (d.after - d.before), 0) / drifts.length;
  console.log(
    '  CONFLICT ' + blows + ' blows between peoples, ' +
    (blows === 0 ? 'n/a' : ((near / blows) * 100).toFixed(0) + '%') + ' near either camp · ' +
    sum(r => r.murders) + ' murders · peoples drifted apart after incidents in ' + drifted + '/' +
    drifts.length + ' seeds (mean ' + (Number.isNaN(meanDrift) ? 'n/a' : meanDrift.toFixed(1)) + ' tiles)'
  );
  // M11 phase 15's gate, pooled for the reason above: `captives-are-taken`
  // is a single event on a single run, and the cohort is where it can be
  // read at all.
  const withCaptives = results.filter(r => r.captives > 0).length;
  const seen = sum(r => r.seenByOwner);
  console.log(
    '  DEFENCE ' + sum(r => r.intervened) + ' interventions against ' + seen +
    ' property deeds an owner saw · ' + sum(r => r.captives) + ' taken captive in ' +
    withCaptives + '/' + results.length + ' seeds, ' + sum(r => r.escaped) + ' escaped, ' +
    sum(r => r.cameHome) + ' came home'
  );
  // M11 phase 17d: the checks one event wide in a single run, read where they
  // can be — how many seeds of the cohort saw each happen at all.
  console.log(
    '  TRIPWIRES coats sewn in ' + results.filter(r => r.coats > 0).length + '/' + results.length +
    ' seeds · the hurt tended in ' + results.filter(r => r.tended > 0).length +
    ' · animals tamed in ' + results.filter(r => r.tamed > 0).length
  );
  // M11 phase 17b: exile, factions and the way back in — phase 5's promised
  // checks that are one or two events a run and can only be read here.
  console.log(
    '  BANDS ' + sum(r => r.exiled) + ' cast out in ' + results.filter(r => r.exiled > 0).length +
    ' seeds · factions in ' + results.filter(r => r.factionDays > 0).length + ' seeds · ' +
    sum(r => r.adopted) + ' taken in, of ' + (sum(r => r.exiled) + sum(r => r.leftInAHuff)) +
    ' who left or were cast out'
  );
  // M11 phase 16's gate, pooled the same way.
  console.log(
    '  BODIES ' + sum(r => r.bodiesFound) + ' of ' + sum(r => r.deaths) + ' found · ' +
    sum(r => r.investigations) + ' investigations, ' + sum(r => r.namedRightly) + ' named the killer, ' +
    sum(r => r.namedWrongly) + ' somebody else'
  );
  // The owner's note of 2026-09-24: tribes fell on their own, and on their
  // own children. Pooled, for the reason `CONFLICT` is.
  console.log(
    '  VIOLENCE ' + sum(r => r.assaults) + ' blows in all, ' + sum(r => r.ownBandBlows) +
    ' inside a band, ' + sum(r => r.childBlows) + ' by an adult on a child · ' +
    sum(r => r.ownBandThefts) + ' of ' + sum(r => r.thefts) + ' thefts from a person inside a band'
  );
  console.log('  ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
  console.log('');
}

main();
