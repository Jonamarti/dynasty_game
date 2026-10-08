/**
 * What a comarca can give, as a function of its geography. M15 step 1a of the revised LOD
 * (docs/m15_simulation_lod.md section 0.2).
 *
 * Nobody generates the 128 by 128 tiles of a comarca the band is not standing in. The compact band model
 * (section 0.3) and the caravans of phase 36 still need to know how much food, fish, game, cereal and metal the
 * ground holds, so this module answers it from the geography alone: `comarcaResourceProfile(geography, x, y)`.
 * The function is the same for the real Earth and for a generated world; only `geography.profileAt` differs.
 *
 * ## Where the numbers come from (measured, not invented)
 *
 * 1. **Habitat** (how much of the comarca is ground a bush, a herd, a shoal or a metal can be on) is *measured*
 *    by `tools/compact-resources.ts`: it generates detailed one-comarca maps (the game's map since 2026-10-08)
 *    over the Earth maps and several generated worlds, gives each comarca a `ProfileKey` from its geography alone,
 *    counts the tiles that the generator's own habitat rules (`Habitat.ts`, the very predicates `Simulation` calls)
 *    accept in it, and averages per key. The committed result is `compact/MeasuredResources.ts`.
 * 2. **Density** (how many bushes, herds, shoals per habitat tile) is a *design choice measured against the
 *    quotas of the classic island*: the island places a fixed quota (280 bushes, 22 herds, 50 shoals, 35 cereal
 *    stands) on whatever habitat it has, so the tool sets the density to *the quota spread over the median map
 *    that has any of that habitat*. A median comarca therefore holds what the island holds; a richer one holds
 *    more (up to `NODE_CAP_FACTOR` times the quota) and a poorer one fewer. **Since step 1b the generator places
 *    exactly these counts** on a map that is one comarca (`profileOfStart` in `Simulation.ts`); the classic
 *    island and the inspection windows of other sizes keep the fixed quotas.
 * 3. **Food per node and season** is neither guessed nor tabulated: `foodModel()` runs the game's own
 *    `ResourceNode.regrow` on a real clock for each bush species and for a shoal, and reads the species and
 *    herd tables, so a retuned regrowth rate moves the profile with no regeneration.
 *
 * ## Units (what the compact band model should read)
 *
 * - **Rations**: one person's daily need, `needs.hungerRate x ticksPerDay` nutrition points (13.2 by default).
 *   `rations.<season>.<source>` is rations *per day*, per comarca, at the game's map
 *   (`PROFILE_SPAN` = 1: a comarca is the whole 128 by 128 tiles, as on the classic island). It is **potential**: what the plants regrow, the shoals
 *   restore and the herds replace, with every node stripped daily. It is not what a band takes. A band's reach,
 *   skill and tools set that fraction, and the compact model has to calibrate it (step 1c).
 * - **`capacity`**: people the comarca feeds through its leanest season *at that potential*, i.e. the smallest
 *   seasonal `total`. Multiply by the band's measured harvest share, never use it raw.
 * - **`arable`**: share of the comarca's tiles that are open or wooded ground fertile enough to farm (fertility
 *   above `GRAIN_FERTILITY_FLOOR`). `wildGrain` says whether the region carries wild cereal at all (the same
 *   gate the generator applies); `cultivable` needs both.
 * - **`minerals`**: which of flint, copper, tin, gold, obsidian, salt and bog iron the region carries.
 *
 * ## Cost
 *
 * Nine elevation samples, one river lookup and a table read; nothing is stored. The measured cost is in
 * docs/m15_simulation_lod.md section 0.2 (Avance). Computed on demand, never cached.
 */
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { TimeManager, SEASONS, type Season } from '../core/TimeManager.ts';
import { ResourceNode, BUSHES, BUSH_SPECIES, type BushSpecies } from '../entities/ResourceNode.ts';
import { SPECIES_DEFS, PREY_SPECIES } from '../entities/Animal.ts';
import { ITEMS } from '../entities/Item.ts';
import { RNG } from '../core/RNG.ts';
import { MEASURED_RESOURCES } from '../compact/MeasuredResources.ts';
import { beachBandWidth, classifyGeographicTerrain } from './Habitat.ts';
import { profileHasResource } from './GeographicResources.ts';
import { regionalMoisture, riverCorridorAt, worldElevationAt } from './LocalGeography.ts';
import { WORLD_FEATURE } from './WorldFeatureSeeds.ts';
import type { WorldGeography, WorldGeographyProfile } from './WorldGeography.ts';

