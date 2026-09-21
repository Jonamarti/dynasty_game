/**
 * Structures: windbreaks, mud huts, storage pits, and the stockpile squares a
 * player draws on bare ground.
 *
 * Two things make buildings worth having rather than decoration:
 *
 *  - **Shelter answers cold.** Until now nothing in the world could make a
 *    person warm, so a real winter was unsurvivable and the winter scenario had
 *    to be tuned down to a rate nobody would notice. A hut is the first honest
 *    answer to that, which is why it is the first thing anyone should build.
 *  - **Storage decouples finding food from eating it.** A person can only carry
 *    so much and food spoils in a pack; a pit lets a band hold a surplus, which
 *    is the precondition for trade, for feeding people who did not forage, and
 *    eventually for farming.
 *
 * Advanced designs are gated behind knowledge that does not exist yet. They are
 * declared here so the progression is visible, and `Simulation.knownTech`
 * keeps them out of the build menu until M4 makes discovery real.
 */
import { Inventory } from './Item.ts';
import { Crop } from './Field.ts';

export interface BuildingDef {
  id: string;
  label: string;
  /** Glyph for the build menu and the map. */
  icon: string;
  width: number;
  height: number;
  /** What must be delivered to the site before it can be finished. */
  materials: Record<string, number>;
  /** Ticks of work, at skill factor 1, once materials are on site. */
  workTicks: number;
  /** 0-1 reduction in cold for anyone standing inside. */
  shelter: number;
  /** Item capacity. 0 means it stores nothing. */
  storage: number;
  /**
   * Knowledge required before this can be placed. Null means anyone can build
   * it with sticks, mud and patience.
   */
  requiresTech: string | null;
  /**
   * Passive production: what this structure catches on its own, per day.
   *
   * The first thing in the game that produces without anybody standing over it,
   * and the reason M8.1's Mesolithic is a real tier rather than a list of nodes.
   * `perDay` is fractional on purpose — a snare that takes a hare every second
   * day is 0.5 — and `Progress.accrueUnits` keeps the remainder between sweeps
   * so a slow trap is slow rather than broken. `Simulation.workTraps` reads it.
   *
   * The rate is scaled by how well the owning band still knows the technology
   * behind the trap, which is what keeps the tech pillar honest: a snare line
   * whose only setter died is a loop of rotting cord, not a food supply.
   */
  yields?: { item: string; perDay: number };
  /**
   * What this slowly turns into something, and how fast — M8.2.
   *
   * The same shape as `yields` and deliberately **not** the same field. A trap
   * takes something out of the world and a heap turns something already in it
   * into something else, and four systems tell them apart for four different
   * reasons: the planner wants a heap only where there is a field to spread it
   * on, `Brain` must not read a heap as a larder, the health report counts
   * traps as a food supply, and `doStore` refuses to fill a trap. One flag
   * reused for both would have made every one of those answers wrong in a way
   * that reads as a bug months later.
   */
  matures?: { item: string; perDay: number };
  /**
   * Where it may stand, beyond "on land, and not on top of something else".
   *
   * `canPlace` had no per-design predicate at all, because until the fish trap
   * nothing cared where it was: a hut is a hut anywhere. A trap set for fish has
   * to be in the water's edge, and a design whose whole point is the shore is
   * worse than useless in the middle of a field.
   */
  placement?: 'shore' | 'arable';
  /**
   * True if this is somewhere work is done rather than somewhere anybody lives.
   *
   * M8.1, mechanism 4. A recipe may name a station in `RecipeDef.station`, and
   * `doCraft` will then refuse to run anywhere else — which is what makes a
   * quern, and later a kiln and a loom, a *place* rather than another item in a
   * pack. The flag is here rather than derived from `RECIPES` because
   * `Recipe.ts` imports this file and not the other way round, and because
   * `tech.test.ts` asserts the two tables agree: a `station: 'kiln'` naming
   * nothing flagged here is exactly the longhouse-behind-a-technology-that-
   * does-not-exist defect, one table along.
   */
  station?: boolean;
  /**
   * True if this is ground that is worked rather than a structure that stands.
   *
   * M8.2. A field is a building because everything *around* a field — siting,
   * placement refusals, the walk to it, ownership, the renderer — is what
   * `Building` already is; see the header of `Field.ts`. The flag is what keeps
   * the four systems that must treat it differently honest: the planner must
   * not count a plot against the roof ceiling, `doStore` must not fill it, the
   * scorer must not read it as shelter, and the health report counts fields on
   * their own. A predicate rather than four hand-written `def.id === 'field'`
   * tests, for the same reason `isTrap` is one.
   */
  field?: boolean;
  /**
   * How much longer food keeps in here. 1 is no better than a pack.
   *
   * M8.1, mechanism 1. A *building* multiplier rather than a person one,
   * because a store belongs to a band and not to whoever last walked in — and
   * baking the storer's own skill in at deposit time would need per-unit state,
   * which `Inventory` deliberately does not have. It is also the second reason
   * to build a drying rack, which otherwise would have been a hut that does
   * nothing.
   */
  preserves?: number;
  /**
   * A pen: what it holds, how much it starts with, and how fast it breeds —
   * M11 phase 10.
   *
   * Deliberately reuses `store` and `doTake` rather than inventing a verb. A
   * pen is, mechanically, a larder that fills itself — proportionally to what
   * is already in it, which is what makes it breeding rather than a slower
   * trap: `Simulation.workHerds` grows `store.count(item)` by a fraction of
   * itself each day, so a pen culled down to nothing stays at nothing for
   * ever, and a pen left alone grows toward `storage`. `seed` is what a
   * newly-finished pen is stocked with, since growth from zero is zero
   * whatever the fraction — a pen with nothing in it is not founding a herd,
   * it is an empty pen.
   *
   * Excluded from `doStore` and from `Brain`'s deposit branch on the same
   * argument `isTrap` already makes: this is somewhere food comes *from*.
   */
  herd?: { item: string; seed: number; growthPerDay: number };
  description: string;
}

