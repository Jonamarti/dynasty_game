/**
 * Every verb in the game, and when it applies.
 *
 * One catalogue, consulted by both the radial menu and (eventually) any NPC
 * deciding what is possible here. Keeping it in the simulation rather than in
 * the UI is deliberate: the menu must never be able to offer an order the world
 * does not understand, and the world must never gain a verb the menu silently
 * fails to show.
 *
 * `applies` decides whether the option appears at all; `reason` explains a
 * greyed-out option, because "why can't I do that?" deserves an answer in the
 * menu rather than a shrug.
 */
import type { Person } from '../entities/Person.ts';
import type { ResourceNode } from '../entities/ResourceNode.ts';
import type { World } from '../core/World.ts';
import type { Building } from '../entities/Building.ts';
import type { Tree } from '../entities/Tree.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES, hasIngredients, missingIngredients } from '../entities/Recipe.ts';
import { INSCRIPTIONS } from '../entities/Inscription.ts';
import { TECH, techPower, prerequisitesMet, type Tech } from '../knowledge/Tech.ts';
import { PROTOTYPE_AT } from '../knowledge/Synthesis.ts';
import type { ItemPile } from '../entities/ItemPile.ts';
import type { Inscription } from '../entities/Inscription.ts';
import type { Animal } from '../entities/Animal.ts';

export type TargetKind =
  'ground' | 'person' | 'node' | 'building' | 'tree' | 'pile' | 'animal' | 'inscription';

export interface ActionTarget {
  kind: TargetKind;
  x: number;
  y: number;
  person?: Person;
  node?: ResourceNode;
  building?: Building;
  tree?: Tree;
  pile?: ItemPile;
  animal?: Animal;
  inscription?: Inscription;
}

export interface ActionOption {
  id: string;
  label: string;
  /** A single glyph for the radial menu. */
  icon: string;
  /**
   * Which entry of `RECIPES` a `craft` option makes.
   *
   * The menu offers one option per recipe under the single `craft` verb, so the
   * id alone no longer says what would be made.
   */
  recipeId?: string;
  /** False when the action is shown but not currently possible. */
  enabled: boolean;
  /** Why it is disabled, for the tooltip. */
  reason?: string;
  /** True for deeds others will judge you for; the menu marks these. */
  hostile?: boolean;
}

export interface CatalogContext {
  world: World;
  /** True if the actor is standing close enough to water to drink. */
  nearWater: boolean;
  /**
   * Set when the player is commanding someone else rather than acting
   * themselves. The verbs are the same; only who carries them out changes, and
   * whether they agree to.
   */
  commanding?: Person | null;
}

const NODE_VERBS: Record<string, { label: string; icon: string; action: string }> = {
  berries: { label: 'Pick berries', icon: '\u{1F33F}', action: 'forage' },
  game: { label: 'Hunt', icon: '\u{1F3F9}', action: 'forage' },
  sticks: { label: 'Gather sticks', icon: '\u{1FAB5}', action: 'gather' },
  reeds: { label: 'Cut reeds', icon: '\u{1F33E}', action: 'gather' },
  clay: { label: 'Dig clay', icon: '\u{1FAA8}', action: 'gather' },
  flint: { label: 'Gather flint', icon: '\u{1FAA8}', action: 'gather' },
};

/**
 * What can be done with one stack in somebody's pack.
 *
 * Lives here rather than in the panel for the same reason every other verb
 * does: the inventory tab and the radial menu must never be able to disagree
 * about what is possible.
 */
export function itemActions(
  itemId: string,
  nearbyPerson: Person | null,
  nearbyStore: Building | null
): ActionOption[] {
  const def = ITEMS[itemId];
  const edible = (def?.nutrition ?? 0) > 0;

  return [
    {
      id: 'eat_item',
      label: 'Eat',
      icon: '\u{1F356}',
      enabled: edible,
      reason: edible ? undefined : 'Not food',
    },
    {
      id: 'give_item',
      label: nearbyPerson ? 'Give to ' + nearbyPerson.name : 'Give',
      icon: '\u{1F381}',
      enabled: nearbyPerson !== null,
      reason: nearbyPerson ? undefined : 'Nobody within reach',
    },
    {
      id: 'store_item',
      label: nearbyStore ? 'Put in the ' + nearbyStore.def.label.toLowerCase() : 'Store',
      icon: '\u{1F4E5}',
      enabled: nearbyStore !== null,
      reason: nearbyStore ? undefined : 'No store within reach',
    },
    {
      id: 'drop_item',
      label: 'Drop',
      icon: '\u{1F53B}',
      enabled: true,
    },
  ];
}

