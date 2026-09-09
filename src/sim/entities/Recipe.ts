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
   * A `BUILDINGS` id this must be made at, or undefined for anywhere.
   *
   * M8.1, mechanism 4, and the first thing in this table that is about a
   * *place*. `doCraft` reaches the named building and refuses away from it with
   * a per-station reason, `Brain` scores the walk, and the catalogue greys the
   * entry out with the name of what is missing.
   *
   * **Do not retrofit one onto an existing recipe.** Adding `station: 'kiln'`
   * to `pot` would make the granary unbuildable again — the defect that took
   * four separate fixes to close — and break `pots-reach-a-granary` in the same
   * stroke. New recipes only, and the retrofit gets its own pass with the
   * starting conditions of the `craft` scenario extended to match.
   */
  station?: string;
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
  // M8.1, the two carried tools of the Mesolithic. Both obey the paragraph
  // above: each is here because something reads it in the same pass —
  // `carryFactor` for the basket, `forageYieldFactor` on a fishing spot for the
  // net — and neither is a building material, so `keep` is 1 for both.
  //
  // Both sit at or under 140 `workTicks` on purpose. Above roughly that a single
  // uninterrupted pull outlasts the thirst a novice picks up while making it, so
  // the job is stopped, restarted from nothing and never finished; see
  // `AGENTS.md`. Anything longer has to bank its progress on the thing being
  // worked, and a recipe has nowhere to bank it.
  basket: {
    id: 'basket',
    label: 'Basket',
    icon: '\u{1F9FA}',
    tech: 'basketry',
    // Weaving withies is the builder's hand rather than the knapper's, the same
    // call `pot` already makes.
    skill: 'build',
    workTicks: 110,
    ingredients: { thatch: 4, sticks: 2 },
    output: { basket: 1 },
    keep: 1,
  },
  net: {
    id: 'net',
    label: 'Net',
    icon: '\u{1F578}',
    tech: 'netting',
    skill: 'build',
    workTicks: 140,
    ingredients: { thatch: 6 },
    output: { net: 1 },
    keep: 1,
  },
  // M8.1, mechanism 4: the first recipe in the game that is about a place.
  //
  // Three acorns into one of meal, and the gain is not a percentage: it is the
  // difference between nothing and food. An acorn is `nutrition: 0` — see
  // `ITEMS` for why that is the honest number — so a band without a quern walks
  // past the commonest tree on the island all autumn, and a band with one does
  // not.
  //
  // Hazelnuts were tried first and measured failing. Three hazelnuts into meal
  // fired *twice* in a whole autumn across two bands, because a hazelnut at 22
  // nutrition is the best thing in most packs and anybody who had gathered
  // enough to grind had eaten them before reaching the stone. Nothing competes
  // for an acorn, and there are four times as many oaks as hazels.
  //
  // Seasonal all the same, and deliberately: acorns fall in autumn, so the quern
  // is a thing a band uses hard for three weeks and walks past for the rest of
  // the year. That shape is the point of it.
  //
  // `keep` is 3 rather than 1: meal is food, and a person wants a few days of it
  // on them the way they want a spear, not one for the collection.
  meal: {
    id: 'meal',
    label: 'Meal',
    icon: '\u{1F35A}',
    tech: 'grinding',
    // The first action in the game to practise `cook`, which until now was a
    // skill every character carried, spent points on at character creation, and
    // could never improve at. `herbalism` does the same for `heal`.
    skill: 'cook',
    workTicks: 90,
    ingredients: { acorn: 3 },
    output: { meal: 1 },
    station: 'quern',
    keep: 3,
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

/**
 * A recipe that consumes `itemId`, or null.
 *
 * The mirror of `recipeFor`, and single-valued for the same reason. It exists
 * because M8.1 puts the first *inedible ingredient* in the world: `Brain` has to
 * be able to ask "is this worth picking up?" about an acorn, and the only honest
 * answer runs through what it can be turned into and by whom.
 */
export function recipeUsing(itemId: string): RecipeDef | null {
  for (const recipe of Object.values(RECIPES)) {
    if (recipe.ingredients[itemId] !== undefined) return recipe;
  }
  return null;
}

/**
 * Nutrition this recipe yields per unit of `itemId` put into it.
 *
 * Zero if the recipe does not consume it or makes nothing anybody can eat.
 */
export function nutritionPerUnit(recipe: RecipeDef, itemId: string): number {
  const consumed = recipe.ingredients[itemId] ?? 0;
  if (consumed <= 0) return 0;
  const fed = Object.entries(recipe.output)
    .reduce((sum, [id, count]) => sum + (ITEMS[id]?.nutrition ?? 0) * count, 0);
  return fed / consumed;
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
