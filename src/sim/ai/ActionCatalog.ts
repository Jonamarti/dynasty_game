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
import type { Corpse } from '../entities/Corpse.ts';
import { isHeld, isBound } from '../social/Defence.ts';
import { debtTo, offerFor, OFFER_AT_LEAST } from '../social/Amends.ts';
import { isCaptive, isEscapee } from '../social/Captivity.ts';
import type { Person } from '../entities/Person.ts';
import type { ResourceNode } from '../entities/ResourceNode.ts';
import type { World } from '../core/World.ts';
import type { Building } from '../entities/Building.ts';
import { BUILDINGS, isStation, isStructure } from '../entities/Building.ts';
import { SOW_SEED } from '../entities/Field.ts';
import type { Tree } from '../entities/Tree.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES, hasIngredients, missingIngredients, type RecipeDef } from '../entities/Recipe.ts';
import { INSCRIPTIONS } from '../entities/Inscription.ts';
import { TECH, techPower, prerequisitesMet, type Tech } from '../knowledge/Tech.ts';
import { MAX_IDEAS, PROTOTYPE_AT } from '../knowledge/Synthesis.ts';
import type { ItemPile } from '../entities/ItemPile.ts';
import type { Inscription } from '../entities/Inscription.ts';
import type { Animal } from '../entities/Animal.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';
import type { PropertyUse } from '../social/Property.ts';
import {
  CONVERSATION_MODES, MODE_LADDER, modeAllowed, whyNotYet, type ConversationMode,
} from '../social/Conversation.ts';
import { t, aNoun, theNoun, language, joinAnd } from '../../i18n/i18n.ts';
import { capitalise } from '../../i18n/i18n.ts';

export type TargetKind =
  'ground' | 'person' | 'node' | 'building' | 'tree' | 'pile' | 'animal' | 'inscription' | 'corpse';

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
  corpse?: Corpse;
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
  /**
   * Which technology a `discuss` or a `ponder` option is about.
   *
   * M9 phase 3. The menu offered one conversation and one line of thought,
   * because the action re-derived the subject from `workableIdea` on every
   * tick: with two ideas in somebody's head the second was unreachable from
   * the interface entirely. The option names it and the order carries it.
   */
  techId?: string;
  /**
   * Which rung of `Conversation.ts` a `talk` option asks for.
   *
   * M9 phase 4. The menu offers four conversations under one verb, so the id
   * alone no longer says which one — the same reason `recipeId` exists on
   * `craft` and `techId` on `discuss`.
   */
  mode?: ConversationMode;
  /** False when the action is shown but not currently possible. */
  enabled: boolean;
  /** Why it is disabled, for the tooltip. */
  reason?: string;
  /**
   * Something the player should know before choosing an *enabled* option —
   * M11 phase 15a, for "the owner of this store can see you". Distinct from
   * `reason`, which only ever explains why an option cannot be chosen.
   */
  warning?: string;
  /** True for deeds others will judge you for; the menu marks these. */
  hostile?: boolean;
  /**
   * A ring of options this one opens instead of doing anything itself.
   *
   * M9 phase 3, note 10. The catalogue had outgrown a flat menu: one option
   * per recipe meant a competent crafter right-clicking the ground got a ring
   * of a dozen overlapping buttons, and every technology added made it worse.
   * Grouping is decided here rather than in `RadialMenu` for the same reason
   * every other question about verbs is — the menu draws what the simulation
   * says is possible, and it must not invent categories of its own.
   *
   * An option with children carries no verb: `enabled` is what the group looks
   * like, and picking it opens the ring rather than issuing anything.
   */
  children?: ActionOption[];
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
   * Whether the actor can use a structure without an owner stopping them.
   * Optional for hand-built test contexts; the live catalogue always supplies
   * it so the menu and the executor answer ownership with the same rule.
   */
  propertyUse?: (building: Building) => PropertyUse;
  /**
   * M11 phase 13f. Puts a refused `PropertyUse` into words for whoever is
   * reading the menu. Separate from `propertyUse` because the catalogue does
   * not know who that is, and the witness has to be named as *they* know them.
   */
  explainProperty?: (use: PropertyUse) => string;
  /**
   * Set when the player is commanding someone else rather than acting
   * themselves. The verbs are the same; only who carries them out changes, and
   * whether they agree to.
   */
  commanding?: Person | null;
  /**
   * The actor's own view of everybody, and the tick, so the conversation rungs
   * can say which of them these two could actually have.
   *
   * Reading the actor's own familiarity with somebody is the actor's own
   * knowledge. Reading a *subordinate's* is not, so these are left out when
   * the player is commanding somebody else, and every rung is then offered
   * with the refusal left to `doTalk` to speak — the rule `issueTake` and
   * `ask` already follow. Optional also for the reason `stationFor` is: a
   * context built by hand in a test keeps compiling.
   */
  relationships?: RelationshipGraph;
  tick?: number;
  /**
   * Who leads a band, for "take a grievance to…" — M12 phase 2b. Who the
   * chief is, is known to everybody; it is the one thing about another person
   * the whole band can see.
   */
  chiefOf?: (bandId: number) => number | undefined;
}