/**
 * True if a design is a trap rather than a building.
 *
 * A predicate rather than a `kind` field, because "is this a trap?" is asked by
 * four systems for four different reasons and every one of them means "does it
 * yield on its own": the band planner must not count traps against its hut
 * ceiling, the scorer must not treat one as somewhere to *put* food, `doStore`
 * refuses to fill one, and the health report counts them separately. Writing
 * the test out four times is how the four answers drift apart.
 */
export function isTrap(def: BuildingDef): boolean {
  return def.yields !== undefined;
}

/**
 * True if a design is a crafting station.
 *
 * The same kind of predicate as `isTrap`, and it exists for the same reason:
 * "is this a workshop?" is asked by the band planner (a quern must not count
 * against the roof ceiling, and must not be planned ahead of a store), by the
 * scorer and by the catalogue, and three hand-written copies of
 * `def.station === true` is how the three answers drift apart.
 */
export function isStation(def: BuildingDef): boolean {
  return def.station === true;
}

/** True if a design is worked ground rather than a structure. See `field`. */
export function isField(def: BuildingDef): boolean {
  return def.field === true;
}

/** True if a design ripens its contents rather than catching anything. */
export function isHeap(def: BuildingDef): boolean {
  return def.matures !== undefined;
}

/** True if a design is a pen: a larder that breeds what it holds. See `herd`. */
export function isHerd(def: BuildingDef): boolean {
  return def.herd !== undefined;
}

