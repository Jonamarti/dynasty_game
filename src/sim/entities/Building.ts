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
  description: string;
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
