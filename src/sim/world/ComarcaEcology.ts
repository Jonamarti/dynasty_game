/**
 * Detached daily ecology for a parked comarca. This is a reducer over a dated
 * TileLedgerEntry, not a Simulation and not an authority over people or bands.
 */
import type { TimeConfig } from '../core/Config.ts';
import { TimeManager, type Season } from '../core/TimeManager.ts';
import { RNG, type RngSnapshot } from '../core/RNG.ts';
import { IdSpace, type IdSpaceSnapshot } from '../core/IdSpace.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { World } from '../core/World.ts';
import { advanceGrass } from '../core/Grass.ts';
import { advanceSnowDepth } from '../core/Snow.ts';
import { ForestSystem } from '../systems/ForestSystem.ts';
import { WildlifeSystem } from '../systems/WildlifeSystem.ts';
import { BUSHES, type BushSpecies } from '../entities/ResourceNode.ts';
import { Tree } from '../entities/Tree.ts';
import { Animal } from '../entities/Animal.ts';
import { Inventory } from '../entities/Item.ts';
import { isStructure, type Building } from '../entities/Building.ts';
import { TileLedger, comarcaIdentityAt, type TileLedgerEntry } from '../persistence/TileLedger.ts';
import { toWorldTerrainRecord } from '../persistence/WorldRecords.ts';
import { fromWorldObjectRecord, type WorldObjectRecord, type WorldObjectState } from '../persistence/WorldObjectRecords.ts';
import { toObjectGraph } from '../persistence/GraphRecords.ts';
import { comarcaResourceProfile, foodModel, type ComarcaResourceProfile, type SourceRations } from './ResourceProfile.ts';
import type { WorldGeography } from './WorldGeography.ts';
import type { Person } from '../entities/Person.ts';

export const COMARCA_NEGLECT_LIFETIME_YEARS = 60;

/** Physical wear budget per day for a complete structure left abandoned. */
export function abandonedBuildingNeglectPerDay(building: Building, daysPerYear: number): number {
  if (!building.complete || !isStructure(building.def) || building.durability === null || building.ruined) return 0;
  return building.def.workTicks / (daysPerYear * COMARCA_NEGLECT_LIFETIME_YEARS);
}

export interface ComarcaEcologyRecord {
  readonly recordType: 'ComarcaEcologyRecord';
  readonly version: 1;
  readonly entry: TileLedgerEntry;
  readonly time: TimeConfig;
  readonly spoilRate: number;
  readonly snowDepth: number;
  readonly forestRng: RngSnapshot;
  readonly wildlifeRng: RngSnapshot;
  readonly ecologyRng: RngSnapshot;
  readonly ids: IdSpaceSnapshot;
  /** Fractional births retained by herd, as in WildlifeSystem.daily(). */
  readonly wildlifeOwed: readonly (readonly [number, number])[];
}

export interface ComarcaEcologyResult {
  readonly record: ComarcaEcologyRecord;
  readonly entry: TileLedgerEntry;
  readonly profile: ComarcaResourceProfile & {
    readonly physical: { readonly berryStock: number; readonly fishStock: number; readonly wildGrainStock: number;
      readonly livingWildlife: number; readonly livingHerds: number };
  };
}

