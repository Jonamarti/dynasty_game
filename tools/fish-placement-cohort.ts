/**
 * Paired economic cohort for geographic shoal placement.
 *
 *   npm.cmd exec -- vite-node tools/fish-placement-cohort.ts -- --seeds 20 --steps 9000
 *
 * It keeps Simulation's shipped Gaussian arm intact. The uniform arm temporarily
 * replaces only the constructor's fish placement method while constructing one
 * world, then restores the original method before stepping. Both arms use the
 * same geographic resource stream, quota, reserved freshwater/saltwater nodes,
 * cluster centers, and number of RNG draws; only the remaining tile selection
 * changes from Gaussian weighted to uniform without replacement.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IdSpace } from '../src/sim/core/IdSpace.ts';
import { profileOfStart, Simulation } from '../src/sim/core/Simulation.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { ResourceNode } from '../src/sim/entities/ResourceNode.ts';
import { toCheckpointRecord } from '../src/sim/persistence/CheckpointRecords.ts';
import { DemographyWatch } from './demography.ts';
import { SCENARIOS } from './simcheck.ts';
import { earthSources } from './resourceMeasure.ts';

const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1] ?? fallback;
};
const seedsN = Number(arg('seeds', '20'));
const steps = Number(arg('steps', '9000'));
const outputDir = resolve(arg('out', 'artifacts/m15-fish-cohort-20261016'));
if (!Number.isInteger(seedsN) || seedsN < 1 || seedsN > 20 || !Number.isInteger(steps) || steps < 1) {
  throw new Error('--seeds must be an integer from 1 to 20, and --steps must be a positive integer');
}

const mapCandidate = earthSources().find(source => source.name === 'earth-12000-bce')?.geography;
if (!mapCandidate || mapCandidate.kind !== 'earth') throw new Error('earth-12000-bce atlas map is required');
const mapSource = mapCandidate;
const start = (() => {
  let best: { x: number; y: number; comarcasWide: 1; comarcasHigh: 1; profile: NonNullable<ReturnType<typeof profileOfStart>>; score: number } | null = null;
  // Search the Iberian Atlantic / Mediterranean coastal corridor for a single-comarca profile
  // with salt shallows, so the cohort measures coastal access rather than the
  // inland river-only fixture at the Ebro valley coordinate.
  for (let y = 112; y <= 148; y++) for (let x = 445; x <= 510; x++) {
    const candidate = { x: x + 0.5, y: y + 0.5, comarcasWide: 1 as const, comarcasHigh: 1 as const };
    const profile = profileOfStart({ geography: mapSource, ...candidate });
    if (!profile || profile.habitat.shallowSalt <= 0 || profile.nodes.shoals <= 1) continue;
    const score = profile.habitat.shallowSalt * profile.nodes.shoals;
    if (!best || score > best.score) best = { ...candidate, profile, score };
  }
  if (!best) throw new Error('No salt-shallow comarca found in the Iberian coastal search window');
  return { x: best.x, y: best.y, comarcasWide: best.comarcasWide, comarcasHigh: best.comarcasHigh };
})();
const baseScenario = SCENARIOS.fishers!;
const resourceProfile = profileOfStart({ geography: mapSource, ...start });
if (!resourceProfile) throw new Error('fish cohort start must resolve to exactly one comarca profile');
const sourceHashes = {
  scenarioConfig: hash(JSON.stringify(baseScenario.config)),
  earthMap: createHash('sha256').update(readFileSync('public/world/earth-12000-bce.bin')).digest('hex'),
  filesAtProcessStart: Object.fromEntries([
    'src/sim/core/Simulation.ts',
    'src/sim/core/RNG.ts',
    'src/sim/core/SpatialHash.ts',
    'src/sim/world/GaussianPlacement.ts',
    'tools/fish-placement-cohort.ts',
  ].map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])),
};

type Arm = 'gaussian' | 'uniform';
type PrototypeWithSpawner = { spawnFish(this: any, rng: any): void };
const simulationPrototype = Simulation.prototype as unknown as PrototypeWithSpawner;
const shippedSpawner = simulationPrototype.spawnFish;

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

/** Same fish generator as Simulation, except for the last placement selector. */
function uniformSpawner(this: any, rng: any): void {
  if (this.geographicStart) rng = this.geographicResourceRng('fish');
  const count = this.scaledCount(this.comarcaProfile ? this.comarcaProfile.nodes.shoals : this.config.world.fishingSpots);
  const shallows = this.world.shoreTiles.filter((tile: any) => this.world.isShallow(tile.x, tile.y));
  if (shallows.length === 0) return;
  if (!this.geographicStart) {
    for (let placed = 0; placed < count; placed++) {
      const spot = rng.pick(shallows);
      const node = new ResourceNode('fish', spot.x, spot.y, rng, this.ids);
      this.nodes.push(node); this.nodesById.set(node.id, node);
    }
    return;
  }
  const habitats = [
    shallows.filter((tile: any) => this.world.isFreshWater(tile.x, tile.y)),
    shallows.filter((tile: any) => this.world.isSaltWater(tile.x, tile.y)),
  ].filter((tiles: any[]) => tiles.length > 0);
  let placed = 0;
  const used = new Set<number>();
  const centresByHabitat: any[][] = habitats.map(() => []);
  if (count >= habitats.length) {
    for (let index = 0; index < habitats.length; index++) {
      const habitat = habitats[index]!;
      const spot = rng.pick(habitat);
      used.add(spot.y * this.world.width + spot.x);
      centresByHabitat[index]!.push(spot);
      const node = new ResourceNode('fish', spot.x, spot.y, rng, this.ids);
      this.nodes.push(node); this.nodesById.set(node.id, node); placed++;
    }
  }
  if (count >= habitats.length) {
    const centresPerHabitat = Math.max(1, Math.ceil(count / Math.max(1, habitats.length) / 16));
    for (let index = 0; index < habitats.length; index++) {
      const pool = habitats[index]!.filter((tile: any) => !used.has(tile.y * this.world.width + tile.x));
      while (centresByHabitat[index]!.length < centresPerHabitat && pool.length > 0) {
        const spot = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
        used.add(spot.y * this.world.width + spot.x);
        centresByHabitat[index]!.push(spot);
        const node = new ResourceNode('fish', spot.x, spot.y, rng, this.ids);
        this.nodes.push(node); this.nodesById.set(node.id, node); placed++;
      }
    }
  }
  // The matched control retains the same reserved nodes and centers. It uses
  // the same one-draw cadence and unique-tile pool, changing only the selector.
  const available = shallows.filter((tile: any) => !used.has(tile.y * this.world.width + tile.x));
  for (; placed < count && available.length > 0; placed++) {
    const spot = available.splice(rng.int(0, available.length - 1), 1)[0]!;
    const node = new ResourceNode('fish', spot.x, spot.y, rng, this.ids);
    this.nodes.push(node); this.nodesById.set(node.id, node);
  }
}

