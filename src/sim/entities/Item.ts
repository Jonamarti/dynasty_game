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
  /** Thirst points restored by this food; M14 phase 12c's `ItemDef.water` uses this existing name. */
  hydration?: number;
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
  /**
   * M15 phase 21f. How much of a blow on each part of the body this turns
   * aside, 0 to 1. Wearable armour applies only while the layer is worn.
   * Replaces the single `armour`
   * number: a hide cuirass shields the torso best and leaves the head bare, and
   * a blow is now rolled against the part it lands on (`Tech.protectionOf`).
   * Never 1 — a wearer nobody can hurt is a fight nobody can end.
   */
  protects?: Partial<Record<import('./Body.ts').BodyPart, number>>;
  /**
   * M15 phase 37. The technique behind a garment, when how well it is made
   * matters to how well it turns a blow (`Tech.armourFit`). Left out, the
   * garment protects by `protects` alone, as every garment did before the metal.
   */
  armourTech?: string;
  /**
   * M15 phase 11a. What fits in a hand, in two hands, or on a shoulder.
   * `perHand` is a fistful, `perArms` an armload with both hands, and
   * `shoulder` — only present on the few things big enough to carry that way
   * (a log, a carcass) — the most a person can heft onto one shoulder.
   * `hands` is how many hands holding *any* amount of this occupies: most
   * tools and weapons take one, a drawn bow or a hauled cart takes two.
   * Required on every entry below; `item.test.ts` enforces it.
   */
  hand: { perHand: number; perArms: number; hands: 1 | 2; shoulder?: number };
  /** M15 phase 14a. A wearable item and the body slot it occupies. */
  garment?: {
    slot: import('./Equipment.ts').GarmentSlot;
    warmth: number;
  };
  /**
   * M15 phase 11a. What kind of thing this is for a container's `accepts`
   * list to test against. Unread until phase 11c gives the container ladder
   * (bundle, hide bag, basket, sledge, cart) its capacities.
   */
  class: ItemClass;
  /**
   * M15 phase 11c. A container adds capacity only while assigned to this slot;
   * `accepts` keeps the extra room specific to the kinds it can hold.
   */
  container?: { slot: import('./Equipment.ts').Slot; capacity: number; accepts: ItemClass[] };
  /** Item can be carried to and placed as the matching 1×1 furniture Building. */
  furniture?: boolean;
}

/**
 * M15 phase 11a. What `ItemDef.container.accepts` and the hand table above
 * test against: food that spoils and is eaten from the hand, a pole or a
 * stick long enough that it will not fit in a pouch, a soft or fragile thing
 * a pouch or basket holds, and something too big or awkward for either.
 */
export type ItemClass = 'food' | 'long' | 'small' | 'bulky' | 'loose';