function invalid(message: string): never { throw new TypeError(`Invalid ComarcaEcology: ${message}`); }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) invalid('unknown or missing fields');
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function validateRecord(value: unknown): ComarcaEcologyRecord {
  if (!object(value)) invalid('record must be an object');
  exact(value, ['recordType', 'version', 'entry', 'time', 'spoilRate', 'snowDepth', 'forestRng', 'wildlifeRng', 'ecologyRng', 'ids', 'wildlifeOwed']);
  if (value.recordType !== 'ComarcaEcologyRecord' || value.version !== 1) invalid('expected record v1');
  const entry = TileLedger.fromRecord({ recordType: 'TileLedger', version: 1, entries: [value.entry] }).at((value.entry as TileLedgerEntry).identity);
  if (!entry) invalid('missing tile entry');
  const time = value.time as TimeConfig;
  const clock = TimeManager.fromSnapshot({ version: 1, tick: entry.lastAdvancedTick, config: time });
  if (clock.day !== entry.lastAdvancedDay) invalid('calendar date disagrees with tile entry');
  if (typeof value.spoilRate !== 'number' || !Number.isFinite(value.spoilRate) || value.spoilRate < 0) invalid('spoil rate');
  if (typeof value.snowDepth !== 'number' || !Number.isFinite(value.snowDepth) || value.snowDepth < 0) invalid('snow depth');
  RNG.fromSnapshot(value.forestRng); RNG.fromSnapshot(value.wildlifeRng); RNG.fromSnapshot(value.ecologyRng); IdSpace.fromSnapshot(value.ids);
  if (!Array.isArray(value.wildlifeOwed)) invalid('wildlife birth carry');
  const owed = new Map<number, number>();
  for (const pair of value.wildlifeOwed) {
    if (!Array.isArray(pair) || pair.length !== 2 || !Number.isSafeInteger(pair[0]) || pair[0] < 0 ||
      typeof pair[1] !== 'number' || !Number.isFinite(pair[1]) || pair[1] < 0 || pair[1] >= 1 || owed.has(pair[0])) invalid('wildlife birth carry entry');
    owed.set(pair[0], pair[1]);
  }
  return { recordType: 'ComarcaEcologyRecord', version: 1, entry, time: { ...time }, spoilRate: value.spoilRate,
    snowDepth: value.snowDepth, forestRng: clone(value.forestRng as RngSnapshot), wildlifeRng: clone(value.wildlifeRng as RngSnapshot), ecologyRng: clone(value.ecologyRng as RngSnapshot),
    ids: clone(value.ids as IdSpaceSnapshot), wildlifeOwed: [...owed].sort((a, b) => a[0] - b[0]) };
}

function objectRecord(state: WorldObjectState, tick: number): WorldObjectRecord {
  const graphState = {
    nodes: state.nodes, nodesById: state.nodesById,
    buildings: state.buildings, buildingsById: state.buildingsById,
    trees: state.trees, treesById: state.treesById,
    piles: state.piles, pilesById: state.pilesById,
    corpses: state.corpses, corpsesById: state.corpsesById,
    animals: state.animals, animalsById: state.animalsById,
    inscriptions: state.inscriptions, inscriptionsById: state.inscriptionsById,
  };
  return { recordType: 'WorldObjectRecord', version: 1, lastAdvancedTick: tick, graph: toObjectGraph(graphState) };
}

/**
 * Versioned, JSON-safe ecology checkpoint. Callers create one when a comarca
 * leaves detail and persist every returned record before dropping the old one.
 */
export class ComarcaEcology {
  private state: ComarcaEcologyRecord;

  constructor(input: ComarcaEcologyRecord) { this.state = validateRecord(input); }

  static start(entry: TileLedgerEntry, options: { time: TimeConfig; spoilRate: number; snowDepth: number; ids: IdSpaceSnapshot }): ComarcaEcology {
    const identity = JSON.stringify(entry.identity);
    const base = `m15-comarca-ecology:v1:${identity}`;
    return new ComarcaEcology({ recordType: 'ComarcaEcologyRecord', version: 1, entry: clone(entry),
      time: { ...options.time }, spoilRate: options.spoilRate, snowDepth: options.snowDepth,
      forestRng: new RNG(`${base}:forest`).snapshot(), wildlifeRng: new RNG(`${base}:wildlife-move`).snapshot(),
      ecologyRng: new RNG(`${base}:wildlife-ecology`).snapshot(), ids: clone(options.ids), wildlifeOwed: [] });
  }

  static fromRecord(value: unknown): ComarcaEcology { return new ComarcaEcology(validateRecord(value)); }
  toRecord(): ComarcaEcologyRecord { return clone(this.state); }