export const BUILDINGS: Record<string, BuildingDef> = {
  stockpile: {
    id: 'stockpile',
    label: 'Stockpile',
    icon: '\u{1F4CD}',
    width: 3, height: 3,
    materials: {},
    workTicks: 0,
    shelter: 0,
    storage: 60,
    requiresTech: null,
    description: 'Bare ground set aside for goods. Costs nothing and keeps nothing dry.',
  },
  windbreak: {
    id: 'windbreak',
    label: 'Windbreak',
    icon: '\u{1FAB5}',
    width: 2, height: 2,
    materials: { sticks: 8, thatch: 4 },
    workTicks: 140,
    shelter: 0.4,
    storage: 0,
    requiresTech: null,
    description:
      'Sticks and thatch braced against the wind. An hour of work, no tree ' +
      'felled, and a cold night survived.',
  },
  storage_pit: {
    id: 'storage_pit',
    label: 'Storage pit',
    icon: '\u{1F573}',
    width: 2, height: 2,
    materials: { sticks: 7, thatch: 3 },
    workTicks: 180,
    shelter: 0,
    storage: 120,
    // A lined hollow in cold ground is a root cellar, and keeping food is the
    // entire reason anybody ever dug one — the description has said so since
    // M2 and nothing read it until M8.1 gave `spoilTicks` a reader. Without
    // this the pit is a hole that food rots in at exactly the rate it rots in a
    // pack, which would make the sentence below a lie.
    preserves: 1.6,
    requiresTech: null,
    description: 'A lined hollow. Holds a band’s surplus through a season.',
  },
  mud_hut: {
    id: 'mud_hut',
    label: 'Mud hut',
    icon: '\u{1F6D6}',
    width: 3, height: 3,
    materials: { wood: 8, sticks: 6, thatch: 10, mud: 14 },
    workTicks: 520,
    shelter: 0.85,
    storage: 40,
    // Indoors and out of the sun, but it is a house rather than a store.
    preserves: 1.2,
    requiresTech: null,
    description:
      'Daubed walls on a felled-timber frame, under thatch. Warm enough to ' +
      'winter in, and the first thing worth cutting a tree for.',
  },

  // --- M11 phase 10, second commit: two more shelters -----------------------
  //
  // `wattle_daub` and `masonry` each answer the mud hut differently: a woven
  // wall skips the felled-timber frame entirely, and a stone one out-shelters
  // everything short of the longhouse. `BandSystem.planBuildings` picks
  // whichever known, affordable design shelters best on its own — no changes
  // needed there, since it already reads `BuildingDef.shelter` rather than a
  // hardcoded id.
  wattle_hut: {
    id: 'wattle_hut',
    label: 'Wattle hut',
    icon: '\u{1F6D6}',
    width: 3, height: 3,
    // No wood at all — the whole point of a woven wall is that it answers
    // what the mud hut's timber frame answers without felling a tree for it.
    materials: { sticks: 10, thatch: 12, mud: 10 },
    workTicks: 400,
    shelter: 0.88,
    storage: 40,
    preserves: 1.2,
    requiresTech: 'wattle_daub',
    description:
      'Withies woven between posts and daubed over. Raised faster than a mud ' +
      'hut, and it keeps the wind out better for the weave underneath.',
  },
  stone_house: {
    id: 'stone_house',
    label: 'Stone house',
    icon: '\u{1F3E0}',
    width: 3, height: 3,
    materials: { flint: 20, wood: 6, mud: 10 },
    workTicks: 750,
    shelter: 0.92,
    storage: 50,
    preserves: 1.3,
    requiresTech: 'masonry',
    description:
      'Coursed stone walls under a timber roof. The best shelter a family can ' +
      'raise without a longhouse’s whole household behind it.',
  },

  // --- M8.1, mechanism 3: the traps -----------------------------------------
  //
  // Both are 2x2 and neither may be 1x1, which is not a style choice. A 1x1
  // footprint spans half a tile either side of its centre, `reachBuilding`
  // demands `contains(x, y)` at margin 0, and movement stops within 0.6 tiles —
  // so a person can arrive, fail the containment test for ever, and walk on the
  // spot in a loop with no interruption check in it. See mechanism 3 in
  // `m8_plan_the_ages.md`.
  //
  // The storage is small and it is the mechanism, not a rounding. A trap holds a
  // few days of catch and then fills, which is what makes emptying it a thing
  // somebody has to decide to do; `Brain`'s larder floor is measured against
  // `def.storage` for exactly this reason.
  snare: {
    id: 'snare',
    label: 'Snare line',
    icon: '\u{1FAA4}',
    width: 2, height: 2,
    materials: { sticks: 4, thatch: 3 },
    workTicks: 130,
    shelter: 0,
    storage: 10,
    yields: { item: 'meat', perDay: 1.2 },
    requiresTech: 'snares',
    description:
      'Cord loops set on a run through the undergrowth. Small game, caught ' +
      'while whoever set it was somewhere else entirely.',
  },
  fish_trap: {
    id: 'fish_trap',
    label: 'Fish trap',
    icon: '\u{1F3A3}',
    width: 2, height: 2,
    materials: { sticks: 6, thatch: 5 },
    workTicks: 160,
    shelter: 0,
    storage: 12,
    yields: { item: 'fish', perDay: 2.0 },
    placement: 'shore',
    requiresTech: 'fish_trap',
    description:
      'A woven funnel staked in the shallows. The shore keeps working through ' +
      'the night, and through the winter.',
  },

  // --- M11 phase 10: herding, a larder that breeds what it holds -------------
  //
  // A pen reuses `store` and `doTake` wholesale rather than a new verb: see the
  // header comment on `BuildingDef.herd`. 2x2 for the same containment reason
  // every trap gives.
  pen: {
    id: 'pen',
    label: 'Pen',
    icon: '\u{1F411}',
    width: 2, height: 2,
    materials: { sticks: 8, thatch: 4 },
    workTicks: 160,
    shelter: 0,
    storage: 30,
    // Three animals to start, growing at 6% of the current stock a day at full
    // knowledge — slow at first, and it compounds. See `Simulation.workHerds`.
    herd: { item: 'meat', seed: 3, growthPerDay: 0.06 },
    requiresTech: 'herding',
    description:
      'A fenced yard, kept for meat that does not have to be hunted. Culled ' +
      'faster than it breeds, it is empty for good; left alone, it grows.',
  },

  // --- M8.1, mechanism 4: the first crafting station -------------------------
  //
  // A quern is two stones and the patience to use them, and it is the first
  // thing in the game that is a *place to work* rather than a tool in a pack.
  // That distinction is the whole of mechanism 4: everything craftable until now
  // could be made standing in a bog in the dark, and from here some things
  // cannot.
  //
  // 3x3 rather than 2x2, for the reason the traps above record — a footprint
  // has to be big enough that `reachBuilding`'s containment test can actually be
  // satisfied by somebody who stopped walking within 0.6 tiles of the centre —
  // and because a quern is worked at rather than stood on: several people
  // grinding at once is the picture.
  //
  // No storage, deliberately. A station that held goods would be picked up by
  // `Brain`'s larder scorer and by `doStore`, and a band carefully filling its
  // quern with berries is not the mechanism.
  quern: {
    id: 'quern',
    label: 'Quern',
    icon: '\u{1FAA8}',
    width: 3, height: 3,
    materials: { flint: 6, sticks: 4 },
    workTicks: 210,
    shelter: 0,
    storage: 0,
    station: true,
    requiresTech: 'grinding',
    description:
      'A saddle stone and a muller, set where the band can get at them. Nuts ' +
      'and seed become food the body can actually use.',
  },

  // --- M8.2: the field ------------------------------------------------------
  //
  // The first design in the game that neither produces on its own nor produces
  // while somebody stands at it: it has to be sown, left alone for most of a
  // season, and reaped inside the week it is ripe. That shape is the point of
  // farming — it is the technology that makes a band stay put.
  //
  // No materials and a long build, which is the ground being broken for the
  // first time. 4x4 rather than 3x3: a plot is the one design whose *area* is
  // its output, sixteen tiles of soil against nine is most of a second harvest
  // for the same walk, and `reachBuilding`'s containment test is comfortably
  // satisfiable at that size.
  //
  // No storage, deliberately, and for the reason the quern's comment gives: a
  // field with a store would be picked up by `Brain`'s larder scorer and by
  // `doStore`, and a band carefully filling its wheat field with fish is not
  // the mechanism.
  field: {
    id: 'field',
    label: 'Field',
    icon: '\u{1F33E}',
    width: 4, height: 4,
    materials: {},
    workTicks: 300,
    shelter: 0,
    storage: 0,
    field: true,
    placement: 'arable',
    requiresTech: 'farming',
    description:
      'Broken ground, cleared and worked. Sow it in spring and it feeds a ' +
      'family; sow it every spring and it stops.',
  },

  // --- M8.2: the answer to a field that is giving less every year -----------
  //
  // The heap is built out of exactly what a field needs back: dry stalks and
  // river mud, which is the brown and the green of it. The cost is paid once,
  // at construction, rather than by feeding it — a verb for putting scraps on a
  // heap would be a fourth thing the AI has to do in order between sowing and
  // reaping, and the field's own history in this project is that each extra
  // step in a chain is where the chain breaks.
  //
  // What it does after that is ripen: `Simulation.workHeaps` turns time into
  // compost in its own store, at a rate set by how well the band still knows
  // how — the same honesty `workTraps` applies to a snare line whose setter
  // died. A heap is not a store for anything else, which is why its capacity is
  // small and `doStore` will not fill it.
  compost_heap: {
    id: 'compost_heap',
    label: 'Compost heap',
    icon: '\u{1F343}',
    width: 2, height: 2,
    materials: { thatch: 8, mud: 4 },
    workTicks: 150,
    shelter: 0,
    storage: 18,
    matures: { item: 'compost', perDay: 0.9 },
    requiresTech: 'composting',
    description:
      'Stalks, scraps and mud, turned and left to rot down. What the ground ' +
      'gave up over ten harvests, handed back in a season.',
  },

  // --- M11 phase 10: mechanism 4's third station -----------------------------
  //
  // A loom is worked at rather than stood on, on the same terms as the quern:
  // no storage, or `Brain`'s larder scorer and `doStore` would both pick it up
  // as a place to leave food. 3x3 for the same containment reason every
  // station and every trap gives — see the quern's own comment.
  loom: {
    id: 'loom',
    label: 'Loom',
    icon: '\u{1F9F6}',
    width: 3, height: 3,
    materials: { wood: 6, sticks: 6 },
    workTicks: 220,
    shelter: 0,
    storage: 0,
    station: true,
    requiresTech: 'weaving',
    description:
      'A frame strung taut, worked back and forth. Thread by the length ' +
      'becomes cloth by the yard.',
  },
  // `bread`, mechanism 4's fourth station.
  oven: {
    id: 'oven',
    label: 'Oven',
    icon: '\u{1F956}',
    width: 3, height: 3,
    materials: { mud: 8, sticks: 4 },
    workTicks: 190,
    shelter: 0,
    storage: 0,
    station: true,
    requiresTech: 'bread',
    description:
      'A domed firing chamber, walled in mud. Meal wetted, worked and baked ' +
      'goes further and keeps longer than the meal it was made from.',
  },
  // `kiln`, mechanism 4's fifth station. See `RECIPES.kiln_pot` for why it is
  // a second recipe rather than a retrofit onto `pot`.
  kiln: {
    id: 'kiln',
    label: 'Kiln',
    icon: '\u{1F525}',
    width: 3, height: 3,
    materials: { flint: 8, mud: 6 },
    workTicks: 240,
    shelter: 0,
    storage: 0,
    station: true,
    requiresTech: 'kiln',
    description:
      'A stone firing chamber that holds a heat no open hearth can. Pottery ' +
      'fired here wastes less clay than pottery fired in embers.',
  },

  // --- Gated behind knowledge that does not exist yet (M4) -----------------
  granary: {
    id: 'granary',
    label: 'Granary',
    icon: '\u{1F3FA}',
    width: 3, height: 3,
    materials: { wood: 14, sticks: 10, thatch: 14, mud: 20, pottery: 6 },
    workTicks: 900,
    shelter: 0.2,
    storage: 400,
    // Raised, sealed and dark. The best keeping in the game until somebody
    // works out how to dry things.
    preserves: 1.8,
    requiresTech: 'pottery',
    description: 'Raised and sealed. Grain keeps for a year, and a year of grain changes everything.',
  },
  library: {
    id: 'library',
    label: 'Library',
    icon: '\u{1F3DB}',
    width: 3, height: 3,
    materials: { wood: 16, sticks: 12, thatch: 14, mud: 12 },
    workTicks: 700,
    // A roof and walls, but it is not somewhere anybody sleeps.
    shelter: 0.25,
    storage: 0,
    requiresTech: 'library',
    description:
      'A roof over the records, and somewhere to sit and think under it. ' +
      'Ideas come faster where the stones are.',
  },
  longhouse: {
    id: 'longhouse',
    label: 'Longhouse',
    icon: '\u{1F3E1}',
    width: 6, height: 3,
    materials: { wood: 34, sticks: 16, thatch: 30, mud: 24 },
    workTicks: 1800,
    shelter: 0.95,
    storage: 160,
    requiresTech: 'carpentry',
    description: 'Jointed timber. A whole family under one roof, and a hall to hold court in.',
  },
};

