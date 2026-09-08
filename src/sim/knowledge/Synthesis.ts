/**
 * Where ideas come from.
 *
 * The tree is not a tree. Technologies sit in a web, and what puts one into
 * somebody's head is a *combination*: a thing you know together with a thing in
 * your hands, a thing underfoot, a thing on your mind, a thing you watched
 * happen. Holding a vegetable while knowing fire suggests putting the two
 * together, and cooking is conceived — not understood, not mastered, still to
 * be prototyped and tested. Holding an animal's fur while cold suggests
 * wrapping it round yourself.
 *
 * That is what this file is for. A `Spark` is one route to an idea; a
 * technology has several, and different bands arrive at the same thing for
 * different reasons. Converging routes and cross-area ingredients are where the
 * web comes from — not runtime generation. Nodes stay hand-authored with
 * hand-written effects, because an emergent node's effect cannot be authored
 * and that would break the rule that no node ships inert.
 *
 * ## `requires` and `sparks` answer different questions
 *
 * `TechDef.requires` is the scaffolding you must already have to *understand*
 * a thing. It gates teaching, observation and conception alike, and it is what
 * keeps the graph acyclic and every node reachable.
 *
 * `sparks` is the situation that makes it *occur to you*. It gates conception
 * only. Collapsing the two would lose both: a person can be perfectly equipped
 * to understand clothing and never think of it, and that is the interesting
 * case.
 */
import type { Tech } from './Tech.ts';
import type { Need } from '../entities/Person.ts';
import type { Biome } from '../core/World.ts';
import type { Season } from '../core/TimeManager.ts';

/**
 * Something that can be true of a person at a moment.
 *
 * Every payload is a plain string id rather than an enum member, which is what
 * makes the table readable — and is also why `spark-ingredients-are-real`
 * exists. A misspelt item id here would be a technology that can never be
 * conceived, passing every other test in the suite, exactly the way
 * `requiresTech: 'carpentry'` made the longhouse permanently unbuildable.
 */
export type Ingredient =
  | { kind: 'knows'; tech: Tech }
  | { kind: 'holding'; item: string }
  | { kind: 'doing'; action: string }
  | { kind: 'feeling'; need: Need }
  | { kind: 'place'; biome: Biome }
  | { kind: 'saw'; what: string }
  | { kind: 'season'; season: Season };

/** One route to an idea. */
export interface Spark {
  needs: Ingredient[];
  /** Relative likelihood against the other sparks competing for one head. */
  weight: number;
  /** The chronicle line when this is the route that fired. */
  story: string;
}

/**
 * Everything about a person that could set an idea off, gathered once a day.
 *
 * Sets rather than the person themselves, because two of these senses did not
 * exist before this milestone and neither is a plain field: what somebody has
 * been *doing* is a decayed tally, and what they *saw* is assembled from
 * firsthand memory and from the reasons their own work kept stopping.
 */
export interface Notice {
  knows: ReadonlySet<string>;
  holding: ReadonlySet<string>;
  lately: ReadonlySet<string>;
  feeling: ReadonlySet<string>;
  place: Biome;
  saw: ReadonlySet<string>;
  season: Season;
}

/** True if one ingredient of a spark is present. */
export function satisfies(ingredient: Ingredient, notice: Notice): boolean {
  switch (ingredient.kind) {
    case 'knows': return notice.knows.has(ingredient.tech);
    case 'holding': return notice.holding.has(ingredient.item);
    case 'doing': return notice.lately.has(ingredient.action);
    case 'feeling': return notice.feeling.has(ingredient.need);
    case 'place': return notice.place === ingredient.biome;
    case 'saw': return notice.saw.has(ingredient.what);
    case 'season': return notice.season === ingredient.season;
  }
}

/** True if every ingredient of a spark is present at once. */
export function sparkFires(spark: Spark, notice: Notice): boolean {
  return spark.needs.every(ingredient => satisfies(ingredient, notice));
}

