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
  failedTests: number;
}

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