const NODE_VERBS: Record<string, { label: string; icon: string; action: string }> = {
  berries: { label: 'Pick berries', icon: '\u{1F33F}', action: 'forage' },
  game: { label: 'Hunt', icon: '\u{1F3F9}', action: 'forage' },
  sticks: { label: 'Gather sticks', icon: '\u{1FAB5}', action: 'gather' },
  reeds: { label: 'Cut reeds', icon: '\u{1F33E}', action: 'gather' },
  clay: { label: 'Dig clay', icon: '\u{1FAA8}', action: 'gather' },
  flint: { label: 'Gather flint', icon: '\u{1FAA8}', action: 'gather' },
  // Translated where it is shown, below; `NODE_VERB_LABELS` lets the i18n test
  // see these.
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
  /**
   * How many living neighbours are within giving reach.
   *
   * A count rather than the nearest one: M9 phase 2 gave `give_item` a
   * recipient picker for exactly the reason `candidatesAt` got one in phase 1
   * — a single `findNearest` swallows the second person standing right there.
   */
  nearbyCount: number,
  /** The one neighbour's name, as the actor knows it, when `nearbyCount` is 1. */
  soleRecipientName: string | null,
  nearbyStore: Building | null
): ActionOption[] {
  const def = ITEMS[itemId];
  const edible = (def?.nutrition ?? 0) > 0;

  return [
    {
      id: 'eat_item',
      label: t('Eat'),
      icon: '\u{1F356}',
      enabled: edible,
      reason: edible ? undefined : t('Not food'),
    },
    {
      id: 'give_item',
      label: nearbyCount === 0
        ? t('Give')
        : nearbyCount === 1
          ? t('Give to {name}', { name: soleRecipientName })
          : t('Give to...'),
      icon: '\u{1F381}',
      enabled: nearbyCount > 0,
      reason: nearbyCount > 0 ? undefined : t('Nobody within reach'),
    },
    {
      id: 'store_item',
      label: nearbyStore
        ? t('Put in {store}', { store: theNoun(nearbyStore.def.label.toLowerCase()) })
        : t('Store'),
      icon: '\u{1F4E5}',
      enabled: nearbyStore !== null,
      reason: nearbyStore ? undefined : t('No store within reach'),
    },
    {
      id: 'drop_item',
      label: t('Drop'),
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
    case 'person': return personActions(actor, target.person!, ctx);
    case 'node': return nodeActions(target.node!);
    case 'tree': return treeActions(target.tree!);
    // `pickup` is a verb in `ActionSystem` as of the pass that answered the
    // owner's "to pick things up npcs must go near the object", so it can be
    // ordered like anything else — this used to be refused here because there
    // was no such action for a subordinate to carry out. `actor` is the
    // subject, so the capacity asked about belongs to whoever would actually
    // walk over and bend down.
    case 'pile': {
      const room = actor.carrying < actor.carryCapacity;
      return [{
        id: 'pickup',
        label: t('Pick up'),
        icon: '\u{1F91A}',
        enabled: room,
        reason: room ? undefined
          : ctx.commanding ? t('Their hands are full') : t('Your hands are full'),
      }];
    }
    case 'animal': return animalActions(actor, target.animal!);
    case 'building': return buildingActions(actor, target.building!, ctx);
    case 'inscription': return recordActions(actor, target.inscription!);
    case 'ground': return groundActions(actor, target, ctx);
    // M11 phase 16b: what can be done to a body, besides looking at it.
    case 'corpse': return [
      {
        id: 'dismember',
        label: t('Cut up the body'),
        icon: '\u{1FA93}',
        enabled: !target.corpse!.dismembered,
        reason: target.corpse!.dismembered ? t('There is nothing left to know it by') : undefined,
        hostile: true,
      },
      {
        // M11 phase 16e. Offered on any body: whether there is anything to
        // find out is what asking is for.
        id: 'investigate',
        label: t('Ask who did this'),
        icon: '\u{1F50D}',
        enabled: true,
      },
      {
        id: 'drag',
        label: t('Drag it to the water'),
        icon: '\u{1F30A}',
        enabled: true,
        hostile: true,
      },
    ];
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
      label: t('Finish cutting it'),
      icon: '\u{1FAA8}',
      enabled: literate,
      reason: literate ? undefined
        : t('You do not know how to make {thing}', { thing: aNoun(record.def.label.toLowerCase()) }),
    }];
  }

  // A `reminder` record only ever lands an idea, so the same two extra guards
  // `ActionSystem.doRead` applies apply here too — otherwise the button reads
  // "enabled" for a painting that can no longer do anything for this person,
  // and clicking it walks them over to be turned away.
  const useful = record.techs.some(tech =>
    TECH[tech as Tech] !== undefined &&
    !actor.knownTech.has(tech) &&
    prerequisitesMet(tech as Tech, actor.knownTech) &&
    (record.def.fidelity === 'instruction' ||
      (!actor.ideaFor(tech) && actor.ideas.length < MAX_IDEAS)));
  return [{
    id: 'read',
    label: t('Read it'),
    icon: '\u{1F4D6}',
    enabled: literate && useful,
    reason: !literate
      ? t('You cannot read {thing}', { thing: aNoun(record.def.label.toLowerCase()) })
      : useful
        ? undefined
        : record.techs.length === 0
          ? t('There is nothing on it yet')
          : t('Nothing on it that you could follow'),
  }];
}

