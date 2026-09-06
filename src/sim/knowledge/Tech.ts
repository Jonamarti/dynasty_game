/**
 * What people know how to do.
 *
 * The central conceit, and the reason this is not a tech tree in the usual
 * sense: **knowledge is held by individuals, not by a civilisation.** There is
 * no global unlock. Fire is not discovered by "the player" — it is worked out
 * by one curious person on a cold night, and it exists in the world only for as
 * long as somebody alive remembers it. Teach nobody and it dies with you.
 *
 * That gives three things a conventional tree cannot:
 *
 *  - **Teaching matters.** Passing on what you know is the only way anything
 *    survives the person who found it.
 *  - **Knowledge can be lost.** A band whose only potter dies in a bad winter
 *    goes back to carrying water in their hands. Dark ages are not scripted;
 *    they are what happens when the chain breaks.
 *  - **Eras are descriptive, not prescriptive.** The world is in the Fire Age
 *    when enough people know how to make fire, and it can fall back out of it.
 *
 * ## Every node does something
 *
 * A technology is not allowed into `TECHS` until the code that makes it matter
 * ships with it, and `techs-have-effects` in the unit tests enforces that by
 * asserting `TECH_EFFECTS` covers every id. This rule exists because the
 * opposite kept happening: `farming` gated an entire era while changing nothing
 * on the ground, `clothing` and `cordage` unlocked nothing at all, and the
 * longhouse sat behind `requiresTech: 'carpentry'` — a string that was never a
 * member of `TECHS`, so it was unbuildable for its whole existence and nothing
 * noticed.
 *
 * `farming` is deliberately absent for the same reason. It comes back when
 * fields, sowing and reaping arrive with it.
 */
import type { Person, Skill } from '../entities/Person.ts';

export const TECHS = [
  'firemaking', 'cordage', 'plant_lore', 'tracking',
  'cooking', 'hafting', 'clothing', 'pottery', 'stoneworking', 'carpentry',
] as const;
export type Tech = (typeof TECHS)[number];

export interface TechDef {
  id: Tech;
  label: string;
  /** Everything that must already be known before this can be worked out. */
  requires: Tech[];
  /**
   * How hard it is to arrive at unaided, 0-1. Higher is harder; the discovery
   * roll divides by this.
   */
  difficulty: number;
  /** The skill whose practice tends to turn it up. */
  skill: Skill;
  /**
   * The need whose pressure makes it likely to be found. Cold winters invent
   * clothing; hunger invents tracking. Null for the merely curious.
   */
  pressure: 'cold' | 'hunger' | 'thirst' | null;
  description: string;
}

export const TECH: Record<Tech, TechDef> = {
  firemaking: {
    id: 'firemaking', label: 'Firemaking',
    requires: [], difficulty: 0.35, skill: 'knap', pressure: 'cold',
    description: 'A spark from struck flint, and a cold night stops being dangerous.',
  },
  cordage: {
    id: 'cordage', label: 'Cordage',
    requires: [], difficulty: 0.3, skill: 'forage', pressure: null,
    description: 'Twisted fibre. On its own, string; with a blade and a haft, everything else.',
  },
  plant_lore: {
    id: 'plant_lore', label: 'Plant lore',
    requires: [], difficulty: 0.25, skill: 'forage', pressure: 'hunger',
    description:
      'Which leaf, which berry, and when. The same hillside feeds more people ' +
      'once somebody has learned to read it.',
  },
  tracking: {
    id: 'tracking', label: 'Tracking',
    requires: [], difficulty: 0.4, skill: 'track', pressure: 'hunger',
    description:
      'Prints, droppings, a bent stem. Game stops being something you stumble ' +
      'across and becomes something you go and find.',
  },
  cooking: {
    id: 'cooking', label: 'Cooking',
    requires: ['firemaking'], difficulty: 0.25, skill: 'cook', pressure: 'hunger',
    description: 'Heat makes food go further, and makes food of things that were not.',
  },
  hafting: {
    id: 'hafting', label: 'Hafting',
    requires: ['cordage'], difficulty: 0.45, skill: 'knap', pressure: null,
    description: 'A worked edge bound to a handle. The first tool worth the name.',
  },
  clothing: {
    id: 'clothing', label: 'Clothing',
    requires: ['cordage', 'plant_lore'], difficulty: 0.4, skill: 'forage', pressure: 'cold',
    description: 'Hide and sinew against the weather. Winter stops choosing who lives.',
  },
  pottery: {
    id: 'pottery', label: 'Pottery',
    requires: ['firemaking'], difficulty: 0.55, skill: 'build', pressure: 'hunger',
    description: 'Fired clay. Grain keeps, water travels, and a surplus becomes a year.',
  },
  stoneworking: {
    id: 'stoneworking', label: 'Stoneworking',
    requires: ['hafting'], difficulty: 0.5, skill: 'knap', pressure: null,
    description:
      'Reading the grain of a core and striking along it. Twice the edge from ' +
      'the same stone, and the beginning of everything sharp.',
  },
  carpentry: {
    id: 'carpentry', label: 'Carpentry',
    requires: ['hafting', 'stoneworking'], difficulty: 0.6, skill: 'build', pressure: 'cold',
    description:
      'Timber jointed rather than piled. Roofs that span a room, and a house a ' +
      'family can grow inside.',
  },
};

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/**
 * What each technology actually does, and where the simulation reads it.
 *
 * This table is the contract behind "no node ships inert". `site` is prose for
 * a human — the test only asserts that every member of `TECHS` has an entry, so
 * that adding a node without wiring an effect fails the build rather than
 * quietly producing another `farming`.
 */
