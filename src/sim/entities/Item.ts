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
  /**
   * M11 phase 8a. Fat, protein and carbohydrate as fractions of `nutrition`
   * that sum to 1. Present only on items with `nutrition > 0` — a fraction of
   * zero nourishment is not a macronutrient, it is a unit test waiting to
   * fail. Nothing reads this yet; it exists so 8b can compute a rolling
   * balance and 8c/8d can make imbalance cost something, without either of
   * those commits also having to invent the numbers.
   */
  macros?: { fat: number; protein: number; carb: number };
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
  berries:  { id: 'berries',  label: 'Berries',    nutrition: 14, spoilTicks: 2400, baseValue: 1, macros: { fat: 0.05, protein: 0.05, carb: 0.90 } },
  apple:    { id: 'apple',    label: 'Apples',     nutrition: 16, spoilTicks: 6000, baseValue: 1, macros: { fat: 0.03, protein: 0.02, carb: 0.95 } },
  pear:     { id: 'pear',     label: 'Pears',      nutrition: 15, spoilTicks: 4800, baseValue: 1, macros: { fat: 0.03, protein: 0.02, carb: 0.95 } },
  plum:     { id: 'plum',     label: 'Plums',      nutrition: 13, spoilTicks: 3000, baseValue: 1, macros: { fat: 0.04, protein: 0.04, carb: 0.92 } },
  // A nut is a fat, not a fruit: it is what keeps `carb` from being every
  // forageable's dominant macro, which would make the whole system read as a
  // single lever wearing three names.
  hazelnut: { id: 'hazelnut', label: 'Hazelnuts',  nutrition: 22, spoilTicks: 0,    baseValue: 2, macros: { fat: 0.75, protein: 0.15, carb: 0.10 } },
  // M8.1, mechanism 4. The first inedible food in the game, and the point of
  // the quern.
  //
  // An acorn is `nutrition: 0` because a raw acorn genuinely is: it is bitter
  // with tannin and makes you ill, which is exactly why every people who lived
  // on them ground and leached them first. That makes `grinding` a far better
  // technology than a yield multiplier would have been — before it, the oak is
  // the commonest tree in the wood and yields nothing but timber; after it, the
  // same tree is an autumn food supply.
  //
  // It also removes the failure the hazelnut version was measured hitting.
  // Three hazelnuts into meal fired twice in a whole autumn across two bands,
  // because a hazelnut at 22 nutrition is the best thing in most packs and
  // anybody holding enough to grind had eaten them by the time they reached the
  // stone. Nothing competes for an acorn.
  acorn:    { id: 'acorn',    label: 'Acorns',     nutrition: 0,  spoilTicks: 0,    baseValue: 1 },
  // M8.2, and **nutrition 0 for the same reason the acorn is**: raw grain is
  // not food, which is precisely why every people who lived on it ground it
  // first. Worth 6 was tried and measured doing real damage. The forage scorer
  // took the nearest edible thing, so wild grain at 6 pulled foragers off
  // fourteen-point berries and twenty-two-point hazelnuts: on `millers`, ninety
  // four grain were gathered, foraging rose 42% in ticks, crafting fell to a
  // third, and the scenario that exists to exercise a crafting station made
  // nothing at one all run. A food nobody should want is not made harmless by
  // making it cheap; it has to be worth nothing until somebody knows what to do
  // with it.
  //
  // That leaves the question this number has to answer: where does the first
  // seed corn come from, if nobody will gather a worthless thing? From the
  // quern. `RECIPES.groats` is gated on `grinding` — which is also `farming`'s
  // own prerequisite — so anybody who could ever discover farming already has a
  // reason to gather wild cereal, and `Brain.nodeWorth` values it the way
  // `fruitWorth` has valued acorns since M8.1. No deadlock, and no bait.
  grain:    { id: 'grain',    label: 'Grain',      nutrition: 0,  spoilTicks: 0,    baseValue: 1 },
  meal:     { id: 'meal',     label: 'Meal',       nutrition: 34, spoilTicks: 0,    baseValue: 4, macros: { fat: 0.02, protein: 0.13, carb: 0.85 } },
  // M8.2. The only item in the game whose whole purpose is to be put back into
  // the ground. Worth nothing to eat and nearly nothing to trade, and a band
  // that has some is a band whose fields have another twenty years in them.
  compost:  { id: 'compost',  label: 'Compost',    nutrition: 0,  spoilTicks: 0,    baseValue: 1 },
  meat:     { id: 'meat',     label: 'Raw meat',   nutrition: 30, spoilTicks: 1200, baseValue: 3, macros: { fat: 0.45, protein: 0.55, carb: 0 } },
  fish:     { id: 'fish',     label: 'Fish',       nutrition: 18, spoilTicks: 800,  baseValue: 2, macros: { fat: 0.35, protein: 0.65, carb: 0 } },
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
  // --- M8.1: what comes off a carcass once you know what to do with it -------
  //
  // Bone and sinew are taken only by a hunter who knows `bone_working`, which is
  // both honest — nobody butchers sinew out of a leg without a use for it — and
  // what keeps every world that has not worked it out bit-identical to the one
  // before this shipped. The same rule the acorn follows.
  bone:     { id: 'bone',     label: 'Bone',       nutrition: 0,  spoilTicks: 0,    baseValue: 2 },
  sinew:    { id: 'sinew',    label: 'Sinew',      nutrition: 0,  spoilTicks: 0,    baseValue: 3 },
  // A needle is a *stage*, not an ornament: it is worth making only because the
  // fur coat consumes one, and it is the reason `tailoring` sits behind
  // `bone_working` rather than behind `clothing` alone. An eyed needle is the
  // single artefact that separates people who could survive a glacial winter
  // from people who could not, and this is the closest the game can come to
  // saying so.
  needle:   { id: 'needle',   label: 'Bone needle', nutrition: 0, spoilTicks: 0,    baseValue: 6 },
  bone_point: {
    id: 'bone_point', label: 'Bone point', nutrition: 0, spoilTicks: 0, baseValue: 10,
    // Between the flint spear and the bow, and closer to the bow: a barbed bone
    // head is light, so it throws further than it hits hard. Poor in a brawl for
    // exactly the same reason.
    weapon: { damage: 0.4, reach: 1.15, hunt: 2.0, tech: 'bone_working' },
  },
  atlatl: {
    id: 'atlatl', label: 'Spear-thrower', nutrition: 0, spoilTicks: 0, baseValue: 12,
    // It precedes the bow by twenty thousand years and sits just below it here,
    // which is the whole reason it requires only `spear`: a lever on the end of
    // your arm is a smaller idea than a bow, and it arrived first.
    weapon: { damage: 0.5, reach: 1.35, hunt: 2.1, tech: 'atlatl' },
  },
  fur_coat: {
    id: 'fur_coat', label: 'Fur coat', nutrition: 0, spoilTicks: 0, baseValue: 15,
  },
  // The only object in the game that does nothing useful at all, and the most
  // valuable thing a Palaeolithic band owns for exactly that reason.
  flute: { id: 'flute', label: 'Flute', nutrition: 0, spoilTicks: 0, baseValue: 16 },
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
  // --- M11 phase 10, the widened Neolithic: see m8_plan_the_ages.md ----------
  //
  // `ground_stone`'s two tools. Neither is a weapon, on the same call `basket`
  // and `net` already make: what they change is read through `techPower`
  // rather than through a fight, so giving either a `weapon` block would be
  // the `handaxe` bug wearing a polish.
  stone_axe: { id: 'stone_axe', label: 'Polished axe', nutrition: 0, spoilTicks: 0, baseValue: 10 },
  adze:      { id: 'adze',      label: 'Adze',         nutrition: 0, spoilTicks: 0, baseValue: 9 },
  // `spinning` and `weaving`, shipped in one commit because thread has no
  // reason to exist without the loom that consumes it — the same rule that
  // kept `needle` and `fur_coat` together.
  thread: { id: 'thread', label: 'Thread', nutrition: 0, spoilTicks: 0, baseValue: 3 },
  // The highest `baseValue` of anything a band can make at this point in the
  // tree, on purpose: `next-steps.md`'s note on `trade` reading `baseValue` is
  // what makes this "the first thing worth trading" rather than a description
  // nobody can act on.
  cloth: { id: 'cloth', label: 'Cloth', nutrition: 0, spoilTicks: 0, baseValue: 12 },
  // `sickle`'s tool. A blade set in a haft, read the same double-gated way as
  // every other carried tool in this file: knowing the technology is not
  // enough, and carrying one is not enough either.
  sickle: { id: 'sickle', label: 'Sickle', nutrition: 0, spoilTicks: 0, baseValue: 8 },
  // --- M11 phase 10, second commit -------------------------------------------
  // `the_wheel`'s cart. Not a weapon or a wearable, on the same double-gated
  // terms as everything else in this block.
  cart: { id: 'cart', label: 'Cart', nutrition: 0, spoilTicks: 0, baseValue: 14 },
  // `bread`. `spoilTicks: 0`, like `meal` — it is baked meal, and keeping is
  // the whole point of baking it, per the plan's own table. Higher nutrition
  // than `meal` is the other half of the same claim, and mostly `carb` for the
  // same reason `meal` is.
  bread: {
    id: 'bread', label: 'Bread', nutrition: 42, spoilTicks: 0, baseValue: 5,
    macros: { fat: 0.05, protein: 0.15, carb: 0.80 },
  },
  // `dairying`'s byproduct. Real spoil ticks, unlike most of this file's
  // pastoral entries — milk goes off fast, which is honest data even while
  // `spoilRate` sits at 0 by default and nothing yet reads it for this item.
  milk: {
    id: 'milk', label: 'Milk', nutrition: 20, spoilTicks: 400, baseValue: 3,
    macros: { fat: 0.5, protein: 0.35, carb: 0.15 },
  },
  // `wool`'s byproduct, and the material `wool_cloth` is made from. Sheared
  // rather than culled, so — unlike `hide` — it comes off a living animal and
  // has no place in `synthesis.test.ts`'s rare-ingredient set: a pen with
  // `wool` known produces it every day, not once per kill.
  wool: { id: 'wool', label: 'Wool', nutrition: 0, spoilTicks: 0, baseValue: 4 },
  // `wool`'s recipe output. Warmer than `cloth` — see `Tech.warmthFrom` — and
  // a second item rather than a second ingredient on `cloth` itself, for the
  // same reason `groats` is a second recipe rather than a second ingredient
  // on `meal`: flax and fleece are two different harvests, and a technology
  // tree should be able to tell the player it found a better material rather
  // than silently swap the old one out.
  wool_cloth: { id: 'wool_cloth', label: 'Wool cloth', nutrition: 0, spoilTicks: 0, baseValue: 15 },
  // `brewing`. Low nutrition on purpose — a jug of beer is not a meal, and a
  // number competitive with bread or meat would have made `bestFood` pick it
  // over both, distorting the whole food economy for a technology whose real
  // claim is social. That low number is also why it is drunk through its own
  // verb, `toast`, rather than through `doEat`: `bestFood` picking the single
  // most nutritious thing carried would otherwise make beer invisible next to
  // anything better, the same failure milk was measured hitting in a pen.
  beer: {
    id: 'beer', label: 'Beer', nutrition: 6, spoilTicks: 1200, baseValue: 5,
    macros: { fat: 0.02, protein: 0.08, carb: 0.90 },
  },
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

  /**
   * Accumulated fractional loss, for perishable ids only.
   *
   * M8.1, mechanism 1. Deliberately a *carry* rather than a per-stack age, and
   * the trade is worth stating because it is visible in play: **adding fresh
   * units does not reset it.** A pile picked on day three and topped up on day
   * nine rots on day thirteen as one pile. That is the same trade
   * `architecture.md` already made keeping per-unit quality out of `stacks`,
   * which nearly everything in this project relies on being a plain id-to-count
   * map, and `world.test.ts` asserts the decision rather than leaving it to be
   * discovered.
   *
   * Two alternatives were weighed and rejected. A decay *roll* per stack needs
   * an appended `RNG` fork and injects variance into the exact system ten seeds
   * cannot resolve. An age-cohort list tells the nicer story but needs the day
   * at all thirty-six `add` sites, for three to five times the code. The cohort
   * list is the upgrade path if per-batch preservation is ever wanted.
   */
  private spoilage = new Map<string, number>();

  /**
   * Ages the contents by `elapsedTicks` and removes whatever has gone off.
   *
   * `factorFor` multiplies an item's `spoilTicks`: higher keeps longer. It is a
   * function rather than a number because a person's answer comes through
   * `spoilFactor` and a building's through `BuildingDef.preserves`, and the
   * sweep should not have to know which it is holding.
   *
   * Returns what was lost, by id, so the caller can count it — the dry-run
   * staging this shipped under depended on being able to measure the loss
   * before paying for it.
   */
  spoil(
    elapsedTicks: number,
    factorFor: (itemId: string) => number,
    apply = true
  ): Map<string, number> {
    const lost = new Map<string, number>();
    if (elapsedTicks <= 0) return lost;
    for (const [itemId, count] of this.stacks) {
      const keeps = ITEMS[itemId]?.spoilTicks ?? 0;
      // Zero means it keeps indefinitely — hazelnuts, flint, a spear.
      if (keeps <= 0) continue;
      const life = keeps * Math.max(0.05, factorFor(itemId));
      // Loss is proportional to how much is held: a pile of forty berries loses
      // four times what a pile of ten does over the same day, which is what
      // makes storing more of something a real decision rather than a free one.
      const carried = (this.spoilage.get(itemId) ?? 0) + (elapsedTicks / life) * count;
      const whole = Math.floor(carried);
      if (whole <= 0) {
        if (apply) this.spoilage.set(itemId, carried);
        else lost.set(itemId, carried);
        continue;
      }
      if (!apply) {
        lost.set(itemId, whole);
        continue;
      }
      const taken = this.remove(itemId, whole);
      if (taken > 0) lost.set(itemId, taken);
      // Whatever could not be taken is dropped rather than banked: a stack that
      // has run out has nothing left to go off, and carrying the remainder
      // forward would make the *next* delivery rot on arrival.
      if (this.count(itemId) <= 0) this.spoilage.delete(itemId);
      else this.spoilage.set(itemId, carried - whole);
    }
    return lost;
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
