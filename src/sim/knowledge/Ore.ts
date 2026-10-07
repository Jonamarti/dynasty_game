/**
 * What a person goes looking for in the ground: the metals' side of the
 * recipe table (M15 phase 37).
 *
 * A flint outcrop and a berry bush are things a forager comes across; copper
 * is something a person goes to find because they know what it is for. There is
 * no list of "ore wanted" anywhere: **the recipe table says it**. Somebody who
 * can make a thing they have too few of wants whatever it is made of, and what
 * that is made of in turn, down to what lies on the ground: a person who wants a
 * bronze axe and holds no bronze wants tin and copper, which means ore, which
 * means charcoal, which means deadwood. A person who has never heard of casting
 * walks past a copper seam, and a smith with an empty stock does not — which is
 * `emergence-over-scripting` applied to a mine.
 *
 * **Why it walks down the chain and not one step.** The first version asked only
 * for the ore a recipe consumes directly, and measured in the `smiths` scenario
 * it failed in the way a chain fails: three people carried copper ore and two
 * carried charcoal, and nobody carried both, so a furnace stood idle beside a
 * camp with eleven loads of ore in it. Wanting the leaves of the chain sends
 * the one who holds the ore to fetch the deadwood, make the charcoal and carry
 * both to the furnace.
 *
 * Pure, and deliberately cheap: `Brain` asks it of every comfortable person on
 * every think, so the recipes that reach an ore are indexed once, here, and the
 * rest of the table is never looked at.
 */
import type { Person } from '../entities/Person.ts';
import { RECIPES, recipeFor, type RecipeDef } from '../entities/Recipe.ts';
import { RESOURCE_DEFS, RESOURCE_KINDS, ORE_COUNTS, type ResourceKind } from '../entities/ResourceNode.ts';
import { techPower } from './Tech.ts';

/** Every kind of node that is a metal rather than food or a material. */
export const ORE_KINDS: readonly ResourceKind[] =
  RESOURCE_KINDS.filter(kind => ORE_COUNTS[kind] !== undefined);

/** The item each ore kind gives, back to the kind. */
const KIND_OF_ORE: ReadonlyMap<string, ResourceKind> =
  new Map(ORE_KINDS.map(kind => [RESOURCE_DEFS[kind].itemId, kind]));

/** What a node gives that is not ore, back to the kind: only deadwood is wanted from it. */
const KIND_OF_MATERIAL: ReadonlyMap<string, ResourceKind> = new Map([[RESOURCE_DEFS.sticks.itemId, 'sticks']]);

/** How far down a chain of recipes the wanting follows: bronze axe, bronze, copper, charcoal, sticks. */
const DEPTH = 5;

/**
 * Whether making this item can end at an ore: the item is one, or the recipe
 * that makes it has an ingredient that is, down the chain. Indexed once.
 */
const REACHES_ORE = new Map<string, boolean>();
function reachesOre(itemId: string, depth = DEPTH): boolean {
  if (KIND_OF_ORE.has(itemId)) return true;
  const cached = REACHES_ORE.get(itemId);
  if (cached !== undefined) return cached;
  if (depth <= 0) return false;
  const maker = recipeFor(itemId);
  const reaches = maker !== null && Object.keys(maker.ingredients).some(id => reachesOre(id, depth - 1));
  if (depth === DEPTH) REACHES_ORE.set(itemId, reaches);
  return reaches;
}

/** The recipes whose making ends at an ore. */
const ORE_RECIPES: readonly RecipeDef[] =
  Object.values(RECIPES).filter(recipe => Object.keys(recipe.ingredients).some(id => reachesOre(id)));

/**
 * Whether this person can work a node of this kind at all. Native copper lies
 * on the surface and needs nothing; anything with a `requiresTech` needs the
 * technique, read through `techPower` like every other gate (a prototype is
 * worked at reduced power, an unknown design not at all).
 */
export function canWork(person: Person, kind: ResourceKind): boolean {
  const gate = RESOURCE_DEFS[kind].requiresTech;
  return gate === undefined || techPower(person, gate) > 0;
}

/**
 * What stands between this person and `count` of `itemId`, as the node kinds
 * that would fix it. Follows only what they know how to make, so a person who
 * cannot cast does not go looking for the copper a cast needs.
 */
function lacking(person: Person, itemId: string, count: number, depth: number, wanted: ResourceKind[]): void {
  if (person.inventory.count(itemId) >= count || depth <= 0) return;
  const ore = KIND_OF_ORE.get(itemId);
  if (ore !== undefined) {
    if (canWork(person, ore) && !wanted.includes(ore)) wanted.push(ore);
    return;
  }
  const material = KIND_OF_MATERIAL.get(itemId);
  if (material !== undefined) {
    if (!wanted.includes(material)) wanted.push(material);
    return;
  }
  const maker = recipeFor(itemId);
  if (maker === null || techPower(person, maker.tech) <= 0) return;
  for (const [id, need] of Object.entries(maker.ingredients)) lacking(person, id, need, depth - 1, wanted);
}

/**
 * The node kinds this person wants right now, in the order their recipes are
 * declared: a recipe they can make, whose output they hold fewer of than they
 * keep, and an ingredient of which they are short, followed down the chain to
 * what lies on the ground.
 */
export function wantedOreKinds(person: Person): ResourceKind[] {
  const wanted: ResourceKind[] = [];
  for (const recipe of ORE_RECIPES) {
    if (techPower(person, recipe.tech) <= 0) continue;
    const output = Object.keys(recipe.output)[0]!;
    if (person.inventory.count(output) >= recipe.keep) continue;
    for (const [itemId, count] of Object.entries(recipe.ingredients)) {
      lacking(person, itemId, count, DEPTH, wanted);
    }
  }
  return wanted;
}