export interface TechEffect {
  /** One line, shown in the character panel. */
  summary: string;
  /** Where in the simulation the effect is read. */
  site: string;
}

export const TECH_EFFECTS: Record<Tech, TechEffect> = {
  firemaking: {
    summary: 'Warmth you carry with you, wherever you are standing.',
    site: 'NeedsSystem.update, via warmthFrom',
  },
  cordage: {
    summary: 'A net and a carrying strap: more in one trip.',
    site: 'Person.carryCapacity, via carryFactor',
  },
  plant_lore: {
    summary: 'More from every bush and every fruiting tree.',
    site: 'ActionSystem.doHarvest and doPickFruit, via forageYieldFactor',
  },
  tracking: {
    summary: 'Game found further off, and slower to notice you.',
    site: 'Brain quarry search, and WildlifeSystem notice radius',
  },
  cooking: {
    summary: 'Cooked food goes further.',
    site: 'ActionSystem.doEat and Simulation.eatItem, via nutritionFactor',
  },
  hafting: {
    summary: 'A hand axe, which halves the work of felling.',
    site: 'ActionSystem.doCraft and doChop',
  },
  clothing: {
    summary: 'Hide against the weather, everywhere and always.',
    site: 'NeedsSystem.update, via warmthFrom',
  },
  pottery: {
    summary: 'Fired vessels, and a granary to keep a year in.',
    site: 'BuildingDef.requiresTech on the granary',
  },
  stoneworking: {
    summary: 'More usable edge from every core struck.',
    site: 'ActionSystem.doHarvest, via forageYieldFactor',
  },
  carpentry: {
    summary: 'Jointed timber: the longhouse, and faster building.',
    site: 'BuildingDef.requiresTech on the longhouse, and ActionSystem.doBuild',
  },
};

/**
 * How strong a technology is in one person's hands: 0 if they do not know it,
 * 1 once they do.
 *
 * Every effect goes through this one function rather than asking
 * `knownTech.has(...)` at the point of use. There were six such call sites
 * before this existed, and every one of them would have had to learn about
 * refinement separately; now one function does and the sites do not change
 * again. Refinement raises the return above 1 for a design its holder has
 * improved.
 *
 * Refinement will live on the *knower*, not on the object: a fine axe in a
 * novice's hand is just an axe. That is a deliberate trade for keeping per-unit
 * quality out of `Inventory`'s stacks, which are a plain id-to-count map and
 * are relied on as one nearly everywhere.
 */
export function techPower(person: Person, tech: Tech): number {
  return person.knownTech.has(tech) ? 1 : 0;
}

/** Scales a bonus by how well its holder knows the technology behind it. */
function scaled(person: Person, tech: Tech, full: number): number {
  return 1 + (full - 1) * techPower(person, tech);
}

/**
 * Multiplier on what a harvest yields.
 *
 * Keyed on the node kind rather than the skill because flint and berries are
 * both gathered with different knowledge behind them, and `ResourceNode.def`
 * already distinguishes them.
 */
export function forageYieldFactor(person: Person, nodeKind: string): number {
  if (nodeKind === 'flint') return scaled(person, 'stoneworking', 1.5);
  return scaled(person, 'plant_lore', 1.3);
}

/** Multiplier on how much a person can carry at once. */
export function carryFactor(person: Person): number {
  return scaled(person, 'cordage', 1.25);
}

