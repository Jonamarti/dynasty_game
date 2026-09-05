/**
 * The forest, over years.
 *
 * Runs once per in-game day, not per tick: a tree does not visibly change in a
 * fifth of a second, and a wood of a thousand trees would otherwise be the most
 * expensive thing in the simulation by a wide margin.
 *
 * Three things happen here, and the third is the one that matters:
 *
 *  1. Trees age, and fruit swells and drops with the seasons.
 *  2. Old trees die standing.
 *  3. **Mature trees seed the ground near them, in spring.** This is the only
 *     way a felled tree is ever replaced. Cut a wood down to stumps and there
 *     is nothing left to seed it — the land stays bare for as long as the game
 *     runs. Leave seed trees standing and it comes back over decades. A band
 *     can ruin a valley permanently, and that possibility is the point.
 */
import { Tree, speciesFor, type TreeSpecies } from '../entities/Tree.ts';
import { DAYS_PER_YEAR } from '../entities/Person.ts';
import type { World } from '../core/World.ts';
import type { RNG } from '../core/RNG.ts';
import type { Season } from '../core/TimeManager.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import { telemetry } from '../core/Telemetry.ts';

/**
 * Chance per mature tree per spring day of casting a viable seed.
 *
 * Tuned against a twenty-year run rather than guessed. The first value gave ten
 * seedlings against a hundred and twenty-five deaths of old age: a closed
 * canopy has nowhere for a seed to land, so almost every attempt was refused
 * for want of room, and the wood was quietly dying at about six trees a year.
 */
const SEED_CHANCE_PER_DAY = 0.014;

/** A seedling needs this much clear ground; woods thin themselves out. */
const MIN_SPACING = 1.4;

/** Above this many trees the simulation stops adding more, whatever happens. */
const MAX_TREES = 4000;

export interface ForestContext {
  world: World;
  rng: RNG;
  season: Season;
  /** 0-1 growing conditions, from TimeManager. */
  growth: number;
  treeHash: SpatialHash<Tree>;
}

export class ForestSystem {
  /**
   * A day in the wood. Returns trees that died standing, for the caller to
   * remove from its arrays and indexes.
   */
  daily(trees: Tree[], ctx: ForestContext): { died: Tree[]; born: Tree[] } {
    const died: Tree[] = [];
    const born: Tree[] = [];
    const seeding = ctx.season === 'spring' && trees.length < MAX_TREES;

    for (const tree of trees) {
      if (!tree.standing) continue;

      if (tree.advanceDay(ctx.season, ctx.growth)) {
        // A tree somebody is part way through felling gets a stay of execution.
        //
        // The axe work is stored on the trunk, so retiring it at a day boundary
        // threw away however many hundred ticks had gone into it and ended the
        // woodcutter's order with a bare "the tree was gone". It is still past
        // its span and will be offered up again tomorrow, by which time the
        // feller has either finished or walked away.
        if (tree.chopProgress > 0) {
          tree.standing = true;
          telemetry.count('tree_death_deferred');
          continue;
        }
        died.push(tree);
        telemetry.count('tree_died_old');
        continue;
      }

      if (seeding && tree.isMature) {
        const seedling = this.trySeed(tree, ctx);
        if (seedling) born.push(seedling);
      }
    }

    return { died, born };
  }

  /**
   * A mature tree casts a seed into nearby clear ground.
   *
   * Deliberately short-range: a wood spreads at its own edges rather than
   * teleporting across the map, so a cleared valley stays cleared until the
   * surrounding forest creeps back into it.
   */
  private trySeed(parent: Tree, ctx: ForestContext): Tree | null {
    if (!ctx.rng.chance(SEED_CHANCE_PER_DAY * parent.def.fecundity * ctx.growth)) return null;

    // Several attempts, and a long tail on the distance: inside an established
    // wood every close landing is refused for spacing, so regeneration happens
    // in gaps and at the edges — which is also how it works in a real forest.
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = ctx.rng.next() * Math.PI * 2;
      const distance = ctx.rng.range(1.5, 9);
      const x = Math.round(parent.x + Math.cos(angle) * distance);
      const y = Math.round(parent.y + Math.sin(angle) * distance);

      if (!ctx.world.isWalkable(x, y)) continue;

      const biome = ctx.world.biomeAt(x, y);
      const moisture = ctx.world.moisture[ctx.world.index(x, y)] ?? 0;
      // A seed usually falls true to its parent, but the ground has a say.
      const species: TreeSpecies | null = ctx.rng.chance(0.75)
        ? parent.def.species
        : speciesFor(biome, moisture, ctx.rng);
      if (!species) continue;

      if (!this.hasRoom(x, y, ctx)) continue;

      telemetry.count('tree_seeded');
      return new Tree(species, x, y, 0);
    }
    return null;
  }

  private hasRoom(x: number, y: number, ctx: ForestContext): boolean {
    const neighbours = ctx.treeHash.queryRadius(x, y, MIN_SPACING + 1);
    for (const other of neighbours) {
      if (!other.standing) continue;
      const dx = other.x - x;
      const dy = other.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < MIN_SPACING) return false;
    }
    return true;
  }
}

/**
 * Scatters a starting wood.
 *
 * Ages are spread across each species' whole span so the world does not begin
 * as a plantation of identical saplings — there are old giants worth felling,
 * middling trees worth waiting for, and seedlings that will not be useful to
 * anyone alive today.
 */
export function seedInitialForest(
  world: World,
  rng: RNG,
  density: number
): Tree[] {
  const trees: Tree[] = [];
  const occupied = new Set<number>();

  const attempts = Math.floor(world.width * world.height * density);
  for (let i = 0; i < attempts; i++) {
    const x = rng.int(0, world.width - 1);
    const y = rng.int(0, world.height - 1);
    if (!world.isWalkable(x, y)) continue;

    const key = y * world.width + x;
    if (occupied.has(key)) continue;

    const biome = world.biomeAt(x, y);
    const moisture = world.moisture[world.index(x, y)] ?? 0;
    const species = speciesFor(biome, moisture, rng);
    if (!species) continue;

    // Forest tiles carry trees densely; open ground only occasionally.
    const chance = biome === 'forest' ? 0.55 : biome === 'hills' ? 0.12 : 0.07;
    if (!rng.chance(chance)) continue;

    const maxAge = 220 * DAYS_PER_YEAR;
    const age = Math.min(maxAge, rng.range(0, 1) ** 0.7 * 90 * DAYS_PER_YEAR);
    occupied.add(key);
    trees.push(new Tree(species, x, y, age));
  }
  return trees;
}