export const ITEMS: Record<string, ItemDef> = {
  bedding: { id: 'bedding', label: 'Bedding', nutrition: 0, spoilTicks: 0, baseValue: 5,
    class: 'bulky', hand: { perHand: 0, perArms: 1, hands: 2 }, furniture: true },
  bed: { id: 'bed', label: 'Bed', nutrition: 0, spoilTicks: 0, baseValue: 12,
    class: 'bulky', hand: { perHand: 0, perArms: 1, hands: 2 }, furniture: true },
  raft: { id: 'raft', label: 'Reed raft', nutrition: 0, spoilTicks: 0, baseValue: 12,
    class: 'bulky', hand: { perHand: 0, perArms: 2, hands: 2, shoulder: 0 } },
  sail: { id: 'sail', label: 'Sail', nutrition: 0, spoilTicks: 0, baseValue: 18,
    class: 'long', hand: { perHand: 1, perArms: 1, hands: 2 } },
  logboat: { id: 'logboat', label: 'Logboat', nutrition: 0, spoilTicks: 0, baseValue: 24,
    class: 'bulky', hand: { perHand: 0, perArms: 1, hands: 2, shoulder: 0 } },
  berries:  { id: 'berries',  label: 'Berries',    nutrition: 14, hydration: 4, spoilTicks: 2400, baseValue: 1, macros: { fat: 0.05, protein: 0.05, carb: 0.90 }, class: 'food', hand: { perHand: 4, perArms: 10, hands: 1 } },
  apple:    { id: 'apple',    label: 'Apples',     nutrition: 16, hydration: 6, spoilTicks: 6000, baseValue: 1, macros: { fat: 0.03, protein: 0.02, carb: 0.95 }, class: 'food', hand: { perHand: 2, perArms: 6, hands: 1 } },
  pear:     { id: 'pear',     label: 'Pears',      nutrition: 15, hydration: 6, spoilTicks: 4800, baseValue: 1, macros: { fat: 0.03, protein: 0.02, carb: 0.95 }, class: 'food', hand: { perHand: 2, perArms: 6, hands: 1 } },
  plum:     { id: 'plum',     label: 'Plums',      nutrition: 13, hydration: 4, spoilTicks: 3000, baseValue: 1, macros: { fat: 0.04, protein: 0.04, carb: 0.92 }, class: 'food', hand: { perHand: 2, perArms: 6, hands: 1 } },
  // A nut is a fat, not a fruit: it is what keeps `carb` from being every
  // forageable's dominant macro, which would make the whole system read as a
  // single lever wearing three names.
  hazelnut: { id: 'hazelnut', label: 'Hazelnuts',  nutrition: 22, spoilTicks: 0,    baseValue: 2, macros: { fat: 0.75, protein: 0.15, carb: 0.10 }, class: 'food', hand: { perHand: 4, perArms: 10, hands: 1 } },
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
  acorn:    { id: 'acorn',    label: 'Acorns',     nutrition: 0,  spoilTicks: 0,    baseValue: 1, class: 'food', hand: { perHand: 4, perArms: 10, hands: 1 } },
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
  grain:    { id: 'grain',    label: 'Grain',      nutrition: 0,  spoilTicks: 0,    baseValue: 1, class: 'food', hand: { perHand: 4, perArms: 10, hands: 1 } },
  meal:     { id: 'meal',     label: 'Meal',       nutrition: 34, spoilTicks: 0,    baseValue: 4, macros: { fat: 0.02, protein: 0.13, carb: 0.85 }, class: 'food', hand: { perHand: 4, perArms: 10, hands: 1 } },
  // M8.2. The only item in the game whose whole purpose is to be put back into
  // the ground. Worth nothing to eat and nearly nothing to trade, and a band
  // that has some is a band whose fields have another twenty years in them.
  compost:  { id: 'compost',  label: 'Compost',    nutrition: 0,  spoilTicks: 0,    baseValue: 1, class: 'bulky', hand: { perHand: 1, perArms: 6, hands: 1 } },
  meat:     { id: 'meat',     label: 'Raw meat',   nutrition: 30, spoilTicks: 1200, baseValue: 3, macros: { fat: 0.45, protein: 0.55, carb: 0 }, class: 'food', hand: { perHand: 2, perArms: 5, hands: 1, shoulder: 8 } },
  fish:     { id: 'fish',     label: 'Fish',       nutrition: 18, spoilTicks: 800,  baseValue: 2, macros: { fat: 0.35, protein: 0.65, carb: 0 }, class: 'food', hand: { perHand: 2, perArms: 5, hands: 1, shoulder: 8 } },
  // A kill yields a hide as well as meat, and a hide in cold hands is the
  // heaviest spark clothing has. Without it that route could never fire.
  hide:     { id: 'hide',     label: 'Hide',       nutrition: 0,  spoilTicks: 0,    baseValue: 3, class: 'bulky', hand: { perHand: 1, perArms: 2, hands: 1, shoulder: 4 } },
  // Weapons. Each is gated on a technology and read through `techPower`, so the
  // same spear is worth more in the hands of whoever kept improving the design.
  spear: {
    id: 'spear', label: 'Spear', nutrition: 0, spoilTicks: 0, baseValue: 9,
    // The reach is the point of it. Damage a little above a hand axe; what a
    // spear actually buys is hitting first.
    weapon: { damage: 0.55, reach: 0.9, hunt: 1.6, tech: 'spear' },
    class: 'long', hand: { perHand: 1, perArms: 1, hands: 1 },
  },
  bow: {
    id: 'bow', label: 'Bow', nutrition: 0, spoilTicks: 0, baseValue: 14,
    // Poor in a brawl and decisive against an animal that outruns you, which is
    // the whole reason hunting has been a garnish: a fresh deer is faster than a
    // person and a hunt could only ever be won by exhausting one.
    weapon: { damage: 0.3, reach: 1.6, hunt: 2.4, tech: 'bow' },
    // Two hands, always: there is no one-handed way to draw a bow, unlike the
    // spear's "needs both hands to throw far, works one-handed at a pinch".
    class: 'long', hand: { perHand: 1, perArms: 1, hands: 2 },
  },
  hide_armour: {
    id: 'hide_armour', label: 'Hide armour', nutrition: 0, spoilTicks: 0, baseValue: 11,
    // Averaged over where blows land (`Body.strikeShare`) this is the 0.3 the
    // piece turned aside as a single number before 21f: torso 0.5, arms 0.25,
    // legs 0.2, head bare.
    protects: { torso: 0.5, left_arm: 0.25, right_arm: 0.25, left_leg: 0.2, right_leg: 0.2 },
    class: 'bulky', hand: { perHand: 1, perArms: 1, hands: 1 },
    garment: { slot: 'torso', warmth: 0.1 },
  },
  // --- M8.1: what comes off a carcass once you know what to do with it -------
  //
  // Bone and sinew are taken only by a hunter who knows `bone_working`, which is
  // both honest — nobody butchers sinew out of a leg without a use for it — and
  // what keeps every world that has not worked it out bit-identical to the one
  // before this shipped. The same rule the acorn follows.
  bone:     { id: 'bone',     label: 'Bone',       nutrition: 0,  spoilTicks: 0,    baseValue: 2, class: 'small', hand: { perHand: 2, perArms: 6, hands: 1 } },
  sinew:    { id: 'sinew',    label: 'Sinew',      nutrition: 0,  spoilTicks: 0,    baseValue: 3, class: 'small', hand: { perHand: 4, perArms: 10, hands: 1 } },
  // A needle is a *stage*, not an ornament: it is worth making only because the
  // fur coat consumes one, and it is the reason `tailoring` sits behind
  // `bone_working` rather than behind `clothing` alone. An eyed needle is the
  // single artefact that separates people who could survive a glacial winter
  // from people who could not, and this is the closest the game can come to
  // saying so.
  needle:   { id: 'needle',   label: 'Bone needle', nutrition: 0, spoilTicks: 0,    baseValue: 6, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  bone_point: {
    id: 'bone_point', label: 'Bone point', nutrition: 0, spoilTicks: 0, baseValue: 10,
    // Between the flint spear and the bow, and closer to the bow: a barbed bone
    // head is light, so it throws further than it hits hard. Poor in a brawl for
    // exactly the same reason.
    weapon: { damage: 0.4, reach: 1.15, hunt: 2.0, tech: 'bone_working' },
    class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 },
  },
  atlatl: {
    id: 'atlatl', label: 'Spear-thrower', nutrition: 0, spoilTicks: 0, baseValue: 12,
    // It precedes the bow by twenty thousand years and sits just below it here,
    // which is the whole reason it requires only `spear`: a lever on the end of
    // your arm is a smaller idea than a bow, and it arrived first.
    weapon: { damage: 0.5, reach: 1.35, hunt: 2.1, tech: 'atlatl' },
    class: 'long', hand: { perHand: 1, perArms: 1, hands: 1 },
  },
  fur_coat: {
    id: 'fur_coat', label: 'Fur coat', nutrition: 0, spoilTicks: 0, baseValue: 15,
    // Thick pelts blunt a blow a little where they cover — the coat is for
    // warmth first, so it is a fifth of what a hide cuirass gives the torso.
    protects: { torso: 0.2, left_arm: 0.12, right_arm: 0.12, left_leg: 0.06, right_leg: 0.06 },
    class: 'bulky', hand: { perHand: 1, perArms: 1, hands: 1 },
    garment: { slot: 'torso', warmth: 0.4 },
  },
  // The only object in the game that does nothing useful at all, and the most
  // valuable thing a Palaeolithic band owns for exactly that reason.
  flute: { id: 'flute', label: 'Flute', nutrition: 0, spoilTicks: 0, baseValue: 16, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  // M8.1. Both are carried tools rather than materials, and both are read
  // through an item-presence test *and* `techPower` — a basket in the hands of
  // somebody who does not know basketry is a bundle of withies. That double
  // gate is deliberate: `handaxe` tests presence alone, which is the bug the
  // M8 plan lists under "three repairs to make while passing".
  bundle:   { id: 'bundle',   label: 'Bundle',     nutrition: 0,  spoilTicks: 0,    baseValue: 4, class: 'bulky', hand: { perHand: 1, perArms: 1, hands: 1 }, container: { slot: 'shoulder', capacity: 12, accepts: ['long'] } },
  hide_bag: { id: 'hide_bag', label: 'Hide bag',   nutrition: 0,  spoilTicks: 0,    baseValue: 6, class: 'bulky', hand: { perHand: 1, perArms: 1, hands: 1 }, container: { slot: 'belt', capacity: 12, accepts: ['small'] } },
  basket:   { id: 'basket',   label: 'Basket',     nutrition: 0,  spoilTicks: 0,    baseValue: 5, class: 'bulky', hand: { perHand: 1, perArms: 1, hands: 1 }, container: { slot: 'back', capacity: 24, accepts: ['small', 'food', 'loose'] } },
  sledge:   { id: 'sledge',   label: 'Sledge',     nutrition: 0,  spoilTicks: 0,    baseValue: 12, class: 'bulky', hand: { perHand: 0, perArms: 0, hands: 2 }, container: { slot: 'left', capacity: 30, accepts: ['small', 'long', 'bulky', 'food'] } },
  net:      { id: 'net',      label: 'Net',        nutrition: 0,  spoilTicks: 0,    baseValue: 7, class: 'bulky', hand: { perHand: 1, perArms: 1, hands: 1 } },
  flint:    { id: 'flint',    label: 'Flint',      nutrition: 0,  spoilTicks: 0,    baseValue: 2, class: 'small', hand: { perHand: 1, perArms: 3, hands: 1 } },
  sticks:   { id: 'sticks',   label: 'Sticks',     nutrition: 0,  spoilTicks: 0,    baseValue: 1, class: 'long', hand: { perHand: 2, perArms: 6, hands: 1 } },
  wood:     { id: 'wood',     label: 'Timber',     nutrition: 0,  spoilTicks: 0,    baseValue: 4, class: 'long', hand: { perHand: 0, perArms: 1, hands: 2, shoulder: 2 } },
  handaxe:  {
    id: 'handaxe', label: 'Hand axe', nutrition: 0, spoilTicks: 0, baseValue: 8,
    // It was always a weapon in everything but the code. No reach — you have to
    // be on top of somebody to use it — and poor for hunting, because the animal
    // has to be caught first.
    weapon: { damage: 0.35, reach: 0, hunt: 1.15, tech: 'hafting' },
    class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 },
  },
  thatch:   { id: 'thatch',   label: 'Thatch',     nutrition: 0,  spoilTicks: 0,    baseValue: 1, class: 'long', hand: { perHand: 2, perArms: 6, hands: 1 } },
  mud:      { id: 'mud',      label: 'Daub',       nutrition: 0,  spoilTicks: 0,    baseValue: 1, class: 'small', hand: { perHand: 1, perArms: 3, hands: 1 } },
  pottery:  { id: 'pottery',  label: 'Pot',        nutrition: 0,  spoilTicks: 0,    baseValue: 6, class: 'bulky', hand: { perHand: 1, perArms: 1, hands: 1 } },
  // --- M11 phase 10, the widened Neolithic: see m8_plan_the_ages.md ----------
  //
  // `ground_stone`'s two tools. Neither is a weapon, on the same call `basket`
  // and `net` already make: what they change is read through `techPower`
  // rather than through a fight, so giving either a `weapon` block would be
  // the `handaxe` bug wearing a polish.
  stone_axe: { id: 'stone_axe', label: 'Polished axe', nutrition: 0, spoilTicks: 0, baseValue: 10, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  adze:      { id: 'adze',      label: 'Adze',         nutrition: 0, spoilTicks: 0, baseValue: 9, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  // `spinning` and `weaving`, shipped in one commit because thread has no
  // reason to exist without the loom that consumes it — the same rule that
  // kept `needle` and `fur_coat` together.
  thread: { id: 'thread', label: 'Thread', nutrition: 0, spoilTicks: 0, baseValue: 3, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  // M11 phase 15c. `cordage`'s first thing in the hand, and here in the same
  // commit as the one verb that spends it — `bind` — because a rope nothing
  // used would be content declared and inert.
  rope: { id: 'rope', label: 'Rope', nutrition: 0, spoilTicks: 0, baseValue: 2, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  // The highest `baseValue` of anything a band can make at this point in the
  // tree, on purpose: `next-steps.md`'s note on `trade` reading `baseValue` is
  // what makes this "the first thing worth trading" rather than a description
  // nobody can act on.
  cloth: { id: 'cloth', label: 'Cloth', nutrition: 0, spoilTicks: 0, baseValue: 12, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  // `sickle`'s tool. A blade set in a haft, read the same double-gated way as
  // every other carried tool in this file: knowing the technology is not
  // enough, and carrying one is not enough either.
  sickle: { id: 'sickle', label: 'Sickle', nutrition: 0, spoilTicks: 0, baseValue: 8, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  // --- M11 phase 10, second commit -------------------------------------------
  // `the_wheel`'s cart. Not a weapon or a wearable, on the same double-gated
  // terms as everything else in this block.
  // Pulled with both hands and nothing else in them — the two-handed haul that
  // will make it a container slot in its own right once phase 11c wires up
  // the container ladder, not a thing that fits in a hand at all.
  cart: { id: 'cart', label: 'Cart', nutrition: 0, spoilTicks: 0, baseValue: 14, class: 'bulky', hand: { perHand: 0, perArms: 0, hands: 2 }, container: { slot: 'left', capacity: 60, accepts: ['small', 'long', 'bulky', 'food'] } },
  // `bread`. `spoilTicks: 0`, like `meal` — it is baked meal, and keeping is
  // the whole point of baking it, per the plan's own table. Higher nutrition
  // than `meal` is the other half of the same claim, and mostly `carb` for the
  // same reason `meal` is.
  bread: {
    id: 'bread', label: 'Bread', nutrition: 42, spoilTicks: 0, baseValue: 5,
    macros: { fat: 0.05, protein: 0.15, carb: 0.80 },
    class: 'food', hand: { perHand: 4, perArms: 10, hands: 1 },
  },
  // `dairying`'s byproduct. Real spoil ticks, unlike most of this file's
  // pastoral entries — milk goes off fast, which is honest data even while
  // `spoilRate` sits at 0 by default and nothing yet reads it for this item.
  milk: {
    // M14 phase 12c: the continental water fallback includes milk; the shared
    // helper keeps this new hydration inactive in the classic island.
    id: 'milk', label: 'Milk', nutrition: 20, hydration: 5, spoilTicks: 400, baseValue: 3,
    macros: { fat: 0.5, protein: 0.35, carb: 0.15 },
    class: 'food', hand: { perHand: 2, perArms: 5, hands: 1 },
  },
  // `wool`'s byproduct, and the material `wool_cloth` is made from. Sheared
  // rather than culled, so — unlike `hide` — it comes off a living animal and
  // has no place in `synthesis.test.ts`'s rare-ingredient set: a pen with
  // `wool` known produces it every day, not once per kill.
  wool: { id: 'wool', label: 'Wool', nutrition: 0, spoilTicks: 0, baseValue: 4, class: 'bulky', hand: { perHand: 2, perArms: 6, hands: 1 } },
  // `wool`'s recipe output. Warmer than `cloth` — see `Tech.warmthFrom` — and
  // a second item rather than a second ingredient on `cloth` itself, for the
  // same reason `groats` is a second recipe rather than a second ingredient
  // on `meal`: flax and fleece are two different harvests, and a technology
  // tree should be able to tell the player it found a better material rather
  // than silently swap the old one out.
  wool_cloth: { id: 'wool_cloth', label: 'Wool cloth', nutrition: 0, spoilTicks: 0, baseValue: 15, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
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
    class: 'food', hand: { perHand: 2, perArms: 5, hands: 1 },
  },
  roast_meat: { id: 'roast_meat', label: 'Roast meat', nutrition: 40, spoilTicks: 2400, baseValue: 4, macros: { fat: 0.45, protein: 0.55, carb: 0 }, class: 'food', hand: { perHand: 2, perArms: 5, hands: 1, shoulder: 8 } },
  roast_fish: { id: 'roast_fish', label: 'Roast fish', nutrition: 24, spoilTicks: 1600, baseValue: 3, macros: { fat: 0.35, protein: 0.65, carb: 0 }, class: 'food', hand: { perHand: 2, perArms: 5, hands: 1, shoulder: 8 } },
  // M15 phase 21d. The baneberry's fruit: the same nourishment as a berry, so
  // that anybody who does not know better finds it as appetising (`Beliefs`
  // lists it among the foods a person already expects to be edible), and a
  // risk of poisoning in `Body.SICKENS` that makes eating it a mistake.
  toxic_berries: { id: 'toxic_berries', label: 'Baneberries', nutrition: 14, hydration: 4, spoilTicks: 2400, baseValue: 0, macros: { fat: 0.05, protein: 0.05, carb: 0.90 }, class: 'food', hand: { perHand: 4, perArms: 10, hands: 1 } },
  // The yarrow's leaves. Not food; `tend` spends one to ease a poisoning or to
  // draw the infection out of a festering wound (`Body.dress`, `Body.soothe`).
  herbs: { id: 'herbs', label: 'Herbs', nutrition: 0, spoilTicks: 0, baseValue: 3, class: 'small', hand: { perHand: 4, perArms: 10, hands: 1 } },
  // M15 phase 26. What a spade lifts out and a mound is built of: a handful,
  // three to an armful, and a basket on the back is what lets a person move
  // enough of it to matter (`loose` is the class the basket takes). Worth
  // nearly nothing to trade; `dig` makes it and `pile` spends it, and a band
  // with a heap of it is a band that has been moving ground.
  earth: { id: 'earth', label: 'Earth', nutrition: 0, spoilTicks: 0, baseValue: 0, class: 'loose', hand: { perHand: 1, perArms: 3, hands: 1 } },
  antler_pick: { id: 'antler_pick', label: 'Antler pick', nutrition: 0, spoilTicks: 0, baseValue: 7, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  spade: { id: 'spade', label: 'Wooden spade', nutrition: 0, spoilTicks: 0, baseValue: 8, class: 'long', hand: { perHand: 1, perArms: 1, hands: 1 } },
  // M15 phase 13d. `stone_boiling`'s broth: the first food made from bone, which
  // until now only served for tools. Fat and protein out of the marrow, and some
  // water in it. Cooked, so absent from `Body.SICKENS` and safe like every other
  // cooked food. It goes off faster than roast meat: a broth is not carried.
  broth: { id: 'broth', label: 'Broth', nutrition: 26, hydration: 10, spoilTicks: 1200, baseValue: 3, macros: { fat: 0.4, protein: 0.6, carb: 0 }, class: 'food', hand: { perHand: 2, perArms: 5, hands: 1 } },
  // `flatbread`: meal baked on the hearth stone, no oven. Worth more than the
  // meal and less than the oven's loaf, and it goes stale - the loaf is the one
  // that keeps. Carbohydrate like the meal it is made of; cooked, so it
  // makes nobody ill.
  flatbread: {
    id: 'flatbread', label: 'Flatbread', nutrition: 38, spoilTicks: 2400, baseValue: 4,
    macros: { fat: 0.04, protein: 0.14, carb: 0.82 },
    class: 'food', hand: { perHand: 4, perArms: 10, hands: 1 },
  },
  // `sling`. Reach past the spear and a better hunting term (small game that a
  // thrown spear cannot reach), poor in a brawl, one hand. Below the bow in
  // every term that matters for a hunt. Its ammunition is not an item: see
  // `RECIPES.sling` and the open doubts of phase 13d.
  sling: {
    id: 'sling', label: 'Sling', nutrition: 0, spoilTicks: 0, baseValue: 5,
    weapon: { damage: 0.2, reach: 1.4, hunt: 1.7, tech: 'sling' },
    class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 },
  },
  // --- M15 phase 37 (M8.3): the metal tier ------------------------------------
  //
  // `charcoal`: wood burned slow under turf. Not food and not a weapon; it is
  // read in two places, `Tech.warmthFrom` (a coal in the pack is a brazier) and
  // the furnace recipes of `smelting`, which is what it is for. Loose, like
  // earth: a basket takes it, a hand holds a fistful of it.
  // `native_copper`'s three things. The nugget is the raw metal, found; the awl
  // is read by `Tech.awlFactor`; the pendant is an ornament, and what it is
  // for is `baseValue`: the best thing of its size a band can make at this point,
  // which is exactly what `gift` and `doSteal` read, and what trade will read.
  copper_nugget: { id: 'copper_nugget', label: 'Copper nugget', nutrition: 0, spoilTicks: 0, baseValue: 6, class: 'small', hand: { perHand: 1, perArms: 3, hands: 1 } },
  copper_awl: { id: 'copper_awl', label: 'Copper awl', nutrition: 0, spoilTicks: 0, baseValue: 9, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  copper_pendant: { id: 'copper_pendant', label: 'Copper pendant', nutrition: 0, spoilTicks: 0, baseValue: 18, class: 'small', hand: { perHand: 1, perArms: 2, hands: 1 } },
  // `mining`'s two ores: raw, heavy, worth nothing to eat and a little to
  // anybody who knows what a furnace does with them. Tin is dearer by far.
  copper_ore: { id: 'copper_ore', label: 'Copper ore', nutrition: 0, spoilTicks: 0, baseValue: 4, class: 'bulky', hand: { perHand: 1, perArms: 4, hands: 1 } },
  tin_ore: { id: 'tin_ore', label: 'Tin ore', nutrition: 0, spoilTicks: 0, baseValue: 9, class: 'bulky', hand: { perHand: 1, perArms: 3, hands: 1 } },
  // `smelting`'s ingot. Not a tool and not an ornament: it is the stuff of both,
  // and what `casting` consumes. Worth four times the ore it came from, which is
  // what makes carrying one a reason to keep it from a thief.
  copper: { id: 'copper', label: 'Copper', nutrition: 0, spoilTicks: 0, baseValue: 14, class: 'bulky', hand: { perHand: 1, perArms: 3, hands: 1 } },
  // `casting`'s two. The axe is read through `AXE_TOOLS`, so it is not a weapon:
  // knowing how to cast it and a swing at a person are different questions, and
  // the `handaxe` bug is what mixing them gave. The dagger is a weapon and only a
  // weapon: short, quick, good in a scuffle, poor against an animal that has to be
  // caught first.
  copper_axe: { id: 'copper_axe', label: 'Copper axe', nutrition: 0, spoilTicks: 0, baseValue: 16, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  copper_dagger: {
    id: 'copper_dagger', label: 'Copper dagger', nutrition: 0, spoilTicks: 0, baseValue: 15,
    weapon: { damage: 0.5, reach: 0.25, hunt: 1.2, tech: 'casting' },
    class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 },
  },
  // `alloying`'s two: the ingot of tin and the ingot of bronze. Tin is the dearest
  // thing a band can make before iron, because there is so little of it.
  tin: { id: 'tin', label: 'Tin', nutrition: 0, spoilTicks: 0, baseValue: 22, class: 'bulky', hand: { perHand: 1, perArms: 3, hands: 1 } },
  bronze: { id: 'bronze', label: 'Bronze', nutrition: 0, spoilTicks: 0, baseValue: 20, class: 'bulky', hand: { perHand: 1, perArms: 3, hands: 1 } },
  // `bronze_tools`. Read through `AXE_TOOLS`, `buildFactor`, `reapFactor` and
  // `DIG_TOOLS`; none is a weapon, on the `handaxe` argument.
  bronze_axe: { id: 'bronze_axe', label: 'Bronze axe', nutrition: 0, spoilTicks: 0, baseValue: 28, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  bronze_adze: { id: 'bronze_adze', label: 'Bronze adze', nutrition: 0, spoilTicks: 0, baseValue: 26, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  bronze_sickle: { id: 'bronze_sickle', label: 'Bronze sickle', nutrition: 0, spoilTicks: 0, baseValue: 22, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  bronze_spade: { id: 'bronze_spade', label: 'Bronze spade', nutrition: 0, spoilTicks: 0, baseValue: 30, class: 'long', hand: { perHand: 1, perArms: 1, hands: 1 } },
  // M15 phase 40e: each iron tool is read by its existing economic work path.
  iron_axe: { id: 'iron_axe', label: 'Iron axe', nutrition: 0, spoilTicks: 0, baseValue: 32, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  iron_adze: { id: 'iron_adze', label: 'Iron adze', nutrition: 0, spoilTicks: 0, baseValue: 30, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  iron_sickle: { id: 'iron_sickle', label: 'Iron sickle', nutrition: 0, spoilTicks: 0, baseValue: 26, class: 'small', hand: { perHand: 1, perArms: 1, hands: 1 } },
  iron_spade: { id: 'iron_spade', label: 'Iron spade', nutrition: 0, spoilTicks: 0, baseValue: 34, class: 'long', hand: { perHand: 1, perArms: 1, hands: 1 } },
  // One person carries and steers the plough; the animal pair is leased from a pen during sowing.
  iron_plough: { id: 'iron_plough', label: 'Iron plough', nutrition: 0, spoilTicks: 0, baseValue: 48, class: 'long', hand: { perHand: 1, perArms: 1, hands: 2 } },
  // `bronze_arms`. The sword is a weapon like the dagger, further reaching and
  // harder-hitting than anything a flint can be; the helm is the first garment
  // to cover the head, and its worth passes through `armourTech`.
  bronze_sword: {
    id: 'bronze_sword', label: 'Bronze sword', nutrition: 0, spoilTicks: 0, baseValue: 34,
    weapon: { damage: 0.75, reach: 0.55, hunt: 1.35, tech: 'bronze_arms' },
    class: 'long', hand: { perHand: 1, perArms: 1, hands: 1 },
  },
  bronze_helm: {
    id: 'bronze_helm', label: 'Bronze helm', nutrition: 0, spoilTicks: 0, baseValue: 30,
    protects: { head: 0.55 }, armourTech: 'bronze_arms',
    class: 'bulky', hand: { perHand: 1, perArms: 1, hands: 1 },
  },
  // `goldwork`. The nugget is the raw metal; the ornament is what a band makes of
  // it, and its `baseValue` is the highest in the game on purpose: it is worth
  // what a people agrees it is worth, and `gift`, `doSteal` and the debts of
  // `Amends` all read exactly that number.
  gold_nugget: { id: 'gold_nugget', label: 'Gold nugget', nutrition: 0, spoilTicks: 0, baseValue: 24, class: 'small', hand: { perHand: 1, perArms: 3, hands: 1 } },
  gold_ornament: { id: 'gold_ornament', label: 'Gold ornament', nutrition: 0, spoilTicks: 0, baseValue: 60, class: 'small', hand: { perHand: 1, perArms: 2, hands: 1 } },
  charcoal: { id: 'charcoal', label: 'Charcoal', nutrition: 0, spoilTicks: 0, baseValue: 3, class: 'loose', hand: { perHand: 2, perArms: 6, hands: 1 } },
  iron_ore: { id: 'iron_ore', label: 'Iron ore', nutrition: 0, spoilTicks: 0, baseValue: 5, class: 'bulky', hand: { perHand: 1, perArms: 3, hands: 1 } },
  // M15 phase 40b: the spongy, slag-bearing iron from the bloomery; forging
  // will turn it into wrought iron in the next node.
  iron_bloom: { id: 'iron_bloom', label: 'Iron bloom', nutrition: 0, spoilTicks: 0, baseValue: 12, class: 'bulky', hand: { perHand: 1, perArms: 3, hands: 1 } },
  // The smith has beaten most of the slag out at a stone anvil. Later iron
  // tools use this clean, workable stock rather than the raw bloom.
  wrought_iron: { id: 'wrought_iron', label: 'Wrought iron', nutrition: 0, spoilTicks: 0, baseValue: 18, class: 'bulky', hand: { perHand: 1, perArms: 3, hands: 1 } },
  // M15 phase 40d: steel is carburised stock; its edge has a real weapon reader.
  steel: { id: 'steel', label: 'Steel', nutrition: 0, spoilTicks: 0, baseValue: 24, class: 'bulky', hand: { perHand: 1, perArms: 3, hands: 1 } },
  steel_sword: {
    id: 'steel_sword', label: 'Steel sword', nutrition: 0, spoilTicks: 0, baseValue: 44,
    weapon: { damage: 0.95, reach: 0.65, hunt: 1.55, tech: 'carburising' },
    class: 'long', hand: { perHand: 1, perArms: 1, hands: 1 },
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
  /** M15 phase 34: escrow moves stacks with their fractional spoilage carry. */
  transferSnapshot(): InventoryTransferState {
    const fields = Object.keys(this).sort();
    if (fields.length !== 3 || fields[0] !== 'spoilage' || fields[1] !== 'stacks' || fields[2] !== 'version' ||
        !(this.stacks instanceof Map) || !(this.spoilage instanceof Map)) {
      throw new TypeError('Inventory transfer fields do not match the supported state');
    }
    return validateInventoryTransferState({ version: this.version, stacks: [...this.stacks.entries()], spoilage: [...this.spoilage.entries()] });
  }

  /** Check a prepared extraction without changing either contents or cache generation. */
  assertCanTakeTransferState(expected: InventoryTransferState): void {
    const clean = validateInventoryTransferState(expected);
    if (!sameInventoryTransferState(this.transferSnapshot(), clean)) throw new RangeError('inventory changed before transfer');
    if ((this.stacks.size !== 0 || this.spoilage.size !== 0) && this.version >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('inventory version cannot advance for transfer');
    }
  }

  /** Empty this inventory only if it still has the state the caller inspected. */
  takeTransferState(expected: InventoryTransferState): void {
    this.assertCanTakeTransferState(expected);
    if (this.stacks.size === 0 && this.spoilage.size === 0) return;
    this.stacks.clear();
    this.spoilage.clear();
    this.version++;
  }

  /** Check a prepared restoration without changing this inventory. */
  assertCanRestoreTransferState(state: InventoryTransferState): void {
    const clean = validateInventoryTransferState(state);
    if (this.stacks.size !== 0 || this.spoilage.size !== 0) throw new RangeError('inventory transfer destination is not empty');
    if (Math.max(this.version, clean.version) >= Number.MAX_SAFE_INTEGER) throw new RangeError('inventory version cannot advance for transfer');
  }

  /** Restore escrow only into a truly empty destination; bump the cache generation. */
  restoreTransferState(state: InventoryTransferState): void {
    const clean = validateInventoryTransferState(state);
    this.assertCanRestoreTransferState(clean);
    this.stacks = new Map(clean.stacks);
    this.spoilage = new Map(clean.spoilage);
    this.version = Math.max(this.version, clean.version) + 1;
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

export interface InventoryTransferState {
  readonly version: number;
  readonly stacks: readonly (readonly [string, number])[];
  readonly spoilage: readonly (readonly [string, number])[];
}

export function validateInventoryTransferState(value: unknown): InventoryTransferState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('inventory transfer state must be an object');
  const state = value as Partial<InventoryTransferState>;
  if (Object.keys(value).length !== 3 || !Object.hasOwn(value, 'version') || !Object.hasOwn(value, 'stacks') || !Object.hasOwn(value, 'spoilage')) {
    throw new TypeError('inventory transfer state has unknown or missing fields');
  }
  if (!Number.isSafeInteger(state.version) || state.version! < 0) throw new RangeError('inventory transfer version must be a non-negative safe integer');
  const rows = (input: unknown, label: string): [string, number][] => {
    if (!Array.isArray(input)) throw new TypeError(`inventory transfer ${label} must be an array`);
    const seen = new Set<string>();
    const out: [string, number][] = [];
    for (const row of input) {
      if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' || !row[0] || !Number.isFinite(row[1]) || row[1] < 0) {
        throw new RangeError(`inventory transfer ${label} contains an invalid entry`);
      }
      if (seen.has(row[0])) throw new RangeError(`inventory transfer ${label} contains a duplicate item`);
      seen.add(row[0]);
      if (label === 'stacks' && row[1] <= 0) throw new RangeError('inventory transfer stacks must be positive');
      out.push([row[0], row[1]]);
    }
    return out;
  };
  return { version: state.version!, stacks: rows(state.stacks, 'stacks'), spoilage: rows(state.spoilage, 'spoilage') };
}

function sameInventoryTransferState(a: InventoryTransferState, b: InventoryTransferState): boolean {
  const equalRows = (left: readonly (readonly [string, number])[], right: readonly (readonly [string, number])[]) =>
    left.length === right.length && left.every((row, i) => row[0] === right[i]![0] && row[1] === right[i]![1]);
  return a.version === b.version && equalRows(a.stacks, b.stacks) && equalRows(a.spoilage, b.spoilage);
}