/**
 * The options for right-clicking `target` while playing `actor`.
 *
 * Ordered by how often they are wanted, because the radial menu lays them out
 * clockwise from the top and muscle memory is worth more than tidiness.
 */
export function availableActions(
  actor: Person,
  target: ActionTarget,
  ctx: CatalogContext
): ActionOption[] {
  switch (target.kind) {
    case 'person': return personActions(actor, target.person!);
    case 'node': return nodeActions(target.node!);
    case 'tree': return treeActions(target.tree!);
    case 'pile': return [{
      id: 'pickup',
      label: 'Pick up',
      icon: '\u{1F91A}',
      enabled: actor.carrying < actor.carryCapacity,
      reason: actor.carrying < actor.carryCapacity ? undefined : 'Your hands are full',
    }];
    case 'animal': return animalActions(actor, target.animal!);
    case 'building': return buildingActions(actor, target.building!);
    case 'inscription': return recordActions(actor, target.inscription!);
    case 'ground': return groundActions(actor, target, ctx);
  }
}

/**
 * What can be done with a record.
 *
 * Both verbs say why they are greyed out, and the literacy one is why that
 * matters here more than anywhere: an option that silently did nothing for an
 * illiterate character would hide the single rule the whole feature turns on.
 */
function recordActions(actor: Person, record: Inscription): ActionOption[] {
  const literate = techPower(actor, 'writing') > 0;

  if (record.unfinished) {
    return [{
      id: 'inscribe',
      label: 'Finish cutting it',
      icon: '\u{1FAA8}',
      enabled: literate,
      reason: literate ? undefined : 'You never learned to write',
    }];
  }

  const useful = record.techs.some(tech =>
    TECH[tech as Tech] !== undefined &&
    !actor.knownTech.has(tech) &&
    prerequisitesMet(tech as Tech, actor.knownTech));
  return [{
    id: 'read',
    label: 'Read it',
    icon: '\u{1F4D6}',
    enabled: literate && useful,
    reason: !literate
      ? 'You never learned to read'
      : useful
        ? undefined
        : record.techs.length === 0
          ? 'There is nothing on it yet'
          : 'Nothing on it that you could follow',
  }];
}

function personActions(actor: Person, other: Person): ActionOption[] {
  const carriedFood = actor.inventory.bestFood();
  // Something they could actually take in. `KnowledgeSystem.teach` drops any
  // technology whose prerequisites the pupil is missing, so a menu that only
  // asked "do they lack it?" offered a lesson that would quietly fail — and
  // since children can be taught, the pupil who lacks the scaffolding is now
  // the common case rather than the rare one.
  const teachable = [...actor.knownTech].some(t =>
    TECH[t as Tech] !== undefined &&
    !other.knownTech.has(t) &&
    prerequisitesMet(t as Tech, other.knownTech));
  const onlyGroundwork = !teachable && actor.knownTech.size > 0 &&
    [...actor.knownTech].some(t => !other.knownTech.has(t));

  // Talking a problem over with somebody who knows something about it. Offered
  // only when there is a problem: an option that is always visible and almost
  // never enabled teaches the player nothing.
  const idea = actor.ideas.find(candidate => candidate.stage !== 'prototyped');
  const informed = idea !== undefined && !other.isChild && (
    other.skills[TECH[idea.tech].skill] >= 12 ||
    TECH[idea.tech].requires.some(required => other.knownTech.has(required))
  );

  return [
    ...(idea ? [{
      id: 'discuss',
      label: 'Discuss ' + TECH[idea.tech].label.toLowerCase() + ' with ' + other.name,
      icon: '\u{1F914}',
      enabled: informed,
      reason: informed ? undefined : 'They know nothing about it',
    }] : []),
    {
      id: 'teach',
      label: 'Teach ' + other.name,
      icon: '\u{1F393}',
      enabled: teachable,
      reason: teachable
        ? undefined
        : actor.knownTech.size === 0
          ? 'You know nothing worth passing on'
          : onlyGroundwork
            ? 'They lack the groundwork for anything you could show them'
            : 'They already know everything you do',
    },
    {
      id: 'talk',
      label: 'Talk to ' + other.name,
      icon: '\u{1F4AC}',
      enabled: true,
    },
    {
      id: 'give',
      label: 'Give food',
      icon: '\u{1F381}',
      enabled: carriedFood !== null,
      reason: carriedFood === null ? 'You are carrying no food' : undefined,
    },
    {
      id: 'steal',
      label: 'Steal from ' + other.name,
      icon: '\u{1F576}',
      enabled: other.inventory.total > 0,
      reason: other.inventory.total === 0 ? 'They carry nothing' : undefined,
      hostile: true,
    },
    {
      id: 'attack',
      label: 'Attack ' + other.name,
      icon: '⚔',
      enabled: true,
      hostile: true,
    },
    {
      id: 'possess',
      label: 'Play as ' + other.name,
      icon: '\u{1F464}',
      enabled: true,
    },
  ];
}

