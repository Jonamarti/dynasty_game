/**
 * What a person goes looking for in the ground: the metals' side of the
 * recipe table (M15 phase 37).
 *
 * A flint outcrop and a berry bush are things a forager comes across; copper
 * is something a person goes to find because they know what it is for. There is
 * no list of "ore wanted" anywhere: **the recipe table says it**. Somebody who
 * can make a thing they have too few of, and who lacks an ore its recipe
 * consumes, wants the node that gives that ore. A person who has never heard
 * of casting walks past a copper seam, and a smith with an empty stock does
 * not — which is `emergence-over-scripting` applied to a mine.
 *
 * Pure, and deliberately cheap: `Brain` asks it of every comfortable person on
 * every think, so the recipes that name an ore are indexed once, here, and the
 * rest of the table is never looked at.
 */
import type { Person } from '../entities/Person.ts';
import { RECIPES, type RecipeDef } from '../entities/Recipe.ts';
import { RESOURCE_DEFS, RESOURCE_KINDS, ORE_COUNTS, type ResourceKind } from '../entities/ResourceNode.ts';
import { techPower } from './Tech.ts';

/** Every kind of node that is a metal rather than food or a material. */
export const ORE_KINDS: readonly ResourceKind[] =
  RESOURCE_KINDS.filter(kind => ORE_COUNTS[kind] !== undefined);

/** The item each ore kind gives, back to the kind. */
const KIND_OF_ITEM: ReadonlyMap<string, ResourceKind> =
  new Map(ORE_KINDS.map(kind => [RESOURCE_DEFS[kind].itemId, kind]));

/** The recipes that consume something dug or picked out of the ground. */
const ORE_RECIPES: readonly RecipeDef[] =
  Object.values(RECIPES).filter(recipe => Object.keys(recipe.ingredients).some(id => KIND_OF_ITEM.has(id)));

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
 * The ore kinds this person wants right now, in the order their recipes are
 * declared: a recipe they can make, whose output they hold fewer of than they
 * keep, and an ingredient of which they are short and which a node gives.
 */
export function wantedOreKinds(person: Person): ResourceKind[] {
  const wanted: ResourceKind[] = [];
  for (const recipe of ORE_RECIPES) {
    if (techPower(person, recipe.tech) <= 0) continue;
    const output = Object.keys(recipe.output)[0]!;
    if (person.inventory.count(output) >= recipe.keep) continue;
    for (const [itemId, count] of Object.entries(recipe.ingredients)) {
      const kind = KIND_OF_ITEM.get(itemId);
      if (kind === undefined || wanted.includes(kind)) continue;
      if (person.inventory.count(itemId) >= count) continue;
      if (canWork(person, kind)) wanted.push(kind);
    }
  }
  return wanted;
}
