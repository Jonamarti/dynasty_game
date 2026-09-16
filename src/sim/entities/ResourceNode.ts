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
import { ITEMS } from './Item.ts';

// `wild_grain` is appended rather than inserted, and it is spawned in a pass of
// its own on a stream of its own — see `Simulation.spawnWildGrain`. Adding it to
// `spawnResources`' plan array would have moved every herd and every person in
// every saved seed without the determinism test noticing, which is the trap
// `AGENTS.md` describes and `fish` already had to dodge.
export const RESOURCE_KINDS = [
  'berries', 'flint', 'sticks', 'reeds', 'clay', 'fish', 'wild_grain',
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
};

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

  constructor(kind: ResourceKind, x: number, y: number, rng: RNG) {
    this.id = nextNodeId++;
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
   * Grows back, at a pace set by the season.
   *
   * `growth` is 0 in deep winter and 1 at midsummer. A stripped bush recovers
   * over weeks in spring and not at all in the cold, which is what turns a
   * storage pit from decoration into the difference between a band that eats in
   * winter and one that does not.
   */
  regrow(ticks: number, growth: number, multiplier = 1): void {
    if (this.def.regrowPerTick === 0) return;
    if (this.amount >= this.def.maxAmount) return;
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
  return (ITEMS[node.def.itemId]?.nutrition ?? 0) > 0;
}