function personActions(actor: Person, other: Person, ctx: CatalogContext): ActionOption[] {
  const carriedFood = actor.inventory.bestFood();
  // How well the actor knows this person, which is what decides which
  // conversations the two of them could have.
  //
  // Absent — which is how `main.ts` calls this when the player is commanding
  // somebody else — every rung is offered and `doTalk` speaks the refusal. How
  // warmly a subordinate feels toward a third person is the subordinate's own
  // business, and a menu that greyed out "talk at length" would tell the
  // player something `AGENTS.md` says the UI must never read. Exactly the rule
  // `issueTake` follows at a store whose contents are not the player's to see,
  // and the one `ask` follows over what is in somebody's head.
  const blind = ctx.relationships === undefined;
  const rel = ctx.relationships?.peek(actor.id, other.id) ?? null;
  const tick = ctx.tick ?? 0;
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
  //
  // One entry per idea, not one entry. The filter is `workableIdea`'s, and it
  // has to stay `workableIdea`'s: an option the action would refuse the moment
  // it was picked is worse than no option, and the two predicates drifting
  // apart is how that happens.
  const discussions: ActionOption[] = actor.ideas
    .filter(candidate => candidate.stage !== 'prototyped' && candidate.insight < 1)
    .map(candidate => {
      const def = TECH[candidate.tech];
      const informed = !other.isChild && (
        other.skills[def.skill] >= 12 ||
        def.requires.some(required => other.knownTech.has(required))
      );
      return {
        id: 'discuss',
        techId: candidate.tech,
        label: t('Discuss {tech} with {name}', { tech: t(def.label).toLowerCase(), name: other.name }),
        icon: '\u{1F914}',
        enabled: informed,
        reason: informed ? undefined : t('They know nothing about it'),
      };
    });

  // M8.1: the first thing anybody can do about somebody else being hurt. Gated
  // on the knowledge rather than shown greyed, and on the patient's actually
  // being hurt, because "tend the perfectly healthy" is not a question worth
  // putting in front of the player.
  const hurt = other.health < 100;
  return [
    ...(techPower(actor, 'herbalism') > 0 ? [{
      id: 'tend',
      label: t('Tend {name}', { name: other.name }),
      icon: '\u{1FAF6}',
      enabled: hurt,
      reason: hurt ? undefined : t('They are not hurt'),
    }] : []),
    // The owner's note of 2026-09-24: what one person can do to another is
    // three families of verb — talking, knowledge, and confrontation — and a
    // ring with all of them side by side had grown past reading. One entry
    // per family, each opening onto its own ring; `grouped` leaves a family
    // of fewer than three flat.
    ...grouped([
    ...grouped(discussions, t('Discuss with {name}…', { name: other.name }), '\u{1F914}',
      t('They know nothing about what is on your mind')),
    {
      id: 'teach',
      label: t('Teach {name}', { name: other.name }),
      icon: '\u{1F393}',
      enabled: teachable,
      reason: teachable
        ? undefined
        : actor.knownTech.size === 0
          ? t('You know nothing worth passing on')
          : onlyGroundwork
            ? t('They lack the groundwork for anything you could show them')
            : t('They already know everything you do'),
    },
    {
      // M9 phase 3, note 11: the mirror of `teach`, started by the pupil.
      //
      // Always offered, and deliberately not gated on what `other` knows.
      // Every other option here is computed from what the actor can see, and
      // what is in somebody else's head is the one thing nobody can see —
      // working out whether they have anything to show you would hand the
      // player a reading of a stranger's knowledge that the character does not
      // have. Asking is free and the answer is the interesting part, so the
      // refusals live in `doAsk` where they can be spoken.
      id: 'ask',
      label: t('Ask {name} to show you how', { name: other.name }),
      icon: '\u{1F64B}',
      enabled: !other.isChild,
      reason: other.isChild ? t('They are too young to show anybody anything') : undefined,
    },
    ], t('Teach and learn…'), '\u{1F393}', t('There is nothing to teach or learn here'), false, FAMILY_AT),
    {
      // M11 phase 11: the safe half of the fix for "nobody can become a
      // better fighter than the person next to them" (docs/bugs.md). Nobody
      // is hurt; `doSpar` is where the gate on their willingness actually
      // lives, this menu only rules out what could never be offered at all.
      id: 'spar',
      label: t('Spar with {name}', { name: other.name }),
      icon: '\u{1F94A}',
      enabled: !actor.isChild && !other.isChild,
      reason: actor.isChild || other.isChild
        ? t('Too young to spar safely')
        : undefined,
    },
    // M9 phase 4, note 5. One entry per rung of `Conversation.ts` rather than
    // the single "Talk to X" that stood for all four: the simulation now has
    // four conversations at four prices, and a menu offering one of them is
    // the defect the single `discuss` entry had — a choice the action would
    // honour that the player had no way to make.
    //
    // The rungs out of reach are shown and greyed rather than hidden, because
    // what the player is being told is a fact about their own relationship,
    // and a conversation that quietly is not offered teaches nobody anything.
    // `modeAllowed` is shared with `doTalk` so the menu cannot offer a
    // conversation the simulation would then decline to have.
    ...grouped(MODE_LADDER.map(mode => {
      const allowed = blind || modeAllowed(rel, tick, mode);
      return {
        id: 'talk',
        mode,
        label: t(CONVERSATION_MODES[mode].verb),
        icon: '\u{1F4AC}',
        enabled: allowed,
        reason: allowed ? undefined : whyNotYet(mode),
      };
    }), t('Talk to {name}…', { name: other.name }), '\u{1F4AC}',
      t('They do not know them well enough to say anything')),
    {
      id: 'give',
      label: t('Give food'),
      icon: '\u{1F381}',
      enabled: carriedFood !== null,
      reason: carriedFood === null ? t('You are carrying no food') : undefined,
    },
    {
      // M11 phase 7b's third `BandRelations` engine: both sides hand
      // something over, unlike `give`, which is why it needs food on both
      // sides rather than one.
      id: 'trade',
      label: t('Trade with {name}', { name: other.name }),
      icon: '\u{1F91D}',
      enabled: carriedFood !== null && other.inventory.bestFood() !== null,
      reason: carriedFood === null
        ? t('You are carrying no food')
        : other.inventory.bestFood() === null
          ? t('They are carrying no food')
          : undefined,
    },
    // M12 phase 2a. Only when the player's character owes this person — they
    // know their own debts, and nobody else's — so the ring does not carry
    // an entry that is almost never there to use.
    ...(ctx.commanding ? [] : [...amendsOption(actor, other), ...justiceOptions(actor, other, ctx)]),
    ...grouped([
    {
      id: 'steal',
      label: t('Steal from {name}', { name: other.name }),
      icon: '\u{1F576}',
      enabled: other.inventory.total > 0,
      reason: other.inventory.total === 0 ? t('They carry nothing') : undefined,
      hostile: true,
    },
    {
      // Coercion that needs no technology: a demand made openly, unlike
      // `steal`, so it costs standing whether or not it is met.
      id: 'threaten',
      label: t('Threaten {name}', { name: other.name }),
      icon: '\u{270A}',
      enabled: other.inventory.total > 0,
      reason: other.inventory.total === 0 ? t('They carry nothing') : undefined,
      hostile: true,
    },
    {
      // M11 phase 15b: holding somebody back. Hurts nobody; whether it works
      // is a struggle, and everybody else grappling them counts.
      id: 'restrain',
      label: t('Hold {name} back', { name: other.name }),
      icon: '\u{1F932}',
      enabled: true,
      hostile: true,
    },
    // M11 phase 15c. Offered only to somebody who knows `cordage`, on the
    // same terms `tame` is: a greyed-out verb nobody here could have thought
    // of hands the player the shape of the tech web for free.
    ...(techPower(actor, 'cordage') > 0 ? [{
      id: 'bind',
      label: t('Tie {name} up', { name: other.name }),
      icon: '\u{1FAA2}',
      enabled: actor.inventory.count('rope') > 0 && isHeld(other, tick),
      reason: actor.inventory.count('rope') <= 0 ? t('You have no rope')
        : !isHeld(other, tick) ? t('Somebody has to be holding them down first')
        : undefined,
      hostile: true,
    }] : []),
    {
      id: 'untie',
      label: t('Untie {name}', { name: other.name }),
      icon: '\u{1FAA2}',
      enabled: !actor.isChild && isBound(other, tick),
      reason: actor.isChild ? t('Too young to untie somebody safely')
        : !isBound(other, tick) ? t('They are not tied up') : undefined,
    },
    {
      id: 'attack',
      label: t('Attack {name}', { name: other.name }),
      icon: '⚔',
      enabled: true,
      hostile: true,
    },
    ], t('Confront {name}…', { name: other.name }), '⚔', '', true, FAMILY_AT),
    {
      id: 'possess',
      label: t('Play as {name}', { name: other.name }),
      icon: '\u{1F464}',
      enabled: true,
    },
  ];
}