  /** Advance existing terrain and objects through the game's passive event calendars. */
  advanceTo(targetTick: number, geography: WorldGeography, services?: {
    ids?: IdSpace; peopleById?: Map<number, Person>; inhabitedBands?: ReadonlySet<number>;
    onTick?: (tick: number, clock: TimeManager, world: World, objects: WorldObjectState) => void;
  }): ComarcaEcologyResult {
    if (!Number.isSafeInteger(targetTick) || targetTick < this.state.entry.lastAdvancedTick) invalid('target tick moved backwards');
    const entry = this.state.entry;
    const expectedIdentity = comarcaIdentityAt(geography, entry.identity.cx, entry.identity.cy);
    if (JSON.stringify(expectedIdentity) !== JSON.stringify(entry.identity)) invalid('geography does not match saved comarca');
    const clock = TimeManager.fromSnapshot({ version: 1, tick: entry.lastAdvancedTick, config: this.state.time });
    const tileLedger = TileLedger.fromRecord({ recordType: 'TileLedger', version: 1, entries: [entry] });
    const detached = tileLedger.hydrate(entry.identity, { tick: entry.lastAdvancedTick, day: entry.lastAdvancedDay }, services?.peopleById ?? new Map<number, Person>());
    const world = detached.world;
    const objects = detached.objects;
    const ids = services?.ids ?? IdSpace.fromSnapshot(this.state.ids);
    const forestRng = RNG.fromSnapshot(this.state.forestRng);
    const wildlifeRng = RNG.fromSnapshot(this.state.wildlifeRng);
    const ecologyRng = RNG.fromSnapshot(this.state.ecologyRng);
    const forest = new ForestSystem();
    const wildlife = new WildlifeSystem();
    const wildlifeOwed = new Map<number, number>(this.state.wildlifeOwed.map(([id, value]) => [id, value]));
    const ticksPerDay = this.state.time.ticksPerDay;
    const daysPerYear = this.state.time.daysPerSeason * 4;
    const peopleHash = new SpatialHash<Person>(8); // Parked comarcas have no live people to interact with.
    const animalHash = new SpatialHash<Animal>(8);
    let snowDepth = this.state.snowDepth;

    const sweepSpoilage = (inventory: Inventory, factor: number): void => {
      if (this.state.spoilRate <= 0) return; // Mirrors Simulation's dormant rate-0 contract.
      inventory.spoil(ticksPerDay * this.state.spoilRate, () => factor, true);
    };
    const daily = (): void => {
      snowDepth = advanceSnowDepth(snowDepth, clock.temperature);
      advanceGrass(world, clock.dailyGrowth, snowDepth);
      for (const node of objects.nodes) {
        if (node.species !== null && node.amount > 0 && BUSHES[node.species as BushSpecies] &&
          !BUSHES[node.species as BushSpecies].ripens.includes(clock.season) &&
          !BUSHES[node.species as BushSpecies].holds.includes(clock.season)) node.amount = 0;
      }
      const forestResult = forest.daily(objects.trees, { world, rng: forestRng, season: clock.season,
        growth: clock.dailyGrowth, treeHash, ids });
      for (const tree of forestResult.died) objects.treesById.delete(tree.id);
      for (const tree of forestResult.born) { objects.trees.push(tree); objects.treesById.set(tree.id, tree); }
      objects.trees = objects.trees.filter(tree => tree.standing);
      objects.treesById = new Map(objects.trees.map(tree => [tree.id, tree]));
      treeHash.rebuild(objects.trees);
      for (const building of objects.buildings) {
        if (building.complete && building.crop) building.crop.advance(clock.day, clock.growth);
        const neglect = services?.inhabitedBands?.has(building.ownerBandId) ? 0 : abandonedBuildingNeglectPerDay(building, daysPerYear);
        if (neglect > 0) building.damage(neglect);
        const keeps = building.def.preserves ?? 1;
        sweepSpoilage(building.store, keeps);
        sweepSpoilage(building.delivered, keeps);
      }
      for (const pile of objects.piles) sweepSpoilage(pile.contents, 1);
      world.soil.recover(1);
      const born = this.dailyWildlifeBirths(objects.animals, world, clock, wildlife, wildlifeOwed, wildlifeRng, ids);
      for (const calf of born) { objects.animals.push(calf); objects.animalsById.set(calf.id, calf); }
    };
    const treeHash = new SpatialHash<Tree>(8);
    treeHash.rebuild(objects.trees);

    for (let tick = entry.lastAdvancedTick + 1; tick <= targetTick; tick++) {
      clock.tick = tick;
      if (tick % 20 === 0) {
        for (const node of objects.nodes) node.regrow(20, clock.growth, (entry.terrain.config.regrowthRate as number), clock.season);
      }
      // WildlifeSystem.update is called every Simulation tick; its per-animal
      // stagger is keyed by (tick + id), so skipping ticks would alter movement.
      animalHash.rebuild(objects.animals);
      wildlife.update(objects.animals, { ids, world, rng: wildlifeRng, tick, peopleHash, animalHash,
        ecologyRng, dailyGrowth: clock.dailyGrowth, isNight: clock.isNight,
        onStarved: animal => { animal.alive = false; }, onPredated: animal => { animal.alive = false; } });
      for (let i = objects.animals.length - 1; i >= 0; i--) if (!objects.animals[i]!.alive) {
        objects.animalsById.delete(objects.animals[i]!.id); objects.animals.splice(i, 1);
      }
      services?.onTick?.(tick, clock, world, objects);
      if (tick > 0 && tick % ticksPerDay === 0) daily();
    }    const day = clock.day;
    const updatedEntry: TileLedgerEntry = { recordType: 'TileLedgerEntry', version: 1, identity: clone(entry.identity),
      revision: entry.revision + (targetTick === entry.lastAdvancedTick ? 0 : 1), lastAdvancedTick: targetTick,
      lastAdvancedDay: day, terrain: toWorldTerrainRecord(world), objects: objectRecord(objects, targetTick) };
    const checkedEntry = TileLedger.fromRecord({ recordType: 'TileLedger', version: 1, entries: [updatedEntry] }).at(entry.identity)!;
    const nextState: ComarcaEcologyRecord = { ...this.state, entry: checkedEntry, snowDepth,
      forestRng: forestRng.snapshot(), wildlifeRng: wildlifeRng.snapshot(), ecologyRng: ecologyRng.snapshot(), ids: ids.snapshot(),
      wildlifeOwed: [...wildlifeOwed].sort((a, b) => a[0] - b[0]) };
    const checkedState = validateRecord(nextState);
    const profile = this.correctedProfile(checkedEntry, geography);
    this.state = checkedState;
    return { record: this.toRecord(), entry: clone(checkedEntry), profile };
  }

