/**
 * Trees: the first thing in this world that keeps time in years rather than
 * days.
 *
 * Everything else regrows on a timer measured in hours, which makes it scenery:
 * a berry bush you strip is back within a season, so nothing you do to the land
 * has consequences you have to live with. A tree does. It takes decades to
 * reach a size worth felling, felling it is permanent, and the only reason
 * there are any trees at all next century is that some of the ones standing now
 * survive to seed. Cut the whole wood and there is nothing left to seed it.
 *
 * That single asymmetry is what turns "gathering" into "husbandry", gives a
 * dynasty something to plan across generations, and makes a forest a thing a
 * band can ruin.
 */
import type { RNG } from '../core/RNG.ts';
import type { Season } from '../core/TimeManager.ts';
import { DAYS_PER_YEAR } from './Person.ts';

export const TREE_SPECIES = ['oak', 'pine', 'apple', 'pear', 'plum', 'hazel'] as const;
export type TreeSpecies = (typeof TREE_SPECIES)[number];

export interface TreeDef {
  species: TreeSpecies;
  label: string;
  /** Years before it bears fruit or is worth the axe. */
  maturityYears: number;
  /** Years before it dies standing. */
  maxAgeYears: number;
  /** Wood from a fully grown specimen. Younger trees give proportionally less. */
  woodAtMaturity: number;
  /** What it fruits, if anything. */
  fruitItem: string | null;
  /** Seasons in which fruit sets. */
  fruitSeasons: Season[];
  /** Fruit a mature tree carries at the height of its season. */
  fruitYield: number;
  /** Relative chance of seeding a neighbour in spring. */
  fecundity: number;
  /** Rough canopy radius at maturity, in tiles; used for spacing and drawing. */
  canopy: number;
}

export const TREES: Record<TreeSpecies, TreeDef> = {
  // The oak bears acorns as of M8.1, and until `grinding` exists in a world
  // nobody picks them: an acorn is `nutrition: 0`, and `Brain`'s fruit scorer
  // now weighs a tree by what its fruit is worth *to the person looking at it*.
  // That is what makes this a safe change to the commonest tree on the island —
  // every scenario in which nobody can grind behaves exactly as it did, and the
  // before-and-after measurements this milestone rests on stay comparable.
  oak: {
    species: 'oak', label: 'Oak',
    maturityYears: 30, maxAgeYears: 220,
    woodAtMaturity: 26,
    // The heaviest yield of any tree in the game, and that is not generosity: a
    // mature oak in a mast year drops more food than any orchard tree in this
    // table, which is the single reason acorns were worth the enormous trouble
    // of leaching them. `advanceDay` swells fruit at `fruitYield / 18` a day
    // scaled by growth, and autumn growth is low, so a smaller number never gets
    // the ground properly covered before winter takes it off again.
    fruitItem: 'acorn', fruitSeasons: ['autumn'], fruitYield: 40,
    fecundity: 0.7, canopy: 2.2,
  },
  pine: {
    species: 'pine', label: 'Pine',
    maturityYears: 20, maxAgeYears: 140,
    woodAtMaturity: 20,
    fruitItem: null, fruitSeasons: [], fruitYield: 0,
    fecundity: 1.1, canopy: 1.6,
  },
  apple: {
    species: 'apple', label: 'Apple tree',
    maturityYears: 8, maxAgeYears: 70,
    woodAtMaturity: 9,
    fruitItem: 'apple', fruitSeasons: ['autumn'], fruitYield: 14,
    fecundity: 1.0, canopy: 1.8,
  },
  pear: {
    species: 'pear', label: 'Pear tree',
    maturityYears: 9, maxAgeYears: 80,
    woodAtMaturity: 10,
    fruitItem: 'pear', fruitSeasons: ['summer', 'autumn'], fruitYield: 11,
    fecundity: 0.9, canopy: 1.7,
  },
  plum: {
    species: 'plum', label: 'Plum tree',
    maturityYears: 6, maxAgeYears: 55,
    woodAtMaturity: 7,
    fruitItem: 'plum', fruitSeasons: ['summer'], fruitYield: 12,
    fecundity: 1.2, canopy: 1.4,
  },
  hazel: {
    species: 'hazel', label: 'Hazel',
    maturityYears: 5, maxAgeYears: 60,
    woodAtMaturity: 5,
    fruitItem: 'hazelnut', fruitSeasons: ['autumn'], fruitYield: 9,
    fecundity: 1.6, canopy: 1.1,
  },
};