function animalActions(actor: Person, animal: Animal): ActionOption[] {
  const laden = actor.carrying >= actor.carryCapacity;
  const beast = theNoun(animal.def.label.toLowerCase());
  const options: ActionOption[] = [
    {
      id: 'hunt',
      label: t('Hunt {beast}', { beast }),
      icon: '\u{1F3F9}',
      enabled: !laden,
      reason: laden ? t('Your hands are full') : undefined,
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
        ? capitalise(t('{beast} follows you', { beast }))
        : t('Offer {beast} food', { beast }),
      icon: '\u{1F36F}',
      enabled: !already && food !== null,
      reason: already
        ? t('It already follows somebody')
        : food === null ? t('You are carrying no food to offer') : undefined,
    });
  }
  return options;
}

function nodeActions(node: ResourceNode): ActionOption[] {
  const verb = NODE_VERBS[node.kind] ?? { label: 'Harvest', icon: '✋', action: 'forage' };
  return [
    {
      id: verb.action,
      label: t(verb.label),
      icon: verb.icon,
      enabled: !node.depleted,
      reason: node.depleted ? t('Nothing left here') : undefined,
    },
  ];
}

function treeActions(tree: Tree): ActionOption[] {
  const options: ActionOption[] = [];

  if (tree.def.fruitItem) {
    options.push({
      id: 'pick',
      // English has always pluralised the id; a translation takes the label.
      label: t('Pick {fruit}', {
        fruit: language() === 'en'
          ? tree.def.fruitItem + 's'
          : t(ITEMS[tree.def.fruitItem]?.label ?? tree.def.fruitItem).toLowerCase(),
      }),
      icon: '\u{1F34E}',
      enabled: tree.fruit >= 1,
      reason: tree.fruit >= 1
        ? undefined
        : tree.isMature ? t('Nothing on it this season') : t('Too young to bear'),
    });
  }

  options.push({
    id: 'chop',
    label: t('Fell {tree}', { tree: theNoun(tree.def.label.toLowerCase()) }),
    icon: '\u{1FA93}',
    enabled: true,
    // Felling is flagged the way theft and violence are. It is permanent, and
    // the only new trees anywhere come from the ones still standing.
    hostile: tree.isMature,
    reason: tree.isMature ? undefined : t('A sapling yields almost nothing'),
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
      label: t('Work on {site}', { site: theSite(building.def.label) }),
      icon: '\u{1F528}',
      enabled: true,
    });
    options.push({
      id: 'haul',
      label: t('Deliver materials'),
      icon: '\u{1F4E6}',
      enabled: building.wants(actor.inventory),
      reason: building.wants(actor.inventory) ? undefined : t('You carry nothing it needs'),
    });
  } else {
    const property = ctx.propertyUse?.(building);
    // M11 phase 15a. Being watched used to disable every verb on a foreign
    // building, with the watcher's name as the greyed-out reason. It is a
    // warning now, not a refusal: the verb is offered, and `watched` says
    // before the player commits who will see it done.
    const watched = property?.watched
      ? ctx.explainProperty?.(property) ?? t('someone from its band is watching')
      : undefined;
    // M11 phase 11b. Repair reuses `build` rather than getting a verb of its
    // own — see `ActionSystem.doBuild`'s own note on why — so the one thing
    // this menu has to add is the *option*: nothing else here offers `build`
    // on a finished site, and without this a damaged hut had no way back.
    if (building.durability !== null && building.durability < building.def.workTicks) {
      options.push({
        id: 'build',
        label: t('Repair {site}', { site: theSite(building.def.label) }),
        icon: '\u{1F528}',
        enabled: true,
        warning: watched,
      });
    }
    // Offered only on a foreign building nobody here has any claim to —
    // `property.ours` is true for the actor's own band and for a close
    // enough ally, and sabotaging either is not a choice this menu offers,
    // the same way `steal` is never offered on one's own store. A watched
    // target carries the same warning every other property verb does.
    if (property && !property.ours && isStructure(building.def) &&
      !building.ruined) {
      options.push({
        id: 'sabotage',
        label: t('Damage {site}', { site: theSite(building.def.label) }),
        icon: '\u{1F525}',
        enabled: true,
        warning: watched,
        hostile: true,
      });
    }
    if (building.def.storage > 0) {
      options.push({
        id: 'store',
        label: t('Store what you carry'),
        icon: '\u{1F4E5}',
        enabled: actor.inventory.total > 0,
        reason: actor.inventory.total === 0 ? t('You carry nothing') : undefined,
        warning: watched,
      });
      options.push({
        id: 'take',
        label: t('Take from store'),
        icon: '\u{1F4E4}',
        enabled: building.store.total > 0,
        reason: building.store.total === 0 ? t('The store is empty') : undefined,
        warning: watched,
      });
    }
    // M8.2. Both verbs are offered on a finished plot, and which one is enabled
    // is the state of the crop: a ripe field asks to be cut and a bare one asks
    // for seed. The `reason` on each is the whole point — the standing
    // instruction on this project is that a refusal has to say why, and the
    // menu is the one place a player can be told *before* walking across the
    // camp rather than after.
    if (building.crop) {
      const crop = building.crop;
      const seed = actor.inventory.count('grain');
      const knows = techPower(actor, 'farming') > 0;
      options.push({
        id: 'sow',
        label: t('Sow the field'),
        icon: '\u{1F331}',
        enabled: knows && crop.isFallow && seed >= SOW_SEED && !building.ruined,
        reason: building.ruined ? t('It has been trampled, and needs mending first')
          : !knows ? t('Nobody here has the idea of putting seed back in the ground')
          : !crop.isFallow ? t('Something is growing here already')
          : seed < SOW_SEED ? t('You need {n} grain to sow this', { n: SOW_SEED })
          : undefined,
        warning: watched,
      });
      const knowsCompost = techPower(actor, 'composting') > 0;
      if (knowsCompost) {
        // Offered only to somebody who could do it, the way `tame` is: a menu
        // full of greyed-out verbs hands the player the shape of the tech web
        // for free. The heap itself is not required to be nearby — `doSpread`
        // walks to one — so the only thing that can stop this is there being no
        // compost anywhere in the band.
        options.push({
          id: 'spread',
          label: t('Spread compost here'),
          icon: '\u{1F343}',
          enabled: true,
          warning: watched,
        });
      }
      options.push({
        id: 'reap',
        label: t('Bring in the harvest'),
        icon: '\u{1F33E}',
        enabled: crop.isRipe,
        reason: crop.isRipe ? undefined
          : crop.isFallow ? t('Nothing is growing here')
          : t('It is not ready yet'),
        warning: watched,
      });
    }
    if (building.def.shelter > 0) {
      // Sheltering is standing indoors waiting out the cold; sleeping is
      // sleeping. They restore different things at very different rates, and
      // offering only one of them made "go to bed" impossible to order.
      options.push({
        id: 'sleep',
        label: t('Sleep here'),
        icon: '\u{1F6CC}',
        enabled: true,
        warning: watched,
      });
      options.push({
        id: 'shelter',
        label: t('Shelter here'),
        icon: '\u{1F3E0}',
        enabled: true,
        warning: watched,
      });
    }
    // M8.1, mechanism 4: what this station is *for*, offered on the station
    // itself. Passing `building` as the station means the one that was clicked
    // is the one used, rather than whichever the UI thinks is nearest.
    if (isStation(building.def)) {
      const crafts: ActionOption[] = [];
      for (const recipe of Object.values(RECIPES)) {
        if (recipe.station !== building.def.id) continue;
        if (techPower(actor, recipe.tech) <= 0) continue;
        const option = craftOption(actor, recipe, ctx, building);
        // Still a refusal, unlike every other verb on this building, and on
        // purpose: `ActionSystem`'s station craft does not pass through
        // `useProperty`, so it records no deed at all. Letting it run in front
        // of the owners would make being watched cost nothing here — see
        // `bugs.md`.
        crafts.push(watched ? { ...option, enabled: false, reason: watched } : option);
      }
      options.push(...grouped(crafts, t('Make…'), '\u{1F528}',
        t('You know nothing that is made here')));
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
      label: t('Walk here'),
      icon: '\u{1F45F}',
      enabled: walkable,
      reason: walkable ? undefined : t('You cannot walk there'),
    },
    // M11 phase 15d: the way out, for a captive — and the road home, for one
    // who has already slipped away. Offered without asking who is watching:
    // the menu does not know, and `doEscape` says so if somebody is.
    ...(isCaptive(actor) || isEscapee(actor) ? [{
      id: 'escape',
      label: isCaptive(actor) ? t('Slip away') : t('Go home'),
      icon: '\u{1F3C3}',
      enabled: true,
    }] : []),
    {
      // M11 phase 15b.4. Everybody within earshot hears that you called, and
      // nothing more; whoever comes is told when they arrive.
      id: 'call_for_help',
      label: t('Call for help'),
      icon: '\u{1F4E3}',
      enabled: true,
    },
    {
      id: 'rest',
      label: t('Rest'),
      icon: '\u{1F634}',
      enabled: true,
    },
    {
      id: 'eat',
      label: t('Eat'),
      icon: '\u{1F356}',
      enabled: actor.inventory.bestFood() !== null,
      reason: actor.inventory.bestFood() === null ? t('You are carrying no food') : undefined,
    },
  ];
  // Offered whenever there is water within reach of the click, including when
  // the click landed *on* the water: the order routes to the nearest bank, so
  // clicking a lake and being told to go and drink is exactly right.
  if (ctx.nearWater) {
    options.push({ id: 'drink', label: t('Drink'), icon: '\u{1F4A7}', enabled: true });
  }

  // Playing, where you stand: a tune has no destination, and everybody in
  // earshot gets it whether or not they were listening for it.
  if (techPower(actor, 'flute') > 0) {
    const hasFlute = actor.inventory.has('flute');
    options.push({
      id: 'play',
      label: t('Play a tune'),
      icon: '\u{1F3B5}',
      enabled: hasFlute,
      reason: hasFlute ? undefined : t('You are not carrying a flute'),
    });
  }

  // `brewing`'s verb, on the same terms as `play`: no destination, everybody
  // in earshot gets some of it.
  if (techPower(actor, 'brewing') > 0) {
    const hasBeer = actor.inventory.has('beer');
    options.push({
      id: 'toast',
      label: t('Share a drink'),
      icon: '\u{1F37A}',
      enabled: hasBeer,
      reason: hasBeer ? undefined : t('You are not carrying any beer'),
    });
  }

  // Thinking, and building the first one. Both are aimed at nothing, so they
  // belong with the other verbs that happen where you stand.
  //
  // One entry per idea, for the reason `discuss` gained one: `doPonder` picked
  // the least advanced idea for itself, so the other one in somebody's head
  // could not be worked on at all from the menu. The disabled single entry
  // survives for the case of having no ideas, because "why can I not think?"
  // deserves the same answer every other greyed verb gives.
  const thinkable: ActionOption[] = actor.ideas
    .filter(candidate => candidate.stage !== 'prototyped' && candidate.insight < 1)
    .map(candidate => ({
      id: 'ponder',
      techId: candidate.tech,
      label: t('Think about {tech}', { tech: t(TECH[candidate.tech].label).toLowerCase() }),
      icon: '\u{1F4AD}',
      enabled: true,
    }));
  if (thinkable.length === 0) {
    // M9 phase 5: this used to be a greyed "Think" reading "Nothing has
    // occurred to you yet", which was a true sentence about `ponder` and a
    // false one about the character — the owner's note 4 is precisely that
    // having no idea yet is the moment thinking is *for*. `reflect` needs no
    // idea, so the answer to "why can I not think?" stopped being a refusal.
    options.push({
      id: 'reflect',
      label: t('Sit and think'),
      icon: '\u{1F4AD}',
      enabled: true,
    });
  } else {
    options.push(...grouped(thinkable, t('Think about…'), '\u{1F4AD}', ''));
  }

  // Devices only: "Build the first plant lore" is not a thing anybody can do,
  // and it was on this menu until the owner pointed at it. A practice at the
  // same stage is being tried out already — it works at half strength the
  // moment there is enough of an idea to try — so there is nothing for the
  // menu to offer beyond the verbs that were always there.
  const buildable = actor.ideas.find(
    candidate => candidate.stage === 'researching' &&
      candidate.insight >= PROTOTYPE_AT &&
      TECH[candidate.tech].kind === 'device'
  );
  if (buildable) {
    const def = TECH[buildable.tech];
    const ready = Object.entries(def.prototype)
      .every(([itemId, count]) => actor.inventory.count(itemId) >= count);
    options.push({
      id: 'prototype',
      label: t('Build the first {tech}', { tech: t(def.label).toLowerCase() }),
      icon: '\u{1F528}',
      enabled: ready,
      reason: ready ? undefined : t('You need {list}', {
        list: joinWith(Object.entries(def.prototype)
          .map(([itemId, count]) => count + ' ' + t(ITEMS[itemId]?.label ?? itemId).toLowerCase())),
      }),
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
    const wants = joinWith(Object.keys(best.materials)
      .map(itemId => t(ITEMS[itemId]?.label ?? itemId).toLowerCase()));
    options.push({
      id: 'inscribe',
      label: best.id === 'ochre' ? t('Paint something on the rock') : t('Write something down'),
      icon: best.icon,
      enabled: usable.length > 0,
      reason: usable.length > 0 ? undefined : t('You need {list}', { list: wants }),
    });
  }

  // One entry per recipe the actor knows, rather than the hand axe written out
  // by name. A recipe nobody has conceived of is not offered at all — a menu
  // full of greyed-out things would give away the shape of the tech web for
  // free — but one they know and lack the parts for is shown greyed with what
  // is missing, which is the question the `reason` channel exists to answer.
  const crafts: ActionOption[] = [];
  for (const recipe of Object.values(RECIPES)) {
    if (techPower(actor, recipe.tech) <= 0) continue;
    crafts.push(craftOption(actor, recipe, ctx));
  }
  options.push(...grouped(crafts, t('Make…'), '\u{1F528}',
    t('You do not know how to make anything yet')));
  return options;
}

/**
 * "the Mud hut", as English has always written a building's label into a verb
 * — capitalised, unlike every other noun on this menu — and "la choza de
 * barro" in Spanish, where the article has to agree.
 */
function theSite(label: string): string {
  return language() === 'en' ? 'the ' + label : theNoun(label.toLowerCase());
}

/** " and " in English, exactly as these lists always joined; "a, b y c" otherwise. */
function joinWith(parts: string[]): string {
  return language() === 'en' ? parts.join(' and ') : joinAnd(parts);
}

/** For the i18n coverage test: the node verbs are translated where shown. */
export const NODE_VERB_LABELS: string[] = [
  ...Object.values(NODE_VERBS).map(verb => verb.label), 'Harvest',
];

/**
 * Folds a run of related options into one entry, once there are enough of them
 * to be worth a page of their own.
 *
 * M9 phase 3, note 10. Below the threshold the options stay on the ring they
 * were on: a forager who knows one recipe should not have to open a submenu to
 * reach the only thing in it, and burying a single option is how a menu that
 * nests becomes a menu that hides.
 *
 * The group reports the state of what is inside it — greyed when nothing in
 * there can be done — but stays *openable* either way, because the reason a
 * recipe is out of reach lives on the recipe, and a group that refused to open
 * would be a refusal with its explanation locked inside it.
 */
function grouped(
  options: ActionOption[], label: string, icon: string, emptyReason: string, hostile = false,
  at = GROUP_AT
): ActionOption[] {
  if (options.length < at) return options;
  const any = options.some(option => option.enabled);
  return [{
    id: 'group',
    label,
    icon,
    enabled: any,
    reason: any ? undefined : emptyReason,
    children: options,
    // Drawn in the warning colour of the verbs inside it, so a ring of blows
    // does not look like a ring of kindnesses.
    ...(hostile ? { hostile: true } : {}),
  }];
}

/**
 * How many related options it takes before they are worth folding away.
 *
 * Three. Two extra buttons on a ring of eight are nothing; the ring stops
 * being readable somewhere around ten, and a crafter late in the tree has
 * fifteen recipes on their own.
 */
const GROUP_AT = 3;

/**
 * "Make amends to…", when there is something owed — M12 phase 2a. Greyed,
 * with the reason, when what the actor carries would not make a real offer:
 * the same line `Brain` holds NPCs to (`OFFER_AT_LEAST`).
 */
function amendsOption(actor: Person, other: Person): ActionOption[] {
  const debt = debtTo(actor, other.id);
  if (!debt) return [];
  const enough = offerFor(actor, debt).value >= debt.worth * OFFER_AT_LEAST;
  return [{
    id: 'make_amends',
    label: t('Make amends to {name}', { name: other.name }),
    icon: '\u{1F932}',
    enabled: enough,
    reason: enough ? undefined : t('You have nothing worth offering them'),
  }];
}

/**
 * Going to the chief, and putting a wrong to another people — M12 phase 2b.
 * Offered only when there is something to say: a grievance not yet taken to
 * one's own chief, a demand carried from another people, or a case against
 * the clicked person's people on the actor's own docket. All three are the
 * actor's own knowledge, which is why none of this is offered while
 * commanding somebody else.
 */
function justiceOptions(actor: Person, other: Person, ctx: CatalogContext): ActionOption[] {
  const options: ActionOption[] = [];
  if (ctx.chiefOf?.(actor.bandId) === other.id && other.id !== actor.id) {
    if (actor.carriedDemand) {
      options.push({
        id: 'complain',
        label: t('Pass on a demand to {name}', { name: other.name }),
        icon: '\u{1F4DC}',
        enabled: true,
      });
    } else if (actor.grievances.some(g => !g.lodged)) {
      options.push({
        id: 'complain',
        label: t('Take a grievance to {name}', { name: other.name }),
        icon: '\u{2696}',
        enabled: true,
      });
    }
  }
  if (actor.docket.some(c => c.accusedBandId === other.bandId) && !other.isChild) {
    options.push({
      id: 'parley',
      label: t('Demand redress from {name}', { name: other.name }),
      icon: '\u{2696}',
      enabled: true,
    });
  }
  return options;
}

/**
 * The three families of verb aimed at a person (owner's note of 2026-09-24)
 * are folded however few they hold: the point is that "attack" is always one
 * click into "Confront…", not on the top ring one day and a level down the
 * next depending on what the player happens to carry.
 */
const FAMILY_AT = 1;

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
  const label = recipe.station === undefined
    ? t('Make {thing}', { thing: aNoun(recipe.label.toLowerCase()) })
    : t('Make {thing}', { thing: t(recipe.label).toLowerCase() });
  if (recipe.station !== undefined && !station) {
    // The station is missing, and saying which one is the whole point: a greyed
    // entry reading "you cannot do that" is the refusal channel failing at the
    // one moment it is easiest to get right.
    return {
      id: 'craft', recipeId: recipe.id, label, icon: recipe.icon,
      enabled: false,
      reason: t('You need {station} to work at', {
        station: aNoun((BUILDINGS[recipe.station]?.label ?? recipe.station).toLowerCase()),
      }),
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
