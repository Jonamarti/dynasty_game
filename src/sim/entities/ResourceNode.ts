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

export const RESOURCE_KINDS = ['berries', 'flint', 'sticks', 'reeds', 'clay'] as const;
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
}

export const RESOURCE_DEFS: Record<ResourceKind, ResourceDef> = {
  berries: { kind: 'berries', itemId: 'berries', maxAmount: 14, regrowPerTick: 0.0042, harvestTicks: 8, skill: 'forage' },
  flint:   { kind: 'flint',   itemId: 'flint',   maxAmount: 30, regrowPerTick: 0,      harvestTicks: 14, skill: 'knap' },
  sticks:  { kind: 'sticks',  itemId: 'sticks',  maxAmount: 12, regrowPerTick: 0.0035, harvestTicks: 7,  skill: 'forage' },
  reeds:   { kind: 'reeds',   itemId: 'thatch',  maxAmount: 16, regrowPerTick: 0.005,  harvestTicks: 9,  skill: 'forage' },
  clay:    { kind: 'clay',    itemId: 'mud',     maxAmount: 24, regrowPerTick: 0.001,  harvestTicks: 12, skill: 'build' },
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
  regrow(ticks: number, growth: number): void {
    if (this.def.regrowPerTick === 0) return;
    if (this.amount >= this.def.maxAmount) return;
    this.amount = Math.min(
      this.def.maxAmount,
      this.amount + this.def.regrowPerTick * ticks * growth
    );
  }

  take(units: number): number {
    const taken = Math.min(units, Math.floor(this.amount));
    this.amount -= taken;
    return taken;
  }
}
