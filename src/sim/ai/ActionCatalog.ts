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
import { BUILDINGS, isStation } from '../entities/Building.ts';
import type { Tree } from '../entities/Tree.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES, hasIngredients, missingIngredients, type RecipeDef } from '../entities/Recipe.ts';
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
  /**
   * The building a `craft` option is to be done at, for a station recipe.
   *
   * M8.1, mechanism 4. `issue` in `main.ts` prefers this over the building that
   * was clicked, which is what lets "Grind meal" be offered on bare ground and
   * still arrive at the quern.
   */
  buildingId?: number;
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
   * The nearest finished station of a given `BUILDINGS` id that the actor could
   * work at, or null.
   *
   * Precomputed and handed in, following `nearWater`, precisely so the
   * catalogue does no world queries of its own — buildings have no spatial hash
   * and `optimizations.md` owns the decision that those scans stay linear, so
   * the one caller that already walks the list is the right place for it.
   * Optional so that the tests and the e2e specs which build a context by hand
   * keep compiling; a context without it simply offers no station recipes.
   */
  stationFor?: (stationId: string) => Building | null;
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
    case 'building': return buildingActions(actor, target.building!, ctx);
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
  // Literacy is a property of the *form* since M8.1, so a painter cannot read a
  // carved stone and a scribe cannot read a painting. The tooltip has to say
  // which, or the single rule the whole feature turns on is invisible from
  // inside the game.
  const literate = techPower(actor, record.def.literacy) > 0;

  if (record.unfinished) {
    return [{
      id: 'inscribe',
      label: 'Finish cutting it',
      icon: '\u{1FAA8}',
      enabled: literate,
      reason: literate ? undefined
        : 'You do not know how to make a ' + record.def.label.toLowerCase(),
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
      ? 'You cannot read a ' + record.def.label.toLowerCase()
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

  // M8.1: the first thing anybody can do about somebody else being hurt. Gated
  // on the knowledge rather than shown greyed, and on the patient's actually
  // being hurt, because "tend the perfectly healthy" is not a question worth
  // putting in front of the player.
  const hurt = other.health < 100;
  return [
    ...(techPower(actor, 'herbalism') > 0 ? [{
      id: 'tend',
      label: 'Tend ' + other.name,
      icon: '\u{1FAF6}',
      enabled: hurt,
      reason: hurt ? undefined : 'They are not hurt',
    }] : []),
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
  const beast = animal.def.label.toLowerCase();
  const options: ActionOption[] = [
    {
      id: 'hunt',
      label: 'Hunt the ' + beast,
      icon: '\u{1F3F9}',
      enabled: !laden,
      reason: laden ? 'Your hands are full' : undefined,
    },
  ];
  // M8.1. Offered only to somebody who could actually do it, for the reason the
  // craft menu gives: a menu full of greyed-out verbs hands the player the shape
  // of the tech web for free.
  if (techPower(actor, 'taming') > 0) {
    const food = actor.inventory.bestFood();
    const already = animal.tamedBy !== null;
    options.push({
      id: 'tame',
      label: already && animal.tamedBy === actor.id
        ? 'The ' + beast + ' follows you'
        : 'Offer the ' + beast + ' food',
      icon: '\u{1F36F}',
      enabled: !already && food !== null,
      reason: already
        ? 'It already follows somebody'
        : food === null ? 'You are carrying no food to offer' : undefined,
    });
  }
  return options;
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

function buildingActions(
  actor: Person,
  building: Building,
  ctx: CatalogContext
): ActionOption[] {
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
    // M8.1, mechanism 4: what this station is *for*, offered on the station
    // itself. Passing `building` as the station means the one that was clicked
    // is the one used, rather than whichever the UI thinks is nearest.
    if (isStation(building.def)) {
      for (const recipe of Object.values(RECIPES)) {
        if (recipe.station !== building.def.id) continue;
        if (techPower(actor, recipe.tech) <= 0) continue;
        options.push(craftOption(actor, recipe, ctx, building));
      }
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

  // Playing, where you stand: a tune has no destination, and everybody in
  // earshot gets it whether or not they were listening for it.
  if (techPower(actor, 'flute') > 0) {
    const hasFlute = actor.inventory.has('flute');
    options.push({
      id: 'play',
      label: 'Play a tune',
      icon: '\u{1F3B5}',
      enabled: hasFlute,
      reason: hasFlute ? undefined : 'You are not carrying a flute',
    });
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
  const forms = Object.values(INSCRIPTIONS)
    .filter(def => techPower(actor, def.literacy) > 0);
  if (forms.length > 0) {
    const usable = forms.filter(def => Object.entries(def.materials)
      .every(([itemId, count]) => actor.inventory.count(itemId) >= count));
    // Named after the best form they could actually use, because "write
    // something down" is the wrong verb for a painter and there is no reason to
    // make the player guess which of the three they are about to make.
    const best = usable[0] ?? forms[0]!;
    const wants = Object.keys(best.materials)
      .map(itemId => ITEMS[itemId]?.label.toLowerCase() ?? itemId)
      .join(' and ');
    options.push({
      id: 'inscribe',
      label: best.id === 'ochre' ? 'Paint something on the rock' : 'Write something down',
      icon: best.icon,
      enabled: usable.length > 0,
      reason: usable.length > 0 ? undefined : 'You need ' + wants,
    });
  }

  // One entry per recipe the actor knows, rather than the hand axe written out
  // by name. A recipe nobody has conceived of is not offered at all — a menu
  // full of greyed-out things would give away the shape of the tech web for
  // free — but one they know and lack the parts for is shown greyed with what
  // is missing, which is the question the `reason` channel exists to answer.
  for (const recipe of Object.values(RECIPES)) {
    if (techPower(actor, recipe.tech) <= 0) continue;
    options.push(craftOption(actor, recipe, ctx));
  }
  return options;
}

/**
 * One craft entry, with the station question answered.
 *
 * Shared by the ground menu and by the menu on a station itself, because "can
 * he make this, and where?" must not get two answers — the drift between two
 * copies of a predicate is what `Recipe.ts` was written to end.
 */
function craftOption(
  actor: Person,
  recipe: RecipeDef,
  ctx: CatalogContext,
  at: Building | null = null
): ActionOption {
  const station = recipe.station === undefined
    ? null
    : at ?? ctx.stationFor?.(recipe.station) ?? null;
  const label = 'Make ' + (recipe.station === undefined ? 'a ' : '') +
    recipe.label.toLowerCase();
  if (recipe.station !== undefined && !station) {
    // The station is missing, and saying which one is the whole point: a greyed
    // entry reading "you cannot do that" is the refusal channel failing at the
    // one moment it is easiest to get right.
    return {
      id: 'craft', recipeId: recipe.id, label, icon: recipe.icon,
      enabled: false,
      reason: 'You need a ' +
        (BUILDINGS[recipe.station]?.label.toLowerCase() ?? recipe.station) + ' to work at',
    };
  }
  const ready = hasIngredients(actor.inventory, recipe);
  return {
    id: 'craft',
    recipeId: recipe.id,
    buildingId: station?.id,
    label,
    icon: recipe.icon,
    enabled: ready,
    reason: ready ? undefined : missingIngredients(actor.inventory, recipe),
  };
}
