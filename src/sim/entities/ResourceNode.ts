/**
 * A harvestable thing standing on a tile: a berry bush, a flint outcrop, a
 * fallen branch, a clay bank.
 *
 * Game is deliberately *not* one of these. It was, and that made hunting
 * identical to picking berries except for the skill it practised — two food
 * systems where one would do. Animals live in `entities/Animal.ts` and move.
 *
 * Nodes deplete and regrow rather than vanishing, so a band can exhaust the
 * ground around its camp and be forced to range further or move — which is the
 * pressure that later makes territory, migration and farming matter.
 */
import type { RNG } from '../core/RNG.ts';
import type { Season } from '../core/TimeManager.ts';
import { ITEMS } from './Item.ts';
import type { IdSpace } from '../core/IdSpace.ts';
import type { Tech } from '../knowledge/Tech.ts';

// `wild_grain` is appended rather than inserted, and it is spawned in a pass of
// its own on a stream of its own — see `Simulation.spawnWildGrain`. Adding it to
// `spawnResources`' plan array would have moved every herd and every person in
// every saved seed without the determinism test noticing, which is the trap
// `AGENTS.md` describes and `fish` already had to dodge.
export const RESOURCE_KINDS = [
  'berries', 'flint', 'sticks', 'reeds', 'clay', 'fish', 'wild_grain',
  // M15 phase 37 (M8.3). Appended, and spawned in a pass of their own on their
  // own stream (`Simulation.spawnOres`, `oreRng`) for the reason `wild_grain`
  // gives above: a new entry in `spawnResources`' plan would move every herd
  // and every person in every saved seed.
  'native_copper',
  // `mining`'s two: ore in the hill, which only somebody who digs can take.
  'copper_ore', 'tin_ore',
  // `goldwork`'s: the metal that lies in the gravels as metal.
  'gold',
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export interface ResourceDef {
  kind: ResourceKind;
  /** What one successful harvest yields. */
  itemId: string;
  maxAmount: number;
  /** Units restored per tick once depleted. Flint does not regrow. */
  regrowPerTick: number;
  /** Ticks a single harvest takes. */
  harvestTicks: number;
  /** Skill whose level scales the yield. */
  skill: 'forage' | 'hunt' | 'knap' | 'build';
  /**
   * A floor under `regrow`'s seasonal multiplier, for the kinds that do not
   * stop existing in winter the way a stripped bush does. Undefined means no
   * floor — plant regrowth genuinely stops in deep winter, and that stoppage
   * is what makes a storage pit matter. Fish are the deliberate exception: the
   * whole point of adding them was food that does not vanish exactly when it
   * is needed most, the same reasoning `gameHerds` was scaled up for.
   */
  winterFloor?: number;
  /**
   * Sits on the ground itself rather than growing out of it or standing in
   * water — M9.5 phase 2b's owner's note that small things on the ground can
   * be buried by enough snow. `Simulation.isBuried` reads this to decide
   * which nodes deep winter can hide; berries, reeds and fish are all above,
   * around, or under things snow does not settle on.
   */
  groundLevel?: boolean;
  /**
   * The technique a person needs to take anything from this node at all, read
   * through `techPower` (`Ore.canWork`). Undefined means anybody: native copper
   * lies on the surface, and picking it up needs no more than hands.
   */
  requiresTech?: Tech;
}

export const RESOURCE_DEFS: Record<ResourceKind, ResourceDef> = {
  berries: { kind: 'berries', itemId: 'berries', maxAmount: 14, regrowPerTick: 0.0042, harvestTicks: 8, skill: 'forage' },
  flint:   { kind: 'flint',   itemId: 'flint',   maxAmount: 30, regrowPerTick: 0,      harvestTicks: 14, skill: 'knap', groundLevel: true },
  sticks:  { kind: 'sticks',  itemId: 'sticks',  maxAmount: 12, regrowPerTick: 0.0035, harvestTicks: 7,  skill: 'forage', groundLevel: true },
  reeds:   { kind: 'reeds',   itemId: 'thatch',  maxAmount: 16, regrowPerTick: 0.005,  harvestTicks: 9,  skill: 'forage' },
  clay:    { kind: 'clay',    itemId: 'mud',     maxAmount: 24, regrowPerTick: 0.001,  harvestTicks: 12, skill: 'build', groundLevel: true },
  // A shoal at a fixed spot rather than a moving animal, the same trade-off the
  // plan made for the fish channel: it reuses `doHarvest` wholesale rather than
  // needing a swimming entity and a second notion of passable ground.
  fish:    { kind: 'fish',    itemId: 'fish',    maxAmount: 10, regrowPerTick: 0.006,  harvestTicks: 11, skill: 'hunt', winterFloor: 0.4 },
  // M8.2: the wild ancestor of the field. A stand of grass whose seed is worth
  // taking — poor food, gathered like any other, and the only place the first
  // handful of seed corn can come from. Thin on purpose: `maxAmount` 8 against
  // berries' 14, so a patch is a morning's work rather than a larder, and it is
  // the *domesticated* version on a tended field that is worth the labour.
  //
  // `groundLevel` is deliberately absent. Standing cereal is the one small thing
  // on open ground that snow does not simply hide — the ears stand above it, and
  // a winter stand of grain going to waste in the open is the picture M9.5 phase
  // 2b's burial rule would have taken away.
  wild_grain: {
    kind: 'wild_grain', itemId: 'grain', maxAmount: 8, regrowPerTick: 0.0032,
    harvestTicks: 10, skill: 'forage',
  },
  // M15 phase 37. Copper lying on the surface as metal — float nuggets washed
  // out of an outcrop, or weathered out of it — which is how the metal was
  // first found and why it was worked cold before anyone smelted anything.
  // Few and small: six at the most, and it never grows back. Anybody can pick
  // one up; only somebody who knows `native_copper` goes looking (`Brain`).
  native_copper: {
    kind: 'native_copper', itemId: 'copper_nugget', maxAmount: 6, regrowPerTick: 0,
    harvestTicks: 16, skill: 'knap', groundLevel: true,
  },
  // M15 phase 37, `mining`. A mine is a node, not a hole: the ground is not
  // excavated (so nothing here needs the region repair of phase 16a) and a
  // seam gives out. Neither grows back. Copper is the commoner; tin is the rare
  // one, and it is rare on purpose - the bronze trade of the real Bronze Age
  // existed because tin was a few places in a continent.
  copper_ore: {
    kind: 'copper_ore', itemId: 'copper_ore', maxAmount: 20, regrowPerTick: 0,
    harvestTicks: 24, skill: 'knap', requiresTech: 'mining',
  },
  tin_ore: {
    kind: 'tin_ore', itemId: 'tin_ore', maxAmount: 14, regrowPerTick: 0,
    harvestTicks: 28, skill: 'knap', requiresTech: 'mining',
  },
  // M15 phase 37, `goldwork`. Grains in the gravel, four at the most, picked up
  // by anybody and never replaced: placer gold is there once.
  gold: {
    kind: 'gold', itemId: 'gold_nugget', maxAmount: 4, regrowPerTick: 0,
    harvestTicks: 18, skill: 'knap', groundLevel: true,
  },
};

/**
 * How many of each ore a classic island holds, before `resourceScale`: the
 * metals come in a pass of their own (`Simulation.spawnOres`), and on a world
 * with a map each is placed only where the region's profile has it
 * (`geographicResourceAvailable`). Native copper is scarce even where it is
 * found - a handful of nuggets, never a seam.
 */
export const ORE_COUNTS: Partial<Record<ResourceKind, number>> = {
  native_copper: 5,
  copper_ore: 4,
  // One seam on a whole island: the scarcity is the design.
  tin_ore: 1,
  gold: 2,
};

/**
 * What kind of fruiting shrub a berry bush is, M15 phase 20 (owner,
 * 2026-10-01): real European species, each bearing in its real season, so
 * that spring, summer, autumn and winter each have their own fruit and winter
 * has clearly the least.
 *
 * A bush used to be one generic plant that set fruit from spring to autumn
 * and kept it through the winter, so nothing about the year could be learned
 * by watching it and nothing made a store worth filling. Now:
 *
 *  - in a season it `ripens` in, fruit sets (and comes back after picking);
 *  - in a season it `holds` in, what is on it stays but nothing new sets —
 *    the hip and the sloe that hang on bare canes through the winter, which is
 *    what real winter foragers in Europe picked;
 *  - in any other season it is bare: the crop has fallen and rotted.
 *
 * Every species still gives the same food (`berries`): this is about when a
 * bush bears, not about a new item for every hand and recipe to learn.
 */
export const BUSH_SPECIES = [
  'strawberry', 'raspberry', 'bilberry', 'bramble', 'rosehip', 'sloe', 'strawberry_tree', 'currant',
] as const;
/**
 * M15 phase 21d. Two plants that grow as bushes but are not fruit bushes, so
 * they are *not* in `BUSH_SPECIES`: that list is what `spawnFlora` plants and
 * what its weights sum over, and a new entry there would move every draw. They
 * are planted in a pass of their own (`Simulation.spawnWildPlants`).
 *
 * The baneberry is what the owner's note asked for: a berry that looks like the
 * edible ones and is not. The yarrow gives `herbs`, which `tend` spends.
 */
export const WILD_PLANTS = ['baneberry', 'yarrow'] as const;
export type BushSpecies = (typeof BUSH_SPECIES)[number] | (typeof WILD_PLANTS)[number];

export interface BushDef {
  species: BushSpecies;
  /** English name, translated at the UI boundary. */
  label: string;
  ripens: readonly Season[];
  holds: readonly Season[];
  /**
   * Multiplier on `berries`' regrowth while it ripens, so that a year's crop
   * is about what the old all-season bush set: a species with one short season
   * sets it fast. Measured as "season-units" of the old curve, which gave
   * about two a year (half a spring, a summer, half an autumn).
   */
  rate: number;
  /** Relative abundance when the island is planted. */
  weight: number;
  /** Keeps its leaves through the winter. */
  evergreen: boolean;
  /** The colour of its ripe fruit, for the renderer and the fog. */
  fruitColor: string;
  /** What it gives when it is not `berries` (21d). */
  yields?: string;
}

export const BUSHES: Record<BushSpecies, BushDef> = {
  // The weights make spring, summer and autumn each about half the bushes in
  // fruit and winter a third, most of that what autumn left hanging: the
  // owner's year (2026-10-01) — people eat calmly from spring to autumn, and
  // winter is the lean season that hunting, fishing and stores are for. Real
  // European spring is thin in fruit, which is why it has two species here
  // and why the dog rose still holds hips in it.
  //
  // Fragaria vesca: May and June.
  strawberry: { species: 'strawberry', label: 'Wild strawberry', ripens: ['spring'], holds: [],
    rate: 3.5, weight: 0.18, evergreen: true, fruitColor: '#d8352a' },
  // Ribes rubrum: late spring into high summer.
  currant: { species: 'currant', label: 'Redcurrant', ripens: ['spring', 'summer'], holds: [],
    rate: 1.35, weight: 0.14, evergreen: false, fruitColor: '#e2263f' },
  // Rubus idaeus and Vaccinium myrtillus: high summer.
  raspberry: { species: 'raspberry', label: 'Raspberry', ripens: ['summer'], holds: [],
    rate: 2, weight: 0.10, evergreen: false, fruitColor: '#cf3a5c' },
  bilberry: { species: 'bilberry', label: 'Bilberry', ripens: ['summer'], holds: [],
    rate: 2, weight: 0.10, evergreen: false, fruitColor: '#3b4a8c' },
  // Rubus fruticosus: August to October. Brambles keep most of their leaves.
  bramble: { species: 'bramble', label: 'Bramble', ripens: ['summer', 'autumn'], holds: [],
    rate: 1.35, weight: 0.16, evergreen: true, fruitColor: '#2b2033' },
  // Rosa canina: hips ripen in autumn and hang on the bare canes until spring.
  rosehip: { species: 'rosehip', label: 'Dog rose', ripens: ['autumn'], holds: ['winter', 'spring'],
    rate: 4, weight: 0.14, evergreen: false, fruitColor: '#d2502a' },
  // Prunus spinosa: sloes ripen in autumn and are best after the first frosts.
  sloe: { species: 'sloe', label: 'Blackthorn', ripens: ['autumn'], holds: ['winter'],
    rate: 4, weight: 0.10, evergreen: false, fruitColor: '#4c5a8a' },
  // Arbutus unedo: an evergreen that flowers and fruits from October into the
  // winter — the one plant here still ripening fruit in the cold.
  strawberry_tree: { species: 'strawberry_tree', label: 'Strawberry tree', ripens: ['autumn', 'winter'], holds: [],
    rate: 2, weight: 0.08, evergreen: true, fruitColor: '#e0602a' },
  // Actaea and deadly nightshade stand for it: dark glossy berries in high
  // summer that hang on into autumn. The colour sits between the bilberry's and
  // the bramble's on purpose — it has to be mistaken for them. `weight` is
  // unused (it is not in `BUSH_SPECIES`).
  baneberry: { species: 'baneberry', label: 'Baneberry', ripens: ['summer'], holds: ['autumn'],
    rate: 2, weight: 0, evergreen: false, fruitColor: '#34274f', yields: 'toxic_berries' },
  // Achillea millefolium: leaves from spring to autumn, nothing in the cold.
  yarrow: { species: 'yarrow', label: 'Yarrow', ripens: ['spring', 'summer', 'autumn'], holds: [],
    rate: 1.5, weight: 0, evergreen: false, fruitColor: '#e8e2c4', yields: 'herbs' },
};

export type BushPhase = 'ripens' | 'holds' | 'bare';

/** What a bush of this species does in this season. */
export function bushPhase(species: BushSpecies, season: Season): BushPhase {
  const def = BUSHES[species];
  return def.ripens.includes(season) ? 'ripens' : def.holds.includes(season) ? 'holds' : 'bare';
}

/**
 * The floor under the season's growth while a species ripens: a strawberry in
 * a cool spring and a strawberry tree in winter still set their fruit, since
 * that is when they bear. Without it the temperature curve that drives every
 * other plant would leave winter's one ripening shrub bearing nothing.
 */
const RIPENING_FLOOR = 0.5;

let nextNodeId = 1;

export function resetResourceIds(): void {
  nextNodeId = 1;
}

export class ResourceNode {
  readonly id: number;
  readonly kind: ResourceKind;
  readonly def: ResourceDef;
  x: number;
  y: number;
  amount: number;
  /**
   * Which shrub a berry bush is (`BUSHES`); null for every other kind, and
   * for a bush in a world built before species existed — which then behaves
   * exactly as the old all-season bush did.
   */
  species: BushSpecies | null = null;

  constructor(kind: ResourceKind, x: number, y: number, rng: RNG, ids?: IdSpace) {
    this.id = ids ? ids.allocate('resourceNode') : nextNodeId++;
    this.kind = kind;
    this.def = RESOURCE_DEFS[kind];
    this.x = x;
    this.y = y;
    // Start partly grown so the world does not look uniformly ripe on day one.
    this.amount = Math.floor(this.def.maxAmount * rng.range(0.4, 1));
  }

  get depleted(): boolean {
    return this.amount < 1;
  }

  /**
   * What one harvest of this node is. The kind's item for everything, except a
   * bush whose species gives something else (the baneberry's poison, the
   * yarrow's herbs). A getter, so a view made with `Object.create(node)` — the
   * remembered-place views `Brain` scores — reads it too.
   */
  get itemId(): string {
    return this.species !== null ? BUSHES[this.species].yields ?? this.def.itemId : this.def.itemId;
  }

  /**
   * Grows back, at a pace set by the season.
   *
   * `growth` is 0 in deep winter and 1 at midsummer. A stripped bush recovers
   * over weeks in spring and not at all in the cold, which is what turns a
   * storage pit from decoration into the difference between a band that eats in
   * winter and one that does not.
   */
  regrow(ticks: number, growth: number, multiplier = 1, season?: Season): void {
    if (this.def.regrowPerTick === 0) return;
    if (this.amount >= this.def.maxAmount) return;
    if (this.species !== null && season !== undefined) {
      // A bush sets fruit only in its own season; see `BUSHES`.
      if (bushPhase(this.species, season) !== 'ripens') return;
      const def = BUSHES[this.species];
      this.amount = Math.min(this.def.maxAmount,
        this.amount + this.def.regrowPerTick * ticks * Math.max(growth, RIPENING_FLOOR) * def.rate * multiplier);
      return;
    }
    const rate = Math.max(growth, this.def.winterFloor ?? 0);
    // The multiplier lands on the final term, not on `growth`. Scaling growth
    // would be swallowed by the `winterFloor` clamp on the line above, so
    // `world.regrowthRate` would silently do nothing to fish — the one food
    // that keeps growing through the winter, and so the one it matters most for.
    this.amount = Math.min(
      this.def.maxAmount,
      this.amount + this.def.regrowPerTick * ticks * rate * multiplier
    );
  }

  take(units: number): number {
    const taken = Math.min(units, Math.floor(this.amount));
    this.amount -= taken;
    return taken;
  }
}

/**
 * Whether a node's yield is something a hungry person can eat.
 *
 * Data-driven off `ITEMS[...].nutrition` rather than a hardcoded list of
 * kinds, so that `Brain`'s forage scorer and `Simulation.stats().foodInWorld`
 * — the two places that used to both test `n.kind === 'berries'` — read one
 * definition of "what counts as food" instead of two that can drift apart.
 */
export function isFoodKind(node: ResourceNode): boolean {
  return (ITEMS[node.itemId]?.nutrition ?? 0) > 0;
}

/**
 * A plant whose yield is food — berries, wild grain — as against fish or a
 * flint outcrop: what `SeasonLore` watches bear and go bare (M15 phase 20).
 * Read off the skill as well as the item, since fish is food and not a plant.
 */
export function isPlantFood(def: ResourceDef): boolean {
  return def.skill === 'forage' && def.regrowPerTick > 0 && (ITEMS[def.itemId]?.nutrition ?? 0) > 0;
}

/**
 * The name `SeasonLore` learns a plant under: its species for a berry bush,
 * since each shrub bears in its own seasons, and its kind for anything else.
 */
export function seasonLoreKind(node: { kind: ResourceKind; species: BushSpecies | null }): string {
  return node.species !== null ? `bush:${node.species}` : `resource:${node.kind}`;
}
