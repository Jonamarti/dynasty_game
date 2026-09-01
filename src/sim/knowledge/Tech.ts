/**
 * What people know how to do.
 *
 * The central conceit, and the reason this is not a tech tree: **knowledge is
 * held by individuals, not by a civilisation.** There is no global unlock. Fire
 * is not discovered by "the player" — it is worked out by one curious person on
 * a cold night, and it exists in the world only for as long as somebody alive
 * remembers it. Teach nobody and it dies with you.
 *
 * That gives three things a tree cannot:
 *
 *  - **Teaching matters.** The `teach` skill has been sitting unused since M0
 *    waiting for this. Passing on what you know is the only way anything
 *    survives the person who found it.
 *  - **Knowledge can be lost.** A band whose only potter dies in a bad winter
 *    goes back to carrying water in their hands. Dark ages are not scripted;
 *    they are what happens when the chain breaks.
 *  - **Eras are descriptive, not prescriptive.** The world is in the Fire Age
 *    when enough people know how to make fire, and it can fall back out of it.
 */

export const TECHS = [
  'firemaking', 'cooking', 'cordage', 'hafting', 'clothing', 'pottery', 'farming',
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
  skill: 'forage' | 'hunt' | 'knap' | 'build' | 'cook' | 'heal' | 'track';
  /**
   * The need whose pressure makes it likely to be found. Cold winters invent
   * clothing; hunger invents farming. Null for the merely curious.
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
    requires: ['cordage'], difficulty: 0.4, skill: 'forage', pressure: 'cold',
    description: 'Hide and sinew against the weather. Winter stops choosing who lives.',
  },
  pottery: {
    id: 'pottery', label: 'Pottery',
    requires: ['firemaking'], difficulty: 0.55, skill: 'build', pressure: 'hunger',
    description: 'Fired clay. Grain keeps, water travels, and a surplus becomes a year.',
  },
  farming: {
    id: 'farming', label: 'Farming',
    requires: ['pottery', 'hafting'], difficulty: 0.8, skill: 'forage', pressure: 'hunger',
    description: 'Sowing what you would rather have found. The end of the wandering.',
  },
};

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
    id: 'tools', label: 'Age of Tools', needs: ['firemaking', 'cooking', 'cordage', 'hafting'], heldBy: 0.4,
    description: 'Hafted edges. Everything gets faster at once.',
  },
  {
    id: 'craft', label: 'Age of Craft',
    needs: ['firemaking', 'cooking', 'cordage', 'hafting', 'clothing', 'pottery'], heldBy: 0.35,
    description: 'Clothes against the winter and pots against the lean year.',
  },
  {
    id: 'sowing', label: 'Age of Sowing',
    needs: ['firemaking', 'cooking', 'cordage', 'hafting', 'clothing', 'pottery', 'farming'],
    heldBy: 0.3,
    description: 'Bread from ground somebody chose. Nothing is the same afterwards.',
  },
];

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