/**
 * Comarcas per side of the detailed window the game opens (`GLOBE_SPAN` in main.ts). The table is measured here. It was 4
 * until 2026-10-08, when the owner decided that each cell of the world map is one playable map: a comarca is now the whole
 * 128 by 128 tiles, which is also what the classic island always was.
 */
export const PROFILE_SPAN = 1;
/** Tiles in one comarca at that span: the detailed World is `world.width` by `world.height` over span by span comarcas. */
export const TILES_PER_COMARCA = DEFAULT_CONFIG.world.width * DEFAULT_CONFIG.world.height / (PROFILE_SPAN * PROFILE_SPAN);
/**
 * No kind of node outnumbers its quota by more than this. The density is nodes per habitat tile, set so that the median
 * window reproduces the quota, so a map that is nearly all one habitat (a coast of shallows, a berry heath) would ask for
 * many times the quota: the shallows of a median window with any are 121 tiles and a long coast has thousands. A cap is a
 * design choice, not a measurement: three times is what the fixed-quota generator's richest window could hold without the
 * map filling with nodes (and without the step slowing down with them).
 */
export const NODE_CAP_FACTOR = 3;
/** Nutrition points one person's day costs: the unit of a ration. */
export const RATION_NUTRITION = DEFAULT_CONFIG.needs.hungerRate * DEFAULT_CONFIG.time.ticksPerDay;

// ---------------------------------------------------------------------------
// The key: what the geography says about a comarca, cheaply
// ---------------------------------------------------------------------------

/**
 * `sea`: open water; `coast`, `bay` and `offshore`: the sea reaches into the comarca, holding up to a third of it, up to two
 * thirds, and more (counted on the nine samples below); `strand` and `shore`: flats in the beach band that
 * touch no sea, the lower half and the upper half of the band (the first version called them `coast` and predicted
 * a coastline for a window with no water in it; the lower half is where relief noise dips under the water line);
 * `low`, `hill`, `rock`: the generator's own bands.
 */
export const RELIEFS = ['sea', 'offshore', 'bay', 'coast', 'strand', 'shore', 'low', 'hill', 'rock'] as const;
export type Relief = (typeof RELIEFS)[number];
/** Fresh water the geography puts in the comarca: nothing, a stream, a broad river, or a lake. */
export const WATERS = ['dry', 'stream', 'major', 'lake'] as const;
export type WaterClass = (typeof WATERS)[number];

/**
 * Wetness classes, cut where the generator's behaviour changes (`Habitat.ts` floors, `classifyTerrain`'s forest
 * line at 0.52, and the hydrology's tributary line at 0.6 and its lake line at 0.64), so two comarcas in one class
 * are the same ground to the generator. Class 0 is barren, 5 is saturated.
 */
export const MOISTURE_EDGES = [0.3, 0.42, 0.52, 0.6, 0.64] as const;
export function moistureClassOf(moisture: number): number {
  // The generator stores moisture in a Float32Array and compares that, so a value that sits on an edge (steppe is
  // exactly 0.30) is compared in float32 here too.
  const m = Math.fround(moisture);
  let cls = 0;
  for (const edge of MOISTURE_EDGES) if (m > edge) cls++;
  return cls;
}

export interface ProfileKey {
  readonly relief: Relief;
  readonly moisture: number;
  readonly water: WaterClass;
}
export const keyText = (k: ProfileKey): string => `${k.relief}|${k.moisture}|${k.water}`;

type Mapped = Exclude<WorldGeography, { kind: 'legacyIsland' }>;
type MappedProfile = Exclude<WorldGeographyProfile, { kind: 'legacyIsland' }>;

const WORLD = DEFAULT_CONFIG.world;
/** Offsets inside a comarca at which the relief is sampled: a 3 by 3 lattice, enough to see a coast cross it. */
const LATTICE = [0.17, 0.5, 0.83] as const;
/** A river's corridor edge this close to a lattice point (in comarcas) counts as running through the comarca. */
const RIVER_REACH = 0.3;
/** One tile's footprint at the game's window span, the floor of any corridor (see `createLocalGeography`). */
const TILE_RADIUS = Math.hypot(PROFILE_SPAN / WORLD.width, PROFILE_SPAN / WORLD.height) / 2;

