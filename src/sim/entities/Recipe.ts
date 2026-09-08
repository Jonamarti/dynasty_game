/**
 * What can be made out of what.
 *
 * Crafting was a stub: one hand axe, and the predicate that guarded it written
 * out three times — in `ActionSystem.doCraft`, in `ActionCatalog.groundActions`
 * and in `Brain.think` — plus a fourth copy of its name as a hardcoded string
 * in the floater labels. Three copies of one idea drift apart, and the drift
 * always surfaces months later as a mystifying bug.
 *
 * The table exists now for a second reason as well. The granary asks for six
 * `pottery` and **nothing in the world ever put a pot in anybody's hands** —
 * `pottery` was the only id in `ITEMS` with no source at all. It was the same
 * class of defect as the longhouse gated behind a technology that did not
 * exist: content declared, gated, listed in the build menu, and unreachable.
 * `buildings-ask-for-things-that-exist` in `tech.test.ts` is the tripwire that
 * stops the next one, and it needs this table to know what the world can make.
 *
 * ## Two entries, and not three
 *
 * A recipe whose output nothing consumes would be exactly the defect above with
 * the arrow reversed, so this table holds only what something already asks for:
 * the axe, which halves felling time, and the pot, which the granary is built
 * out of.
 *
 * Phase 5 added the weapons on exactly the terms this paragraph set: they are
 * here **because** `doAttack` and `doHunt` gained the terms that read them in
 * the same pass. Before that `doAttack` had no item term at all, so a spear
 * would have been an expensive way to carry a stick.
 */
import type { Skill } from './Person.ts';
import type { Tech } from '../knowledge/Tech.ts';
import { ITEMS, type Inventory } from './Item.ts';

export interface RecipeDef {
  id: string;
  /** How the verb reads in the radial menu and in a floater over someone's head. */
  label: string;
  icon: string;
  /**
   * Read through `techPower`, never through `knownTech.has`.
   *
   * That is what lets a half-proven design be worked with at reduced power and
   * a refined one be worked with at more, without this file knowing anything
   * about prototypes or refinement.
   */
  tech: Tech;
  /** Divides the work: a practised hand is faster. */
  skill: Skill;
  /** Ticks at `skillFactor` 1. A novice sits at 0.35 and takes nearly three times as long. */
  workTicks: number;
  ingredients: Record<string, number>;
  output: Record<string, number>;
  /**
   * How many of the output somebody wants on them for its own sake.
   *
   * The scorer's answer to "why would anyone make this?". An axe is worth
   * carrying because it halves every job involving wood, so `keep` is 1 and a
   * person with none will make one unprompted. A pot is worth nothing in a pack
   * — it is a building material — so `keep` is 0 and pots get made only when a
   * site is waiting for them. Writing this as data rather than as a name-check
   * on `handaxe` in `Brain` is what stops the next recipe from needing a fourth
   * special case in the scorer.
   */
  keep: number;
}

export const RECIPES: Record<string, RecipeDef> = {
  handaxe: {
    id: 'handaxe',
    label: 'Hand axe',
    icon: '\u{1FA93}',
    tech: 'hafting',
    skill: 'knap',
    // 90 ticks, flint and a haft: exactly what `doCraft` did before the table,
    // moved across without touching a number so that the change to the wood
    // economy is the interruption check and nothing else.
    workTicks: 90,
    ingredients: { flint: 1, sticks: 1 },
    output: { handaxe: 1 },
    keep: 1,
  },
  spear: {
    id: 'spear',
    label: 'Spear',
    icon: '🗡',
    tech: 'spear',
    skill: 'knap',
    workTicks: 100,
    ingredients: { sticks: 2, flint: 1 },
    output: { spear: 1 },
    // Worth carrying for its own sake: it makes every hunt and every fight go
    // better, which is exactly what `keep` is for.
    keep: 1,
  },
  bow: {
    id: 'bow',
    label: 'Bow',
    icon: '🏹',
    tech: 'bow',
    skill: 'hunt',
    workTicks: 140,
    ingredients: { sticks: 3, thatch: 2 },
    output: { bow: 1 },
    keep: 1,
  },
  hide_armour: {
    id: 'hide_armour',
    label: 'Hide armour',
    icon: '🦺',
    tech: 'leatherwork',
    skill: 'build',
    workTicks: 130,
    ingredients: { hide: 2, thatch: 1 },
    output: { hide_armour: 1 },
    keep: 1,
  },
  pot: {
    id: 'pot',
    label: 'Pot',
    icon: '\u{1F3FA}',
    tech: 'pottery',
    // Shaping and firing clay is the builder's hand rather than the knapper's,
    // and it is the skill `TECH.pottery` already names.
    skill: 'build',
    workTicks: 110,
    ingredients: { mud: 2, sticks: 1 },
    output: { pottery: 1 },
    keep: 0,
  },
};

/** Every item any recipe can produce. Used by the "is this reachable?" tests. */
export function craftableItems(): Set<string> {
  const made = new Set<string>();
  for (const recipe of Object.values(RECIPES)) {
    for (const id of Object.keys(recipe.output)) made.add(id);
  }
  return made;
}

/**
 * The recipe that yields `itemId`, or null.
 *
 * Single-valued on purpose. Two ways to make one thing is a choice the scorer
 * would have to make every tick, and there is nothing in the table that wants
 * it yet; when there is, this becomes a list and `Brain` picks.
 */
export function recipeFor(itemId: string): RecipeDef | null {
  for (const recipe of Object.values(RECIPES)) {
    if (recipe.output[itemId] !== undefined) return recipe;
  }
  return null;
}

/** Whether a pack holds everything one run of `recipe` consumes. */
export function hasIngredients(inventory: Inventory, recipe: RecipeDef): boolean {
  return Object.entries(recipe.ingredients)
    .every(([itemId, count]) => inventory.count(itemId) >= count);
}

/**
 * What is still missing, phrased for a greyed-out menu entry.
 *
 * Lives here rather than in the menu because "why can't I do that?" deserves
 * the same answer wherever it is asked, and because the alternative is the
 * fourth hand-written copy of a recipe's contents.
 */
export function missingIngredients(inventory: Inventory, recipe: RecipeDef): string {
  const short = Object.entries(recipe.ingredients)
    .filter(([itemId, count]) => inventory.count(itemId) < count)
    .map(([itemId, count]) => {
      const label = ITEMS[itemId]?.label.toLowerCase() ?? itemId;
      return count > 1 ? count + ' ' + label : label;
    });
  return short.length === 0 ? '' : 'You need ' + short.join(' and ');
}
