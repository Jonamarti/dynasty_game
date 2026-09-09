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
 *
 * ## Not a tree: a web
 *
 * `requires` is not the only thing standing between a person and a technology,
 * and since M6b phase 2 it is not even the interesting one. Each node also
 * carries **sparks** — several different situations, each of which can put the
 * idea into somebody's head. See `Synthesis.ts`: `requires` is what you must
 * already understand, `sparks` is what makes it occur to you, and the two are
 * deliberately different questions.
 */
import type { Person, Skill } from '../entities/Person.ts';
import type { Spark } from './Synthesis.ts';
import { PROTOTYPE_POWER, REFINEMENT_STEP } from './Synthesis.ts';
import { ITEMS } from '../entities/Item.ts';

export const TECHS = [
  'firemaking', 'cordage', 'plant_lore', 'tracking',
  'cooking', 'hafting', 'clothing', 'pottery', 'stoneworking', 'carpentry',
  // Phase 4: the fourth channel. Everything above travels only between living
  // heads; these are how a thing gets past the death of everyone who knew it.
  'marking', 'writing', 'clay_tablet', 'library',
  // Phase 5: the first things made to be *used on* something. Until these,
  // `doAttack` had no item term at all and a hunt could only be won by
  // outlasting an animal that runs faster than a person.
  'spear', 'bow', 'leatherwork',
  // M8.1: the food half of the tree, see m8_plan_the_ages.md. `fishing` is
  // the first entry; the rest of the fourteen-node tier follows in later
  // passes.
  'fishing',
] as const;
export type Tech = (typeof TECHS)[number];

/**
 * The area of life a technology belongs to.
 *
 * Sparks that reach across two domains are the ones worth having — fur and
 * cold, fire and a raw vegetable — so this is both a label and, from phase 3,
 * what lays the web out and colours it.
 */
export const DOMAINS = [
  'fire', 'plants', 'stone', 'cloth', 'timber', 'beasts',
  // M8.1 adds a domain for the shore and the water it borders — fishing,
  // netting and the fish trap all belong here. `metal` follows in M8.3.
  'water',
] as const;
export type Domain = (typeof DOMAINS)[number];

export interface TechDef {
  id: Tech;
  label: string;
  domain: Domain;
  /** Everything that must already be known before this can be worked out. */
  requires: Tech[];
  /**
   * How hard it is to arrive at unaided, 0-1. Higher is harder; the conception
   * roll divides by this.
   */
  difficulty: number;
  /** The skill whose practice tends to turn it up. */
  skill: Skill;
  /**
   * The situations that can put this idea in somebody's head. Several, always:
   * one route in makes a tree, and several make a web.
   *
   * There is no `pressure` field any more. Need used to be a multiplier on the
   * discovery roll, and it is now an ingredient — cold *is* the reason clothing
   * occurred to you, and saying it twice would double-count it.
   */
  sparks: Spark[];
  /**
   * What building a first one costs. Everything named here must be something
   * the world can actually produce, or the idea stalls at `prototyped` forever.
   */
  prototype: Record<string, number>;
  /** How far a holder can improve the design before there is nothing left to fix. */
  maxRefinement: number;
  description: string;
}

/**
 * Every technology, with the several ways it can occur to somebody.
 *
 * Reading a spark: each is one *whole situation*, and every ingredient in it
 * must be true at the same moment. Weights are relative to the other sparks
 * competing for one head on one day, so the heavier route is the one a band
 * usually arrives by and the lighter one is the story you get occasionally.
 *
 * Every node wants at least one spark built out of commonly-available
 * ingredients. A technology all of whose routes need an unlikely coincidence is
 * unreachable in play while still passing every static test in the suite, which
 * is the failure mode `sparks-are-various` and `ideas-are-conceived` exist to
 * catch.
 */