/** The key of the comarca whose south-west corner is the integer cell (cx, cy). Pure. */
export function profileKeyOf(geography: Mapped, cx: number, cy: number): ProfileKey {
  const centre = geography.profileAt(cx + 0.5, cy + 0.5);
  const moisture = moistureClassOf(regionalMoisture(centre));
  let below = 0;
  let sum = 0;
  let nearestRiver: { distance: number; major: boolean } | null = null;
  for (const oy of LATTICE) for (const ox of LATTICE) {
    const elev = worldElevationAt(geography, cx + ox, cy + oy, WORLD.waterLevel, WORLD.metresPerUnit);
    if (elev < WORLD.waterLevel) below++;
    sum += elev;
    const river = riverCorridorAt(geography, cx + ox, cy + oy, TILE_RADIUS, WORLD.waterLevel, WORLD.metresPerUnit);
    if (river) {
      const reach = river.distance - river.halfWidth;
      if (!nearestRiver || reach < nearestRiver.distance) nearestRiver = { distance: reach, major: river.major };
    }
  }
  let relief: Relief;
  if (below === LATTICE.length * LATTICE.length) relief = 'sea';
  // How much of the comarca the sea holds: one comarca is a whole map now, and a coast that is a thin strip of water and one
  // that is nearly all sea are not the same ground (the first single-comarca table averaged them: land share 0.51 against 0.13).
  else if (below > 0) relief = below <= 3 ? 'coast' : below <= 6 ? 'bay' : 'offshore';
  else {
    const band = classifyGeographicTerrain(sum / (LATTICE.length ** 2), 1, geography.kind, WORLD.waterLevel, WORLD.metresPerUnit);
    const lowerHalf = sum / (LATTICE.length ** 2) - WORLD.waterLevel < beachBandWidth(geography.kind, WORLD.metresPerUnit) / 2;
    relief = band === 'beach' ? (lowerHalf ? 'strand' : 'shore') : band === 'hills' ? 'hill' : band === 'rock' ? 'rock' : 'low';
  }
  return { relief, moisture, water: waterClassOf(geography, centre, nearestRiver) };
}

function waterClassOf(geography: Mapped, centre: MappedProfile,
  river: { distance: number; major: boolean } | null): WaterClass {
  if (geography.kind === 'earth' && centre.kind === 'earth' && (centre.features & WORLD_FEATURE.lake) !== 0) return 'lake';
  // `distance` is already measured from the corridor's edge, so the reach is the slack past it.
  if (river && river.distance <= RIVER_REACH) return river.major ? 'major' : 'stream';
  return 'dry';
}

// ---------------------------------------------------------------------------
// The measured table
// ---------------------------------------------------------------------------

/** What `tools/compact-resources.ts` counts per comarca, as a share of its tiles. Order is the table's column order. */
export const HABITAT_FIELDS = [
  'berry', 'grain', 'arable', 'herd', 'forage', 'predator', 'hills', 'rock', 'freshWater', 'saltWater', 'shallowFresh', 'shallowSalt',
] as const;
export type HabitatField = (typeof HABITAT_FIELDS)[number];
export type Habitat = Readonly<Record<HabitatField, number>>;

/** The sources of the quotas the generator spreads: the table's `density` is these over the median window. */
export interface DensityEntry {
  /** Nodes (or herds) the generator places per window, from the config at measurement. */
  readonly quota: number;
  /** Median number of habitat tiles, over the windows that have any. */
  readonly medianTiles: number;
  /** Nodes per habitat tile: `quota / medianTiles`. */
  readonly perTile: number;
}
export interface MeasuredResourceTable {
  readonly source: { readonly windows: number; readonly cells: number; readonly sources: readonly string[]; readonly span: number };
  /** key -> [cells measured, share of tiles for each `HABITAT_FIELDS` entry]. */
  readonly rows: Readonly<Record<string, readonly [number, ...number[]]>>;
  readonly density: Readonly<Record<'berries' | 'grain' | 'herds' | 'fish', DensityEntry>>;
}

/** A row measured on fewer comarcas than this is too noisy to trust alone; the nearest well-measured rows stand in. */
export const MIN_ROW_CELLS = 8;
const WATER_FIELDS: readonly HabitatField[] = ['freshWater', 'saltWater', 'shallowFresh', 'shallowSalt'];