let nextTreeId = 1;

export function resetTreeIds(): void {
  nextTreeId = 1;
}

export class Tree {
  readonly id: number;
  readonly def: TreeDef;
  readonly x: number;
  readonly y: number;

  /** Age in days. Trees are the only thing here that measures life in years. */
  age: number;
  /** False once felled or dead of old age. Felled trees are removed entirely. */
  standing = true;
  /** Fruit currently on the branches. */
  fruit = 0;
  /**
   * Ticks of felling work already done on this trunk.
   *
   * Kept on the tree rather than the woodcutter so that walking away — for a
   * drink, for a fight, for nightfall — does not waste the morning's work, and
   * so two people can fell one trunk between them.
   */
  chopProgress = 0;

  constructor(species: TreeSpecies, x: number, y: number, ageDays: number) {
    this.id = nextTreeId++;
    this.def = TREES[species];
    this.x = x;
    this.y = y;
    this.age = ageDays;
  }

  get years(): number {
    return Math.floor(this.age / DAYS_PER_YEAR);
  }

  /** 0-1 through to maturity. A seedling is 0; anything grown is 1. */
  get maturity(): number {
    return Math.min(1, this.age / (this.def.maturityYears * DAYS_PER_YEAR));
  }

  get isSeedling(): boolean {
    return this.maturity < 0.35;
  }

  get isMature(): boolean {
    return this.maturity >= 1;
  }

  /**
   * Wood a felling would yield right now.
   *
   * Scales with the square of maturity, so cutting saplings is a poor trade —
   * a stand of young trees left alone for twenty years is worth many times what
   * it is worth today, which is the whole argument for not cutting it.
   */
  get woodYield(): number {
    const m = this.maturity;
    return Math.max(1, Math.round(this.def.woodAtMaturity * m * m));
  }

  /** Ticks of work to fell, before skill and tools. Big trees take a long time. */
  get fellingTicks(): number {
    return Math.round(80 + this.woodYield * 26);
  }

  /** Canopy radius now, for drawing and for spacing new seedlings. */
  get radius(): number {
    return 0.35 + this.def.canopy * this.maturity;
  }

  get bearsFruit(): boolean {
    return this.def.fruitItem !== null && this.isMature;
  }

  /**
   * A day passes: grow, set or drop fruit, and possibly die of old age.
   * Returns true if the tree died standing.
   */
  advanceDay(season: Season, growth: number): boolean {
    this.age += 1;

    if (this.def.fruitItem !== null && this.isMature) {
      if (this.def.fruitSeasons.includes(season)) {
        // Fruit swells through its season rather than appearing at once.
        const perDay = this.def.fruitYield / 18;
        this.fruit = Math.min(this.def.fruitYield, this.fruit + perDay * Math.max(0.2, growth));
      } else if (this.fruit > 0) {
        // Out of season it drops and rots.
        this.fruit = Math.max(0, this.fruit - this.def.fruitYield / 10);
      }
    }

    if (this.years > this.def.maxAgeYears) {
      this.standing = false;
      return true;
    }
    return false;
  }

  /** Takes up to `units` fruit. Returns how many were actually picked. */
  pick(units: number): number {
    const taken = Math.min(units, Math.floor(this.fruit));
    this.fruit -= taken;
    return taken;
  }
}

/** Which species suit a tile, given its biome and how wet it is. */
export function speciesFor(biome: string, moisture: number, rng: RNG): TreeSpecies | null {
  if (biome === 'forest') {
    const roll = rng.next();
    if (roll < 0.42) return 'oak';
    if (roll < 0.70) return 'pine';
    if (roll < 0.80) return 'hazel';
    if (roll < 0.88) return 'apple';
    if (roll < 0.95) return 'pear';
    return 'plum';
  }
  if (biome === 'grass' && moisture > 0.45) {
    // Open ground carries the orchard species: light-loving and short.
    const roll = rng.next();
    if (roll < 0.34) return 'apple';
    if (roll < 0.62) return 'pear';
    if (roll < 0.85) return 'plum';
    return 'hazel';
  }
  if (biome === 'hills') return rng.chance(0.7) ? 'pine' : 'hazel';
  return null;
}