export const TECH: Record<Tech, TechDef> = {
  firemaking: {
    id: 'firemaking', label: 'Firemaking', domain: 'fire',
    requires: [], difficulty: 0.35, skill: 'knap',
    prototype: { sticks: 2, flint: 1 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'holding', item: 'flint' }, { kind: 'feeling', need: 'cold' }],
        weight: 1.0, story: 'struck two cold stones together and one of them spat a spark' },
      { needs: [{ kind: 'holding', item: 'sticks' }, { kind: 'feeling', need: 'cold' },
                { kind: 'doing', action: 'gather' }],
        weight: 0.6, story: 'was cold, with an armful of dry sticks and nothing to do with them' },
      { needs: [{ kind: 'place', biome: 'forest' }, { kind: 'season', season: 'winter' },
                { kind: 'feeling', need: 'cold' }],
        weight: 0.4, story: 'stood freezing in a winter wood made entirely of firewood' },
      // The route that does not need anybody to be cold. Every other spark here
      // wants it, and cold is the one need the band answers *well* — shelter
      // takes it at 25 — so without this the whole fire branch of the web was
      // measurably unreachable in play while passing every static test.
      { needs: [{ kind: 'holding', item: 'flint' }, { kind: 'holding', item: 'sticks' },
                { kind: 'doing', action: 'gather' }],
        weight: 0.7, story: 'struck flint against flint for the noise of it, over and over' },
    ],
    description: 'A spark from struck flint, and a cold night stops being dangerous.',
  },
  cordage: {
    id: 'cordage', label: 'Cordage', domain: 'cloth',
    requires: [], difficulty: 0.3, skill: 'forage',
    prototype: { thatch: 3 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'holding', item: 'thatch' }, { kind: 'doing', action: 'gather' }],
        weight: 1.0, story: 'twisted a handful of reeds out of boredom, and the twist held' },
      { needs: [{ kind: 'saw', what: 'hands_full' }],
        weight: 0.7, story: 'kept running out of hands' },
      { needs: [{ kind: 'doing', action: 'haul' }, { kind: 'holding', item: 'sticks' }],
        weight: 0.5, story: 'carried sticks across camp one armful at a time all afternoon' },
    ],
    description: 'Twisted fibre. On its own, string; with a blade and a haft, everything else.',
  },
  plant_lore: {
    id: 'plant_lore', label: 'Plant lore', domain: 'plants',
    requires: [], difficulty: 0.25, skill: 'forage',
    prototype: { berries: 4 }, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'doing', action: 'forage' }, { kind: 'feeling', need: 'hunger' }],
        weight: 1.0, story: 'went hungry in a place that looked full of food' },
      { needs: [{ kind: 'doing', action: 'pick' }, { kind: 'season', season: 'autumn' }],
        weight: 0.8, story: 'watched, one autumn, which trees gave and which did not' },
      { needs: [{ kind: 'doing', action: 'forage' }, { kind: 'place', biome: 'grass' }],
        weight: 0.5, story: 'spent a season with both hands in the same hillside' },
    ],
    description:
      'Which leaf, which berry, and when. The same hillside feeds more people ' +
      'once somebody has learned to read it.',
  },
  spear: {
    id: 'spear', label: 'The spear', domain: 'beasts',
    requires: ['hafting'], difficulty: 0.35, skill: 'knap',
    prototype: { sticks: 2, flint: 1 }, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'hafting' }, { kind: 'saw', what: 'quarry_escaped' }],
        weight: 1.0, story: 'lost a deer by the length of one arm' },
      { needs: [{ kind: 'doing', action: 'hunt' }, { kind: 'holding', item: 'sticks' }],
        weight: 0.8, story: 'was carrying a long straight stick when the boar turned' },
      { needs: [{ kind: 'knows', tech: 'hafting' }, { kind: 'saw', what: 'under_attack' }],
        weight: 0.6, story: 'wished, while being beaten, for a longer arm' },
    ],
    description:
      'A blade on the end of a shaft. The first tool made to be used at a ' +
      'distance, however short that distance is.',
  },
  bow: {
    id: 'bow', label: 'The bow', domain: 'beasts',
    requires: ['cordage', 'spear'], difficulty: 0.6, skill: 'hunt',
    prototype: { sticks: 3, thatch: 2 }, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'doing', action: 'hunt' },
               { kind: 'feeling', need: 'hunger' }],
        weight: 1.0, story: 'drew a cord back around a green branch and felt it want to go' },
      { needs: [{ kind: 'knows', tech: 'spear' }, { kind: 'saw', what: 'quarry_escaped' }],
        weight: 0.7, story: 'threw a spear as far as an arm goes, and watched it fall short' },
    ],
    description:
      'Cord, tension, and a shaft that goes where a thrown one cannot. The ' +
      'first time the wilderness stops being faster than you are.',
  },
  leatherwork: {
    id: 'leatherwork', label: 'Leatherwork', domain: 'cloth',
    requires: ['clothing'], difficulty: 0.45, skill: 'build',
    prototype: { hide: 1, thatch: 2 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'clothing' }, { kind: 'holding', item: 'hide' }],
        weight: 1.0, story: 'worked a stiff hide soft and wondered what else it would take' },
      { needs: [{ kind: 'saw', what: 'under_attack' }, { kind: 'holding', item: 'hide' }],
        weight: 0.7, story: 'was struck while carrying a hide, and thought about the difference' },
      // A route that needs nothing scarce. Both routes above want a hide in
      // hand, and `every-tech-has-an-ordinary-route` caught that at once: hides
      // are rare precisely because hunting is, so a node reachable only by
      // holding one is a node reachable in principle and not in play.
      { needs: [{ kind: 'knows', tech: 'clothing' }, { kind: 'feeling', need: 'cold' },
               { kind: 'season', season: 'winter' }],
        weight: 0.5, story: 'spent a winter deciding that what they wore was not enough' },
    ],
    description:
      'Hide worked until it bends without cracking. Warm, and it turns a blow ' +
      'that bare skin does not.',
  },
  tracking: {
    id: 'tracking', label: 'Tracking', domain: 'beasts',
    requires: [], difficulty: 0.4, skill: 'track',
    prototype: { sticks: 2 }, maxRefinement: 3,
    sparks: [
      // The ordinary route. The other three all wait on a hunt, and hunting is
      // rare enough that they fired in 1 of 20 twenty-seed-cohort worlds — see
      // bugs.md, "tracking is unreachable". Anybody foraging in a forest walks
      // past prints and droppings daily whether or not they are hunting, which
      // is both the realistic story and, unlike the routes below, common enough
      // to actually fire.
      { needs: [{ kind: 'doing', action: 'forage' }, { kind: 'place', biome: 'forest' }],
        weight: 0.7, story: 'noticed, while picking, the same trail crossed twice' },
      { needs: [{ kind: 'saw', what: 'quarry_escaped' }],
        weight: 1.0, story: 'watched a deer become a rustle and then nothing at all' },
      { needs: [{ kind: 'doing', action: 'hunt' }, { kind: 'feeling', need: 'hunger' }],
        weight: 0.8, story: 'came back empty-handed once too often' },
      { needs: [{ kind: 'place', biome: 'forest' }, { kind: 'season', season: 'winter' },
                { kind: 'doing', action: 'wander' }],
        weight: 0.4, story: 'read the marks something heavy had left in a winter wood' },
    ],
    description:
      'Prints, droppings, a bent stem. Game stops being something you stumble ' +
      'across and becomes something you go and find.',
  },
  cooking: {
    id: 'cooking', label: 'Cooking', domain: 'fire',
    requires: ['firemaking'], difficulty: 0.25, skill: 'cook',
    prototype: { sticks: 2, meat: 1 }, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'firemaking' }, { kind: 'holding', item: 'meat' }],
        weight: 1.0, story: 'held raw meat beside a fire long enough to wonder' },
      { needs: [{ kind: 'knows', tech: 'firemaking' }, { kind: 'holding', item: 'berries' },
                { kind: 'feeling', need: 'hunger' }],
        weight: 0.6, story: 'was hungry enough to put the berries in the flames and find out' },
      { needs: [{ kind: 'knows', tech: 'firemaking' }, { kind: 'holding', item: 'hazelnut' }],
        weight: 0.5, story: 'dropped a hazelnut in the embers and fished out something better' },
    ],
    description: 'Heat makes food go further, and makes food of things that were not.',
  },
  hafting: {
    id: 'hafting', label: 'Hafting', domain: 'stone',
    requires: ['cordage'], difficulty: 0.45, skill: 'knap',
    prototype: { flint: 1, sticks: 1, thatch: 1 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'holding', item: 'flint' },
                { kind: 'holding', item: 'sticks' }],
        weight: 1.0, story: 'had cord, a stone and a stick, and only two hands' },
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'doing', action: 'chop' }],
        weight: 0.8,
        story: 'hacked at a trunk with a loose stone until the stone hurt more than the tree' },
      { needs: [{ kind: 'saw', what: 'long_enough' }, { kind: 'doing', action: 'chop' }],
        weight: 0.4, story: 'spent a whole day on one tree, and went to bed thinking about handles' },
    ],
    description: 'A worked edge bound to a handle. The first tool worth the name.',
  },
  clothing: {
    id: 'clothing', label: 'Clothing', domain: 'cloth',
    requires: ['cordage'], difficulty: 0.4, skill: 'forage',
    // Plaited fibre, not a fur coat. Hide is the *idea*'s strongest spark and
    // it stays one, but a kill is rare enough in this world that costing the
    // first prototype two of them left clothing permanently conceivable and
    // permanently unbuildable — an idea nobody could ever finish, which is the
    // inert-content rule wearing a different hat. Hide garments arrive with
    // leatherwork.
    prototype: { thatch: 4 }, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'feeling', need: 'cold' }, { kind: 'holding', item: 'hide' }],
        weight: 1.0, story: 'was cold, and had a hide in their hands' },
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'feeling', need: 'cold' },
                { kind: 'season', season: 'winter' }],
        weight: 0.5, story: 'spent one winter too many bound in nothing but cord' },
      { needs: [{ kind: 'saw', what: 'cold' }, { kind: 'holding', item: 'hide' }],
        weight: 0.6, story: 'gave up a day of work to the cold, with a hide across their shoulders' },
    ],
    description: 'Hide and sinew against the weather. Winter stops choosing who lives.',
  },
  pottery: {
    id: 'pottery', label: 'Pottery', domain: 'fire',
    requires: ['firemaking'], difficulty: 0.55, skill: 'build',
    prototype: { mud: 3, sticks: 2 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'firemaking' }, { kind: 'holding', item: 'mud' }],
        weight: 1.0, story: 'left daub too near the fire and found it had gone hard as stone' },
      { needs: [{ kind: 'knows', tech: 'firemaking' }, { kind: 'doing', action: 'store' },
                { kind: 'feeling', need: 'hunger' }],
        weight: 0.6, story: 'wanted to keep more of the autumn than a basket would hold' },
      { needs: [{ kind: 'knows', tech: 'firemaking' }, { kind: 'holding', item: 'mud' },
                { kind: 'place', biome: 'beach' }],
        weight: 0.4, story: 'shaped river clay on a beach and left it out in the sun' },
    ],
    description: 'Fired clay. Grain keeps, water travels, and a surplus becomes a year.',
  },
  marking: {
    id: 'marking', label: 'Tallies', domain: 'cloth',
    requires: ['cordage'], difficulty: 0.4, skill: 'build',
    prototype: { sticks: 2 }, maxRefinement: 1,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'doing', action: 'store' },
                { kind: 'saw', what: 'store_empty' }],
        weight: 1.0, story: 'went to the pit once too often and found it bare, and began keeping count' },
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'doing', action: 'store' },
                { kind: 'feeling', need: 'hunger' }],
        weight: 0.7, story: 'counted what was left against the days still to come' },
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'saw', what: 'theft' }],
        weight: 0.5, story: 'could not prove anything was missing, and resolved never to be in that position again' },
    ],
    description: 'Knots in a cord, notches on a stick. The first thing anybody wrote down was a number.',
  },
  writing: {
    id: 'writing', label: 'Writing', domain: 'stone',
    requires: ['marking', 'stoneworking'], difficulty: 0.75, skill: 'knap',
    prototype: { flint: 2 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'marking' }, { kind: 'doing', action: 'teach' }],
        weight: 1.0, story: 'was tired of explaining the same thing to every new pair of hands' },
      { needs: [{ kind: 'knows', tech: 'marking' }, { kind: 'holding', item: 'flint' },
                { kind: 'place', biome: 'hills' }],
        weight: 0.7, story: 'sat on bare rock with a flint in hand and cut rather more than a tally' },
      { needs: [{ kind: 'knows', tech: 'marking' }, { kind: 'saw', what: 'teach' },
                { kind: 'season', season: 'winter' }],
        weight: 0.5, story: 'watched what an old woman knew go into the ground with her' },
    ],
    description: 'Marks that say more than how many. What one person knew, a stone can hold.',
  },
  clay_tablet: {
    id: 'clay_tablet', label: 'Clay tablets', domain: 'fire',
    requires: ['writing', 'pottery'], difficulty: 0.55, skill: 'build',
    prototype: { mud: 3 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'writing' }, { kind: 'holding', item: 'mud' }],
        weight: 1.0, story: 'had soft clay in their hands and no rock worth the effort' },
      { needs: [{ kind: 'knows', tech: 'writing' }, { kind: 'knows', tech: 'pottery' },
                { kind: 'doing', action: 'craft' }],
        weight: 0.7, story: 'pressed a mark into a pot before firing it, and saw what that meant' },
      { needs: [{ kind: 'knows', tech: 'writing' }, { kind: 'place', biome: 'beach' },
                { kind: 'doing', action: 'gather' }],
        weight: 0.5, story: 'wrote in wet river clay and wondered how to keep it' },
    ],
    description: 'Quicker than stone and holds more of it, and it will not last a century.',
  },
  library: {
    id: 'library', label: 'The library', domain: 'timber',
    requires: ['writing', 'carpentry'], difficulty: 0.7, skill: 'build',
    prototype: { wood: 3, sticks: 3 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'writing' }, { kind: 'doing', action: 'ponder' }],
        weight: 1.0, story: 'wanted every stone they had cut within arm\u2019s reach at once' },
      { needs: [{ kind: 'knows', tech: 'writing' }, { kind: 'knows', tech: 'carpentry' },
                { kind: 'doing', action: 'build' }],
        weight: 0.7, story: 'was raising a roof and thought of what ought to go under it' },
      { needs: [{ kind: 'knows', tech: 'writing' }, { kind: 'season', season: 'autumn' },
                { kind: 'feeling', need: 'fatigue' }],
        weight: 0.5, story: 'was too tired to walk to the far stone one more time' },
    ],
    description: 'A roof over the records, and somewhere to sit and think under it.',
  },
  stoneworking: {
    id: 'stoneworking', label: 'Stoneworking', domain: 'stone',
    requires: ['hafting'], difficulty: 0.5, skill: 'knap',
    prototype: { flint: 3 }, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'hafting' }, { kind: 'holding', item: 'flint' },
                { kind: 'doing', action: 'craft' }],
        weight: 1.0, story: 'noticed the core broke the same way twice' },
      { needs: [{ kind: 'knows', tech: 'hafting' }, { kind: 'doing', action: 'gather' },
                { kind: 'place', biome: 'hills' }],
        weight: 0.7, story: 'worked a hillside outcrop until its grain was obvious' },
      { needs: [{ kind: 'saw', what: 'node_empty' }, { kind: 'holding', item: 'flint' }],
        weight: 0.5, story: 'watched good flint run out before the work did' },
    ],
    description:
      'Reading the grain of a core and striking along it. Twice the edge from ' +
      'the same stone, and the beginning of everything sharp.',
  },
  carpentry: {
    id: 'carpentry', label: 'Carpentry', domain: 'timber',
    requires: ['hafting', 'stoneworking'], difficulty: 0.6, skill: 'build',
    prototype: { wood: 4, thatch: 2 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'stoneworking' }, { kind: 'doing', action: 'chop' },
                { kind: 'holding', item: 'wood' }],
        weight: 1.0, story: 'cut a notch to carry a log, and saw a joint in it' },
      { needs: [{ kind: 'knows', tech: 'hafting' }, { kind: 'doing', action: 'build' },
                { kind: 'feeling', need: 'cold' }, { kind: 'season', season: 'winter' }],
        weight: 0.6, story: 'raised a roof in a winter that came in through it anyway' },
      { needs: [{ kind: 'saw', what: 'cold' }, { kind: 'place', biome: 'forest' },
                { kind: 'knows', tech: 'stoneworking' }],
        weight: 0.4, story: 'was driven out of a wood by weather, standing in the answer to it' },
    ],
    description:
      'Timber jointed rather than piled. Roofs that span a room, and a house a ' +
      'family can grow inside.',
  },
  // M8.1: the first node of the food half of the tree. See
  // m8_plan_the_ages.md, mechanism 2 — a fish node reuses `ResourceNode`
  // wholesale, so this technology is a yield multiplier, the same shape as
  // `plant_lore` on berries, rather than a hard gate on catching anything at
  // all: a spear already answers "how", and refining `fishing` answers "how
  // well".
  fishing: {
    id: 'fishing', label: 'Fishing', domain: 'water',
    requires: ['spear'], difficulty: 0.45, skill: 'hunt',
    prototype: { sticks: 2, flint: 1 }, maxRefinement: 3,
    sparks: [
      // The ordinary route: everybody goes to the water's edge to drink, far
      // more often than anybody hunts, so this is the route that actually
      // fires — the lesson from `tracking`'s own spark applied on the way in
      // rather than found the hard way afterward.
      { needs: [{ kind: 'knows', tech: 'spear' }, { kind: 'doing', action: 'drink' }],
        weight: 0.8, story: 'stood at the water with a spear in hand and watched something dart past' },
      { needs: [{ kind: 'knows', tech: 'spear' }, { kind: 'doing', action: 'hunt' }],
        weight: 0.5, story: 'carried the same throw that worked on a boar down to the shore' },
    ],
    description:
      'A spear turned on the shallows. Food that does not stop existing when ' +
      'the ground freezes.',
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
  spear: {
    summary: 'A blade at the end of a shaft: harder blows, and landed first.',
    site: 'ActionSystem.doAttack and doHunt, via weaponOf; RECIPES.spear',
  },
  bow: {
    summary: 'Meat from an animal that would have outrun you.',
    site: 'ActionSystem.doHunt, via weaponOf; RECIPES.bow',
  },
  leatherwork: {
    summary: 'Worked hide that turns a blow.',
    site: 'ActionSystem.doAttack, via armourOf; RECIPES.hide_armour',
  },
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
    site: 'RECIPES.pot, and BuildingDef.requiresTech on the granary',
  },
  marking: {
    summary: 'A count you can point at, so an argument has something in it.',
    site: 'ActionSystem.doDiscuss, via tallyFactor',
  },
  writing: {
    summary: 'Cut a thing into stone and it outlives you. Read one and it is yours.',
    site: 'ActionSystem.doInscribe and doRead',
  },
  clay_tablet: {
    summary: 'A second, cheaper hand: holds two things, and perishes.',
    site: 'ActionSystem.doInscribe, choosing the form',
  },
  library: {
    summary: 'Records under one roof, and thinking goes better beside them.',
    site: 'BuildingDef.requiresTech on the library, and ActionSystem.doPonder',
  },
  stoneworking: {
    summary: 'More usable edge from every core struck.',
    site: 'ActionSystem.doHarvest, via forageYieldFactor',
  },
  carpentry: {
    summary: 'Jointed timber: the longhouse, and faster building.',
    site: 'BuildingDef.requiresTech on the longhouse, and ActionSystem.doBuild',
  },
  fishing: {
    summary: 'More from every fishing spot, and food that keeps coming in winter.',
    site: 'ActionSystem.doHarvest, via forageYieldFactor',
  },
};