  private dailyWildlifeBirths(animals: Animal[], world: World, clock: TimeManager, wildlife: WildlifeSystem,
    owed: Map<number, number>, rng: RNG, ids: IdSpace): Animal[] {
    // Reuse WildlifeSystem.daily's exact persisted fractional carry by seeding
    // its private map at the boundary; this avoids both resetting births on JSON
    // reload and maintaining a second reproduction formula here.
    const system = wildlife as unknown as { owed: Map<number, number>; daily: WildlifeSystem['daily'] };
    system.owed.clear(); for (const [id, value] of owed) system.owed.set(id, value);
    const born = system.daily(animals, { ids, world, rng, tick: clock.tick, season: clock.season,
      peopleHash: new SpatialHash<Person>(8), animalHash: new SpatialHash<Animal>(8), dailyGrowth: clock.dailyGrowth });
    owed.clear(); for (const [id, value] of system.owed) owed.set(id, value);
    return born;
  }

  private correctedProfile(entry: TileLedgerEntry, geography: WorldGeography): ComarcaEcologyResult['profile'] {
    const base = comarcaResourceProfile(geography, entry.identity.cx, entry.identity.cy);
    const objects = fromWorldObjectRecord(entry.objects);
    let berryStock = 0, fishStock = 0, wildGrainStock = 0;
    let berryAvailable = 0, fishAvailable = 0;
    for (const node of objects.nodes) {
      const fraction = Math.max(0, Math.min(1, node.amount / Math.max(1, node.def.maxAmount)));
      if ((node.species === null || node.species in BUSHES) && node.kind === 'berries' && node.itemId === 'berries') { berryStock += node.amount; berryAvailable += fraction; }
      if (node.kind === 'fish') { fishStock += node.amount; fishAvailable += fraction; }
      if (node.kind === 'wild_grain') wildGrainStock += node.amount;
    }
    const herds = new Set(objects.animals.filter(a => a.alive && a.tamedBy === null && !a.def.predator).map(a => a.herdId));
    const counts = { bushes: berryAvailable, shoals: fishAvailable, herds: herds.size, wildGrainStands: objects.nodes.filter(n => n.kind === 'wild_grain' && n.amount > 0).length };
    const model = foodModel();
    const rations = {} as Record<Season, SourceRations>;
    let capacity = Infinity;
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      const gather = counts.bushes * model.perBush[season];
      const fish = counts.shoals * model.perShoal[season];
      const game = counts.herds * model.perHerd[season];
      const total = gather + fish + game;
      rations[season] = { gather, fish, game, total }; capacity = Math.min(capacity, total);
    }
    return { ...base, nodes: counts, rations, capacity,
      physical: { berryStock, fishStock, wildGrainStock, livingWildlife: objects.animals.filter(a => a.alive).length, livingHerds: herds.size } };
  }
}