/**
 * Which ingredients of a spark are present and which are missing.
 *
 * Phase 2 does not read this; the tech web does, to answer "why not" on a node
 * the player is hovering — "you know fire; you are not holding clay". It lives
 * here rather than in the UI because the answer must come from the same
 * predicate that decides whether the spark actually fires, or the panel will
 * eventually start lying about the simulation.
 */
export function sparkStatus(
  spark: Spark,
  notice: Notice
): { met: Ingredient[]; missing: Ingredient[] } {
  const met: Ingredient[] = [];
  const missing: Ingredient[] = [];
  for (const ingredient of spark.needs) {
    (satisfies(ingredient, notice) ? met : missing).push(ingredient);
  }
  return { met, missing };
}

/**
 * One ingredient in words, as a plain noun phrase.
 *
 * Lives here beside the predicate that tests it rather than in the panel that
 * shows it, so that the answer the tech web gives to "why has this not occurred
 * to me?" is phrased from the same table the simulation decides on. A UI with
 * its own copy of this vocabulary would drift from the data the first time
 * somebody added an ingredient, and the panel would go on confidently
 * describing a spark that no longer exists.
 *
 * Neutral person, deliberately: the web can be opened on somebody else, and
 * "you are holding a hide" is wrong when the answer is about your daughter.
 */
export function describeIngredient(
  ingredient: Ingredient,
  labelFor: (kind: 'tech' | 'item', id: string) => string
): string {
  switch (ingredient.kind) {
    case 'knows': return 'knowing ' + labelFor('tech', ingredient.tech).toLowerCase();
    case 'holding': return 'holding ' + labelFor('item', ingredient.item).toLowerCase();
    case 'doing': return 'having been ' + DOING_WORDS[ingredient.action];
    case 'feeling': return FEELING_WORDS[ingredient.need] ?? ingredient.need;
    case 'place': return PLACE_WORDS[ingredient.biome] ?? ('on ' + ingredient.biome);
    case 'saw': return 'having ' + (SAW_WORDS[ingredient.what] ?? 'seen ' + ingredient.what);
    case 'season': return 'in ' + ingredient.season;
  }
}

/**
 * The verbs, as something that reads in a list.
 *
 * Falls back to the raw id rather than throwing, because a missing entry here
 * should degrade to a slightly clumsy sentence and not to a blank panel — but
 * `synthesis.test.ts` asserts every action a spark actually names has one, so
 * the fallback is for verbs no spark uses.
 */
const DOING_WORDS: Record<string, string> = {
  forage: 'foraging', gather: 'gathering', pick: 'picking fruit', chop: 'felling trees',
  hunt: 'hunting', build: 'building', haul: 'hauling materials', store: 'storing goods',
  craft: 'making things', wander: 'walking the country', talk: 'talking',
  teach: 'teaching', take: 'living out of the store', drink: 'fetching water',
  eat: 'eating', rest: 'resting', sleep: 'sleeping', shelter: 'sheltering',
  give: 'giving things away', steal: 'stealing', attack: 'fighting',
  court: 'courting', ponder: 'thinking', discuss: 'arguing things out',
  prototype: 'building the first one', flee: 'running away', goto: 'walking',
};

const FEELING_WORDS: Record<string, string> = {
  cold: 'being cold', hunger: 'being hungry', thirst: 'being thirsty',
  fatigue: 'being worn out', company: 'being lonely',
};

const PLACE_WORDS: Record<string, string> = {
  forest: 'standing in woodland', grass: 'standing on open grass',
  hills: 'standing in the hills', beach: 'standing on the shore',
  rock: 'standing on bare rock', water: 'standing at the water',
};