/**
 * How strong a technology is in one person's hands.
 *
 * Three answers, not two: nothing at all, half of it while the design is still
 * an untested prototype, and one or more once it has been proven and refined.
 *
 * Every effect goes through this one function rather than asking
 * `knownTech.has(...)` at the point of use. There were six such call sites
 * before this existed, and every one of them would have had to learn about
 * prototypes and refinement separately; one function learns instead.
 *
 * **This is pure and must stay pure.** It is called from the renderer, the HUD
 * and the action catalogue as well as from the simulation, so a draw from an
 * `RNG` in here would make what the world does depend on how often it was
 * drawn — which is exactly why an untested prototype returns a fixed reduced
 * power and the roll that proves or breaks it happens once a day in
 * `KnowledgeSystem` instead.
 *
 * Refinement lives on the *knower*, not on the object: a fine axe in a novice's
 * hand is just an axe. That is a deliberate trade for keeping per-unit quality
 * out of `Inventory`'s stacks, which are a plain id-to-count map and are relied
 * on as one nearly everywhere.
 */
/**
 * The best weapon in somebody's pack, and what it is worth to them.
 *
 * Scaled by `techPower`, so the same spear is worth more to whoever went on
 * improving the design — the trade-off recorded at the top of this file, that a
 * fine spear handed to a novice is just a spear, because refinement lives on the
 * knower rather than on the object.
 *
 * `forHunt` picks by a different measure, because a bow is a far better answer
 * to a deer than to a neighbour and a hand axe is the reverse.
 */
