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
import { PROTOTYPE_AT, PROTOTYPE_POWER, REFINEMENT_STEP } from './Synthesis.ts';
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
  // M8.1: the food half of the tree, see m8_plan_the_ages.md. `fishing` came
  // first, with mechanism 2; these four are mechanism 3 and the two carried
  // tools that lead to it. The rest of the fourteen-node tier follows.
  'fishing', 'basketry', 'netting', 'snares', 'fish_trap',
  // M8.1, mechanism 4: the first technology whose effect is a *place to work*
  // rather than a thing to carry.
  'grinding',
  // M8.1, the bone tier: what a carcass is worth once you know what to do with
  // the parts nobody was eating.
  'bone_working', 'tailoring', 'atlatl',
  // M8.1, the last four. Three of them are the first technologies in this game
  // that are not about getting more out of the ground, and that is most of the
  // point of them: a picture, a tune, and somebody sitting with the sick.
  'ochre', 'flute', 'herbalism', 'taming',
  // M9.5 phase 4c: the first technology in this game that is about *people*
  // rather than about the land or what can be made out of it. Everything above
  // makes somebody better at a task; this one is the idea that not everybody
  // should be doing the same task. Coercion needed no technology — see
  // `menaceOver` and `doThreaten`, shipped in 4a — and that is exactly the
  // contrast: what gets discovered here is legitimate, cheap, repeatable
  // authority, not authority as such.
  'division_of_labour',
  // M8.2: the oldest open entry in `next-steps.md`, closed. `farming` was
  // *removed* from this list once already, because it gated a whole era while
  // changing nothing on the ground; the rule since has been that it may not
  // come back without fields, and it comes back here with `entities/Field.ts`,
  // `core/Soil.ts` and two verbs in the same commit.
  'farming',
  // M8.2, and the other half of the owner's note about the ground: a field that
  // only ever gets poorer is a strictly worse world with no counterplay, which
  // is exactly what happened to spoilage. This is the counterplay.
  'composting',
  // M9.5 phase 4d: the second rung, and the first time a band has a shape
  // rather than a leader. Household heads carry standing outside their own
  // roof, and a chief holds office long enough for it to be an office.
  'chiefdom',
  // M11 phase 9b: the oral channel gets a practice of its own, so nerfing
  // `ochre` in 9a is not the last word on how knowledge outlives a bad winter
  // without being cut into anything. The knack of telling something so it is
  // remembered, not the memory itself — see `TECH_EFFECTS.storytelling`.
  'storytelling',
  // M11 phase 10: four of the fifteen Neolithic nodes `m8_plan_the_ages.md`
  // left pending after `farming` and `composting` shipped. Evolve-style density
  // rather than a new mechanism each: every effect below is a numeric term on a
  // function that already exists, which is what lets the tree widen without the
  // engine widening with it. Eleven remain — see `next-steps.md`.
  'ground_stone', 'spinning', 'weaving', 'sickle',
  // M11 phase 10, second commit: five more of the same tier. `masonry` and
  // `wattle_daub` are each a second building, on the terms the mud hut already
  // set; `calendar` is a yield term read the same way `techPower('farming')`
  // already is; `the_wheel` is a fourth term on `carryFactor`, beside cordage
  // and the basket; `bread` is mechanism 4's fourth station. Six remain.
  'masonry', 'wattle_daub', 'calendar', 'the_wheel', 'bread',
  // M11 phase 10, third commit: the one node in this tier that needed a real
  // mechanism rather than a numeric term — see `BuildingDef.herd`. `wool` and
  // `dairying` both depend on it and are still to come.
  'herding',
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
  // M9.5 phase 4c: the eighth, and the only one whose subject matter is other
  // people. Appended rather than inserted because `TechWebLayout` gives each
  // domain an angular sector in this order, and reordering the list would
  // rearrange a web the player has learned the shape of.
  'people',
] as const;
export type Domain = (typeof DOMAINS)[number];

/**
 * The archaeological periods, in order, and the one vocabulary two different
 * questions are answered in.
 *
 * The questions are deliberately different, and conflating them is the mistake
 * this comment exists to prevent:
 *
 *  - **`TechDef.age`** — when *our* species got there. It is descriptive. It
 *    drives the ring a node is drawn on in the tech web and nothing else.
 *  - **`ERAS`** — what a world must widely know to be reported as living in a
 *    period. That is about a society, and it can be lost again.
 *
 * Neither of them is `requires`, which is the only thing that actually gates a
 * discovery. `writing` sits in the Bronze Age because that is when writing
 * happened, while it rests on `marking`, `stoneworking` and, since M11 phase
 * 9c, `farming` — all three Neolithic or older — so a lucky band can work it
 * out as early as the Neolithic, and that anachronism is the player's to
 * earn. Do not "fix" it by gating on the age; the same distinction the
 * project already draws between `requires` and `sparks` is being drawn again
 * here.
 *
 * All eight periods are listed even though the table stops in the Neolithic,
 * because the list is a historical fact rather than a content manifest — but
 * **`AGES` is not a licence to declare a technology before the code that makes
 * it real**: the rule in the file header still holds.
 */
export const AGES = [
  'lower_palaeolithic', 'middle_palaeolithic', 'upper_palaeolithic', 'mesolithic',
  'neolithic', 'chalcolithic', 'bronze', 'iron',
] as const;
export type AgeId = (typeof AGES)[number];

/** The period names as a player should read them. Written once, used twice. */
export const AGE_LABELS: Record<AgeId, string> = {
  lower_palaeolithic: 'Lower Palaeolithic',
  middle_palaeolithic: 'Middle Palaeolithic',
  upper_palaeolithic: 'Upper Palaeolithic',
  mesolithic: 'Mesolithic',
  neolithic: 'Neolithic',
  chalcolithic: 'Chalcolithic',
  bronze: 'Bronze Age',
  iron: 'Iron Age',
};

/** Where a period sits on the ladder, for "is this one later than that one". */
export function ageIndex(age: AgeId): number {
  return AGES.indexOf(age);
}

/**
 * What kind of thing a technology *is*, and therefore how it is arrived at.
 *
 * The owner's note: "All techs should be developed the same. Plant lore for
 * example shouldn't show a 'build a plant lore', it doesn't make sense — it
 * should improve by harvesting and thinking about it, but doesn't have a
 * prototype to build. We should distinguish technologies that are improvements
 * of actions from technologies that unlock objects, like baskets, that actually
 * have prototypes."
 *
 * They are right, and the tell is in `TECH_EFFECTS`: half the table reads
 * `RECIPES.spear` or `BuildingDef.requiresTech`, and the other half reads
 * `forageYieldFactor` or `doTend`. The first half makes something you can hold;
 * the second half makes you better at something you already do. Every node was
 * arriving by the first route, so plant lore cost four berries and a hundred
 * and twenty ticks of *building* a plant lore.
 *
 * The line is not a matter of taste. **A `device` is a technology that gates a
 * recipe, a building or a form of writing** — nineteen of them do, and the
 * compiler can see it. A `practice` gates nothing and changes a number instead.
 *
 * Both still go conceived → worked out → tried → proven, and that symmetry is
 * the point: the same four stages, reached by the road the thing itself
 * implies. A device is tried by building one, out of materials. A practice is
 * tried by *doing it* — see `practisedBy` — because there is nothing to build.
 */
export type TechKind = 'practice' | 'device';