function animalActions(actor: Person, animal: Animal): ActionOption[] {
  const laden = actor.carrying >= actor.carryCapacity;
  return [
    {
      id: 'hunt',
      label: 'Hunt the ' + animal.def.label.toLowerCase(),
      icon: '\u{1F3F9}',
      enabled: !laden,
      reason: laden ? 'Your hands are full' : undefined,
    },
  ];
}

function nodeActions(node: ResourceNode): ActionOption[] {
  const verb = NODE_VERBS[node.kind] ?? { label: 'Harvest', icon: '✋', action: 'forage' };
  return [
    {
      id: verb.action,
      label: verb.label,
      icon: verb.icon,
      enabled: !node.depleted,
      reason: node.depleted ? 'Nothing left here' : undefined,
    },
  ];
}

function treeActions(tree: Tree): ActionOption[] {
  const options: ActionOption[] = [];

  if (tree.def.fruitItem) {
    options.push({
      id: 'pick',
      label: 'Pick ' + tree.def.fruitItem + 's',
      icon: '\u{1F34E}',
      enabled: tree.fruit >= 1,
      reason: tree.fruit >= 1
        ? undefined
        : tree.isMature ? 'Nothing on it this season' : 'Too young to bear',
    });
  }

  options.push({
    id: 'chop',
    label: 'Fell the ' + tree.def.label.toLowerCase(),
    icon: '\u{1FA93}',
    enabled: true,
    // Felling is flagged the way theft and violence are. It is permanent, and
    // the only new trees anywhere come from the ones still standing.
    hostile: tree.isMature,
    reason: tree.isMature ? undefined : 'A sapling yields almost nothing',
  });

  return options;
}

function buildingActions(actor: Person, building: Building): ActionOption[] {
  const options: ActionOption[] = [];
  if (!building.complete) {
    options.push({
      id: 'build',
      label: 'Work on the ' + building.def.label,
      icon: '\u{1F528}',
      enabled: true,
    });
    options.push({
      id: 'haul',
      label: 'Deliver materials',
      icon: '\u{1F4E6}',
      enabled: building.wants(actor.inventory),
      reason: building.wants(actor.inventory) ? undefined : 'You carry nothing it needs',
    });
  } else {
    if (building.def.storage > 0) {
      options.push({
        id: 'store',
        label: 'Store what you carry',
        icon: '\u{1F4E5}',
        enabled: actor.inventory.total > 0,
        reason: actor.inventory.total === 0 ? 'You carry nothing' : undefined,
      });
      options.push({
        id: 'take',
        label: 'Take from store',
        icon: '\u{1F4E4}',
        enabled: building.store.total > 0,
        reason: building.store.total === 0 ? 'The store is empty' : undefined,
      });
    }
    if (building.def.shelter > 0) {
      // Sheltering is standing indoors waiting out the cold; sleeping is
      // sleeping. They restore different things at very different rates, and
      // offering only one of them made "go to bed" impossible to order.
      options.push({
        id: 'sleep',
        label: 'Sleep here',
        icon: '\u{1F6CC}',
        enabled: true,
      });
      options.push({
        id: 'shelter',
        label: 'Shelter here',
        icon: '\u{1F3E0}',
        enabled: true,
      });
    }
  }
  return options;
}

