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
  /**
   * What this is worth in a fight, if anything.
   *
   * `doAttack` had no item term at all: a man with a spear hit exactly as hard
   * as a man with his hands, which made every weapon in the game a decoration.
   *
   * `reach` widens the range `approach` will settle for, which is how a spear
   * beats a fist without ranged combat existing — the spearman lands blows from
   * a step further back than the other party can. `hunt` is the separate
   * multiplier on bringing an animal down, because a bow is a far better answer
   * to a deer than to a neighbour. `tech` routes the whole thing through
   * `techPower`, so a refined design hits harder than a first attempt at one.
   */
  weapon?: { damage: number; reach: number; hunt: number; tech: string };
  /** How much of a blow this turns aside, 0 to 1. */
  armour?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  berries:  { id: 'berries',  label: 'Berries',    nutrition: 14, spoilTicks: 2400, baseValue: 1 },
  apple:    { id: 'apple',    label: 'Apples',     nutrition: 16, spoilTicks: 6000, baseValue: 1 },
  pear:     { id: 'pear',     label: 'Pears',      nutrition: 15, spoilTicks: 4800, baseValue: 1 },
  plum:     { id: 'plum',     label: 'Plums',      nutrition: 13, spoilTicks: 3000, baseValue: 1 },
  hazelnut: { id: 'hazelnut', label: 'Hazelnuts',  nutrition: 22, spoilTicks: 0,    baseValue: 2 },
  meat:     { id: 'meat',     label: 'Raw meat',   nutrition: 30, spoilTicks: 1200, baseValue: 3 },
  fish:     { id: 'fish',     label: 'Fish',       nutrition: 18, spoilTicks: 800,  baseValue: 2 },
  // A kill yields a hide as well as meat, and a hide in cold hands is the
  // heaviest spark clothing has. Without it that route could never fire.
  hide:     { id: 'hide',     label: 'Hide',       nutrition: 0,  spoilTicks: 0,    baseValue: 3 },
  // Weapons. Each is gated on a technology and read through `techPower`, so the
  // same spear is worth more in the hands of whoever kept improving the design.
  spear: {
    id: 'spear', label: 'Spear', nutrition: 0, spoilTicks: 0, baseValue: 9,
    // The reach is the point of it. Damage a little above a hand axe; what a
    // spear actually buys is hitting first.
    weapon: { damage: 0.55, reach: 0.9, hunt: 1.6, tech: 'spear' },
  },
  bow: {
    id: 'bow', label: 'Bow', nutrition: 0, spoilTicks: 0, baseValue: 14,
    // Poor in a brawl and decisive against an animal that outruns you, which is
    // the whole reason hunting has been a garnish: a fresh deer is faster than a
    // person and a hunt could only ever be won by exhausting one.
    weapon: { damage: 0.3, reach: 1.6, hunt: 2.4, tech: 'bow' },
  },
  hide_armour: {
    id: 'hide_armour', label: 'Hide armour', nutrition: 0, spoilTicks: 0, baseValue: 11,
    armour: 0.3,
  },
  // M8.1. Both are carried tools rather than materials, and both are read
  // through an item-presence test *and* `techPower` — a basket in the hands of
  // somebody who does not know basketry is a bundle of withies. That double
  // gate is deliberate: `handaxe` tests presence alone, which is the bug the
  // M8 plan lists under "three repairs to make while passing".
  basket:   { id: 'basket',   label: 'Basket',     nutrition: 0,  spoilTicks: 0,    baseValue: 5 },
  net:      { id: 'net',      label: 'Net',        nutrition: 0,  spoilTicks: 0,    baseValue: 7 },
  flint:    { id: 'flint',    label: 'Flint',      nutrition: 0,  spoilTicks: 0,    baseValue: 2 },
  sticks:   { id: 'sticks',   label: 'Sticks',     nutrition: 0,  spoilTicks: 0,    baseValue: 1 },
  wood:     { id: 'wood',     label: 'Timber',     nutrition: 0,  spoilTicks: 0,    baseValue: 4 },
  handaxe:  {
    id: 'handaxe', label: 'Hand axe', nutrition: 0, spoilTicks: 0, baseValue: 8,
    // It was always a weapon in everything but the code. No reach — you have to
    // be on top of somebody to use it — and poor for hunting, because the animal
    // has to be caught first.
    weapon: { damage: 0.35, reach: 0, hunt: 1.15, tech: 'hafting' },
  },
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