export interface TechDef {
  id: Tech;
  label: string;
  domain: Domain;
  /**
   * The archaeological period our own species arrived at this in.
   *
   * **Descriptive, never a gate.** See the comment on `AGES`: `requires` is
   * what stands between a person and an idea, and this is what the tech web
   * draws a ring for. A test asserts a node's age is never earlier than any of
   * its prerequisites' — the picture would otherwise draw an arrow pointing
   * backwards through time — but nothing in the simulation reads it.
   */
  age: AgeId;
  /**
   * When, in plain words: "about 40,000 years ago", "about 3200 BC".
   *
   * Shown in the tech web's detail pane, and most of what the owner's "as
   * realistic as possible to human history" actually asks for — the player
   * finds out that the needle is older than the pot, and that iron is younger
   * than writing.
   */
  firstKnown: string;
  /** Whether this makes a thing or makes you better at a thing. */
  kind: TechKind;
  /**
   * For a `practice`, the actions that count as trying it out in earnest.
   *
   * Action ids as `ActionSystem` names them, matched when one *finishes* —
   * `Person.noteDid` is the hook, which is the single place every completed
   * action already passes through. Deliberately not derived from `skill`: the
   * skill a technology belongs to is not the same question as what you were
   * doing when you found it out. Nothing in the game practises the `cook`
   * skill at all, and `ponder` practises the idea's own skill, so a
   * skill-matched version would have counted sitting and thinking about
   * cooking as having cooked.
   *
   * Empty for a device, whose trying-out is `doPrototype` and its materials.
   */
  practisedBy?: string[];
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
   *
   * Empty for a `practice`: there is nothing to build. `doPrototype` refuses
   * outright rather than treating an empty requirement as satisfiable, which
   * is what it would otherwise do — vacuously, and in a hundred and twenty
   * ticks.
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
    age: 'middle_palaeolithic', firstKnown: 'about 400,000 years ago',
    kind: 'device',
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
    age: 'middle_palaeolithic', firstKnown: 'about 50,000 years ago',
    kind: 'device',
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
    age: 'lower_palaeolithic', firstKnown: 'older than our species',
    kind: 'practice', practisedBy: ['forage', 'pick'],
    requires: [], difficulty: 0.25, skill: 'forage',
    prototype: {}, maxRefinement: 3,
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
    age: 'middle_palaeolithic', firstKnown: 'about 200,000 years ago',
    kind: 'device',
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
    age: 'mesolithic', firstKnown: 'about 12,000 years ago',
    kind: 'device',
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
    age: 'middle_palaeolithic', firstKnown: 'about 50,000 years ago',
    kind: 'device',
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
    age: 'lower_palaeolithic', firstKnown: 'older than our species',
    kind: 'practice', practisedBy: ['hunt'],
    requires: [], difficulty: 0.4, skill: 'track',
    prototype: {}, maxRefinement: 3,
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
      // `doing: wander` until M9 phase 5, which could not be satisfied on any
      // seed ever run: `noteDid` ignores `'wander'` outright — see the note
      // there — so this route was dead from the day it was written. `reflect`
      // is what it should have said all along. Somebody stopping in a winter
      // wood to sit and think is the story; walking through one was never the
      // part that taught anybody to read a trail.
      { needs: [{ kind: 'place', biome: 'forest' }, { kind: 'season', season: 'winter' },
                { kind: 'doing', action: 'reflect' }],
        weight: 0.4, story: 'sat still in a winter wood long enough to read what had crossed it' },
    ],
    description:
      'Prints, droppings, a bent stem. Game stops being something you stumble ' +
      'across and becomes something you go and find.',
  },
  cooking: {
    id: 'cooking', label: 'Cooking', domain: 'fire',
    age: 'middle_palaeolithic', firstKnown: 'about 300,000 years ago',
    kind: 'practice', practisedBy: ['eat'],
    requires: ['firemaking'], difficulty: 0.25, skill: 'cook',
    prototype: {}, maxRefinement: 3,
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
    age: 'middle_palaeolithic', firstKnown: 'about 200,000 years ago',
    kind: 'device',
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
    age: 'middle_palaeolithic', firstKnown: 'at least 120,000 years ago',
    kind: 'device',
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
    age: 'upper_palaeolithic', firstKnown: 'about 20,000 years ago',
    kind: 'device',
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
    age: 'upper_palaeolithic', firstKnown: 'about 40,000 years ago',
    kind: 'device',
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
      // A fourth, because the weight-1.0 route above needs `store_empty`, which
      // `bugs.md` records as firing zero times in every run inspected: `Brain`
      // scores stores by what is in them and so never sends anybody to an empty
      // one. Counting is the one step on this tree that is an act of pure
      // abstraction rather than a thing anybody's hands found out, which makes
      // it the right place for the new verb to earn its keep.
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'doing', action: 'reflect' }],
        weight: 0.6, story: 'sat working out how many days were left, and how little there was to meet them' },
    ],
    description: 'Knots in a cord, notches on a stick. The first thing anybody wrote down was a number.',
  },
  writing: {
    id: 'writing', label: 'Writing', domain: 'stone',
    age: 'bronze', firstKnown: 'about 3200 BC',
    kind: 'device',
    // M11 phase 9c adds `farming` to what used to be just `marking` and
    // `stoneworking`. The historical case for script is that it arrives
    // behind a surplus — a tally is not the same pressure as an account that
    // has to outlast a harvest and a season of trade — and the mechanical
    // case is 9a: with `ochre` nerfed to a spark rather than a transcript,
    // `writing` sitting one step from the game's root nodes made it the
    // dominant record channel by default, exactly backwards from what a
    // painted-first, written-later oral tree is supposed to look like.
    requires: ['marking', 'stoneworking', 'farming'], difficulty: 0.75, skill: 'knap',
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
      // The route the new prerequisite is actually about: a tally answers
      // "how many", and a harvest large enough to outlast anybody's memory of
      // it needs something a tally cannot give — whose it was, when it was
      // taken in, what was owed against it.
      { needs: [{ kind: 'knows', tech: 'farming' }, { kind: 'holding', item: 'grain' },
                { kind: 'doing', action: 'store' }],
        weight: 0.8, story: 'kept account of a harvest too large for anybody to just remember' },
    ],
    description: 'Marks that say more than how many. What one person knew, a stone can hold.',
  },
  clay_tablet: {
    id: 'clay_tablet', label: 'Clay tablets', domain: 'fire',
    age: 'bronze', firstKnown: 'about 3200 BC',
    kind: 'device',
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
    age: 'bronze', firstKnown: 'about 2300 BC',
    kind: 'device',
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
    age: 'upper_palaeolithic', firstKnown: 'about 45,000 years ago',
    kind: 'practice', practisedBy: ['gather', 'craft'],
    requires: ['hafting'], difficulty: 0.5, skill: 'knap',
    prototype: {}, maxRefinement: 3,
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
    age: 'mesolithic', firstKnown: 'about 11,000 years ago',
    kind: 'device',
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
    age: 'upper_palaeolithic', firstKnown: 'about 42,000 years ago',
    kind: 'practice', practisedBy: ['forage', 'hunt'],
    requires: ['spear'], difficulty: 0.45, skill: 'hunt',
    prototype: {}, maxRefinement: 3,
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
  // M8.1, mechanism 3, and the two carried tools that lead to it.
  //
  // Read the four together, because they are one idea. Every kind of work in
  // the game above this line happens only while somebody is standing over it;
  // a snare and a fish trap are the first things in the world that produce food
  // while nobody is looking at them, and that is most of what a Mesolithic band
  // actually had over a Palaeolithic one. The basket and the net are the same
  // story told with cordage: a woven container is what a trap *is*.
  basketry: {
    id: 'basketry', label: 'Basketry', domain: 'cloth',
    age: 'upper_palaeolithic', firstKnown: 'about 27,000 years ago',
    kind: 'device',
    requires: ['cordage'], difficulty: 0.35, skill: 'build',
    prototype: { thatch: 4, sticks: 2 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'holding', item: 'thatch' },
                { kind: 'doing', action: 'gather' }],
        weight: 1.0, story: 'twisted one withy round another until the bundle held its own shape' },
      // `hands_full` sparks `cordage` as well, and that is the point rather than
      // a duplicate: the first answer to carrying too much is a strap, and the
      // second is something to put it in.
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'saw', what: 'hands_full' }],
        weight: 0.8, story: 'carried an armful home twice and dropped half of it both times' },
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'doing', action: 'haul' },
                { kind: 'season', season: 'autumn' }],
        weight: 0.5, story: 'ferried a whole autumn of fruit across camp in two hands' },
    ],
    description:
      'Withies woven into a shape that holds. More carried in one trip, and ' +
      'the first container in the world that is not a pair of hands.',
  },
  netting: {
    id: 'netting', label: 'Netting', domain: 'water',
    age: 'upper_palaeolithic', firstKnown: 'about 27,000 years ago',
    kind: 'device',
    requires: ['cordage', 'fishing'], difficulty: 0.45, skill: 'forage',
    prototype: { thatch: 6 }, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'holding', item: 'fish' }],
        weight: 1.0, story: 'lost a fish out of a wet hand while the other held a cord' },
      { needs: [{ kind: 'knows', tech: 'fishing' }, { kind: 'doing', action: 'forage' },
                { kind: 'place', biome: 'beach' }],
        weight: 0.7, story: 'watched a shoal go past faster than one spear could answer' },
      { needs: [{ kind: 'knows', tech: 'fishing' }, { kind: 'saw', what: 'node_empty' }],
        weight: 0.5, story: 'stood over water that had been full of fish an hour before' },
    ],
    description:
      'Cordage knotted into a mesh. A spear takes one fish; a net takes ' +
      'whatever swims into it.',
  },
  snares: {
    id: 'snares', label: 'Snares', domain: 'beasts',
    age: 'upper_palaeolithic', firstKnown: 'about 25,000 years ago',
    kind: 'device',
    requires: ['cordage', 'tracking'], difficulty: 0.45, skill: 'track',
    prototype: { thatch: 3, sticks: 3 }, maxRefinement: 3,
    sparks: [
      // The heaviest route is a failure, deliberately. A snare is what occurs to
      // you after the thing you were chasing has gone, and `quarry_escaped` is a
      // real stop reason that both `tracking` and `spear` already read.
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'knows', tech: 'tracking' },
                { kind: 'saw', what: 'quarry_escaped' }],
        weight: 1.0, story: 'lost a hare on foot and thought about where it would run tomorrow' },
      { needs: [{ kind: 'knows', tech: 'tracking' }, { kind: 'doing', action: 'forage' },
                { kind: 'place', biome: 'forest' }],
        weight: 0.7, story: 'passed the same run through the same thicket every day for a month' },
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'feeling', need: 'hunger' },
                { kind: 'season', season: 'winter' }],
        weight: 0.5, story: 'went hungry in a winter wood that plainly had animals in it' },
    ],
    description:
      'A loop of cord set where something small runs, and the patience to come ' +
      'back to it. The first work in the world that goes on without you.',
  },
  fish_trap: {
    id: 'fish_trap', label: 'Fish trap', domain: 'water',
    age: 'mesolithic', firstKnown: 'about 8,000 years ago',
    kind: 'device',
    requires: ['netting', 'basketry'], difficulty: 0.5, skill: 'forage',
    prototype: { thatch: 6, sticks: 4 }, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'netting' }, { kind: 'knows', tech: 'basketry' },
                { kind: 'place', biome: 'beach' }],
        weight: 1.0, story: 'stood at the water holding a basket and a net, and saw one thing' },
      { needs: [{ kind: 'knows', tech: 'basketry' }, { kind: 'holding', item: 'fish' },
                { kind: 'doing', action: 'forage' }],
        weight: 0.7, story: 'noticed which way a fish turns when it finds a wall' },
      { needs: [{ kind: 'knows', tech: 'netting' }, { kind: 'saw', what: 'node_empty' },
                { kind: 'place', biome: 'beach' }],
        weight: 0.5, story: 'wanted the water worked on a day nobody could stand in it' },
    ],
    description:
      'A woven mouth set where the water runs, emptied when it suits you. Fish ' +
      'that arrive whether or not anybody walked down to the shore.',
  },
  // M8.1, mechanism 4. The other half of the food answer, and the opposite kind
  // of one to the traps: a snare gets you more food, a quern gets more food out
  // of what you already had. Requires only `stoneworking`, because a saddle
  // quern is two stones and the idea of rubbing them together — the hard part
  // was never the tool.
  grinding: {
    id: 'grinding', label: 'Grinding', domain: 'plants',
    age: 'upper_palaeolithic', firstKnown: 'about 30,000 years ago',
    kind: 'device',
    requires: ['stoneworking'], difficulty: 0.4, skill: 'cook',
    prototype: { flint: 2, sticks: 1 }, maxRefinement: 2,
    sparks: [
      // **No spark may require holding an acorn**, and the reason is worth
      // stating because it is the exact deadlock this project has shipped once
      // already with `leatherwork`. `Brain` will not pick a fruit that is worth
      // nothing to the picker, and an acorn is worth nothing to anybody who
      // cannot grind — so "holding an acorn" is a condition only a person who
      // already knows this technology can ever meet, and the node would have
      // been unreachable in play while passing every static test in the suite.
      //
      // The heaviest route is therefore the *sight* of a mast year rather than
      // the holding of one: standing hungry in an autumn wood on ground
      // carpeted with food nobody can eat is the historical moment exactly.
      { needs: [{ kind: 'knows', tech: 'stoneworking' }, { kind: 'place', biome: 'forest' },
                { kind: 'season', season: 'autumn' }, { kind: 'feeling', need: 'hunger' }],
        weight: 1.0, story: 'went hungry in an autumn wood ankle-deep in something nothing could chew' },
      // A hazelnut is edible and is therefore genuinely carried, which is what
      // makes this a real route where an acorn would not be.
      { needs: [{ kind: 'holding', item: 'hazelnut' }, { kind: 'knows', tech: 'stoneworking' },
                { kind: 'feeling', need: 'hunger' }],
        weight: 0.7, story: 'chewed at a nut that would not give and reached for a stone' },
      // The route that needs no autumn at all, so the node is not shut out of
      // three seasons of the year. Knapping is one stone rubbed on another and
      // always was; noticing what the grit underneath is doing is the whole step.
      { needs: [{ kind: 'knows', tech: 'stoneworking' }, { kind: 'doing', action: 'craft' }],
        weight: 0.5, story: 'watched the dust come off a core and wondered what else would powder' },
    ],
    description:
      'A saddle stone and a muller. An acorn is bitter and an oak is the ' +
      'commonest tree in the wood; ground and leached, it is a winter food.',
  },
  // --- M8.1, the bone tier ---------------------------------------------------
  //
  // Read the three together. A kill has always given meat and a hide and thrown
  // the rest away; `bone_working` is noticing that the rest is the best material
  // on the animal. Out of it come a point that throws better than flint and the
  // eyed needle, and out of the needle comes the first garment that actually
  // fits — which is, as nearly as one mechanic can be, the reason our species
  // could live where it was cold.
  bone_working: {
    id: 'bone_working', label: 'Bone working', domain: 'beasts',
    age: 'upper_palaeolithic', firstKnown: 'about 45,000 years ago',
    kind: 'device',
    requires: ['hafting'], difficulty: 0.4, skill: 'knap',
    prototype: { flint: 1, sticks: 1 }, maxRefinement: 3,
    sparks: [
      // The heaviest route needs no bone in hand, and must not: bone is taken
      // off a kill only by somebody who already knows this, so "holding a bone"
      // is a condition only a holder can meet. The same deadlock the acorn
      // taught, one node along.
      { needs: [{ kind: 'knows', tech: 'hafting' }, { kind: 'doing', action: 'hunt' }],
        weight: 1.0, story: 'looked at what was left of a carcass and saw a set of tools in it' },
      { needs: [{ kind: 'holding', item: 'hide' }, { kind: 'knows', tech: 'hafting' }],
        weight: 0.7, story: 'skinned a beast and found the hard parts more interesting than the soft' },
      { needs: [{ kind: 'knows', tech: 'hafting' }, { kind: 'saw', what: 'quarry_escaped' },
                { kind: 'feeling', need: 'hunger' }],
        weight: 0.5, story: 'wanted a point that would go further than a flint one would' },
    ],
    description:
      'Antler, bone and sinew: the parts of a kill nobody was eating. A barbed ' +
      'point, and a needle with an eye in it.',
  },
  tailoring: {
    id: 'tailoring', label: 'Tailoring', domain: 'cloth',
    age: 'upper_palaeolithic', firstKnown: 'about 40,000 years ago',
    kind: 'device',
    requires: ['clothing', 'bone_working'], difficulty: 0.5, skill: 'build',
    prototype: { hide: 2, sinew: 1 }, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'clothing' }, { kind: 'holding', item: 'needle' },
                { kind: 'feeling', need: 'cold' }],
        weight: 1.0, story: 'held a needle in one hand and a draughty hide in the other' },
      { needs: [{ kind: 'knows', tech: 'bone_working' }, { kind: 'feeling', need: 'cold' },
                { kind: 'season', season: 'winter' }],
        weight: 0.7, story: 'spent a winter night finding out where a wrapped skin lets the cold in' },
      { needs: [{ kind: 'knows', tech: 'clothing' }, { kind: 'holding', item: 'sinew' }],
        weight: 0.5, story: 'pulled a length of sinew straight and thought of it as thread' },
    ],
    description:
      'Skins cut to a shape and sewn shut. A wrapped hide keeps the wind off; ' +
      'a fitted coat keeps the winter out.',
  },
  atlatl: {
    id: 'atlatl', label: 'Spear-thrower', domain: 'beasts',
    age: 'upper_palaeolithic', firstKnown: 'about 18,000 years ago',
    kind: 'device',
    requires: ['spear'], difficulty: 0.45, skill: 'hunt',
    prototype: { sticks: 2, thatch: 1 }, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'spear' }, { kind: 'saw', what: 'quarry_escaped' }],
        weight: 1.0, story: 'watched a spear fall short of something already running' },
      { needs: [{ kind: 'holding', item: 'spear' }, { kind: 'doing', action: 'hunt' },
                { kind: 'place', biome: 'grass' }],
        weight: 0.7, story: 'threw across open ground at a range no arm could cover' },
      { needs: [{ kind: 'knows', tech: 'spear' }, { kind: 'doing', action: 'chop' }],
        weight: 0.5, story: 'felt how much further a long haft carries the end of a swing' },
    ],
    description:
      'A notched stick that lengthens the arm. Twenty thousand years before ' +
      'the bow, and most of the way to it.',
  },
  // --- M8.1, the last four ---------------------------------------------------
  ochre: {
    id: 'ochre', label: 'Ochre', domain: 'stone',
    age: 'middle_palaeolithic', firstKnown: 'about 100,000 years ago',
    kind: 'device',
    requires: ['firemaking'], difficulty: 0.3, skill: 'build',
    prototype: { mud: 2, sticks: 1 }, maxRefinement: 2,
    sparks: [
      // The whole idea is in the fire, which is why the only prerequisite is
      // one: yellow earth goes red when it is heated, and somebody noticed.
      { needs: [{ kind: 'knows', tech: 'firemaking' }, { kind: 'holding', item: 'mud' }],
        weight: 1.0, story: 'left a lump of yellow earth in the embers and pulled out a red one' },
      { needs: [{ kind: 'knows', tech: 'firemaking' }, { kind: 'doing', action: 'gather' },
                { kind: 'place', biome: 'hills' }],
        weight: 0.7, story: 'dug clay out of a bank and found it stained everything it touched' },
      { needs: [{ kind: 'knows', tech: 'firemaking' }, { kind: 'doing', action: 'hunt' },
                { kind: 'feeling', need: 'company' }],
        weight: 0.5, story: 'came back from a hunt with something worth telling and no way to keep it' },
    ],
    description:
      'Earth burnt red, and a rock wall. The cheapest way in the world to ' +
      'leave something behind, and the only one that needs no script.',
  },
  flute: {
    id: 'flute', label: 'Flute', domain: 'beasts',
    age: 'upper_palaeolithic', firstKnown: 'about 40,000 years ago',
    kind: 'device',
    requires: ['bone_working'], difficulty: 0.45, skill: 'build',
    prototype: { bone: 1, flint: 1 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'bone_working' }, { kind: 'feeling', need: 'company' }],
        weight: 1.0, story: 'blew across the end of a hollow bone and startled themselves' },
      { needs: [{ kind: 'holding', item: 'bone' }, { kind: 'doing', action: 'rest' }],
        weight: 0.7, story: 'sat idle with a bird bone and nothing better to do with it' },
      { needs: [{ kind: 'knows', tech: 'bone_working' }, { kind: 'season', season: 'winter' },
                { kind: 'feeling', need: 'company' }],
        weight: 0.5, story: 'spent a long winter night making the only noise anybody had heard all day' },
    ],
    description:
      'A hollow bone with holes bored in it. The first thing anybody made that ' +
      'does nothing at all except be worth listening to.',
  },
  herbalism: {
    id: 'herbalism', label: 'Herbalism', domain: 'plants',
    age: 'middle_palaeolithic', firstKnown: 'about 50,000 years ago',
    kind: 'practice', practisedBy: ['tend'],
    requires: ['plant_lore'], difficulty: 0.45, skill: 'heal',
    prototype: {}, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'plant_lore' }, { kind: 'doing', action: 'forage' },
                { kind: 'place', biome: 'forest' }],
        weight: 1.0, story: 'knew which leaves were food and started wondering about the rest' },
      { needs: [{ kind: 'knows', tech: 'plant_lore' }, { kind: 'saw', what: 'assault' }],
        weight: 0.7, story: 'sat with somebody who had been beaten and wanted to do more than sit' },
      { needs: [{ kind: 'knows', tech: 'plant_lore' }, { kind: 'season', season: 'spring' },
                { kind: 'doing', action: 'gather' }],
        weight: 0.5, story: 'chewed a spring root for want of anything else and felt the ache go' },
    ],
    description:
      'Which leaf for a fever and which root for a wound. The first answer ' +
      'anybody has ever had to being hurt beyond waiting it out.',
  },
  taming: {
    id: 'taming', label: 'Taming', domain: 'beasts',
    age: 'upper_palaeolithic', firstKnown: 'about 30,000 years ago',
    kind: 'practice', practisedBy: ['tame'],
    requires: ['tracking'], difficulty: 0.5, skill: 'track',
    prototype: {}, maxRefinement: 3,
    sparks: [
      // The historical route exactly: nobody goes out and tames a wolf, they
      // stop driving off the one that keeps coming back to the middens.
      { needs: [{ kind: 'knows', tech: 'tracking' }, { kind: 'holding', item: 'meat' },
                { kind: 'saw', what: 'quarry_escaped' }],
        weight: 1.0, story: 'noticed the same beast following the camp and threw it something' },
      { needs: [{ kind: 'knows', tech: 'tracking' }, { kind: 'doing', action: 'hunt' },
                { kind: 'feeling', need: 'company' }],
        weight: 0.7, story: 'hunted alone often enough to want something at their shoulder' },
      { needs: [{ kind: 'knows', tech: 'tracking' }, { kind: 'holding', item: 'meat' },
                { kind: 'season', season: 'winter' }],
        weight: 0.5, story: 'fed a hungry animal in a hard winter instead of killing it' },
    ],
    description:
      'An animal that comes back rather than runs. It begins with feeding ' +
      'something you could have eaten.',
  },
  division_of_labour: {
    id: 'division_of_labour', label: 'Division of labour', domain: 'people',
    age: 'upper_palaeolithic', firstKnown: 'about 40,000 years ago',
    // A practice, and it could not be anything else: there is nothing to
    // build. It is tried by doing it — `Simulation.assignJob` calls
    // `noteDid('assign')` on every arrangement that sticks — which is the same
    // road `herbalism` and `taming` take in, and for the same reason. The
    // deadlock that would otherwise close here is real and worth naming:
    // assigning work is gated on `techPower > 0`, and `techPower` gives a
    // practice half strength from `PROTOTYPE_AT` onward precisely so that the
    // one act which counts as trying a practice out is not locked behind
    // having already finished trying it out.
    kind: 'practice', practisedBy: ['assign'],
    // Nothing. This is a thought anybody standing in a crowded camp can have,
    // and it must be, because the four nodes that build on it in M9.5 phase 4d
    // and beyond are the whole social ladder: putting a prerequisite here
    // would make the ladder hang off whichever branch of the tree that
    // prerequisite happened to sit on.
    requires: [], difficulty: 0.45, skill: 'persuade',
    prototype: {}, maxRefinement: 2,
    sparks: [
      // Crowding, felt rather than counted. There is no ingredient for "four
      // people are doing your job beside you" and there does not need to be:
      // a stripped patch is what several people on the same patch *produces*,
      // and `node_empty` already lands in `noticed` when it happens to you.
      { needs: [{ kind: 'saw', what: 'node_empty' }, { kind: 'feeling', need: 'hunger' }],
        weight: 1.0, story: 'went hungry beside a patch that several of them had stripped between them' },
      // The talk in a camp big enough to have the conversation in — `talk`
      // needs somebody to talk to — paired with the same stripped patch,
      // because the thought needs both halves: the crowding, and somebody to
      // say it to.
      //
      // This route wanted `long_enough` first, and that would have been a dead
      // route: it is emitted only by `MAX_WORK_STRETCH`, a 900-tick backstop
      // that thirst beats by better than two to one, and it fires **zero**
      // times in every scenario in the suite. Exactly the shape of
      // `tracking`'s `doing: wander`, which sat dead in this table for the
      // whole life of the project while passing every test in it. Measured
      // before it shipped rather than after.
      { needs: [{ kind: 'doing', action: 'talk' }, { kind: 'saw', what: 'node_empty' }],
        weight: 0.7, story: 'worked a patch out and said as much to the next person to try it' },
      // Friction. Being told no to your face is what makes anybody think about
      // how the asking works — see `Simulation.command`, which records it.
      { needs: [{ kind: 'saw', what: 'order_refused' }],
        weight: 0.8, story: 'was refused once too often, and wondered what would make an order stick' },
      // 4a's route in, and the one the plan is really about: menace works, and
      // it is ruinously expensive in regard. A cheaper way to be obeyed is
      // exactly what this node is.
      { needs: [{ kind: 'saw', what: 'threaten' }, { kind: 'doing', action: 'talk' }],
        weight: 0.5, story: 'saw what a threat bought, and thought there must be a cheaper way to be obeyed' },
    ],
    description:
      'Not everybody should be doing the same thing. One person set to one ' +
      'task, by arrangement rather than by menace, and the camp stops ' +
      'stripping the same patch four times over.',
  },
  farming: {
    id: 'farming', label: 'Farming', domain: 'plants',
    age: 'neolithic', firstKnown: 'about 9500 BC',
    // A device, by this file's own test of one: it gates a building. The
    // prototype is the first deliberate sowing — a handful of seed put in the
    // ground to see what happens, which is exactly what `doPrototype` models and
    // exactly how it really went.
    kind: 'device',
    requires: ['plant_lore', 'grinding'], difficulty: 0.62, skill: 'farm',
    prototype: { grain: 5 }, maxRefinement: 3,
    sparks: [
      // The observation itself, and it is the one every account of early
      // agriculture puts first: the ground by the camp where last year's spilt
      // seed came up thicker than anything on the hillside.
      { needs: [{ kind: 'holding', item: 'grain' }, { kind: 'doing', action: 'forage' },
                { kind: 'season', season: 'autumn' }],
        weight: 1.0, story: 'saw where last year’s spilt seed had come up thickest' },
      { needs: [{ kind: 'knows', tech: 'plant_lore' }, { kind: 'holding', item: 'grain' },
                { kind: 'doing', action: 'store' }],
        weight: 0.7, story: 'found seed sprouting in the pit and understood what it had been asking for' },
      // Hunger on open grass with seed in hand. The route that needs nobody to
      // have noticed anything — every other spark here wants a coincidence, and
      // a node all of whose routes want one is unreachable in play while passing
      // every static test in the suite.
      { needs: [{ kind: 'holding', item: 'grain' }, { kind: 'place', biome: 'grass' },
                { kind: 'feeling', need: 'hunger' }],
        weight: 0.8, story: 'stood hungry on a hillside of grass that was nearly food' },
      { needs: [{ kind: 'knows', tech: 'grinding' }, { kind: 'holding', item: 'grain' },
                { kind: 'saw', what: 'node_empty' }],
        weight: 0.6, story: 'gathered the last stand of wild grain bare and wondered where next year’s would come from' },
    ],
    description:
      'Seed saved from one harvest and put back in the ground for the next. ' +
      'The band stops walking to the food and starts waiting for it.',
  },
  composting: {
    id: 'composting', label: 'Composting', domain: 'plants',
    age: 'neolithic', firstKnown: 'about 4000 BC',
    kind: 'device',
    requires: ['farming'], difficulty: 0.5, skill: 'farm',
    prototype: { thatch: 4, mud: 2 }, maxRefinement: 3,
    sparks: [
      // The two routes that matter both come out of the failure itself. A
      // harvest that gave nothing and ground that refused the seed are both
      // things `noteSaw` already records, which is what makes them real
      // ingredients rather than plausible ones.
      { needs: [{ kind: 'saw', what: 'ground_spent' }, { kind: 'knows', tech: 'farming' }],
        weight: 1.0, story: 'stood on ground that would not take seed and thought about what had been taken out of it' },
      { needs: [{ kind: 'saw', what: 'nothing_to_reap' }, { kind: 'doing', action: 'reflect' }],
        weight: 0.8, story: 'sat with a harvest that came to nothing and worked out where it had gone' },
      // And the one that needs no failure at all: the midden by the camp is
      // always the greenest ground anybody has, and somebody was always going
      // to notice.
      { needs: [{ kind: 'holding', item: 'thatch' }, { kind: 'doing', action: 'store' },
                { kind: 'knows', tech: 'farming' }],
        weight: 0.7, story: 'noticed that nothing grew greener than the rubbish heap behind the camp' },
      { needs: [{ kind: 'doing', action: 'sow' }, { kind: 'season', season: 'autumn' }],
        weight: 0.5, story: 'turned the last of the straw back into the furrow to be rid of it' },
    ],
    description:
      'Straw, scraps and mud rotted down and turned back into the furrow. ' +
      'The first idea anybody had that the ground can be given to as well as ' +
      'taken from.',
  },
  chiefdom: {
    id: 'chiefdom', label: 'Chiefdom', domain: 'people',
    age: 'neolithic', firstKnown: 'about 7,000 years ago',
    // Practised by presiding: giving an order to somebody who is neither your
    // kin nor under your roof, and being obeyed because of the rank rather
    // than in spite of the lack of one. `Simulation.command` records that as
    // `preside`, and only when the rank term was what carried it — see
    // `Standing.byRank`. The same half-strength trial route `techPower` gives
    // every practice keeps this from locking itself out.
    kind: 'practice', practisedBy: ['preside'],
    requires: ['division_of_labour'], difficulty: 0.55, skill: 'persuade',
    prototype: {}, maxRefinement: 2,
    sparks: [
      // The commonest deed in the game that nobody has the standing to settle.
      // 155 thefts on the `century` seed against 47 beatings, which is why
      // this is the heavy route and the beating is the lighter one.
      { needs: [{ kind: 'saw', what: 'theft' }, { kind: 'doing', action: 'talk' }],
        weight: 1.0, story: 'watched a theft that everybody saw and nobody had the standing to settle' },
      { needs: [{ kind: 'saw', what: 'assault' }],
        weight: 0.8, story: 'saw two of them come to blows with nobody set above either to stop it' },
      // The lesson `division_of_labour` teaches by failing: parcelling out the
      // work is not the same as being obeyed, and the gap between them is what
      // rank is for.
      { needs: [{ kind: 'knows', tech: 'division_of_labour' },
                { kind: 'saw', what: 'order_refused' }],
        weight: 0.7, story: 'found that parcelling out the work was not the same as being obeyed' },
      // And 4a again, one rung up: menace was settling what standing ought to
      // have settled.
      { needs: [{ kind: 'saw', what: 'threaten' }, { kind: 'doing', action: 'talk' }],
        weight: 0.6, story: 'saw menace settle a thing that ought to have been settled by standing' },
    ],
    description:
      'A band with a shape. The heads of houses answer to the chief and are ' +
      'answered to by everyone else, and the chief holds the office long ' +
      'enough for it to be one.',
  },
  storytelling: {
    id: 'storytelling', label: 'Storytelling', domain: 'people',
    age: 'upper_palaeolithic', firstKnown: 'about 40,000 years ago',
    // A practice, on `division_of_labour`'s own test: there is nothing to
    // build. Tried by doing it — `ActionSystem.finish` already calls
    // `Person.noteDid(person.action)` on every completed action, so `talk`
    // finishing is the trial with no new hook required.
    kind: 'practice', practisedBy: ['talk'],
    // No prerequisite, deliberately, for the same reason `division_of_labour`
    // has none: it is a thought anybody who talks to anybody can have, and
    // gating the oral channel behind some other node would make the fallback
    // that is supposed to survive a band with nothing else depend on having
    // something else first.
    requires: [], difficulty: 0.5, skill: 'persuade',
    prototype: {}, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'doing', action: 'talk' }, { kind: 'feeling', need: 'company' }],
        weight: 1.0, story: 'found a good story was the cheapest company there was' },
      { needs: [{ kind: 'doing', action: 'talk' }, { kind: 'season', season: 'winter' }],
        weight: 0.8, story: 'kept the whole hearth listening through a long winter night' },
      // No `knows` ingredient, and deliberately: a spark that named a
      // prerequisite here would have to be in `requires` too — see
      // `spark-ingredients-are-real` — and this node's whole point is to be
      // reachable with nothing else in hand.
      { needs: [{ kind: 'saw', what: 'teach' }, { kind: 'doing', action: 'talk' }],
        weight: 0.5, story: 'watched a lesson land and noticed how much of it was in the telling' },
    ],
    description:
      'The knack of telling a thing so it is remembered — not what is known, ' +
      'but how it travels. A lesson lands more often for the telling, and a ' +
      'long evening carries an extra story further than it otherwise would.',
  },

  // --- M11 phase 10: the widened Neolithic -----------------------------------
  //
  // `m8_plan_the_ages.md`'s M8.2 table, resumed after `farming` and
  // `composting`. This tier is deliberately cheap: no node here needs a new
  // system, only a term on a function `techPower`'s callers already read —
  // `buildFactor`, `warmthFrom`, and the felling and reaping arithmetic in
  // `ActionSystem`. That is the Evolve-style density the plan asks for.
  ground_stone: {
    id: 'ground_stone', label: 'Ground stone', domain: 'stone',
    age: 'neolithic', firstKnown: 'about 8,000 years ago',
    kind: 'device',
    requires: ['stoneworking', 'hafting'], difficulty: 0.5, skill: 'knap',
    // `maxRefinement: 2`, not 3 — `axeFactor` reads this through `scaled` with a
    // `full` under 1, and a `full` of 0.35 at three refinement steps would push
    // the multiplier negative (`1 + (0.35 - 1) * 1.6 = -0.04`), which would make
    // `required` in `doChop` negative and fell a tree in zero ticks. Two steps
    // keeps the floor at a positive 0.09.
    prototype: { flint: 3, sticks: 1 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'stoneworking' }, { kind: 'knows', tech: 'hafting' },
                { kind: 'doing', action: 'chop' }],
        weight: 1.0, story: 'noticed how much cleaner a rubbed edge cut than a struck one' },
      { needs: [{ kind: 'knows', tech: 'stoneworking' }, { kind: 'doing', action: 'craft' }],
        weight: 0.7, story: 'kept working a flake smooth after it was already sharp' },
      { needs: [{ kind: 'knows', tech: 'hafting' }, { kind: 'doing', action: 'build' }],
        weight: 0.5, story: 'wanted a blade that would not chip the moment it hit a knot' },
    ],
    description:
      'A struck edge ground smooth against another stone. Twice the axe, and ' +
      'twice the adze — the same idea `stoneworking` had, taken further.',
  },
  spinning: {
    id: 'spinning', label: 'Spinning', domain: 'cloth',
    age: 'neolithic', firstKnown: 'about 7,000 BC',
    kind: 'device',
    requires: ['cordage'], difficulty: 0.4, skill: 'build',
    prototype: { sticks: 2, thatch: 1 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'doing', action: 'gather' },
                { kind: 'place', biome: 'grass' }],
        weight: 1.0, story: 'twisted a strand of fibre between finger and thumb until it held straight' },
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'season', season: 'winter' },
                { kind: 'feeling', need: 'cold' }],
        weight: 0.7, story: 'sat through a cold evening twisting cord finer than any strap needed' },
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'doing', action: 'craft' }],
        weight: 0.5, story: 'noticed a spun cord held straighter than a plaited one' },
    ],
    description:
      'Fibre drawn out and twisted into a length of thread. Cordage was rope; ' +
      'this is fine enough to sew or to weave.',
  },
  weaving: {
    id: 'weaving', label: 'Weaving', domain: 'cloth',
    age: 'neolithic', firstKnown: 'about 6,000 BC',
    kind: 'device',
    requires: ['spinning', 'basketry'], difficulty: 0.55, skill: 'build',
    prototype: { wood: 3, sticks: 2 }, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'spinning' }, { kind: 'knows', tech: 'basketry' }],
        weight: 1.0, story: 'ran a thread over and under a row of withies the way a basket already goes' },
      { needs: [{ kind: 'knows', tech: 'spinning' }, { kind: 'feeling', need: 'cold' },
                { kind: 'season', season: 'winter' }],
        weight: 0.7, story: 'strung a frame with thread to keep the draught off, and it held together' },
      { needs: [{ kind: 'knows', tech: 'basketry' }, { kind: 'doing', action: 'craft' }],
        weight: 0.5, story: 'saw the same over-and-under in a basket wall and a bird’s nest both' },
    ],
    description:
      'Thread crossed over and under itself on a frame. A length of cloth: ' +
      'warmer than a bare hide, and the first thing a band makes worth ' +
      'trading for its own sake.',
  },
  sickle: {
    id: 'sickle', label: 'Sickle', domain: 'plants',
    age: 'neolithic', firstKnown: 'about 9,000 BC',
    kind: 'device',
    requires: ['farming', 'hafting'], difficulty: 0.4, skill: 'knap',
    prototype: { flint: 2, sticks: 1 }, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'farming' }, { kind: 'doing', action: 'reap' }],
        weight: 1.0, story: 'tore at a ripe stand with bare hands and thought of a blade instead' },
      { needs: [{ kind: 'knows', tech: 'hafting' }, { kind: 'saw', what: 'nothing_to_reap' }],
        weight: 0.6, story: 'lost a stand to the weather waiting to strip it by hand and swore not to again' },
      { needs: [{ kind: 'knows', tech: 'farming' }, { kind: 'doing', action: 'chop' }],
        weight: 0.5, story: 'felt how much faster a hafted edge went through a stalk than a fist did' },
    ],
    description:
      'A curved blade set in a haft. A field stripped in an afternoon instead ' +
      'of a day, and less of the harvest shattered onto the ground getting there.',
  },

  // --- M11 phase 10, second commit -------------------------------------------
  masonry: {
    id: 'masonry', label: 'Masonry', domain: 'stone',
    age: 'neolithic', firstKnown: 'about 9,000 years ago',
    kind: 'device',
    requires: ['stoneworking', 'carpentry'], difficulty: 0.55, skill: 'build',
    prototype: { flint: 6, mud: 4 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'stoneworking' }, { kind: 'knows', tech: 'carpentry' },
                { kind: 'doing', action: 'build' }],
        weight: 1.0, story: 'set one stone flat on another while a wall waited for its daub' },
      { needs: [{ kind: 'knows', tech: 'stoneworking' }, { kind: 'feeling', need: 'cold' },
                { kind: 'season', season: 'winter' }],
        weight: 0.7, story: 'sheltered against an outcrop that shrugged off a wind no daubed wall had held back' },
      { needs: [{ kind: 'knows', tech: 'carpentry' }, { kind: 'doing', action: 'gather' },
                { kind: 'place', biome: 'hills' }],
        weight: 0.5, story: 'stacked cleared stone into a wall rather than a heap, to see if it would stand' },
    ],
    description:
      'Stone laid and coursed rather than piled. Walls a timber frame does not ' +
      'need, and a roof that answers a winter no hut of mud and sticks can.',
  },
  wattle_daub: {
    id: 'wattle_daub', label: 'Wattle and daub', domain: 'timber',
    age: 'neolithic', firstKnown: 'about 6,000 BC',
    kind: 'device',
    requires: ['carpentry', 'cordage'], difficulty: 0.45, skill: 'build',
    prototype: { sticks: 6, mud: 4 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'carpentry' }, { kind: 'knows', tech: 'cordage' },
                { kind: 'doing', action: 'build' }],
        weight: 1.0, story: 'wove a panel of withies between two posts before reaching for the mud at all' },
      { needs: [{ kind: 'knows', tech: 'cordage' }, { kind: 'feeling', need: 'cold' },
                { kind: 'season', season: 'winter' }],
        weight: 0.7, story: 'felt a plain mud wall let the wind through where a woven one might not' },
      { needs: [{ kind: 'knows', tech: 'carpentry' }, { kind: 'doing', action: 'gather' },
                { kind: 'place', biome: 'forest' }],
        weight: 0.5, story: 'bent a green branch double and thought of a wall that bent instead of cracking' },
    ],
    description:
      'A woven panel of withies, daubed over rather than packed solid. Faster ' +
      'to raise than a mud hut, and it keeps the warmth in better for it.',
  },
  calendar: {
    id: 'calendar', label: 'Calendar', domain: 'plants',
    age: 'neolithic', firstKnown: 'about 5,000 BC',
    // A practice: nothing is built, and the trial is the act it improves —
    // sowing at the right time rather than by guesswork. The same road
    // `herbalism` and `taming` take, for the same reason `techPower` gives a
    // practice half strength from `PROTOTYPE_AT` onward: the one act that
    // counts as trying it out cannot be locked behind having already proven it.
    kind: 'practice', practisedBy: ['sow'],
    requires: ['marking', 'farming'], difficulty: 0.5, skill: 'farm',
    prototype: {}, maxRefinement: 3,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'marking' }, { kind: 'knows', tech: 'farming' },
                { kind: 'doing', action: 'sow' }],
        weight: 1.0, story: 'kept a tally of the seasons and noticed the crop sown on the same notch always did best' },
      { needs: [{ kind: 'knows', tech: 'farming' }, { kind: 'saw', what: 'nothing_to_reap' }],
        weight: 0.7, story: 'lost a crop to a frost and started counting the days until the ground could be trusted again' },
      { needs: [{ kind: 'knows', tech: 'marking' }, { kind: 'doing', action: 'discuss' }],
        weight: 0.5, story: 'argued about which day was the right one to sow, and started marking it down to settle it' },
    ],
    description:
      'Sowing timed to a tally of the seasons rather than to guesswork. The ' +
      'same field, worked the same, gives more back for going in on the right day.',
  },
  the_wheel: {
    id: 'the_wheel', label: 'The wheel', domain: 'timber',
    age: 'neolithic', firstKnown: 'about 3500 BC',
    kind: 'device',
    requires: ['carpentry', 'ground_stone'], difficulty: 0.55, skill: 'build',
    prototype: { wood: 5, sticks: 3 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'carpentry' }, { kind: 'knows', tech: 'ground_stone' },
                { kind: 'doing', action: 'haul' }],
        weight: 1.0, story: 'dragged a sledge of logs down the same track twice and wondered about a wheel under it' },
      { needs: [{ kind: 'knows', tech: 'ground_stone' }, { kind: 'doing', action: 'craft' }],
        weight: 0.7, story: 'rolled a round offcut across the ground and noticed how far it ran before it stopped' },
      { needs: [{ kind: 'knows', tech: 'carpentry' }, { kind: 'saw', what: 'hands_full' }],
        weight: 0.5, story: 'carried a third trip home in two loads and wanted a fourth hand that was not a hand at all' },
    ],
    description:
      'A disc that turns on an axle, under a frame. What a strap and a basket ' +
      'carry, and then a cartload more on top of it.',
  },
  bread: {
    id: 'bread', label: 'Bread', domain: 'fire',
    age: 'neolithic', firstKnown: 'about 8,000 BC',
    kind: 'device',
    requires: ['grinding', 'farming', 'firemaking'], difficulty: 0.4, skill: 'cook',
    prototype: { mud: 4, sticks: 2 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'grinding' }, { kind: 'knows', tech: 'firemaking' },
                { kind: 'holding', item: 'meal' }],
        weight: 1.0, story: 'left a paste of meal and water too near the coals and it came out solid' },
      { needs: [{ kind: 'knows', tech: 'farming' }, { kind: 'doing', action: 'eat' },
                { kind: 'feeling', need: 'hunger' }],
        weight: 0.6, story: 'chewed dry meal by the fire and thought of trying it wet, and baked, instead' },
      { needs: [{ kind: 'knows', tech: 'grinding' }, { kind: 'knows', tech: 'farming' },
                { kind: 'doing', action: 'craft' }],
        weight: 0.5, story: 'watched a pot of grain paste stiffen at the fire’s edge and thought of eating it that way' },
    ],
    description:
      'Meal wetted, worked and baked at the fire. More nourishing than the ' +
      'meal it is made from, and it keeps just as well.',
  },

  // --- M11 phase 10, third commit: the one node in this tier with a real
  // mechanism behind it. See `BuildingDef.herd` and `Simulation.workHerds`.
  herding: {
    id: 'herding', label: 'Herding', domain: 'beasts',
    age: 'neolithic', firstKnown: 'about 8,500 BC',
    kind: 'device',
    requires: ['taming'], difficulty: 0.5, skill: 'track',
    prototype: { sticks: 4, thatch: 2 }, maxRefinement: 2,
    sparks: [
      { needs: [{ kind: 'knows', tech: 'taming' }, { kind: 'doing', action: 'tame' }],
        weight: 1.0, story: 'kept the same doe coming back to camp until keeping her felt no different from feeding her' },
      { needs: [{ kind: 'knows', tech: 'taming' }, { kind: 'holding', item: 'meat' },
                { kind: 'feeling', need: 'hunger' }],
        weight: 0.6, story: 'ate the last of a hunt and wondered why the next one had to start from nothing' },
      { needs: [{ kind: 'knows', tech: 'taming' }, { kind: 'doing', action: 'forage' },
                { kind: 'place', biome: 'grass' }],
        weight: 0.5, story: 'watched a tamed animal graze without wandering off and thought of a fence around the idea' },
    ],
    description:
      'A tamed animal, kept rather than followed, and a fence to keep the next ' +
      'one from wandering. Meat that does not have to be found again, up to ' +
      'the day it is culled faster than it breeds.',
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
  basketry: {
    summary: 'Something to put it in: more carried home in one trip.',
    site: 'Person.carryCapacity, via carryFactor, when a basket is in the pack',
  },
  netting: {
    summary: 'A mesh instead of a point: far more from every fishing spot.',
    site: 'ActionSystem.doHarvest, via forageYieldFactor, when a net is in the pack',
  },
  snares: {
    summary: 'Small game caught while you were somewhere else.',
    site: 'Simulation.workTraps, via BUILDINGS.snare.yields',
  },
  fish_trap: {
    summary: 'The shore worked without anybody standing on it.',
    site: 'Simulation.workTraps, via BUILDINGS.fish_trap.yields',
  },
  grinding: {
    summary: 'Acorns and wild grain become food. The oak stops being timber and starts being a harvest.',
    site: 'BUILDINGS.quern, and RECIPES.meal and RECIPES.groats through RecipeDef.station',
  },
  farming: {
    summary: 'Ground broken and sown: a harvest where you left it, and grain that keeps.',
    site: 'BUILDINGS.field, and ActionSystem.doSow and doReap',
  },
  composting: {
    summary: 'The ground can be given back to. A field that lasts beyond the farmer.',
    site: 'BUILDINGS.compost_heap, Simulation.workHeaps, and ActionSystem.doSpread',
  },
  bone_working: {
    summary: 'Bone and sinew off every kill, and a point that throws further than flint.',
    site: 'ActionSystem.doHunt, and RECIPES.bone_point / RECIPES.needle',
  },
  tailoring: {
    summary: 'A coat that fits. The largest single answer to cold anybody carries.',
    site: 'NeedsSystem, via warmthFrom, when a fur coat is in the pack',
  },
  atlatl: {
    summary: 'Reach on a throw: a strike landed from further off than an arm can cover.',
    site: 'ActionSystem.doHunt and doAttack, via weaponOf',
  },
  ochre: {
    summary: 'A record anybody can leave, and anybody who knows the picture can read.',
    site: 'INSCRIPTIONS.ochre, through InscriptionDef.literacy',
  },
  flute: {
    summary: 'Music. It answers loneliness for everybody in earshot, not only the player.',
    site: 'ActionSystem.doPlay',
  },
  herbalism: {
    summary: 'Tending the hurt: they mend far faster than waiting would have managed.',
    site: 'ActionSystem.doTend, the only use the heal skill has ever had',
  },
  chiefdom: {
    summary:
      'Rank. The head of a house is heeded across the whole camp, and a chief ' +
      'holds office half as long again.',
    site:
      'Authority.standingOver, the rank term; Leadership.chiefTermDays; ' +
      'BandSystem.directWork, where heads put people to work',
  },
  division_of_labour: {
    summary:
      'The idea of setting one person to one task. Jobs can be handed out at ' +
      'all, and a leader who has the knack of it is argued with less.',
    site: 'Simulation.assignJob, gate and compliance; BandSystem.assignJobs',
  },
  taming: {
    summary: 'An animal that follows you, and hunts better than you do alone.',
    site: 'ActionSystem.doTame, Animal.tamedBy, and WildlifeSystem.noticeRadius',
  },
  storytelling: {
    summary: 'A lesson lands more often, and a long evening carries an extra story.',
    site: 'KnowledgeSystem.teach, scaling the chance; SocialSystem.converse, the deep-talk bonus',
  },
  ground_stone: {
    summary: 'A polished axe and adze: a tree felled and a roof raised in a fraction of the swings.',
    site: 'Tech.axeFactor, read by ActionSystem.doChop and Progress.workProgressOf; Tech.buildFactor, when an adze is in the pack',
  },
  spinning: {
    summary: 'Fibre spun into thread — the material weaving turns into cloth.',
    site: 'RECIPES.thread, the ingredient RECIPES.cloth consumes',
  },
  weaving: {
    summary: 'Woven cloth: warmer than a bare hide, and the first thing worth trading for its own sake.',
    site: 'BUILDINGS.loom and RECIPES.cloth; NeedsSystem, via warmthFrom, when cloth is in the pack',
  },
  sickle: {
    summary: 'A hafted blade instead of bare hands: a field stripped in less of a day.',
    site: 'Tech.reapFactor, read by ActionSystem.doReap',
  },
  masonry: {
    summary: 'Coursed stone walls: the best roof anybody can raise with hand tools.',
    site: 'BUILDINGS.stone_house',
  },
  wattle_daub: {
    summary: 'A woven wall daubed over: faster to raise than a mud hut, and warmer for it.',
    site: 'BUILDINGS.wattle_hut',
  },
  calendar: {
    summary: 'Sowing timed to a tally instead of to guesswork: more off the same ground.',
    site: 'Tech.calendarFactor, read by ActionSystem.doReap',
  },
  the_wheel: {
    summary: 'A cart: what a strap and a basket carry, and a cartload more on top.',
    site: 'Person.carryCapacity, via carryFactor, when a cart is in the pack',
  },
  bread: {
    summary: 'Meal baked into bread: more nourishing than the meal it is made from, and it keeps as well.',
    site: 'BUILDINGS.oven and RECIPES.bread',
  },
  herding: {
    summary: 'A fenced herd: meat that breeds on its own, culled instead of hunted.',
    site: 'BUILDINGS.pen, via BuildingDef.herd; Simulation.workHerds',
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
  if (!idea) return 0;
  if (idea.stage === 'prototyped') return PROTOTYPE_POWER;
  // A practice has nothing to build, so the moment there is enough of an idea
  // to try is the moment it starts working — clumsily, at the same half
  // strength a built prototype gets, and for exactly the same reason: the
  // world has to use the thing to find out whether it is any good.
  //
  // Without this, two practices could never be tried at all. `tend` is offered
  // only to somebody with `techPower('herbalism') > 0` and `tame` only with
  // `techPower('taming') > 0`, so the one action that counts as trying each of
  // them out was locked behind having already finished trying it out.
  if (TECH[tech].kind === 'practice' &&
      idea.stage === 'researching' && idea.insight >= PROTOTYPE_AT) {
    return PROTOTYPE_POWER;
  }
  return 0;
}

/**
 * Scales a bonus by how well its holder knows the technology behind it.
 *
 * Exported rather than kept private to this file once `KnowledgeSystem.teach`
 * needed the same "no effect at 0, `full` at a proven design, more past it
 * with refinement" curve for `storytelling`. Reusing it there is the point:
 * a second copy of `1 + (full - 1) * techPower` is how the two would drift
 * out of step with what "half-learned" means everywhere else in the game.
 */
export function scaled(person: Person, tech: Tech, full: number): number {
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
  // A net multiplies a fishing spot rather than replacing the spear, and it is
  // gated on *carrying* one as well as on knowing how to make one. Both halves
  // matter: knowledge alone would make the recipe pointless, and the item alone
  // is the `handaxe` bug — a tool that works identically in the hands of
  // somebody who could not have made it, and that refinement never improves.
  if (nodeKind === 'fish') {
    const net = person.inventory.has('net') ? scaled(person, 'netting', 1.7) : 1;
    return scaled(person, 'fishing', 1.5) * net;
  }
  return scaled(person, 'plant_lore', 1.3);
}

/**
 * Multiplier on how much a person can carry at once.
 *
 * Cordage is the strap and applies always; the basket has to be in the pack.
 * See the note in `forageYieldFactor` on why both gates are there.
 */
export function carryFactor(person: Person): number {
  const basket = person.inventory.has('basket') ? scaled(person, 'basketry', 1.3) : 1;
  // M11 phase 10: `the_wheel`'s cart, on the same double gate as the basket
  // and the net. The plan's table also credits it with speed on `doHaul`, but
  // nothing in this game slows a laden walker down in the first place — there
  // is no ladenness penalty for a cart to answer — so claiming one here would
  // be a comment asserting a mechanism that does not exist. Capacity alone is
  // the honest half of the historical claim.
  const cart = person.inventory.has('cart') ? scaled(person, 'the_wheel', 1.5) : 1;
  return scaled(person, 'cordage', 1.25) * basket * cart;
}

/** Multiplier on the nutrition of anything eaten. */
export function nutritionFactor(person: Person): number {
  return scaled(person, 'cooking', 1.35);
}

/** Multiplier on how fast building work goes. */
export function buildFactor(person: Person): number {
  // M11 phase 10: `ground_stone`'s second tool, double-gated on carrying an
  // adze the same way the basket and the net already are — knowing how to
  // grind one is not enough, and an adze in the hands of somebody who could
  // not have made it is the `handaxe` bug one node along.
  const adze = person.inventory.has('adze') ? scaled(person, 'ground_stone', 1.2) : 1;
  return scaled(person, 'carpentry', 1.3) * adze;
}

/**
 * Multiplier on the work required to fell a tree, read by `ActionSystem.doChop`
 * and mirrored in `Progress.workProgressOf` so the progress bar never lies to
 * whoever is holding the axe.
 *
 * `hafting` used to be tested by `inventory.has('handaxe')` alone, unscaled by
 * `techPower` — the exact defect `m8_plan_the_ages.md` names under "three
 * repairs to make while passing", left until `ground_stone` gave the bug a
 * second axe to double it. A person picks the better of the two they are
 * carrying rather than stacking them, because two axes do not fell a tree
 * twice as fast — only one is swinging.
 */
export function axeFactor(person: Person): number {
  let best = 1;
  if (person.inventory.has('handaxe')) {
    best = Math.min(best, scaled(person, 'hafting', 0.5));
  }
  if (person.inventory.has('stone_axe')) {
    best = Math.min(best, scaled(person, 'ground_stone', 0.35));
  }
  return best;
}

/**
 * Multiplier on the work required to bring in a ripe field, read by
 * `ActionSystem.doReap`. The same double gate as `axeFactor`: `sickle` alone
 * teaches nothing about stripping a field by hand.
 */
export function reapFactor(person: Person): number {
  return person.inventory.has('sickle') ? scaled(person, 'sickle', 0.6) : 1;
}

/**
 * Multiplier on what a harvest yields, read by `ActionSystem.doReap` beside
 * `techPower('farming')`. `calendar` is a practice — there is nothing to
 * carry, unlike `sickle` — so this has no item gate.
 */
export function calendarFactor(person: Person): number {
  return scaled(person, 'calendar', 1.2);
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
  // M8.1's third term, and the largest of the three, because a sewn coat is the
  // largest of the three. Double-gated on carrying one as well as on knowing
  // how — the rule the basket and the net already follow, and the one
  // `handaxe` still breaks.
  const furs = person.inventory.has('fur_coat')
    ? 0.4 * techPower(person, 'tailoring')
    : 0;
  // M11 phase 10's fourth term. Named `woven` rather than `cloth`, which this
  // function already uses for the `clothing` technology's own multiplier —
  // reusing the name would have shadowed one silently.
  const woven = person.inventory.has('cloth')
    ? 0.25 * techPower(person, 'weaving')
    : 0;
  return 1 - (1 - fire) * (1 - cloth) * (1 - furs) * (1 - woven);
}

// ---------------------------------------------------------------------------
// Eras
// ---------------------------------------------------------------------------

/**
 * Eras, named by the archaeological period they correspond to.
 *
 * `heldBy` is the fraction of living adults who must know *all* of the listed
 * techs. Fractions rather than counts because an era is about a society, and
 * because it lets the world fall back down the list when a generation dies
 * badly — which is the whole reason to model it this way.
 *
 * ## Why the real period names, and not "the Age of Fire"
 *
 * The ladder used to read stone → fire → hearth → tools → craft → building:
 * evocative, invented, and saying nothing true. The project owner asked for the
 * real archaeological periods, and the evocative line each rung already had
 * survives as its `description`, which is where it was always doing its work.
 * The rungs are now the same vocabulary as `TechDef.age`, so the period the HUD
 * names and the ring the tech web draws a node on are the same word.
 *
 * ## The Neolithic rung, and why it waited
 *
 * A rung whose `needs` name a technology nobody can learn is a rung no world
 * can ever reach — declared content that does nothing, which is the defect
 * this project checks for in `techs-have-effects` — so the Neolithic rung
 * waited for `farming`, `herding` and `masonry`, the last of which landed in
 * M11 phase 10's third commit. `eras-name-only-real-technologies` is what
 * would have caught it arriving early.
 *
 * Everything above the Neolithic is still planned rather than built — see
 * `docs/m8_plan_the_ages.md` — and stays off this ladder for the same reason.
 *
 * ## Two deliberate departures from the table in the plan
 *
 * **A Middle Palaeolithic rung**, which the plan's table did not have. Without
 * it, a band that has carried fire for three generations is still reported as
 * Lower Palaeolithic, and the one rung a world reliably climbs in a twelve-day
 * run would have stopped existing. Habitual, controlled fire is the textbook
 * marker of the period, so the rung is honest as well as useful.
 *
 * **The Mesolithic asks for `netting` where the plan asked for `preserving`**,
 * because `preserving` is the one node of M8.1's fourteen that was deliberately
 * held back — see `docs/next-steps.md` §0b, spoilage is built and switched off.
 * Nets and the fish they take are as Mesolithic as anything in the tier, and
 * the rung can be revisited if spoilage is ever switched on.
 */
export interface EraDef {
  /** One of `AGES`: the ladder and `TechDef.age` share a vocabulary. */
  id: AgeId;
  label: string;
  needs: Tech[];
  heldBy: number;
  description: string;
}

/**
 * The rungs, without their labels: the label is `AGE_LABELS[id]` and is written
 * once, in the period list, rather than twice here.
 */
const ERA_LADDER: Omit<EraDef, 'label'>[] = [
  {
    id: 'lower_palaeolithic', needs: [], heldBy: 0,
    description: 'Flint, sticks and what the land offers.',
  },
  {
    id: 'middle_palaeolithic', needs: ['firemaking'], heldBy: 0.35,
    description: 'Warmth that travels, and the night pushed back.',
  },
  {
    id: 'upper_palaeolithic',
    needs: ['firemaking', 'cooking', 'hafting', 'clothing'], heldBy: 0.35,
    description: 'Fire carried, hide sewn, and a winter night that can be survived.',
  },
  {
    id: 'mesolithic',
    needs: ['firemaking', 'cooking', 'hafting', 'clothing', 'fishing', 'netting', 'bow'],
    heldBy: 0.3,
    description:
      'The bow, the net and the snare — food you go and take rather than food ' +
      'you find.',
  },
  {
    id: 'neolithic',
    needs: [
      'firemaking', 'cooking', 'hafting', 'clothing', 'fishing', 'netting', 'bow',
      'farming', 'herding', 'pottery', 'masonry',
    ],
    // The same 0.3 as the Mesolithic, per the plan's own table — not raised
    // for having four more technologies in the list. `heldBy` asks what
    // fraction of adults hold *every* listed technology, so a longer list is
    // already harder to satisfy at an unchanged fraction; compounding that
    // with a higher bar as well would make the Neolithic much harder to enter
    // than the rung below it for reasons that have nothing to do with how
    // widely spread the knowledge needs to be.
    heldBy: 0.3,
    description:
      'Seed saved from one year to sow the next, and a herd that comes back ' +
      'on its own legs. The band stops moving to the food.',
  },
];

export const ERAS: EraDef[] = ERA_LADDER.map(rung => ({ ...rung, label: AGE_LABELS[rung.id] }));

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