/**
 * The habitat of a key. A row measured on enough comarcas is used whole. A combination the sample met too rarely
 * (or never) is assembled from two nearer neighbours, because land and water answer to different parts of the key:
 * the land fields (what grows and grazes) come from the nearest well-measured row of the same relief and wetness
 * class, preferring the same water; the water fields (channels, shoals) from the nearest row of the same relief
 * and water class, preferring the same wetness. Relief is never traded: a rock face is not a plain.
 */
function habitatRow(key: ProfileKey, table: MeasuredResourceTable): { share: Habitat; cells: number; exact: boolean } {
  const rows = table.rows;
  const own = rows[keyText(key)];
  if (own && own[0] >= MIN_ROW_CELLS) return { share: shareOf(own), cells: own[0], exact: true };
  let land: readonly number[] | undefined, water: readonly number[] | undefined;
  let bestLand = Infinity, bestWater = Infinity;
  for (const [text, candidate] of Object.entries(rows)) {
    if (candidate[0] < MIN_ROW_CELLS) continue;
    const [relief, moisture, kind] = text.split('|') as [Relief, string, WaterClass];
    if (relief !== key.relief) continue;
    const wetnessGap = Math.abs(Number(moisture) - key.moisture);
    const landDistance = wetnessGap * 10 + (kind === key.water ? 0 : kind === 'dry' ? 1 : 2);
    const waterDistance = (kind === key.water ? 0 : 10) + wetnessGap;
    if (landDistance < bestLand) { bestLand = landDistance; land = candidate; }
    if (waterDistance < bestWater) { bestWater = waterDistance; water = candidate; }
  }
  if (!land || !water) return { share: ZERO_HABITAT, cells: 0, exact: false };
  const a = shareOf(land), b = shareOf(water);
  const share = { ...a } as Record<HabitatField, number>;
  for (const f of WATER_FIELDS) share[f] = b[f];
  return { share, cells: land[0], exact: false };
}

function shareOf(row: readonly number[]): Habitat {
  const share = {} as Record<HabitatField, number>;
  HABITAT_FIELDS.forEach((f, i) => { share[f] = row[i + 1]!; });
  return share;
}
const ZERO_HABITAT: Habitat = Object.freeze(Object.fromEntries(HABITAT_FIELDS.map(f => [f, 0])) as Record<HabitatField, number>);

// ---------------------------------------------------------------------------
// Food per node and season, read off the game's own rules
// ---------------------------------------------------------------------------

type Seasonal = Readonly<Record<Season, number>>;
export interface FoodModel {
  /** Rations a day one bush gives in each season, weighted over the species the generator plants. */
  readonly perBush: Seasonal;
  /** Rations a day one fishing spot gives. */
  readonly perShoal: Seasonal;
  /** Rations a day one herd replaces (births, spread over the year); meat is not seasonal. */
  readonly perHerd: Seasonal;
}

/**
 * Runs `ResourceNode.regrow` on a real clock, two years, stripping the node bare at the start of every day, and
 * reads the second year. A bush that `holds` its fruit (the dog rose through winter and spring) gives that
 * standing crop, left unpicked, spread over the seasons it holds. Deterministic; the one RNG built here is
 * handed to a node constructor that needs one and whose draw is then overwritten.
 */