export function weaponOf(
  person: Person,
  forHunt: boolean
): { damage: number; reach: number; hunt: number; power: number } | null {
  let best = null as
    { damage: number; reach: number; hunt: number; power: number } | null;
  for (const [itemId, count] of person.inventory.entries()) {
    if (count <= 0) continue;
    const weapon = ITEMS[itemId]?.weapon;
    if (!weapon) continue;
    const power = techPower(person, weapon.tech as Tech);
    if (power <= 0) continue;
    const worth = forHunt ? weapon.hunt * power : weapon.damage * power;
    const bestWorth = best === null
      ? 0
      : (forHunt ? best.hunt * best.power : best.damage * best.power);
    if (best === null || worth > bestWorth) {
      best = { damage: weapon.damage, reach: weapon.reach, hunt: weapon.hunt, power };
    }
  }
  return best;
}

/** How much of a blow the best thing they are wearing turns aside, 0 to 1. */
export function armourOf(person: Person): number {
  let best = 0;
  for (const [itemId, count] of person.inventory.entries()) {
    if (count <= 0) continue;
    const armour = ITEMS[itemId]?.armour;
    if (armour !== undefined && armour > best) best = armour;
  }
  return best;
}

export function techPower(person: Person, tech: Tech): number {
  if (person.knownTech.has(tech)) {
    return 1 + (person.techLevel.get(tech) ?? 0) * REFINEMENT_STEP;
  }
  // An unproven design still does something, because it has to be used for
  // anyone to find out whether it works. A prototype nobody can use is not a
  // prototype, it is a delay.
  const idea = person.ideas.find(candidate => candidate.tech === tech);
  return idea && idea.stage === 'prototyped' ? PROTOTYPE_POWER : 0;
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
  if (nodeKind === 'fish') return scaled(person, 'fishing', 1.5);
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

/**
 * Multiplier on an argument's chance of getting somewhere.
 *
 * What tallies buy. Two people disagreeing about whether the store will last
 * the winter are guessing; two people with a knotted cord between them are
 * having a different conversation, and one of them can be shown to be wrong.
 */
export function tallyFactor(person: Person): number {
  return scaled(person, 'marking', 1.25);
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

/**
 * Techs whose prerequisites are met but which are not known yet.
 *
 * **This is no longer how discovery picks anything.** Conception used to draw
 * uniformly from this list; since M6b phase 2 it needs a spark as well, and
 * `KnowledgeSystem.conceivable` is the function that answers "what could occur
 * to this person right now". What survives here is the *understanding* half of
 * the question, which is what the acyclicity test walks the graph with: start
 * knowing nothing, keep taking whatever has become reachable, and anything a
 * cycle encloses is left over at the end.
 */
export function reachableFrom(known: ReadonlySet<string>): Tech[] {
  return TECHS.filter(tech => !known.has(tech) && prerequisitesMet(tech, known));
}