let nextBuildingId = 1;

export function resetBuildingIds(): void {
  nextBuildingId = 1;
}

export class Building {
  readonly id: number;
  readonly def: BuildingDef;
  /** Top-left corner, in tiles. */
  readonly x: number;
  readonly y: number;
  /** Who ordered it; used later for ownership and inheritance. */
  ownerBandId: number;

  /** Materials delivered so far. */
  readonly delivered = new Inventory();
  /** Goods kept here once finished. */
  readonly store = new Inventory();

  /** Ticks of work done. Complete when it reaches `def.workTicks`. */
  progress = 0;
  complete: boolean;

  /**
   * The fraction of a catch a trap has accrued but not yet turned into an item.
   *
   * Lives on the building rather than in the sweep because the sweep is
   * stateless by design: `Simulation.workTraps` runs once a day over every trap
   * and draws no `RNG`, so the only thing that has to survive between days is
   * this remainder. Reset to zero when nobody left can work the trap, so that a
   * band which loses and later regains the knowledge starts the catch again
   * rather than banking a decade of half-hares.
   */
  yieldCarry = 0;

  /**
   * What is growing here, for a field, and null for everything else.
   *
   * The trap's `yieldCarry` sets the precedent: state that belongs to one kind
   * of design lives on the instance, because the alternative is a parallel map
   * keyed by building id that nothing keeps in step with the buildings
   * themselves. Constructed with the plot rather than on first sowing, so every
   * reader can ask `building.crop?.stage` without a null dance and a half-built
   * field reads as `fallow` rather than as undefined.
   */
  readonly crop: Crop | null;