export function buildFoodModel(): FoodModel {
  const time = DEFAULT_CONFIG.time;
  const ticksPerDay = time.ticksPerDay, daysPerSeason = time.daysPerSeason;
  const daysPerYear = daysPerSeason * 4;
  const berryRations = ITEMS.berries!.nutrition / RATION_NUTRITION;
  const fishRations = ITEMS.fish!.nutrition / RATION_NUTRITION;
  const meatRations = ITEMS.meat!.nutrition / RATION_NUTRITION;
  const rng = new RNG('resource-profile:food-model');

  /** Units taken per day, per season of the second year, from a node stripped daily; plus the unpicked stock at each day. */
  const run = (make: () => ResourceNode, strip: boolean) => {
    const clock = new TimeManager({ ...time, startDay: 0 });
    const node = make();
    node.amount = 0;
    const taken: Record<Season, number> = { spring: 0, summer: 0, autumn: 0, winter: 0 };
    const stockAtSeasonStart: Record<Season, number> = { spring: 0, summer: 0, autumn: 0, winter: 0 };
    for (let tick = 0; tick < 2 * daysPerYear * ticksPerDay; tick++) {
      if (tick % ticksPerDay === 0) {
        const year2 = tick >= daysPerYear * ticksPerDay;
        const day = Math.floor(tick / ticksPerDay);
        if (year2 && day % daysPerSeason === 0) stockAtSeasonStart[clock.season] = node.amount;
        if (strip) { const n = node.take(node.amount); if (year2) taken[clock.season] += n; }
      }
      clock.advance();
      if (clock.tick % 20 === 0) node.regrow(20, clock.growth, 1, clock.season);
    }
    return { taken, stockAtSeasonStart };
  };

  const perBush: Record<Season, number> = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  const weightSum = BUSH_SPECIES.reduce((s, sp) => s + BUSHES[sp].weight, 0);
  for (const species of BUSH_SPECIES) {
    const make = () => { const n = new ResourceNode('berries', 0, 0, rng); n.species = species as BushSpecies; return n; };
    const stripped = run(make, true);
    const unpicked = run(make, false);
    const holds = SEASONS.filter(s => BUSHES[species].holds.includes(s));
    // The crop standing when the first held season opens, shared out over every season it is held.
    const standing = holds.length > 0 ? unpicked.stockAtSeasonStart[holds[0]!] : 0;
    for (const season of SEASONS) {
      const flow = stripped.taken[season] / daysPerSeason;
      const held = holds.includes(season) ? standing / (holds.length * daysPerSeason) : 0;
      perBush[season] += BUSHES[species].weight / weightSum * (flow + held) * berryRations;
    }
  }
  const shoal = run(() => new ResourceNode('fish', 0, 0, rng), true);
  const perShoal = Object.fromEntries(SEASONS.map(s => [s, shoal.taken[s] / daysPerSeason * fishRations])) as Record<Season, number>;

  // A herd replaces, each spring, `fecundity` young per member per day over the season; that offtake in meat,
  // averaged over the three prey species the generator picks with equal chance, and spread over the whole year.
  let herdRations = 0;
  for (const id of PREY_SPECIES) {
    const def = SPECIES_DEFS[id];
    herdRations += def.herdSize * def.fecundity * daysPerSeason * def.meat * meatRations / daysPerYear / PREY_SPECIES.length;
  }
  const perHerd = Object.fromEntries(SEASONS.map(s => [s, herdRations])) as Record<Season, number>;
  return { perBush, perShoal, perHerd };
}

let FOOD: FoodModel | null = null;
export function foodModel(): FoodModel { return FOOD ??= buildFoodModel(); }

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

export const MINERALS = ['flint', 'copper', 'tin', 'gold', 'obsidian', 'salt', 'iron'] as const;
export type Mineral = (typeof MINERALS)[number];

export interface SourceRations { readonly gather: number; readonly fish: number; readonly game: number; readonly total: number }

export interface ComarcaResourceProfile {
  readonly key: ProfileKey;
  /** Share of the comarca's tiles that are each kind of habitat (measured). */
  readonly habitat: Habitat;
  /** Node counts per comarca: what the habitat holds at the table's density. */
  readonly nodes: { readonly bushes: number; readonly shoals: number; readonly herds: number; readonly wildGrainStands: number };
  /** Potential rations per day, per season, by source. See the module header for what "potential" means. */
  readonly rations: Readonly<Record<Season, SourceRations>>;
  /** People the leanest season feeds at that potential. */
  readonly capacity: number;
  readonly arable: number;
  readonly wildGrain: boolean;
  readonly cultivable: boolean;
  readonly minerals: readonly Mineral[];
  /** False when the key had no measured row and the nearest was used (or none existed). */
  readonly measured: boolean;
}

/** A comarca whose arable share is at least this is worth sowing. A convention, not a measurement. */
export const CULTIVABLE_ARABLE_SHARE = 0.25;

/**
 * Nodes and potential rations a habitat holds. Exported so the measuring tool can print the table in food and so the
 * profile has exactly one place where habitat becomes food.
 */
