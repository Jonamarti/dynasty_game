/**
 * Planting a tree - M15 phase 24.
 *
 * `Tree` and `ForestSystem` already keep time in years; what was missing was a
 * hand that sets one. This file is the rules of that hand and nothing else: what
 * can be planted, what ground will take it, and where beside the camp a person
 * should look. The verb itself is `ActionSystem.doPlant`; the scorer is in
 * `Brain`; both ask the same functions here, so the menu, the order and the AI
 * refuse for the same reasons (the pattern `Earth.ts` set).
 *
 * **No dice anywhere.** Which tile, which species and how long it takes are all
 * functions of the person and the ground, so this adds no stream to
 * `Simulation`'s fork table and cannot move a world in which nobody plants.
 */
import type { Person } from './Person.ts';
import type { Tree, TreeSpecies } from './Tree.ts';
import type { World } from '../core/World.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import { t } from '../../i18n/i18n.ts';

/** Ticks of work to set one tree. Short: well under the banking threshold. */
export const PLANT_TICKS = 70;

/** How far apart orchard trees stand. Wider than a wood's own self-thinning. */
export const ORCHARD_SPACING = 2.6;

/** How far from the home or camp a person looks for ground to plant. */
export const ORCHARD_RANGE = 11;

/** Closer than this to the hearth is the camp's floor, not its orchard. */
export const ORCHARD_INNER = 3;

/**
 * The fruit a person can plant, and the tree it grows into. Pips and stones
 * come inside the fruit, so planting one costs one piece of food - the price
 * of an investment, and the reason a hungry person eats it instead. Acorns are
 * left out on purpose: an oak takes thirty years and is not an orchard tree.
 */
export const PLANTABLE: Record<string, TreeSpecies> = {
  apple: 'apple', pear: 'pear', plum: 'plum', hazelnut: 'hazel',
};

export type PlantRefusal =
  | 'no_fruit_to_plant'
  | 'ground_unfit_for_trees'
  | 'building_in_the_way'
  | 'no_room_for_a_tree';

/** What is in the pack that could go in the ground, in a fixed order. */
export function plantable(person: Person): { item: string; species: TreeSpecies } | null {
  for (const item of Object.keys(PLANTABLE)) {
    if (person.inventory.count(item) > 0) return { item, species: PLANTABLE[item]! };
  }
  return null;
}

export interface PlantingGround {
  world: World;
  treeHash: SpatialHash<Tree>;
  /** Whether any building covers the tile (a field's plot included). */
  built: (x: number, y: number) => boolean;
  /**
   * Whether somebody else is already on their way to plant within spacing of
   * the tile. Read by `findPlantingSpot` only, never by `plantingRefusal`: a
   * claim is a plan and not a fact about the ground, and measured without it
   * nine planters sent to the same ring turned back at the hole twenty-three
   * times for the four trees that went in.
   */
  claimed?: (x: number, y: number) => boolean;
}

/** Why this tile cannot take a tree, or null. The one definition of "fit". */
export function plantingRefusal(ground: PlantingGround, x: number, y: number): PlantRefusal | null {
  const { world } = ground;
  if (!world.isWalkable(x, y)) return 'ground_unfit_for_trees';
  const biome = world.biomeAt(x, y);
  if (biome !== 'grass' && biome !== 'forest') return 'ground_unfit_for_trees';
  // A dug or heaped tile is not soil a root will keep.
  if (world.depthDug(x, y) !== 0) return 'ground_unfit_for_trees';
  if (ground.built(x, y)) return 'building_in_the_way';
  for (const other of ground.treeHash.queryRadius(x, y, ORCHARD_SPACING + 1)) {
    if (!other.standing) continue;
    if (Math.hypot(other.x - x, other.y - y) < ORCHARD_SPACING) return 'no_room_for_a_tree';
  }
  return null;
}

/**
 * The first fit tile in a widening ring round the anchor, reachable from where
 * the person stands. The ring's starting angle is the person's id, so two
 * planters do not both head for the same tile - no draw, and the same answer
 * for the same person on the same day.
 */
export function findPlantingSpot(
  ground: PlantingGround,
  from: { x: number; y: number },
  anchor: { x: number; y: number },
  personId: number,
): { x: number; y: number } | null {
  const steps = 16;
  const start = ((personId % steps) + steps) % steps;
  for (let r = ORCHARD_INNER; r <= ORCHARD_RANGE; r++) {
    for (let k = 0; k < steps; k++) {
      const a = ((start + k) % steps) * (Math.PI * 2 / steps);
      const x = Math.round(anchor.x + Math.cos(a) * r);
      const y = Math.round(anchor.y + Math.sin(a) * r);
      if (!ground.world.sameRegion(from.x, from.y, x, y)) continue;
      if (plantingRefusal(ground, x, y) === null && !ground.claimed?.(x, y)) return { x, y };
    }
  }
  return null;
}

/** The sentence for a refusal, for the order and the menu. Literal keys: `t` is read by a regex. */
export function plantRefusalText(why: PlantRefusal): string {
  return why === 'no_fruit_to_plant' ? t('they have no fruit to plant')
    : why === 'ground_unfit_for_trees' ? t('a tree will not grow in that ground')
    : why === 'building_in_the_way' ? t('there is a building on that ground')
    : t('there is no room for another tree there');
}
