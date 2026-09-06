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
import { techPower } from '../knowledge/Tech.ts';
import type { ItemPile } from '../entities/ItemPile.ts';
import type { Animal } from '../entities/Animal.ts';

export type TargetKind =
  'ground' | 'person' | 'node' | 'building' | 'tree' | 'pile' | 'animal';

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
}

export interface ActionOption {
  id: string;
  label: string;
  /** A single glyph for the radial menu. */
  icon: string;
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
    case 'ground': return groundActions(actor, target, ctx);
  }
}

function personActions(actor: Person, other: Person): ActionOption[] {
  const carriedFood = actor.inventory.bestFood();
  const teachable = [...actor.knownTech].some(t => !other.knownTech.has(t));
  return [
    {
      id: 'teach',
      label: 'Teach ' + other.name,
      icon: '\u{1F393}',
      enabled: teachable,
      reason: teachable
        ? undefined
        : actor.knownTech.size === 0
          ? 'You know nothing worth passing on'
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

  const canCraft = techPower(actor, 'hafting') > 0;
  const hasParts = actor.inventory.has('flint') && actor.inventory.has('sticks');
  if (canCraft) {
    options.push({
      id: 'craft',
      label: 'Make a hand axe',
      icon: '\u{1FA93}',
      enabled: hasParts,
      reason: hasParts ? undefined : 'You need flint and a stick',
    });
  }
  return options;
}
