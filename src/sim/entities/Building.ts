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
   * Where it may stand, beyond "on land, and not on top of something else".
   *
   * `canPlace` had no per-design predicate at all, because until the fish trap
   * nothing cared where it was: a hut is a hut anywhere. A trap set for fish has
   * to be in the water's edge, and a design whose whole point is the shore is
   * worse than useless in the middle of a field.
   */
  placement?: 'shore';
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
    requiresTech: null,
    description:
      'Daubed walls on a felled-timber frame, under thatch. Warm enough to ' +
      'winter in, and the first thing worth cutting a tree for.',
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

  constructor(def: BuildingDef, x: number, y: number, ownerBandId: number) {
    this.id = nextBuildingId++;
    this.def = def;
    this.x = x;
    this.y = y;
    this.ownerBandId = ownerBandId;
    // A stockpile is a decision, not a construction: it is finished the moment
    // it is drawn.
    this.complete = def.workTicks === 0 && Object.keys(def.materials).length === 0;
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
