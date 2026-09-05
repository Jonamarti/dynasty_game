/**
 * Animals that move.
 *
 * Game used to be a `ResourceNode` — a stationary thing you walked up to and
 * harvested, which made hunting indistinguishable from picking berries except
 * for the skill it practised. Two food systems where one would do is one too
 * many, so the node is gone and this replaces it: a herd that drifts, grazes
 * and bolts, and a hunt that can fail.
 *
 * Deliberately thin. Two fields here do nothing yet and are here anyway,
 * because adding them later is a migration and adding them now is two fields:
 * `temperament` is what "friendly unless attacked" will read, and `fedBy` is
 * what taming will read.
 */
import type { RNG } from '../core/RNG.ts';

export const SPECIES = ['deer', 'boar', 'hare'] as const;
export type Species = (typeof SPECIES)[number];

export interface SpeciesDef {
  id: Species;
  label: string;
  /** Units of meat a kill yields. */
  meat: number;
  /** Tiles per tick while calm, and while bolting. */
  speed: number;
  fleeSpeed: number;
  /** Tiles at which an unseen hunter is noticed. `track` shrinks this. */
  awareness: number;
  /** How hard it is to bring down: rolled against the hunter's skill. */
  evasion: number;
  /** Rough size of a herd when the world is seeded. */
  herdSize: number;
  /** How much health one successful strike removes. */
  health: number;
}

/**
 * Three animals that want different things from a hunter.
 *
 * A hare is easy to find and barely worth the walk; a boar is dangerous and
 * feeds a family; a deer is the honest middle. That spread is what makes the
 * `hunt` skill worth raising rather than a flat multiplier on one prey.
 */
export const SPECIES_DEFS: Record<Species, SpeciesDef> = {
  deer: {
    id: 'deer', label: 'Deer',
    meat: 22, speed: 0.30, fleeSpeed: 0.52,
    awareness: 7.5, evasion: 0.55, herdSize: 5, health: 30,
  },
  boar: {
    id: 'boar', label: 'Boar',
    meat: 30, speed: 0.22, fleeSpeed: 0.40,
    awareness: 5.5, evasion: 0.7, herdSize: 3, health: 46,
  },
  hare: {
    id: 'hare', label: 'Hare',
    meat: 7, speed: 0.26, fleeSpeed: 0.58,
    awareness: 9, evasion: 0.8, herdSize: 2, health: 12,
  },
};

let nextAnimalId = 1;

export function resetAnimalIds(): void {
  nextAnimalId = 1;
}

export class Animal {
  readonly id: number;
  readonly species: Species;
  readonly def: SpeciesDef;
  x: number;
  y: number;
  /** Which herd this one drifts with. Herds are the unit that gets spooked. */
  herdId: number;
  health: number;
  alive = true;

  /** Tick until which this animal is bolting. */
  alarmedUntil = 0;

  /**
   * How much run it has left, 0-1. Drained by bolting, recovered by grazing.
   *
   * This is what makes a hunt finishable. A deer is faster than a person and
   * re-alarms every time one comes within its notice radius, so without a cost
   * to running the chase is arithmetically endless: the animal stays sixteen
   * tiles ahead forever and the hunter eventually gives up thirsty. Wearing the
   * quarry down over a long pursuit is also, as it happens, how people actually
   * hunted before they had anything to throw.
   */
  stamina = 1;
  /** Where it is running to while alarmed. */
  fleeX: number | null = null;
  fleeY: number | null = null;

  /**
   * Unused today, and here on purpose — see the file comment. A skittish boar
   * and a bold one is the difference between a herd worth stalking and a herd
   * that is simply a slower berry bush.
   */
  temperament: number;
  /** Who has fed this animal. The hook taming and loyalty will read. */
  readonly fedBy = new Set<number>();

  constructor(species: Species, x: number, y: number, herdId: number, rng: RNG) {
    this.id = nextAnimalId++;
    this.species = species;
    this.def = SPECIES_DEFS[species];
    this.x = x;
    this.y = y;
    this.herdId = herdId;
    this.health = this.def.health;
    this.temperament = rng.range(0, 1);
  }

  get alarmed(): boolean {
    return this.alarmedUntil > 0;
  }

  /** The label a person would use. No knowledge gating: a deer is a deer. */
  get label(): string {
    return this.def.label;
  }
}