function comparableInitialState(sim: Simulation): string {
  // The canonical checkpoint covers terrain, roster, all world entities,
  // ledgers, allocator state, RNG snapshots, and exact stream aliases. Fish
  // coordinates are the sole intended initial-state difference; normalize
  // those fields in the inert object graph before hashing the complete record.
  const checkpoint = JSON.parse(JSON.stringify(toCheckpointRecord(sim))) as any;
  for (const node of checkpoint.objects.graph.nodes) {
    if (node.kind !== 'object' || node.prototype !== 'ResourceNode') continue;
    const fields = new Map(node.fields);
    if (fields.get('kind') !== 'fish') continue;
    node.fields = node.fields.map(([key, value]: [string, unknown]) =>
      key === 'x' || key === 'y' ? [key, 0] : [key, value]);
  }
  return hash(JSON.stringify(checkpoint));
}

function initialReach(sim: Simulation) {
  const adults = sim.livingPeople().filter(person => !person.isChild);
  const fish = sim.nodes.filter(node => node.kind === 'fish');
  const nearest = adults.map(person => {
    const node = sim.nodeHash.findNearest(person.x, person.y,
      Math.hypot(sim.world.width, sim.world.height), candidate => candidate.kind === 'fish');
    return node ? person.distanceTo(node) : null;
  });
  const within = (radius: number) => nearest.filter(distance => distance !== null && distance <= radius).length;
  return {
    adults: adults.length,
    fishNodes: fish.length,
    fishStock: fish.reduce((sum, node) => sum + node.amount, 0),
    nearestFishDistanceByAdult: nearest,
    adultsWithinEuclidean: { tiles5: within(5), tiles10: within(10), tiles20: within(20) },
    freshFishNodes: fish.filter(node => sim.world.isFreshWater(node.x, node.y)).length,
    saltFishNodes: fish.filter(node => sim.world.isSaltWater(node.x, node.y)).length,
  };
}