  constructor(def: BuildingDef, x: number, y: number, ownerBandId: number) {
    this.id = nextBuildingId++;
    this.def = def;
    this.x = x;
    this.y = y;
    this.ownerBandId = ownerBandId;
    // A stockpile is a decision, not a construction: it is finished the moment
    // it is drawn.
    this.complete = def.workTicks === 0 && Object.keys(def.materials).length === 0;
    this.crop = isField(def) ? new Crop() : null;
  }

  /** Centre of the footprint, which is where people walk to. */
  get centerX(): number {
    return this.x + this.def.width / 2 - 0.5;
  }

  get centerY(): number {
    return this.y + this.def.height / 2 - 0.5;
  }

  contains(x: number, y: number, margin = 0): boolean {
    return (
      x >= this.x - 0.5 - margin && x < this.x + this.def.width - 0.5 + margin &&
      y >= this.y - 0.5 - margin && y < this.y + this.def.height - 0.5 + margin
    );
  }

  /**
   * Warmth reaches a little past the walls.
   *
   * A hut with a fire in it warms the ground around the door, and without that
   * margin a three-by-three hut shelters at most a handful of people while the
   * rest of the band freezes standing next to it.
   */
  static readonly SHELTER_MARGIN = 1.5;

  /** How many more of `itemId` the site still needs. */
  stillNeeds(itemId: string): number {
    const wanted = this.def.materials[itemId] ?? 0;
    return Math.max(0, wanted - this.delivered.count(itemId));
  }

