/**
 * Items and inventories.
 *
 * Deliberately thin for now: a stack is an id and a count. Quality tiers,
 * ownership and heirloom provenance attach to this later, and barter values are
 * computed per-person rather than stored here — an item is worth what the
 * person looking at it thinks it is worth.
 */

export interface ItemDef {
  id: string;
  label: string;
  /** Hunger points restored by eating one unit. 0 means inedible. */
  nutrition: number;
  /** Ticks before one unit spoils. 0 means it keeps indefinitely. */
  spoilTicks: number;
  /** Rough scarcity weight used as the base of subjective barter value. */
  baseValue: number;
}

export const ITEMS: Record<string, ItemDef> = {
  berries:  { id: 'berries',  label: 'Berries',    nutrition: 14, spoilTicks: 2400, baseValue: 1 },
  apple:    { id: 'apple',    label: 'Apples',     nutrition: 16, spoilTicks: 6000, baseValue: 1 },
  pear:     { id: 'pear',     label: 'Pears',      nutrition: 15, spoilTicks: 4800, baseValue: 1 },
  plum:     { id: 'plum',     label: 'Plums',      nutrition: 13, spoilTicks: 3000, baseValue: 1 },
  hazelnut: { id: 'hazelnut', label: 'Hazelnuts',  nutrition: 22, spoilTicks: 0,    baseValue: 2 },
  meat:     { id: 'meat',     label: 'Raw meat',   nutrition: 30, spoilTicks: 1200, baseValue: 3 },
  flint:    { id: 'flint',    label: 'Flint',      nutrition: 0,  spoilTicks: 0,    baseValue: 2 },
  sticks:   { id: 'sticks',   label: 'Sticks',     nutrition: 0,  spoilTicks: 0,    baseValue: 1 },
  wood:     { id: 'wood',     label: 'Timber',     nutrition: 0,  spoilTicks: 0,    baseValue: 4 },
  handaxe:  { id: 'handaxe',  label: 'Hand axe',   nutrition: 0,  spoilTicks: 0,    baseValue: 8 },
  thatch:   { id: 'thatch',   label: 'Thatch',     nutrition: 0,  spoilTicks: 0,    baseValue: 1 },
  mud:      { id: 'mud',      label: 'Daub',       nutrition: 0,  spoilTicks: 0,    baseValue: 1 },
  pottery:  { id: 'pottery',  label: 'Pot',        nutrition: 0,  spoilTicks: 0,    baseValue: 6 },
};

export class Inventory {
  private stacks = new Map<string, number>();

  /**
   * Bumped on every change to the contents.
   *
   * The inventory panel caches its DOM against a key and only patches a handful
   * of live values on a hit, so a pack that changed while the key stayed the
   * same left the Kit tab showing what it showed a minute ago. Folding this
   * counter into that key means any change to the pack rebuilds the panel —
   * which is also the correct behaviour for the per-item verbs, since what can
   * be done with a stack depends on what is in it.
   */
  version = 0;

  add(itemId: string, count = 1): void {
    if (count <= 0) return;
    this.stacks.set(itemId, (this.stacks.get(itemId) ?? 0) + count);
    this.version++;
  }

  /** Removes up to `count`; returns how many were actually removed. */
  remove(itemId: string, count = 1): number {
    const have = this.stacks.get(itemId) ?? 0;
    const taken = Math.min(have, count);
    if (taken <= 0) return 0;
    if (have - taken <= 0) this.stacks.delete(itemId);
    else this.stacks.set(itemId, have - taken);
    this.version++;
    return taken;
  }

  count(itemId: string): number {
    return this.stacks.get(itemId) ?? 0;
  }

  has(itemId: string, count = 1): boolean {
    return this.count(itemId) >= count;
  }

  get total(): number {
    let n = 0;
    for (const c of this.stacks.values()) n += c;
    return n;
  }

  entries(): [string, number][] {
    return [...this.stacks.entries()];
  }

  /** The most nourishing edible thing carried, or null. */
  bestFood(): string | null {
    let best: string | null = null;
    let bestNutrition = 0;
    for (const [id] of this.stacks) {
      const nutrition = ITEMS[id]?.nutrition ?? 0;
      if (nutrition > bestNutrition) {
        bestNutrition = nutrition;
        best = id;
      }
    }
    return best;
  }
}