/** Multiplier on the nutrition of anything eaten. */
export function nutritionFactor(person: Person): number {
  return scaled(person, 'cooking', 1.35);
}

/** Multiplier on how fast building work goes. */
export function buildFactor(person: Person): number {
  return scaled(person, 'carpentry', 1.3);
}

/** How far a hunter will look for a quarry, as a multiple of sight radius. */
export function quarryReachFactor(person: Person): number {
  return scaled(person, 'tracking', 1.6);
}

/**
 * Multiplier on the range at which an animal notices this person. Lower is
 * better, so a tracker shrinks it.
 */
export function stealthFactor(person: Person): number {
  return scaled(person, 'tracking', 0.75);
}

/**
 * Warmth a person carries with them, 0-1, before any roof over their head.
 *
 * Fire and clothing are different answers to the same problem and stack, but
 * with diminishing returns rather than by addition: two answers to cold should
 * be better than one and not twice as good. Summing them would put a clothed
 * firemaker past 1 and invert the chill into warming, which is how you get
 * people who are at their most comfortable in February.
 */
export function warmthFrom(person: Person): number {
  const fire = 0.45 * techPower(person, 'firemaking');
  const cloth = 0.3 * techPower(person, 'clothing');
  return 1 - (1 - fire) * (1 - cloth);
}

// ---------------------------------------------------------------------------
// Eras
// ---------------------------------------------------------------------------

/**
 * Eras, named by what is widely known rather than by a date.
 *
 * `heldBy` is the fraction of living adults who must know *all* of the listed
 * techs. Fractions rather than counts because an era is about a society, and
 * because it lets the world fall back down the list when a generation dies
 * badly — which is the whole reason to model it this way.
 */
export interface EraDef {
  id: string;
  label: string;
  needs: Tech[];
  heldBy: number;
  description: string;
}

export const ERAS: EraDef[] = [
  {
    id: 'stone', label: 'Stone Age', needs: [], heldBy: 0,
    description: 'Flint, sticks and what the land offers.',
  },
  {
    id: 'fire', label: 'Age of Fire', needs: ['firemaking'], heldBy: 0.35,
    description: 'Warmth that travels, and the night pushed back.',
  },
  {
    id: 'hearth', label: 'Age of the Hearth', needs: ['firemaking', 'cooking'], heldBy: 0.4,
    description: 'Cooked food, and more of it than the land seemed to hold.',
  },
  {
    id: 'tools', label: 'Age of Tools',
    needs: ['firemaking', 'cooking', 'cordage', 'hafting'], heldBy: 0.4,
    description: 'Hafted edges. Everything gets faster at once.',
  },
  {
    id: 'craft', label: 'Age of Craft',
    needs: ['firemaking', 'cooking', 'cordage', 'hafting', 'clothing', 'pottery'], heldBy: 0.35,
    description: 'Clothes against the winter and pots against the lean year.',
  },
  {
    id: 'building', label: 'Age of Building',
    needs: [
      'firemaking', 'cooking', 'cordage', 'hafting',
      'clothing', 'pottery', 'stoneworking', 'carpentry',
    ],
    heldBy: 0.3,
    description: 'Jointed timber and worked stone. A house outlasts the people who raised it.',
  },
];

/**
 * Era ids in order, so a change can be reported as a gain or a loss.
 *
 * Derived from `ERAS` rather than written out again: the hand-written copy that
 * used to live in `Simulation` was a second list that nothing kept in step, and
 * an era missing from it would have been silently reported as a loss.
 */
export const ERA_ORDER: string[] = ERAS.map(era => era.id);

/** The furthest era whose conditions the living population currently meets. */
export function eraFor(holdersByTech: Map<Tech, number>, adults: number): EraDef {
  if (adults === 0) return ERAS[0]!;
  let best = ERAS[0]!;
  for (const era of ERAS) {
    const met = era.needs.every(tech => (holdersByTech.get(tech) ?? 0) / adults >= era.heldBy);
    if (met) best = era;
  }
  return best;
}

/** True if `known` contains everything `tech` is built on. */
export function prerequisitesMet(tech: Tech, known: ReadonlySet<string>): boolean {
  return TECH[tech].requires.every(required => known.has(required));
}

/** Techs a person could plausibly arrive at next. */
export function reachableFrom(known: ReadonlySet<string>): Tech[] {
  return TECHS.filter(tech => !known.has(tech) && prerequisitesMet(tech, known));
}