  /** True if the carrier holds anything this site is short of. */
  wants(inventory: Inventory): boolean {
    for (const itemId of Object.keys(this.def.materials)) {
      if (this.stillNeeds(itemId) > 0 && inventory.count(itemId) > 0) return true;
    }
    return false;
  }

  get materialsReady(): boolean {
    return Object.keys(this.def.materials).every(id => this.stillNeeds(id) === 0);
  }

  /** 0-1, for the progress bar on the map. */
  get completion(): number {
    if (this.complete) return 1;
    if (this.def.workTicks === 0) return this.materialsReady ? 1 : 0;
    return Math.min(1, this.progress / this.def.workTicks);
  }

  get storageFree(): number {
    return Math.max(0, this.def.storage - this.store.total);
  }

  /**
   * Moves as much of one stack from `from` into the store as fits. Returns how
   * much moved.
   *
   * Shared by `Simulation.storeItem` and `doStore`'s single-item branch in
   * `ActionSystem`, so there is one definition of how much fits rather than a
   * second copy of this arithmetic.
   */
  accept(from: Inventory, itemId: string, count: number): number {
    const room = this.storageFree;
    if (room <= 0) return 0;
    const moved = from.remove(itemId, Math.min(room, count, from.count(itemId)));
    if (moved > 0) this.store.add(itemId, moved);
    return moved;
  }

  /** Adds work. Returns true if this was the moment it was finished. */
  addWork(amount: number): boolean {
    if (this.complete || !this.materialsReady) return false;
    this.progress += amount;
    if (this.progress >= this.def.workTicks) {
      this.complete = true;
      return true;
    }
    return false;
  }
}
