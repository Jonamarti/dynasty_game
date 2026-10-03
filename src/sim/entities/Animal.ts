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

/**
 * The herbivores come first and keep their indices, and `spawnHerds` picks
 * from `PREY_SPECIES` alone: adding a species to the pool it draws from would
 * move every herd in every saved seed. The hunters (M15 phase 23e) are placed
 * by their own pass on their own stream.
 */
export const PREY_SPECIES = ['deer', 'boar', 'hare'] as const;
export const PREDATOR_SPECIES = ['wolf', 'bear', 'lynx'] as const;
export const SPECIES = [...PREY_SPECIES, ...PREDATOR_SPECIES] as const;
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
  /**
   * Young per member per spring day when well fed, M15 phase 23d. Hares breed
   * like hares and deer like deer; the herd's ceiling comes from the grass.
   */
  fecundity: number;
  /** A hunter of animals (and, hungry enough, of people), M15 phase 23e. */
  predator: boolean;
  /** What a hunter takes. Empty for the herbivores. */
  prey: readonly Species[];
  /**
   * Health a person loses to this animal's blow, on the 100-point scale, or 0
   * for an animal that never strikes back. A hare runs; a boar turns on the
   * man with the spear (M15 phase 23f).
   */
  blow: number;
  /** Whether it turns on a hunter who has missed it (the stag, the boar). */
  defends: boolean;
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
    awareness: 7.5, evasion: 0.55, herdSize: 5, health: 30, fecundity: 0.03,
    predator: false, prey: [], blow: 14, defends: true,
  },
  boar: {
    id: 'boar', label: 'Boar',
    meat: 30, speed: 0.22, fleeSpeed: 0.40,
    awareness: 5.5, evasion: 0.7, herdSize: 3, health: 46, fecundity: 0.035,
    predator: false, prey: [], blow: 24, defends: true,
  },
  hare: {
    id: 'hare', label: 'Hare',
    meat: 7, speed: 0.26, fleeSpeed: 0.58,
    awareness: 9, evasion: 0.8, herdSize: 2, health: 12, fecundity: 0.07,
    predator: false, prey: [], blow: 0, defends: false,
  },
  // The hunters, M15 phase 23e. Wolf in a pack, bear alone and hard to turn,
  // lynx alone and small: all three native to Holocene Europe.
  wolf: {
    id: 'wolf', label: 'Wolf',
    meat: 20, speed: 0.34, fleeSpeed: 0.5,
    awareness: 9, evasion: 0.6, herdSize: 4, health: 34, fecundity: 0.03,
    predator: true, prey: ['deer', 'hare', 'boar'], blow: 14, defends: true,
  },
  bear: {
    id: 'bear', label: 'Bear',
    meat: 60, speed: 0.24, fleeSpeed: 0.36,
    awareness: 6, evasion: 0.5, herdSize: 1, health: 90, fecundity: 0,
    predator: true, prey: ['deer', 'boar', 'hare'], blow: 22, defends: true,
  },
  lynx: {
    id: 'lynx', label: 'Lynx',
    meat: 14, speed: 0.32, fleeSpeed: 0.55,
    awareness: 8, evasion: 0.7, herdSize: 1, health: 22, fecundity: 0,
    predator: true, prey: ['hare'], blow: 10, defends: true,
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

  /**
   * How well fed it is, 0-1 — M15 phase 23c. Falls a little every move and is
   * refilled by what it takes off the grass under it (`World.graze`); at zero
   * it starves, slowly. The number a herd's births (23d) are proportional to.
   */
  fed = 1;

  /** Last simulation tick with an observed meal, solely for presentation. */
  lastMealAt = -Infinity;
  /** Last simulation tick with an observed attack attempt at reach. */
  lastAttackAt = -Infinity;
  /** Last simulation tick annotated as a run; renderers also verify movement. */
  lastRunAt = -Infinity;

  /**
   * Who last put it through a hunt that turned on them, and when — M15 phase
   * 23g reads both (`WildlifeSystem.grudgeOf`). A grudge is a few days long,
   * not a life sentence: `hurtAt` is what lets an animal forget.
   */
  hurtBy: number | null = null;
  hurtAt = 0;

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

  /**
   * Whose animal this is, once feeding it has worked. Null for everything wild.
   *
   * M8.1's `taming`, and the field that finally reads `fedBy` and
   * `temperament` — both of which have been on this class since M6a doing
   * nothing, deliberately, because adding them later would have been a
   * migration. `fedBy` is the count of hands that have offered it food and
   * `temperament` is how many it takes; a placid beast comes round in two
   * meals and a wary one never does.
   *
   * A tamed animal stops fleeing its owner, follows them about, and makes the
   * hunt roll better — see `WildlifeSystem` and `ActionSystem.doHunt`. It is
   * still an animal: it can be killed, and it forgets nobody, because nothing
   * in this game remembers who fed it. That last one is section 8 of
   * `next-steps.md` and is not this pass.
   */
  tamedBy: number | null = null;

  /**
   * How many meals this animal has accepted, from anybody.
   *
   * Separate from `fedBy` because the two answer different questions and the
   * first version of taming conflated them: `fedBy` is a `Set` of person ids,
   * so one person feeding an animal every day for a season added themselves to
   * it exactly once and the threshold could never be reached. A hundred and one
   * meals were offered across a run and nothing was ever tamed.
   *
   * So `fedBy` is *who it will let near*, and taming is a matter of persistence
   * rather than of committee. That split turns out to be the better design as
   * well as the working one: an animal that has taken food from you once stops
   * bolting when you approach, which is what makes the second meal possible at
   * all, and the two stages together are recognisably how it actually goes.
   */
  meals = 0;

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