const SAW_WORDS: Record<string, string> = {
  // Deeds, from `social/Events.ts`.
  gift: 'watched a gift given', share_food: 'watched food shared',
  help: 'watched somebody helped', talk: 'listened to people talking',
  trade: 'watched a trade', teach: 'watched somebody taught',
  theft: 'witnessed a theft', assault: 'witnessed a beating',
  murder: 'witnessed a killing',
  // Reasons their own work stopped, from `ActionSystem`.
  hands_full: 'run out of hands', quarry_escaped: 'lost an animal in the chase',
  node_empty: 'worked a place until nothing was left',
  long_enough: 'worked a whole day at one thing',
  cold: 'given up on a day of work for the cold',
  hungry: 'broken off work to eat', thirsty: 'broken off work to drink',
  tree_bare: 'stripped a tree bare', under_attack: 'been set upon at work',
  store_empty: 'gone to the store and found it bare',
  store_full: 'had nowhere left to put a surplus',
};

// ---------------------------------------------------------------------------
// The lifecycle of an idea
// ---------------------------------------------------------------------------

/**
 * Where an idea has got to.
 *
 * Research is a lifecycle rather than a dice roll, and every stage is a place
 * it can stall: conceived and never worked on, researched and never built,
 * built and never made to work. `proven` is not the end — a proven design is
 * still being refined, and the idea only retires at its ceiling.
 */
export type IdeaStage = 'conceived' | 'researching' | 'prototyped' | 'proven';

export interface Idea {
  tech: Tech;
  stage: IdeaStage;
  /**
   * 0-1, moved in *jumps* by breakthroughs rather than accruing smoothly.
   *
   * The jump is the whole point: a bar that creeps up a hundredth at a time is
   * a progress bar, and a bar that lurches when somebody finally sees it is an
   * event you can put a floater and a chronicle line on.
   */
  insight: number;
  /** The spark that started it, in words, for the chronicle and the panel. */
  story: string;
  conceivedTick: number;
  /** Ticks of thinking and talking spent on it, for the panel. */
  effort: number;
  /** Who has been talked to about it; a second conversation is worth far less. */
  discussedWith: number[];
  /**
   * Trials held so far, and how far they have got towards proving the design.
   *
   * `proof` only ever goes up. The first version of this was a single
   * all-or-nothing roll: one pass proved a design outright, and one failure cost
   * a quarter of the insight, set the stage back to `researching` **and left
   * the prototype materials spent**, so a second attempt at cordage wanted
   * another three thatch. From inside the game that is indistinguishable from
   * being stuck — the panel said "Needs 3 thatch to build one" for the third
   * time and nothing anywhere showed that the last two trials had happened.
   *
   * A failed trial still teaches you something, so it still adds progress, just
   * far less of it. The design gets there either way; bad luck decides how long
   * it takes, not whether it happens.
   */
  trials: number;
  proof: number;
  failedTests: number;
}

/**
 * Where an idea has got to, in the player's words.
 *
 * Beside `IdeaStage` rather than in the HUD because two panels show it — the
 * Self tab and the tech web — and a second copy of this vocabulary is a second
 * copy that can drift out of step with the stages it names. Same reasoning as
 * `describeIngredient` below: the words live beside the thing they describe.
 */
export const STAGE_LABELS: Record<IdeaStage, string> = {
  conceived: 'just an idea',
  researching: 'working it out',
  prototyped: 'built, and being tried',
  proven: 'refining',
};

/** Nobody dabbles at everything. Two ideas at a time, and no more. */
export const MAX_IDEAS = 2;

/** Insight at which there is enough of a design to be worth building one. */
export const PROTOTYPE_AT = 0.6;

/**
 * How much of a technology's effect a prototype delivers.
 *
 * Above zero, because an untested design has to actually be *used* for the
 * world to find out whether it works — a prototype nothing reads is just a
 * longer wait. Well below one, because it does not work properly yet.
 */
export const PROTOTYPE_POWER = 0.5;

/** What one level of refinement adds to `techPower`. */
export const REFINEMENT_STEP = 0.2;