export function foodFromHabitat(share: Habitat, wildGrain: boolean, table: MeasuredResourceTable = MEASURED_RESOURCES) {
  const tiles = (f: HabitatField): number => share[f] * TILES_PER_COMARCA;
  const d = table.density;
  const capped = (count: number, entry: DensityEntry): number => Math.min(count, NODE_CAP_FACTOR * entry.quota);
  const nodes = {
    bushes: capped(tiles('berry') * d.berries.perTile, d.berries),
    shoals: capped((tiles('shallowFresh') + tiles('shallowSalt')) * d.fish.perTile, d.fish),
    // Herds are counted from the grass the comarca can carry, not from where the generator happens to drop them:
    // it drops the full quota on desert "grass" too, where a herd would starve down to what the sward feeds.
    herds: capped(tiles('forage') * d.herds.perTile, d.herds),
    // Stands exist only where the region carries wild cereal (the generator's gate).
    wildGrainStands: wildGrain ? capped(tiles('grain') * d.grain.perTile, d.grain) : 0,
  };
  const food = foodModel();
  const rations = {} as Record<Season, SourceRations>;
  let lean = Infinity;
  for (const season of SEASONS) {
    const gather = nodes.bushes * food.perBush[season];
    const fish = nodes.shoals * food.perShoal[season];
    const game = nodes.herds * food.perHerd[season];
    const total = gather + fish + game;
    rations[season] = { gather, fish, game, total };
    lean = Math.min(lean, total);
  }
  return { nodes, rations, lean };
}

/**
 * The resource profile of the comarca whose south-west corner is the integer cell (cx, cy). Pure and
 * deterministic: the same geography and cell always give the same profile, and nothing is drawn from any stream.
 */
export function comarcaResourceProfile(
  geography: WorldGeography, cx: number, cy: number, table: MeasuredResourceTable = MEASURED_RESOURCES,
): ComarcaResourceProfile {
  if (geography.kind === 'legacyIsland') throw new RangeError('The classic island has no global comarcas to profile');
  const key = profileKeyOf(geography, cx, cy);
  const centre = geography.profileAt(cx + 0.5, cy + 0.5);
  const { share, exact } = habitatRow(key, table);
  const wildGrain = profileHasResource(geography, centre, 'wild_grain');
  const { nodes, rations, lean } = foodFromHabitat(share, wildGrain, table);
  const minerals: Mineral[] = [];
  for (const [mineral, kind] of [['flint', 'flint'], ['copper', 'native_copper'], ['tin', 'tin_ore'], ['gold', 'gold']] as const) {
    if (profileHasResource(geography, centre, kind)) minerals.push(mineral);
  }
  if (hasRegionalFeature(geography, centre, 'obsidian')) minerals.push('obsidian');
  if (hasRegionalFeature(geography, centre, 'salt')) minerals.push('salt');
  // Bog iron lies on wet ground beside fresh water (`Simulation.suitsBiome`, 'iron_ore').
  if (key.moisture >= MOISTURE_EDGES.length && key.water !== 'dry') minerals.push('iron');
  const arable = share.arable;
  return {
    key, habitat: share, nodes, rations, capacity: lean, arable, wildGrain,
    cultivable: wildGrain && arable >= CULTIVABLE_ARABLE_SHARE, minerals, measured: exact,
  };
}

function hasRegionalFeature(geography: Mapped, centre: MappedProfile, name: 'obsidian' | 'salt'): boolean {
  if (geography.kind === 'random' && centre.kind === 'random') {
    return geography.map.regionAt(centre.regionX, centre.regionY).resources.includes(name);
  }
  if (centre.kind === 'earth') return (centre.features & WORLD_FEATURE[name]) !== 0;
  return false;
}

/** Sum of the comarcas of a window (one, at the game's map), for comparing with a generated World. */
export function windowResourceProfile(
  geography: WorldGeography, originX: number, originY: number, span = PROFILE_SPAN, table: MeasuredResourceTable = MEASURED_RESOURCES,
) {
  const cells: ComarcaResourceProfile[] = [];
  for (let y = 0; y < span; y++) for (let x = 0; x < span; x++) {
    cells.push(comarcaResourceProfile(geography, originX + x, originY + y, table));
  }
  const sum = (pick: (c: ComarcaResourceProfile) => number) => cells.reduce((s, c) => s + pick(c), 0);
  return {
    cells,
    bushes: sum(c => c.nodes.bushes), shoals: sum(c => c.nodes.shoals), herds: sum(c => c.nodes.herds),
    wildGrainStands: sum(c => c.nodes.wildGrainStands),
    habitat: Object.fromEntries(HABITAT_FIELDS.map(f => [f, sum(c => c.habitat[f]) / cells.length])) as Record<HabitatField, number>,
    rations: Object.fromEntries(SEASONS.map(s => [s, sum(c => c.rations[s].total)])) as Record<Season, number>,
  };
}

export { MEASURED_RESOURCES };