function runArm(seed: string, arm: Arm) {
  telemetry.reset(); telemetry.enable();
  if (arm === 'uniform') simulationPrototype.spawnFish = uniformSpawner;
  else simulationPrototype.spawnFish = shippedSpawner;
  let sim: Simulation;
  try {
    sim = new Simulation({ ...baseScenario.config, seed }, new IdSpace(), {
      geography: mapSource, ...start,
    });
  } finally { simulationPrototype.spawnFish = shippedSpawner; }

  // Match simcheck's headless cadence: otherwise other bands remain unslowed
  // here while the standard headless harness advances only its focused band.
  if (!sim.player) sim.headlessFocusBand ??= sim.livingPeople()[0]?.bandId ?? null;
  const initialHash = comparableInitialState(sim);
  const reach = initialReach(sim);
  const initialPopulation = sim.livingPeople();
  const founders = new Set(initialPopulation.map(person => person.id));
  const initialFish = sim.nodes.filter(node => node.kind === 'fish');
  const initialFishIds = new Set(initialFish.map(node => node.id));
  const demography = new DemographyWatch(sim.peopleById.values(), sim.config.time.ticksPerDay);
  for (let step = 0; step < steps; step++) {
    sim.step();
    if (sim.time.tick % sim.config.time.ticksPerDay === 0) demography.observe(sim.peopleById.values(), sim.time.tick);
  }
  const demographicResult = demography.finish(sim.peopleById.values(), sim.time.tick);
  const finalFish = sim.nodes.filter(node => initialFishIds.has(node.id));
  const report = {
    seed, arm, steps, initialHash, reach,
    harvestEvents: telemetry.get('harvest_fish'),
    shallowHarvestEvents: telemetry.get('harvest_fish_shallows'),
    fishNutrition: telemetry.get('compact_food_nutrition_fish'),
    fishWorkTicks: telemetry.get('compact_food_work_ticks_fish'),
    populationStart: initialPopulation.length,
    foundersSurvived: sim.livingPeople().filter(person => founders.has(person.id)).length,
    founderSurvivalRate: initialPopulation.length
      ? sim.livingPeople().filter(person => founders.has(person.id)).length / initialPopulation.length : null,
    populationEnd: sim.livingPeople().length,
    hungerMeanEnd: sim.livingPeople().length
      ? sim.livingPeople().reduce((sum, person) => sum + person.needs.hunger, 0) / sim.livingPeople().length : null,
    starvationDeaths: demographicResult.causes.starvation ?? 0,
    deathsByCause: demographicResult.causes,
    fishStockEnd: finalFish.reduce((sum, node) => sum + node.amount, 0),
    depletedFishNodesEnd: finalFish.filter(node => node.depleted).length,
    fishNodesRemaining: finalFish.length,
  };
  telemetry.disable(); telemetry.reset();
  return report;
}

const seeds = ['century', 'alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta', 'eta', 'theta', 'iota',
  'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau'].slice(0, seedsN);
const rows: ReturnType<typeof runArm>[] = [];
mkdirSync(outputDir, { recursive: true });
const metadata = {
  createdAt: new Date().toISOString(),
  design: 'Paired geographic fishers cohort; salt-shallow one-comarca start selected from an Iberian coastal search on earth-12000-bce; 9000 ticks/arm; fish placement only differs for nonreserved tiles: shipped Gaussian-weighted vs uniform without replacement. Same geographic fish stream, fish quota, center/reservation pass, config and non-fish initial state. Headless focus uses the first living founder band, matching simcheck.',
  steps, seeds, start, map: mapSource.entry, resourceProfile, sourceHashes,
};
writeFileSync(resolve(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
for (const seed of seeds) {
  const gaussian = runArm(seed, 'gaussian');
  rows.push(gaussian);
  console.log(JSON.stringify({ done: `${seed}/gaussian`, fishNodes: gaussian.reach.fishNodes, hash: gaussian.initialHash }));
  const uniform = runArm(seed, 'uniform');
  rows.push(uniform);
  console.log(JSON.stringify({ done: `${seed}/uniform`, fishNodes: uniform.reach.fishNodes, hash: uniform.initialHash }));
  if (gaussian.initialHash !== uniform.initialHash || gaussian.reach.fishNodes !== uniform.reach.fishNodes ||
      gaussian.reach.fishStock !== uniform.reach.fishStock || gaussian.reach.adults !== uniform.reach.adults) {
    throw new Error(`paired initial state mismatch for ${seed}`);
  }
  const seedResult = { seed, initialHash: gaussian.initialHash, gaussian, uniform };
  const seedJson = JSON.stringify(seedResult, null, 2) + '\n';
  const seedSha = hash(seedJson);
  writeFileSync(resolve(outputDir, `${seed}.json`), seedJson);
  writeFileSync(resolve(outputDir, `${seed}.sha256`), `${seedSha}  ${seed}.json\n`);
  console.log(JSON.stringify({ done: `${seed}/pair`, initialSha256: gaussian.initialHash, outputSha256: seedSha }));
  writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify({ metadata, rows }, null, 2) + '\n');
}

const totals = (arm: Arm) => rows.filter(row => row.arm === arm).reduce((total, row) => {
  for (const key of ['harvestEvents', 'shallowHarvestEvents', 'fishNutrition', 'fishWorkTicks',
    'populationStart', 'foundersSurvived', 'populationEnd', 'starvationDeaths', 'fishStockEnd', 'depletedFishNodesEnd'] as const) {
    total[key] = (total[key] ?? 0) + row[key];
  }
  total.seeds++;
  return total;
}, { seeds: 0 } as Record<string, number>);
const summary = { metadata, arms: { gaussian: totals('gaussian'), uniform: totals('uniform') }, rows };
const summaryJson = JSON.stringify(summary, null, 2) + '\n';
writeFileSync(resolve(outputDir, 'results.json'), summaryJson);
writeFileSync(resolve(outputDir, 'results.sha256'), `${hash(summaryJson)}  results.json\n`);
console.log(JSON.stringify(summary, null, 2));