function groundActions(
  actor: Person,
  target: ActionTarget,
  ctx: CatalogContext
): ActionOption[] {
  const walkable = ctx.world.isWalkable(target.x, target.y);
  const options: ActionOption[] = [
    {
      id: 'goto',
      label: 'Walk here',
      icon: '\u{1F45F}',
      enabled: walkable,
      reason: walkable ? undefined : 'You cannot walk there',
    },
    {
      id: 'rest',
      label: 'Rest',
      icon: '\u{1F634}',
      enabled: true,
    },
    {
      id: 'eat',
      label: 'Eat',
      icon: '\u{1F356}',
      enabled: actor.inventory.bestFood() !== null,
      reason: actor.inventory.bestFood() === null ? 'You are carrying no food' : undefined,
    },
  ];
  // Offered whenever there is water within reach of the click, including when
  // the click landed *on* the water: the order routes to the nearest bank, so
  // clicking a lake and being told to go and drink is exactly right.
  if (ctx.nearWater) {
    options.push({ id: 'drink', label: 'Drink', icon: '\u{1F4A7}', enabled: true });
  }

  // Thinking, and building the first one. Both are aimed at nothing, so they
  // belong with the other verbs that happen where you stand.
  const thinkable = actor.ideas.find(
    candidate => candidate.stage !== 'prototyped' && candidate.insight < 1
  );
  options.push({
    id: 'ponder',
    label: thinkable
      ? 'Think about ' + TECH[thinkable.tech].label.toLowerCase()
      : 'Think',
    icon: '\u{1F4AD}',
    enabled: thinkable !== undefined,
    reason: thinkable === undefined ? 'Nothing has occurred to you yet' : undefined,
  });

  const buildable = actor.ideas.find(
    candidate => candidate.stage === 'researching' && candidate.insight >= PROTOTYPE_AT
  );
  if (buildable) {
    const def = TECH[buildable.tech];
    const ready = Object.entries(def.prototype)
      .every(([itemId, count]) => actor.inventory.count(itemId) >= count);
    options.push({
      id: 'prototype',
      label: 'Build the first ' + def.label.toLowerCase(),
      icon: '\u{1F528}',
      enabled: ready,
      reason: ready ? undefined : 'You need ' + Object.entries(def.prototype)
        .map(([itemId, count]) => count + ' ' + (ITEMS[itemId]?.label.toLowerCase() ?? itemId))
        .join(' and '),
    });
  }

  // Writing where you stand. Offered on the ground rather than on a record,
  // because a new one is *made* here — the ground is what you are writing on.
  if (techPower(actor, 'writing') > 0) {
    const spare = Object.values(INSCRIPTIONS).some(def =>
      (def.id !== 'clay' || techPower(actor, 'clay_tablet') > 0) &&
      Object.entries(def.materials)
        .every(([itemId, count]) => actor.inventory.count(itemId) >= count));
    options.push({
      id: 'inscribe',
      label: 'Write something down',
      icon: '\u{1FAA8}',
      enabled: spare,
      reason: spare ? undefined : 'You need flint to cut with',
    });
  }

  // One entry per recipe the actor knows, rather than the hand axe written out
  // by name. A recipe nobody has conceived of is not offered at all — a menu
  // full of greyed-out things would give away the shape of the tech web for
  // free — but one they know and lack the parts for is shown greyed with what
  // is missing, which is the question the `reason` channel exists to answer.
  for (const recipe of Object.values(RECIPES)) {
    if (techPower(actor, recipe.tech) <= 0) continue;
    const ready = hasIngredients(actor.inventory, recipe);
    options.push({
      id: 'craft',
      recipeId: recipe.id,
      label: 'Make a ' + recipe.label.toLowerCase(),
      icon: recipe.icon,
      enabled: ready,
      reason: ready ? undefined : missingIngredients(actor.inventory, recipe),
    });
  }
  return options;
}
