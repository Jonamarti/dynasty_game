/**
 * Executes whatever action was chosen: walk there, then do the thing.
 *
 * Actions are deliberately short. Long plans go stale in a world where someone
 * else may have eaten the berries first, so a person commits only until the
 * next think tick, at which point the brain re-scores from current reality.
 *
 * The social actions all follow one shape — close the distance, then act, then
 * emit an event — because the event is the whole point. Nothing here writes a
 * reputation number; it announces what happened and lets everyone who saw it
 * draw their own conclusions.
 */
import type { Person } from '../entities/Person.ts';
import type { ResourceNode } from '../entities/ResourceNode.ts';
import type { World } from '../core/World.ts';
import { Arrival, type MovementSystem } from './MovementSystem.ts';
import { companionBonus } from './WildlifeSystem.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { SocialSystem } from '../social/SocialSystem.ts';
import { isTrap, type Building } from '../entities/Building.ts';
import type { Tree } from '../entities/Tree.ts';
import type { Animal } from '../entities/Animal.ts';
import type { ItemPile } from '../entities/ItemPile.ts';
import type { KnowledgeSystem } from './KnowledgeSystem.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';
import type { RNG } from '../core/RNG.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES, hasIngredients } from '../entities/Recipe.ts';
import {
  INSCRIPTIONS, type Inscription, type InscriptionDef, type InscriptionForm,
} from '../entities/Inscription.ts';
import type { NeedsConfig } from '../core/Config.ts';
import { telemetry } from '../core/Telemetry.ts';
import {
  TECH, buildFactor, forageYieldFactor, nutritionFactor, prerequisitesMet, tallyFactor,
  techPower, weaponOf, armourOf, type Tech,
} from '../knowledge/Tech.ts';
import { PROTOTYPE_AT, type Idea } from '../knowledge/Synthesis.ts';

export interface ActionContext {
  world: World;
  movement: MovementSystem;
  nodesById: Map<number, ResourceNode>;
  buildingsById: Map<number, Building>;
  treesById: Map<number, Tree>;
  animalsById: Map<number, Animal>;
  /** Called when an animal is killed, so the world can take it out. */
  onAnimalKilled: (animal: Animal, hunter: Person) => void;
  knowledge: KnowledgeSystem;
  relationships: RelationshipGraph;
  /** Called when a tree is felled, so the world can remove it. */
  onTreeFelled: (tree: Tree, feller: Person) => void;
  peopleById: Map<number, Person>;
  peopleHash: SpatialHash<Person>;
  social: SocialSystem;
  rng: RNG;
  tick: number;
  sightRadius: number;
  /** Whether it is dark out. Sleep ends at dawn; nothing else reads it yet. */
  isNight: boolean;
  /** Need rates, so an interruption can look one work cycle ahead. */
  needs: NeedsConfig;
  /** Puts goods on the ground, for yields nobody has room to carry. */
  dropAt: (x: number, y: number, itemId: string, count: number) => void;
  pilesById: Map<number, ItemPile>;
  /**
   * Takes goods off a heap on the ground, as far as the carrier has room.
   *
   * A callback into `Simulation.takeFromPile` rather than a transfer written
   * out here, because emptying a heap has to remove it from the world and its
   * spatial hash, and that is the world's business rather than an action's.
   */
  takeFromPile: (
    person: Person, pile: ItemPile, itemId?: string, count?: number
  ) => number;
  /** Everything written down anywhere, so nobody cuts the same word twice. */
  recorded: ReadonlySet<string>;
  inscriptionsById: Map<number, Inscription>;
  /** The record under a point, if there is one within arm's reach. */
  inscriptionAt: (x: number, y: number) => Inscription | null;
  /** The *half-cut* record under a point. Records stack; see `inscriptionAt`. */
  unfinishedAt: (x: number, y: number) => Inscription | null;
  /** Whether a point is under a finished library's roof. */
  inLibrary: (x: number, y: number) => boolean;
  /** Notes that a technology is now being written down somewhere. */
  claimRecord: (tech: string) => void;
  /** Cuts a new record. Returns null if the ground will not take one. */
  inscribe: (
    form: InscriptionForm, x: number, y: number, author: Person
  ) => Inscription | null;
  /**
   * Called whenever an action ends for a reason, so the world can tell the
   * player about it.
   *
   * Every reason this file produces used to be a telemetry counter and nothing
   * else, which meant that from inside the game an order simply stopped and the
   * character went back to thinking. A simulation that knows exactly why it
   * refused you and does not say is worse than one that does not know.
   */
  onStopped: (person: Person, action: string, reason: string) => void;
  /**
   * Announces a breakthrough, a prototype built, or a design improved.
   *
   * The same channel `KnowledgeSystem` reports through. Research is deliberately
   * lumpy — insight moves in jumps rather than creeping — precisely so that
   * there is a moment worth announcing, and a moment nobody is told about is
   * not a moment.
   */
  onInsight: (person: Person, text: string, kind: 'idea' | 'gain' | 'setback') => void;
}

/** How close two people must be to hand something over, or land a blow. */
const REACH = 1.6;

/**
 * Ticks a conversation occupies.
 *
 * At `ticksPerDay` 240 a tick is six in-game minutes, so this is four and a
 * half hours — not the "half an hour" this comment used to claim, which was
 * wrong by a factor of nine and is very likely why the social layer reads as
 * sparse. Deliberately left alone for now: `next-steps.md` §O1 replaces the
 * single conversation with several modes at several costs, and changing the
 * number here first would only move the problem.
 */
const TALK_TICKS = 45;

/** Ticks to hand something over and be thanked for it. */
const GIVE_TICKS = 15;

/** Ticks a courtship visit takes. Longer than a conversation; it is one. */
const COURT_TICKS = 60;

/** Ticks to show somebody how a thing is done. Longer than any conversation. */
const TEACH_TICKS = 90;

/**
 * Ticks of sitting and turning a problem over.
 *
 * Long, because thinking should cost a visible part of a day and compete with
 * foraging for it. Not so long that it cannot finish between two meals: a
 * stretch of work that always ends in an interruption is a stretch of work that
 * never pays out, and the person doing it would simply be worse off than a
 * neighbour who never had an idea.
 */
const PONDER_TICKS = 150;

/** Ticks spent arguing a problem out with somebody who knows something. */
const DISCUSS_TICKS = 70;

/** Ticks to build the first one of a thing. */
const PROTOTYPE_TICKS = 120;

/**
 * Ticks to get one thing off a record.
 *
 * Shorter than being taught it, and much shorter than working it out: the
 * hard part of reading was learning to read. It is scaled by `teach`, which is
 * this world's skill for putting things into and taking them out of words.
 */
const READ_TICKS = 110;

/**
 * How much better thinking goes under a library's roof.
 *
 * Deliberately a multiplier on the whole chance rather than a term added to
 * it, so it helps a dull person and a brilliant one in the same proportion. A
 * flat bonus would have made the building matter enormously to somebody with no
 * wits and not at all to somebody with plenty.
 */
const LIBRARY_INSIGHT = 1.35;

/**
 * How much insight a breakthrough is worth.
 *
 * A jump, not a trickle. Insight that accrued smoothly made research a progress
 * bar; insight that lurches when somebody finally sees it makes research a
 * series of events, each of which can carry a floater and a chronicle line.
 */
const BREAKTHROUGH = 0.22;

/**
 * What a second conversation with the same person about the same idea is worth.
 *
 * Sharply reduced, because a partner has a finite amount to offer on one
 * problem. Without this, two people would sit in a field discussing hafting
 * until one of them starved, and it would have been the optimal thing to do.
 */
const REPEAT_DISCUSSION = 0.35;

/** How `interruption` should be asked. See the comments on it. */
interface InterruptionOptions {
  /** Ticks of work still to come, so the check can look one cycle ahead. */
  lookaheadTicks?: number;
  /** True for work that does not need pack room until it finishes. */
  ignoreLaden?: boolean;
  /**
   * The need this job is *answering*, if any.
   *
   * Passed by the caller rather than read off `person.action`, because only the
   * caller knows: `forage` is picking berries at one bush and knapping flint at
   * the next, and only one of those is food.
   */
  answers?: LethalNeed;
}

/** No single stretch of work runs longer than this, whatever else is true. */
const MAX_WORK_STRETCH = 900;

/**
 * The need levels at which a stretch of work is broken off.
 *
 * Exported because `Brain` has to be able to ask the same question before it
 * starts somebody on a long job. Crafting is the case that forced this out into
 * the open: it is one long pull rather than a run of short ones, so the check
 * fires *during* the work, and a scorer that did not know where the line was
 * would arm a two-hundred-tick timer for somebody one point over it, watch them
 * be stopped on the next tick, and choose the same thing again — a hundred
 * abandoned attempts for every finished axe.
 *
 * Two copies of these numbers would drift, and the drift would show up as that
 * same thrash months later with nothing to point at.
 */
export type LethalNeed = 'thirst' | 'hunger' | 'cold';

/**
 * How far a need may go before it stops a job that is *answering* it.
 *
 * The reported symptom was a forager who kept downing tools. Picking berries is
 * how you stop being hungry, so being hungry is a poor reason to stop picking
 * berries. Near the critical line (85) rather than at it, so somebody who
 * genuinely cannot feed themselves where they are standing still gives up and
 * goes to look elsewhere instead of starving at the bush.
 *
 * This is also what keeps the base limits honest. Those are where a need
 * *parks*, so raising them raises the whole population's average hunger and
 * thirst; this raises the ceiling only for the person actually doing something
 * about it, which costs nothing on the average.
 */
const ANSWERING_LIMIT: Record<LethalNeed, number> = { hunger: 90, thirst: 90, cold: 80 };

/**
 * Most a nearly-finished pull may push past the line, in need points.
 *
 * The honest half of a rule `bugs.md` recorded as untunable: because the limits
 * are absolute need levels, whether a job is *ever* interrupted depends on how
 * long it runs, so berries looked uninterruptible and flint looked hopeless
 * under identical code. Lookahead fixed the near end of that. This fixes the far
 * end, by letting the last tenth of a stretch finish rather than throwing it
 * away one pull short of the end.
 */
const NEARLY_DONE_SLACK = 10;

/** Extra room for work the player actually asked for, in need points. */
const ORDERED_SLACK = 6;

/**
 * Where work stops, for this person, on this job, right now.
 *
 * This was a flat `WORK_LIMITS` triple, and the base of it still is —
 * `Config.needs.workLimits`, so a scenario can move it. What sits on top is the
 * answer to the owner's report that people stop working far too readily.
 *
 * **The base numbers are low on purpose and must stay lowish.** A need parks at
 * whatever line stops it: work continues right up to the limit and ends there,
 * so wherever these sit is where the population's average hunger and thirst
 * settle. An early build put them near the lethal line and a healthy band was
 * carrying 82 thirst inside a fortnight. Every modifier here is therefore a
 * *per-job exception* rather than a raise, which is what lets somebody push on
 * without moving the average.
 */
export function workLimit(
  person: Person,
  need: LethalNeed,
  limits: NeedsConfig['workLimits'],
  answers?: LethalNeed
): number {
  if (answers === need) return ANSWERING_LIMIT[need];
  return limits[need] +
    NEARLY_DONE_SLACK * person.pullProgress() +
    (person.order !== null ? ORDERED_SLACK : 0);
}

/**
 * True if a need is already past the point where work stops.
 *
 * Deliberately without the lookahead `interruption` applies: this answers "is it
 * sensible to begin?", not "will the next cycle carry them over?". It asks
 * `workLimit` rather than keeping a second copy of the numbers.
 *
 * Exported because `Brain` has to ask the same question before it starts
 * somebody on a long job. Crafting forced this into the open: it is one long
 * pull rather than a run of short ones, so the check fires *during* the work,
 * and a scorer that did not know where the line was would arm a two-hundred-tick
 * timer for somebody one point over it, watch them stop on the next tick, and
 * choose the same thing again — 786 abandoned attempts against 10 finished axes.
 */
export function pressedByNeed(
  person: Person,
  limits: NeedsConfig['workLimits'],
  answers?: LethalNeed
): boolean {
  return person.needs.thirst > workLimit(person, 'thirst', limits, answers) ||
    person.needs.hunger > workLimit(person, 'hunger', limits, answers) ||
    person.needs.cold > workLimit(person, 'cold', limits, answers);
}

/** Ticks to take something that is not yours without being obvious about it. */
const STEAL_TICKS = 30;

/** Ticks before a person will deliberately approach anyone again. */
const SOCIAL_COOLDOWN = 220;

/**
 * Fatigue restored per tick of real sleep.
 *
 * Well above `rest`'s 0.35: lying down in a hut for the night should clear a
 * day's tiredness, where dozing in a field only takes the edge off.
 */
const SLEEP_RECOVERY = 0.9;

/** Ticks between blows. Long enough that a fight is watchable and escapable. */
const ATTACK_WINDUP = 12;

/** Beyond this the attacker gives up the chase. */
const PURSUIT_LIMIT = 9;

/**
 * Opinion the attacker recovers toward their victim with each blow landed.
 *
 * Violence has to *discharge* the grudge that motivated it, or every quarrel
 * ends in a body. Without this, hitting someone left the attacker exactly as
 * angry as before, so the only way a fight could end was for one party to die —
 * and a band of thirty lost fifteen people to murder in three months.
 */
const GRUDGE_DISCHARGE = 9;

/**
 * M8.1's three verbs, in numbers.
 *
 * `PLAY_TICKS` is well under the roughly-140 ceiling `AGENTS.md` sets for a
 * single uninterrupted pull, so playing needs nothing banked. `EARSHOT` is
 * wider than `sightRadius` on purpose — a tune carries further than a look —
 * and it is what makes one flute worth having in a band of ten. `PLAY_RELIEF`
 * is per tick and per listener, so a whole tune is worth rather more than a
 * conversation to the player and rather less to each person hearing it, which
 * is the right shape: music is not a substitute for being spoken to.
 */
const PLAY_TICKS = 120;
const EARSHOT = 16;
const PLAY_RELIEF = 0.35;

/**
 * Health mended per tick of being tended, before skill and refinement.
 *
 * Against `needs.recoveryRate` of 0.02 this is about thirty times as fast, and
 * it should be: the alternative is lying still for a week. A full recovery from
 * near death still takes several hundred ticks of somebody else's time, which
 * is what stops a healer from being a switch that turns injury off.
 */
const TEND_RATE = 0.6;

export class ActionSystem {
  execute(person: Person, ctx: ActionContext): void {
    if (!person.alive) return;

    switch (person.action) {
      case 'drink': this.doDrink(person, ctx); break;
      case 'eat': this.doEat(person, ctx); break;
      case 'forage':
      case 'gather': this.doHarvest(person, ctx); break;
      case 'pick': this.doPickFruit(person, ctx); break;
      case 'chop': this.doChop(person, ctx); break;
      case 'hunt': this.doHunt(person, ctx); break;
      case 'rest': this.doRest(person); break;
      case 'flee': this.doFlee(person, ctx); break;
      case 'haul': this.doHaul(person, ctx); break;
      case 'build': this.doBuild(person, ctx); break;
      case 'store': this.doStore(person, ctx); break;
      case 'take': this.doTake(person, ctx); break;
      case 'pickup': this.doPickup(person, ctx); break;
      case 'shelter': this.doShelter(person, ctx); break;
      case 'sleep': this.doSleep(person, ctx); break;
      case 'talk': this.doTalk(person, ctx); break;
      case 'court': this.doCourt(person, ctx); break;
      case 'teach': this.doTeach(person, ctx); break;
      case 'ask': this.doAsk(person, ctx); break;
      case 'craft': this.doCraft(person, ctx); break;
      case 'inscribe': this.doInscribe(person, ctx); break;
      case 'read': this.doRead(person, ctx); break;
      case 'ponder': this.doPonder(person, ctx); break;
      case 'discuss': this.doDiscuss(person, ctx); break;
      case 'prototype': this.doPrototype(person, ctx); break;
      case 'give': this.doGive(person, ctx); break;
      case 'steal': this.doSteal(person, ctx); break;
      case 'attack': this.doAttack(person, ctx); break;
      // M8.1's three new verbs. All three answer something the world could not
      // answer before: loneliness for more than two people at once, being hurt
      // beyond waiting it out, and an animal that is neither food nor a threat.
      case 'play': this.doPlay(person, ctx); break;
      case 'tend': this.doTend(person, ctx); break;
      case 'tame': this.doTame(person, ctx); break;
      case 'goto':
        // A walk order. Identical to wandering except that arriving ends it,
        // so the person stands where they were sent.
        if (this.travel(person, ctx)) this.finish(person);
        break;
      case 'wander':
      default:
        // Nobody ordered a wander, so there is nothing to abandon and no
        // reason to report — nothing here goes through `travel`. `Blocked`
        // and `Arrived` both just end the leg the same way: `finish` puts
        // `action` back to `idle`, which is what lets the brain plan the next
        // one instead of a random hop trying to route around the failure
        // itself. This is also what stops the player's own character from
        // showing `action = 'walk'` forever after the keys are released:
        // `targetX/Y` are null by then, so `advance` reports `Arrived`
        // immediately and `finish` resets it.
        if (ctx.movement.advance(person, ctx.tick) !== Arrival.Moving) this.finish(person);
        break;
    }
  }

  /**
   * Ends the current action cleanly, releasing any player order with it.
   *
   * Also the one place a person's own history of what they have been doing is
   * written. Every ended action passes through here — `stop` and `abandon` both
   * delegate to it — so `noteDid` needs one call site rather than one per verb,
   * and a verb added later cannot forget to record itself.
   */
  private finish(person: Person): void {
    person.noteDid(person.action);
    person.clearTarget();
    person.clearOrder();
    person.action = 'idle';
    person.workedTicks = 0;
  }

  /** Ends a deliberate social act and starts the cooldown before the next. */
  private finishSocial(person: Person, tick: number): void {
    person.socialCooldownUntil = tick + SOCIAL_COOLDOWN;
    this.finish(person);
  }

  /** Abandons an action that turned out to be impossible. */
  /**
   * Gives up on an action because the world changed under it.
   *
   * Reports before finishing, because `finish` resets the action to `idle` and
   * the reason is only meaningful attached to what was being attempted.
   */
  private abandon(person: Person, reason: string, ctx: ActionContext): void {
    telemetry.count('abandoned_' + reason);
    ctx.onStopped(person, person.action, reason);
    // Recorded on the person as well as reported to the player. Being stopped
    // is one of the senses an idea can be built out of: somebody whose hands
    // keep being full is somebody who might think of a carrying strap.
    person.noteSaw(reason);
    this.finish(person);
  }

  /**
   * Advances one tick toward `person`'s target, for every action that walks
   * somewhere before doing something. Returns whether they have arrived.
   *
   * The one place that decides what `Arrival.Blocked` means for an action
   * somebody actually asked for: abandon it, with a reason, through the same
   * `onStopped` → floater path every other refusal already uses. `finish`
   * (via `abandon`) clears both the target and the order, which is what stops
   * a stuck walk under a player's order from freezing forever — `giveUp` used
   * to clear only the target, leaving the order standing with nothing left to
   * walk toward.
   *
   * Not reached by `case 'wander'`: nobody ordered a wander, so there is
   * nothing to abandon and no reason to report — see that case's own
   * handling of `Arrival.Blocked`.
   */
  private travel(person: Person, ctx: ActionContext): boolean {
    const arrival = ctx.movement.advance(person, ctx.tick);
    if (arrival === Arrival.Blocked) {
      this.abandon(person, 'cannot_reach', ctx);
      return false;
    }
    return arrival === Arrival.Arrived;
  }

  /**
   * Ends a stretch of work for a stated reason.
   *
   * The counterpart to `abandon`: nothing has gone wrong, the person has simply
   * had enough. Both routes report, because from the player's side "the tree is
   * gone" and "he stopped for a drink" are the same question — why did the thing
   * I asked for stop happening?
   */
  private stop(
    person: Person,
    reason: string,
    ctx: ActionContext,
    prefix = 'work_ended_'
  ): void {
    telemetry.count(prefix + reason);
    ctx.onStopped(person, person.action, reason);
    person.noteSaw(reason);
    this.finish(person);
  }

  // -------------------------------------------------------------------------
  // Survival
  // -------------------------------------------------------------------------

  private doDrink(person: Person, ctx: ActionContext): void {
    if (!this.travel(person, ctx)) return;

    // Movement stops within 0.6 tiles of the target, so the rounded position can
    // land on the tile next door. Test the neighbourhood rather than one tile,
    // otherwise people walk to the water's edge and then refuse to drink.
    if (!this.waterWithinReach(person.x, person.y, ctx)) {
      this.abandon(person, 'no_water', ctx);
      return;
    }
    person.needs.thirst = Math.max(0, person.needs.thirst - 6);
    // `drink` counts *ticks* spent drinking; `drink_finished` counts trips to the
    // water. Only the second answers "how often does somebody stop what they are
    // doing and go to the river?", which is the question the owner asked and
    // which nothing here could answer before.
    telemetry.count('drink');
    if (person.needs.thirst <= 0) {
      telemetry.count('drink_finished');
      this.finish(person);
    }
  }

  /**
   * True if water is within arm's reach of (x, y).
   *
   * The radius is 2, not 1, and the reason is worth keeping. Movement counts
   * "arrived" at 0.6 tiles from the target, so a person's rounded position can
   * be one tile off the shore tile they walked to — and the water is one further
   * tile beyond that. With a 3x3 test they reached the water's edge, were told
   * there was no water, gave up, and stood there until they died of thirst with
   * a lake two tiles away. It only failed sometimes, which is what made it look
   * like a balance problem rather than a bug.
   */
  private waterWithinReach(x: number, y: number, ctx: ActionContext): boolean {
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (ctx.world.isWater(cx + dx, cy + dy)) return true;
      }
    }
    return false;
  }

  private doEat(person: Person, ctx: ActionContext): void {
    const foodId = person.inventory.bestFood();
    if (!foodId) {
      this.abandon(person, 'no_food', ctx);
      return;
    }
    if (person.inventory.remove(foodId, 1) === 0) {
      this.abandon(person, 'no_food', ctx);
      return;
    }
    // Cooking makes food go further. It is the plainest possible payoff for
    // knowing something, and it compounds: a band that cooks needs a third less
    // forage than one that does not, and can therefore support more people on
    // the same ground.
    const cooked = nutritionFactor(person);
    person.needs.hunger = Math.max(
      0,
      person.needs.hunger - (ITEMS[foodId]?.nutrition ?? 0) * cooked
    );
    telemetry.count('eat');
    if (person.needs.hunger <= 0) this.finish(person);
  }

  /**
   * Why a stretch of work ends.
   *
   * Work used to stop after a single pull — a forager walked to a bush, took
   * one handful of berries and wandered off, which is both absurd to watch and
   * hopeless as an economy. People now keep at a job until something actually
   * stops them, and this is the list of things that do.
   */
  private interruption(
    person: Person,
    ctx: ActionContext,
    opts: InterruptionOptions = {}
  ): string | null {
    // Not every long action is gated by carrying capacity.
    //
    // Felling is the case that made this an option rather than a constant: a
    // tree needs pack room only at the instant the trunk drops, so a laden
    // woodcutter used to abort on the very first swing. Sleeping had the same
    // problem, and answers it by not using this function at all.
    if (!opts.ignoreLaden && person.isLaden) return 'hands_full';
    if (person.lastHarmedTick > ctx.tick - 40) return 'under_attack';

    // The thresholds here are the whole difficulty of letting work continue.
    //
    // A committed worker does not re-plan — that is the point — so these are the
    // *only* thing that lets a need reach them. They are no longer a flat triple:
    // `workLimit` keeps the low base — a need parks at whatever line stops it, so
    // the base is also where the population's averages settle — and adds per-job
    // exceptions on top. A job that answers the need does not stop for it, a
    // nearly-finished pull gets to finish, and work the player asked for is given
    // a little more rope.
    //
    // `lookaheadTicks` asks the question one work cycle ahead: would finishing
    // the next pull leave them over the line? Without it, whether a job is ever
    // interrupted depends entirely on how long the job runs — a berry bush is
    // stripped in 148 ticks and never crosses the threshold, a flint outcrop
    // takes 416 and always does. Same code, same rule, and from outside it looks
    // like berries are uninterruptible and flint is not.
    const ahead = opts.lookaheadTicks ?? 0;
    const limits = ctx.needs.workLimits;

    // Ticks of work that only continued because the job was answering the need
    // that would otherwise have stopped it — a hungry forager still picking.
    // Counted so the exemption is measurable rather than merely asserted: it is
    // the whole of the owner's "my people keep downing tools", and a feature the
    // health report cannot see is a feature nobody can tell has regressed.
    // The denominator for the one above, and deliberately *outside* the
    // `answers` guard: this counts a worker being over the hunger line at all,
    // whether or not their job is the kind that exempts them. Without it
    // `food-work-continues` cannot tell "the exemption is broken" from "nobody
    // in this world ever got hungry mid-gather", and M7 stage C made the
    // second case common by making people reach food faster.
    if (person.needs.hunger > limits.hunger) {
      telemetry.count('hungry_at_work_' + person.action);
    }
    if (opts.answers !== undefined &&
      person.needs[opts.answers] > limits[opts.answers]) {
      // Keyed by the verb as well as the need. Hunting and berry-picking both
      // answer hunger, and a check that could not tell them apart passed
      // happily on a build with the gathering exemption removed — the hunts
      // alone kept the total above zero.
      telemetry.count('pushed_on_' + opts.answers + '_' + person.action);
    }
    if (person.needs.thirst + ctx.needs.thirstRate * ahead >
      workLimit(person, 'thirst', limits, opts.answers)) return 'thirsty';
    if (person.needs.hunger + ctx.needs.hungerRate * ahead >
      workLimit(person, 'hunger', limits, opts.answers)) return 'hungry';
    // Cold is read as it stands: its rate depends on the season and the roof
    // overhead, so projecting it forward from a per-tick constant would be a
    // guess dressed up as arithmetic.
    if (person.needs.cold > workLimit(person, 'cold', limits, opts.answers)) return 'cold';

    // A hard ceiling on any one stretch, so no combination of conditions can
    // leave somebody locked in a job forever.
    if (person.workedTicks > MAX_WORK_STRETCH) return 'long_enough';
    return null;
  }

  private doHarvest(person: Person, ctx: ActionContext): void {
    const node = person.targetNodeId === null ? null : ctx.nodesById.get(person.targetNodeId);
    if (!node || node.depleted) {
      this.abandon(person, 'node_gone', ctx);
      return;
    }

    if (!this.travel(person, ctx)) return;

    // Work phase: a pull takes time, scaled by the relevant skill.
    if (person.actionTimer <= 0) {
      person.actionTimer = Math.ceil(node.def.harvestTicks / person.skillFactor(node.def.skill));
    }
    person.actionTimer--;
    person.workedTicks++;
    if (person.actionTimer > 0) return;

    const yieldUnits = Math.max(1, Math.round(
      (1 + person.skillFactor(node.def.skill)) * forageYieldFactor(person, node.kind)
    ));
    const room = Math.max(0, person.carryCapacity - person.carrying);
    const taken = node.take(Math.min(yieldUnits, room));
    if (taken > 0) {
      person.inventory.add(node.def.itemId, taken);
      person.practice(node.def.skill, 0.6);
      telemetry.count('harvest_' + node.kind);
    }

    // Keep going unless something stops us.
    //
    // `answers` is decided per node rather than per verb: `forage` is berries at
    // one bush and flint at the next, and only one of those is a reason to keep
    // going while hungry.
    const nextPull = Math.ceil(node.def.harvestTicks / person.skillFactor(node.def.skill));
    const feeds = (ITEMS[node.def.itemId]?.nutrition ?? 0) > 0;
    const stop = node.depleted
      ? 'node_empty'
      : this.interruption(person, ctx, {
          lookaheadTicks: nextPull,
          answers: feeds ? 'hunger' : undefined,
        });
    if (stop) {
      this.stop(person, stop, ctx);
      return;
    }
    person.actionTimer = Math.ceil(node.def.harvestTicks / person.skillFactor(node.def.skill));
  }

  /** Picking fruit off a standing tree. Same rhythm as any other harvest. */
  private doPickFruit(person: Person, ctx: ActionContext): void {
    const tree = person.targetTreeId === null ? null : ctx.treesById.get(person.targetTreeId);
    if (!tree || !tree.standing || tree.fruit < 1) {
      this.abandon(person, 'no_fruit', ctx);
      return;
    }

    person.targetX = tree.x;
    person.targetY = tree.y;
    if (!this.travel(person, ctx)) return;

    if (person.actionTimer <= 0) {
      person.actionTimer = Math.ceil(9 / person.skillFactor('forage'));
    }
    person.actionTimer--;
    person.workedTicks++;
    if (person.actionTimer > 0) return;

    const room = Math.max(0, person.carryCapacity - person.carrying);
    const picked = tree.pick(Math.min(Math.max(1, Math.round(
      person.skillFactor('forage') * 2 * forageYieldFactor(person, 'fruit')
    )), room));
    if (picked > 0 && tree.def.fruitItem) {
      person.inventory.add(tree.def.fruitItem, picked);
      person.practice('forage', 0.5);
      telemetry.count('picked_' + tree.def.fruitItem);
    }

    const stop = tree.fruit < 1
      ? 'tree_bare'
      : this.interruption(person, ctx, { answers: 'hunger' });
    if (stop) {
      this.stop(person, stop, ctx);
      return;
    }
    person.actionTimer = Math.ceil(9 / person.skillFactor('forage'));
  }

  /**
   * Felling a tree.
   *
   * Slow, and permanent. A grown oak is the better part of an in-game day's
   * work with bare hands, and when it goes down it does not come back — the
   * only new trees anywhere come from seed cast by trees still standing.
   */
  private doChop(person: Person, ctx: ActionContext): void {
    const tree = person.targetTreeId === null ? null : ctx.treesById.get(person.targetTreeId);
    if (!tree || !tree.standing) {
      this.abandon(person, 'tree_gone', ctx);
      return;
    }

    person.targetX = tree.x;
    person.targetY = tree.y;
    if (!this.travel(person, ctx)) return;

    // Felling accumulates on the trunk instead of running down a single
    // uninterruptible timer. The timer version committed the woodcutter for
    // hundreds of ticks — long enough that the brain could not re-plan — and
    // people chopped steadily through to a hundred thirst and died holding the
    // axe. Progress on the trunk means the same work happens, but the person
    // is free to leave for a drink and come back to it.
    const axe = person.inventory.has('handaxe') ? 0.5 : 1;
    const required = tree.fellingTicks * axe;
    tree.chopProgress += person.skillFactor('build');
    person.workedTicks++;
    person.practice('build', 0.05);

    if (tree.chopProgress < required) {
      // `ignoreLaden`: a tree needs pack room only at the instant it falls, so
      // a full pack is no reason not to swing. It used to be — a laden feller
      // aborted on the very first tick, and the order died in silence.
      const stop = this.interruption(person, ctx, { ignoreLaden: true });
      if (stop) this.stop(person, stop, ctx);
      return;
    }

    // The trunk is down. Take what will fit and leave the rest where it fell:
    // this world's standing rule is that goods move rather than appearing and
    // vanishing, and a laden feller used to have the remainder simply cease to
    // exist.
    const wood = tree.woodYield;
    tree.standing = false;
    const room = Math.max(0, person.carryCapacity - person.carrying);
    const carried = Math.min(wood, room);
    if (carried > 0) person.inventory.add('wood', carried);
    if (wood - carried > 0) ctx.dropAt(tree.x, tree.y, 'wood', wood - carried);
    person.practice('build', 2.5);
    telemetry.count('tree_felled');
    telemetry.count('wood_cut', wood);
    person.chronicle.push({
      tick: ctx.tick,
      ageDays: person.age,
      text: 'felled ' + (tree.isMature ? 'a grown ' : 'a young ') + tree.def.label.toLowerCase(),
      kind: 'did',
    });
    ctx.onTreeFelled(tree, person);
    this.finish(person);
  }

  private doFlee(person: Person, ctx: ActionContext): void {
    if (this.travel(person, ctx)) {
      telemetry.count('fled');
      this.finish(person);
    }
  }

  private doRest(person: Person): void {
    person.needs.fatigue = Math.max(0, person.needs.fatigue - 0.35);
    telemetry.count('rest');
    // A player order is held until it is finished or countermanded. Left to its
    // own judgement the simulation ends a rest the moment fatigue hits zero,
    // which is right for an NPC and wrong for an instruction: telling someone
    // who is not tired to sit down and watch the camp did nothing at all,
    // because they stood straight back up on the same tick.
    if (person.needs.fatigue <= 0 && !person.order) this.finish(person);
  }

  // -------------------------------------------------------------------------
  // Building and storage
  // -------------------------------------------------------------------------

  /**
   * Walks to the structure this action is aimed at. Returns it once standing
   * on the footprint, or null while still travelling or if it is gone.
   *
   * `requirement` is M8.1, mechanism 4: a station recipe needs the target to be
   * a *finished quern* rather than merely a building that still exists, and the
   * five callers that predate stations pass nothing and are unaffected. The
   * reason travels with the predicate because a per-station id — the
   * `abandoned_no_station_quern` that falls out of this — is the only way to
   * find out that a station has been demolished and everybody is still walking
   * to where it was.
   */
  private reachBuilding(
    person: Person,
    ctx: ActionContext,
    requirement?: { ok: (building: Building) => boolean; reason: string }
  ): Building | null {
    const building = person.targetBuildingId === null
      ? null
      : ctx.buildingsById.get(person.targetBuildingId);
    if (!building) {
      this.abandon(person, requirement?.reason ?? 'site_gone', ctx);
      return null;
    }
    if (requirement && !requirement.ok(building)) {
      this.abandon(person, requirement.reason, ctx);
      return null;
    }
    if (building.contains(person.x, person.y)) return building;

    person.targetX = building.centerX;
    person.targetY = building.centerY;
    // `travel`'s own return is not the arrival signal here — `contains` above
    // already is, on the next call once it is true. What matters is that a
    // `Blocked` route now abandons instead of the six callers below walking
    // this person on the spot forever.
    this.travel(person, ctx);
    return null;
  }

  /** Delivers carried materials to a construction site. */
  private doHaul(person: Person, ctx: ActionContext): void {
    const site = this.reachBuilding(person, ctx);
    if (!site) return;

    let delivered = 0;
    for (const [itemId] of person.inventory.entries()) {
      const needed = site.stillNeeds(itemId);
      if (needed <= 0) continue;
      const given = person.inventory.remove(itemId, Math.min(needed, person.inventory.count(itemId)));
      site.delivered.add(itemId, given);
      delivered += given;
    }

    if (delivered === 0) {
      this.abandon(person, 'nothing_to_haul', ctx);
      return;
    }
    telemetry.count('materials_delivered', delivered);
    this.finish(person);
  }

  /**
   * Works on a site. Materials must be on hand first — a person who arrives
   * with nothing to build with fetches instead of standing there, which is why
   * this hands off to gathering rather than simply failing.
   */
  private doBuild(person: Person, ctx: ActionContext): void {
    const site = this.reachBuilding(person, ctx);
    if (!site) return;

    if (site.complete) {
      this.abandon(person, 'already_built', ctx);
      return;
    }
    if (!site.materialsReady) {
      // Deliver what we carry, then go find the rest.
      if (site.wants(person.inventory)) {
        person.action = 'haul';
        return;
      }
      this.abandon(person, 'site_needs_materials', ctx);
      return;
    }

    // Every long job needs this. An ordered builder is `committed`, so the brain
    // will not re-plan for them, and without a check here a chief could put
    // someone on a hut and they would work through hunger, thirst and nightfall
    // until the roof went on or they died — which is what happened.
    const stop = this.interruption(person, ctx);
    if (stop) {
      this.stop(person, stop, ctx);
      return;
    }

    const work = person.skillFactor('build') * buildFactor(person);
    person.workedTicks++;
    person.practice('build', 0.25);
    if (site.addWork(work)) {
      telemetry.count('building_completed');
      // Per design as well as in total: "did anybody ever finish a granary?" is
      // a question about whether a gated design is reachable, and an aggregate
      // cannot answer it.
      telemetry.count('completed_' + site.def.id);
      person.chronicle.push({
        tick: ctx.tick,
        ageDays: person.age,
        text: 'finished building a ' + site.def.label.toLowerCase(),
        kind: 'did',
      });
      this.finish(person);
    }
  }

  private doStore(person: Person, ctx: ActionContext): void {
    const store = this.reachBuilding(person, ctx);
    if (!store) return;

    // A trap is a place food comes from, not a place to put it: filling one
    // stops it catching, since a full trap accrues nothing. The player can
    // still order it, and gets told why it did not happen — which is the whole
    // reason this refuses out loud rather than quietly dropping the order.
    if (!store.complete || store.def.storage === 0 || isTrap(store.def)) {
      this.abandon(person, 'not_a_store', ctx);
      return;
    }

    // A player order that named a specific item takes precedence — M9.3, the
    // same opt-in `doTake` already honours. No AI caller ever sets
    // `targetItemId` for `store` (`Brain.setup`'s `store` case sets only
    // `targetBuildingId`, and `BandSystem` commands carry `{ buildingId }`
    // alone), so this branch is reached only from a player's choice in the
    // radial menu; every AI-planned trip to the store still empties the pack.
    const requested = person.targetItemId;
    if (requested !== null) {
      if (person.inventory.count(requested) === 0) {
        this.abandon(person, 'store_item_gone', ctx);
        return;
      }
      const amount = person.targetItemCount ?? person.inventory.count(requested);
      const moved = store.accept(person.inventory, requested, amount);
      if (moved === 0) {
        this.abandon(person, 'store_full', ctx);
        return;
      }
      telemetry.count('stored', moved);
      this.finish(person);
      return;
    }

    let moved = 0;
    for (const [itemId, count] of person.inventory.entries()) {
      const room = store.storageFree;
      if (room <= 0) break;
      const taken = person.inventory.remove(itemId, Math.min(count, room));
      store.store.add(itemId, taken);
      moved += taken;
    }

    if (moved === 0) {
      this.abandon(person, 'store_full', ctx);
      return;
    }
    telemetry.count('stored', moved);
    this.finish(person);
  }

  private doTake(person: Person, ctx: ActionContext): void {
    const store = this.reachBuilding(person, ctx);
    if (!store) return;

    // A player order that named a specific item takes precedence — M9 phase 2.
    // Everyone else, including every AI-planned trip to the larder, still falls
    // back to food first: taking from the store is nearly always about eating.
    const requested = person.targetItemId;
    const itemId = requested ?? store.store.bestFood() ?? store.store.entries()[0]?.[0];
    if (!itemId || store.store.count(itemId) === 0) {
      this.abandon(person, requested !== null ? 'take_item_gone' : 'store_empty', ctx);
      return;
    }
    const amount = requested !== null && person.targetItemCount !== null
      ? person.targetItemCount
      : 6;
    const taken = store.store.remove(itemId, Math.min(amount, store.store.count(itemId)));
    person.inventory.add(itemId, taken);
    telemetry.count('withdrawn', taken);
    // Counted apart from an ordinary withdrawal because it answers a different
    // question. A trap that fills and is never emptied stops catching, and from
    // the outside that is indistinguishable from a trap that works: the catch
    // counter keeps rising for a while and then quietly stops. This is the only
    // signal that the other half of the mechanism — somebody walking out to it —
    // is actually happening.
    if (isTrap(store.def)) telemetry.count('trap_emptied', taken);
    this.finish(person);
  }

  /**
   * Picking goods up off the ground — which means walking to them first.
   *
   * This used to happen on the click: `main.ts` called `Simulation.takeFromPile`
   * straight out of the radial menu, so a player could right-click a heap
   * across the camp and have it arrive in their pack without anybody moving.
   * The owner reported it in one line — "to pick things up npcs must go near
   * the object" — and the fix is not a distance check on the menu but a verb
   * like every other: an order, a walk, and a refusal that says why if the
   * heap is gone when they get there.
   *
   * Making it a verb is also what lets it be *ordered*. Until now the menu had
   * to refuse "you cannot order somebody else to pick that up", because there
   * was no such action for a subordinate to carry out.
   *
   * The chosen item and count ride on `targetItemId`/`targetItemCount`, the
   * same pair `take` and `store` already use, so an order and the amount the
   * player asked for travel together and survive being set aside and resumed.
   */
  private doPickup(person: Person, ctx: ActionContext): void {
    // Checked before the walk as well as after it: somebody whose hands are
    // already full should be told so where they stand, not after crossing the
    // camp. The check after arrival is the one that matters, since a walk is
    // long enough for a pack to fill on the way.
    if (person.carrying >= person.carryCapacity) {
      this.abandon(person, 'hands_full', ctx);
      return;
    }

    const pile = person.targetPileId === null
      ? null
      : ctx.pilesById.get(person.targetPileId) ?? null;
    if (!pile || pile.empty) {
      this.abandon(person, 'goods_gone', ctx);
      return;
    }
    // The heap does not move, but it can be emptied while somebody walks to
    // it, so the aim is refreshed the way `doHunt` refreshes a quarry's — it
    // costs nothing and keeps one rule for where a walk is headed.
    person.targetX = pile.x;
    person.targetY = pile.y;
    if (!this.travel(person, ctx)) return;

    const requested = person.targetItemId;
    if (requested !== null && pile.contents.count(requested) === 0) {
      // Somebody else took that stack while this one was walking. Kept apart
      // from `goods_gone` for the same reason `take_item_gone` is kept apart
      // from `store_empty`: the heap may still hold plenty of everything else.
      this.abandon(person, 'pile_item_gone', ctx);
      return;
    }

    const moved = ctx.takeFromPile(
      person, pile,
      requested ?? undefined,
      person.targetItemCount ?? undefined);
    if (moved === 0) {
      this.abandon(person, 'hands_full', ctx);
      return;
    }
    telemetry.count('pickup_ordered', moved);
    this.finish(person);
  }

  /** Waits out the cold indoors, and leaves once there is no longer a reason. */
  private doShelter(person: Person, ctx: ActionContext): void {
    const building = this.reachBuilding(person, ctx);
    if (!building) return;
    telemetry.count('sheltering');
    // Being indoors is restful, so waiting out a cold night is not wasted time.
    person.needs.fatigue = Math.max(0, person.needs.fatigue - 0.2);

    // Warm again, or something more pressing than the cold: go.
    if (person.needs.cold < 8 || person.needs.thirst > 45 || person.needs.hunger > 55) {
      this.finish(person);
    }
  }

  /**
   * A hunt: close on a moving, fleeing animal, then roll for the kill.
   *
   * This is what replaced the `game` resource node. Standing next to a bush for
   * twenty-four ticks and receiving meat was not hunting; it was foraging with
   * a different skill attached. Here the animal runs faster than a person can,
   * so a hunt is won on approach — which is what finally gives `track` a job,
   * through `noticeRadius`.
   */
  private doHunt(person: Person, ctx: ActionContext): void {
    const animal = person.targetAnimalId === null
      ? null
      : ctx.animalsById.get(person.targetAnimalId);
    if (!animal || !animal.alive) {
      this.abandon(person, 'quarry_gone', ctx);
      return;
    }

    const distance = person.distanceTo(animal);
    if (distance > PURSUIT_LIMIT * 2) {
      // Outrun. A chase that never ends is a person who never eats again.
      telemetry.count('hunt_lost');
      this.abandon(person, 'quarry_escaped', ctx);
      return;
    }

    // The chase is long, and every long action gets an interruption check.
    //
    // `answers: 'hunger'` because a hunt is *for* food: a hunter who breaks off
    // a chase because they are hungry has thrown away the meal they were three
    // minutes from catching.
    //
    // Reported through `stop` rather than counted and dropped. This was the one
    // long action that called `finish` directly, so a chase broken off by thirst
    // reached neither the player's floater nor `person.resume` — the standing
    // "if the simulation stops something, the UI says why" rule with a hole in
    // it, and the telemetry counter beside it is exactly what made the hole look
    // deliberate. The counter is kept because the health report reads it.
    const stop = this.interruption(person, ctx, { answers: 'hunger' });
    if (stop) {
      telemetry.count('hunt_ended_' + stop);
      this.stop(person, stop, ctx);
      return;
    }
    person.workedTicks++;

    // The weapon is chosen before the range test, not after, and that is M8.1
    // closing one of the three repairs the plan lists.
    //
    // `doHunt` used the bare `REACH` constant, so a bow's `reach: 1.6` did
    // nothing at all in the one place it should matter most: the archer walked
    // to arm's length of a deer like everybody else, and the field existed only
    // to win brawls. The atlatl arriving in this pass is a weapon whose *whole
    // point* is the throw, so leaving it would have shipped a third node with a
    // decorative stat.
    const weapon = weaponOf(person, true);
    if (distance > REACH + (weapon?.reach ?? 0)) {
      person.targetX = animal.x;
      person.targetY = animal.y;
      this.travel(person, ctx);
      return;
    }

    // Within reach: strike. Skill against the animal's evasion, so a novice
    // after a hare mostly goes hungry and an expert after a boar mostly does
    // not — and both outcomes happen, which is what makes it a hunt.
    person.practice('hunt', 0.6);
    person.practice('track', 0.2);
    // A blown animal is far easier to bring down than a fresh one, which is
    // what makes the chase itself worth something rather than just a delay.
    // The weapon term, and the intended answer to "hunting is rare". A fresh
    // deer outruns a person, so before this a hunt could only be won by draining
    // an animal's stamina, and a two-year run produced about three kills. A bow
    // is worth more here than a hand axe by a wide margin and less than one in a
    // brawl, which is what `weapon.hunt` is separate from `weapon.damage` for.
    const armed = weapon === null ? 1 : weapon.hunt * weapon.power;
    if (weapon !== null) telemetry.count('armed_hunt');
    // M8.1: and whoever came with you. A dog at the hunter's side is worth more
    // than any weapon in the game, which is the correct order — it cost a
    // season of feeding an animal that could have been eaten.
    const companion = companionBonus(person, ctx.animalsById.values());
    if (companion > 1) telemetry.count('hunt_with_companion');
    const chance = Math.max(0.05, Math.min(0.9,
      person.skillFactor('hunt') * (1 - animal.def.evasion) * armed * companion + 0.15
        + (1 - animal.stamina) * 0.35
    ));

    if (!ctx.rng.chance(chance)) {
      telemetry.count('hunt_missed');
      // A miss costs the stalk: the herd is gone and the hunter is winded.
      person.needs.fatigue = Math.min(100, person.needs.fatigue + 4);
      animal.alarmedUntil = ctx.tick + 90;
      return;
    }

    animal.health = 0;
    animal.alive = false;
    ctx.onAnimalKilled(animal, person);

    const yielded = Math.max(1, Math.round(animal.def.meat * person.skillFactor('hunt')));
    const room = person.carryCapacity - person.carrying;
    person.inventory.add('meat', Math.min(yielded, Math.max(0, room)));
    telemetry.count('hunt_killed');
    telemetry.count('harvest_meat', yielded);
    // The skin comes off with the meat. Nothing consumed hides before M6b, and
    // that was the reason clothing's strongest spark — cold hands holding fur —
    // could never fire: the ingredient did not exist in the world.
    const hideRoom = person.carryCapacity - person.carrying;
    if (hideRoom > 0) {
      person.inventory.add('hide', 1);
      telemetry.count('harvest_hide');
    } else {
      ctx.dropAt(animal.x, animal.y, 'hide', 1);
    }

    // M8.1: bone and sinew, and only for a butcher who knows what they are for.
    //
    // Gated on the knowledge rather than dropping off every kill, for two
    // reasons that happen to agree. It is honest — nobody strips sinew out of a
    // leg without a use for it, and a band that has never worked bone leaves the
    // carcass where it lies. And it is what keeps every world that has not
    // worked this out bit-identical to the one before this shipped: a pack
    // filling up with material nobody can use would move `isLaden`, and
    // `isLaden` moves everything.
    if (techPower(person, 'bone_working') > 0) {
      for (const [itemId, count] of [['bone', 3], ['sinew', 2]] as const) {
        if (person.carryCapacity - person.carrying > 0) {
          person.inventory.add(itemId, count);
          telemetry.count('harvest_' + itemId, count);
        } else {
          ctx.dropAt(animal.x, animal.y, itemId, count);
        }
      }
    }

    person.chronicle.push({
      tick: ctx.tick,
      ageDays: person.age,
      text: 'brought down a ' + animal.def.label.toLowerCase(),
      kind: 'did',
    });
    this.finish(person);
  }

  // -------------------------------------------------------------------------
  // M8.1: music, medicine, and the animal that follows you home
  // -------------------------------------------------------------------------

  /**
   * Playing a flute.
   *
   * The first thing in this game that answers a need for *more than the person
   * doing it*. Every other social act is a pair: `SocialSystem.converse` sets
   * `company` to zero for exactly two people and nothing else touches it. A
   * player sitting by the fire relieves the loneliness of whoever is in
   * earshot, which is why one flute in a band is worth having and a second is
   * not — and it is also, at last, a use for company that does not require
   * somebody to be free to talk.
   *
   * It runs long and therefore has an interruption check, and it is under the
   * `AGENTS.md` ceiling for a single pull so there is nothing to bank.
   */
  private doPlay(person: Person, ctx: ActionContext): void {
    if (techPower(person, 'flute') <= 0 || !person.inventory.has('flute')) {
      this.abandon(person, 'nothing_to_play', ctx);
      return;
    }

    if (person.actionTimer <= 0) {
      person.actionTimer = PLAY_TICKS;
      return;
    }
    person.actionTimer--;
    person.workedTicks++;

    // Relief goes to the listeners every tick, in small amounts, rather than
    // in one lump at the end: somebody who walks past halfway through has still
    // heard half a tune, and a player interrupted has still done some good.
    const heard = ctx.peopleHash.queryRadius(person.x, person.y, EARSHOT);
    let listeners = 0;
    for (const other of heard) {
      if (!other.alive) continue;
      const before = other.needs.company;
      other.needs.company = Math.max(0, before - PLAY_RELIEF * techPower(person, 'flute'));
      if (other.id !== person.id && before > 0) listeners++;
    }
    telemetry.count('flute_listener_ticks', listeners);
    person.practice('build', 0.15);

    if (person.actionTimer > 0) {
      // `ignoreLaden` for the same reason crafting passes it: nothing goes into
      // the pack or comes out of it.
      const stop = this.interruption(person, ctx, { ignoreLaden: true });
      if (stop) this.stop(person, stop, ctx);
      return;
    }
    telemetry.count('flute_played');
    this.finish(person);
  }

  /**
   * Sitting with somebody who is hurt.
   *
   * **The first use the `heal` skill has ever had.** It has been in `SKILLS`
   * since the beginning, spent points on at character creation, inherited,
   * aged and never once practised by any action — which made it the clearest
   * piece of inert content left in the game.
   *
   * Health is otherwise recovered at a flat `needs.recoveryRate` and by nothing
   * else at all, so being badly hurt has always been a thing you wait out
   * alone. This is the alternative, and it is deliberately somebody *else's*
   * work: you cannot tend yourself, because the point of the node is that a
   * band with a healer in it is a different band.
   */
  private doTend(person: Person, ctx: ActionContext): void {
    const patient = person.targetPersonId === null
      ? null
      : ctx.peopleById.get(person.targetPersonId);
    if (!patient || !patient.alive || patient.id === person.id) {
      this.abandon(person, 'nobody_to_tend', ctx);
      return;
    }
    if (techPower(person, 'herbalism') <= 0) {
      this.abandon(person, 'dont_know_how', ctx);
      return;
    }
    if (patient.health >= 100) {
      this.abandon(person, 'nothing_to_treat', ctx);
      return;
    }

    person.targetX = patient.x;
    person.targetY = patient.y;
    if (!this.travel(person, ctx)) return;

    person.workedTicks++;
    const mended = TEND_RATE * techPower(person, 'herbalism')
      * (0.4 + person.skillFactor('heal'));
    patient.health = Math.min(100, patient.health + mended);
    person.practice('heal', 0.4);
    telemetry.count('tended_ticks');

    if (patient.health >= 100) {
      telemetry.count('tended_to_health');
      person.chronicle.push({
        tick: ctx.tick,
        ageDays: person.age,
        text: 'nursed ' + patient.name + ' back to health',
        kind: 'did',
      });
      this.finish(person);
      return;
    }
    const stop = this.interruption(person, ctx, { ignoreLaden: true });
    if (stop) this.stop(person, stop, ctx);
  }

  /**
   * Offering food to an animal instead of a spear.
   *
   * Reads `Animal.fedBy` and `Animal.temperament`, which have sat on that class
   * since M6a doing nothing — deliberately, because adding them later would
   * have been a migration. `temperament` decides how many meals it takes: a
   * placid beast comes round in two and a wary one is never worth the meat.
   *
   * Deliberately expensive. It costs food, in a world where `bugs.md` says
   * total food is the constraint, and most attempts are simply thrown away —
   * which is the correct shape for the first domestication anybody attempted.
   */
  private doTame(person: Person, ctx: ActionContext): void {
    const animal = person.targetAnimalId === null
      ? null
      : ctx.animalsById.get(person.targetAnimalId);
    if (!animal || !animal.alive) {
      this.abandon(person, 'quarry_gone', ctx);
      return;
    }
    if (techPower(person, 'taming') <= 0) {
      this.abandon(person, 'dont_know_how', ctx);
      return;
    }
    if (animal.tamedBy !== null) {
      this.abandon(person, 'already_tame', ctx);
      return;
    }
    const food = person.inventory.bestFood();
    if (food === null) {
      this.abandon(person, 'nothing_to_offer', ctx);
      return;
    }

    // A wild animal will not stand still to be approached, so this is a chase
    // with a different ending. The interruption check comes first for the same
    // reason it does in `doHunt`.
    const stop = this.interruption(person, ctx);
    if (stop) {
      this.stop(person, stop, ctx);
      return;
    }
    person.workedTicks++;

    if (person.distanceTo(animal) > REACH) {
      person.targetX = animal.x;
      person.targetY = animal.y;
      this.travel(person, ctx);
      return;
    }

    person.inventory.remove(food, 1);
    animal.fedBy.add(person.id);
    animal.meals++;
    person.practice('track', 0.8);
    telemetry.count('animal_fed');

    // How many meals it takes. `temperament` runs 0 to 1 and this maps it onto
    // four for the placid and ten for the wariest — scaled by how well the
    // feeder knows what they are doing, so a refined design is the difference
    // between a wolf that comes back and a wolf that does not.
    //
    // Meals rather than *feeders*, which is what it counted first and is the
    // reason nothing was ever tamed: `fedBy` is a `Set` of ids, so one person
    // feeding an animal all season put themselves in it once.
    const needed = Math.max(1, Math.round(
      (4 + animal.temperament * 6) / techPower(person, 'taming')));
    if (animal.meals >= needed) {
      animal.tamedBy = person.id;
      animal.alarmedUntil = 0;
      telemetry.count('animal_tamed');
      person.chronicle.push({
        tick: ctx.tick,
        ageDays: person.age,
        text: 'tamed a ' + animal.def.label.toLowerCase(),
        kind: 'milestone',
      });
    }
    this.finish(person);
  }

  /**
   * Sleeping, which is not the same thing as sheltering.
   *
   * `shelter` is standing indoors waiting out the cold and `rest` is sitting
   * down anywhere; neither is sleeping, and until now nobody in this world ever
   * went to bed. Warmth needs no special case here: `NeedsSystem.shelterAt`
   * reads position, so someone asleep in a hut is warm because of where they
   * are lying, not because sleeping is warm.
   */
  private doSleep(person: Person, ctx: ActionContext): void {
    const building = this.reachBuilding(person, ctx);
    if (!building) return;

    telemetry.count('sleeping');
    person.needs.fatigue = Math.max(0, person.needs.fatigue - SLEEP_RECOVERY);

    // Note what is *not* here: `person.workedTicks++`. Sleeping is not work, and
    // counting it toward `MAX_WORK_STRETCH` would eventually report that
    // somebody had been asleep long enough to need a break.

    const wake = this.wakeReason(person, ctx);
    if (wake) {
      this.stop(person, wake, ctx, 'woke_');
      return;
    }
  }

  /**
   * Why somebody wakes up.
   *
   * Deliberately *not* `interruption()`, which is the list of reasons to stop
   * working. Borrowing it made sleep unusable in the most ordinary case in the
   * game: its first clause is `isLaden`, so a player who had been out foraging
   * came home with a full pack, lay down, and was woken on the same tick by
   * "your hands are full" — which is a reason to stop picking berries and has
   * nothing whatever to do with lying down.
   *
   * The thresholds sit above the working ones on purpose. You work through mild
   * thirst and stop at 35; you sleep through it and wake at 45. Waking for a
   * need you would not even have broken off work for is not rest.
   */
  private wakeReason(person: Person, ctx: ActionContext): string | null {
    if (person.lastHarmedTick > ctx.tick - 40) return 'under_attack';
    if (person.needs.thirst > 45) return 'thirsty';
    if (person.needs.hunger > 50) return 'hungry';
    // Cold is deliberately absent. The roof overhead is the thing that fixes
    // cold, and throwing somebody out of the hut for being cold in it is a
    // circle. `NeedsSystem.shelterAt` warms them where they lie.

    if (person.needs.fatigue <= 0) return 'rested';
    // A player order holds through the daylight the way `rest` does — being told
    // to lie down and being ignored is worse than a pointless nap. Left to their
    // own judgement, nobody sleeps through the day.
    if (!ctx.isNight && !person.order) return 'daylight';
    return null;
  }

  // -------------------------------------------------------------------------
  // Social
  // -------------------------------------------------------------------------

  /**
   * Walks to the person this action is aimed at. Returns them once in reach,
   * or null while still travelling or if they are gone.
   *
   * People move, so the target tile is refreshed every tick rather than fixed
   * at the moment of decision — otherwise you walk to where someone used to be.
   */
  private approach(person: Person, ctx: ActionContext): Person | null {
    const other = person.targetPersonId === null ? null : ctx.peopleById.get(person.targetPersonId);
    if (!other || !other.alive) {
      this.abandon(person, 'target_gone', ctx);
      return null;
    }
    // A weapon's reach widens what counts as close enough, and only for a blow.
    // This is how a spear beats a fist without ranged combat existing: the
    // spearman lands from a step further back than the other party can reach,
    // so a fight is decided partly by who has to close the distance.
    const weapon = person.action === 'attack' ? weaponOf(person, false) : null;
    const reach = REACH + (weapon?.reach ?? 0);
    if (person.distanceTo(other) <= reach) return other;

    person.targetX = other.x;
    person.targetY = other.y;
    // Same shape as `reachBuilding`: arrival is `distanceTo <= reach` above, on
    // the next call. What `travel` adds is a `Blocked` route abandoning
    // instead of every social verb below walking on the spot forever.
    this.travel(person, ctx);
    return null;
  }

  /**
   * A conversation takes time and is nobody else's business.
   *
   * Both properties were learned the hard way. The first version resolved a
   * conversation in a single tick and emitted a public event for it: people
   * standing next to each other talked on every step, fifty thousand times in a
   * twelve-day run, and every bystander dutifully recorded every one of them.
   * It flooded memory with worthless entries, crowded out the deeds worth
   * gossiping about, and cost more than the rest of the simulation combined.
   */
  private doTalk(person: Person, ctx: ActionContext): void {
    const other = this.approach(person, ctx);
    if (!other) return;

    if (person.actionTimer <= 0) {
      person.actionTimer = TALK_TICKS;
      return;
    }
    person.actionTimer--;
    if (person.actionTimer > 0) return;

    ctx.social.converse(person, other, ctx.tick, ctx.peopleById);
    person.practice('persuade', 0.3);
    // Both parties were in the conversation, so both wait before the next one.
    other.socialCooldownUntil = ctx.tick + SOCIAL_COOLDOWN;
    this.finishSocial(person, ctx.tick);
  }

  /**
   * Courtship: time spent together, and a proposal when both are sure.
   *
   * Romance is grown rather than decided. A marriage that can happen on a first
   * meeting makes the relationship graph meaningless; requiring both sides to
   * reach the threshold means a wedding is the record of a courtship that
   * actually took place, and that one party can be keen while the other is not.
   */
  private doCourt(person: Person, ctx: ActionContext): void {
    const other = this.approach(person, ctx);
    if (!other) return;

    if (other.spouseId !== null || person.spouseId !== null) {
      this.abandon(person, 'already_wed', ctx);
      return;
    }

    if (person.actionTimer <= 0) {
      person.actionTimer = COURT_TICKS;
      return;
    }
    person.actionTimer--;
    if (person.actionTimer > 0) return;

    // Charm helps, but only at the margin: being liked matters far more.
    const charm = 3 + person.skillFactor('persuade') * 6;
    ctx.social.courtship(person, other, charm, ctx.tick);
    person.practice('persuade', 0.4);
    other.socialCooldownUntil = ctx.tick + SOCIAL_COOLDOWN;
    this.finishSocial(person, ctx.tick);
  }

  /**
   * Passing on what you know.
   *
   * The only reliable way anything survives its discoverer. Deliberately slow
   * and deliberately social: both parties have to be present, willing and
   * patient, and how well the pupil thinks of the teacher matters as much as
   * how good the teacher is.
   */
  private doTeach(person: Person, ctx: ActionContext): void {
    const pupil = this.approach(person, ctx);
    if (!pupil) return;

    if (person.actionTimer <= 0) {
      person.actionTimer = TEACH_TICKS;
      return;
    }
    person.actionTimer--;
    if (person.actionTimer > 0) return;

    const regard = ctx.relationships.opinion(pupil.id, person.id) / 100;
    const taught = ctx.knowledge.teach(person, pupil, regard, ctx.tick, ctx.rng);
    if (taught) {
      // Teaching is a gift, and it is received as one.
      ctx.social.emit('teach', person, pupil, 0.6, ctx.tick, ctx.peopleHash, ctx.sightRadius);
    }
    pupil.socialCooldownUntil = ctx.tick + SOCIAL_COOLDOWN;
    this.finishSocial(person, ctx.tick);
  }

  /**
   * Asking somebody to show you how.
   *
   * The mirror of `doTeach`, started from the other end. Until M9 phase 3 a
   * lesson could only ever begin with the teacher: a person who could see
   * that the woman across the camp knew how to make fire had no way to ask,
   * and the player had none either. That is a strange gap in a game whose
   * central claim is that knowledge lives in heads and dies with them —
   * `next-steps.md` §0 names transmission as the tree's real bottleneck, and
   * this is a whole channel of it that did not exist.
   *
   * Two things separate it from being taught. The lesson is **the teacher's
   * to refuse**, on `opinion(teacher → pupil)` rather than the pupil's regard
   * for them, which is the opposite way round from `KnowledgeSystem.teach`'s
   * own roll and deliberately so: whether they will sit down with you and
   * whether you can follow them once they have are different questions, and
   * both are asked. And the pupil does the walking.
   *
   * What is *not* different: nothing here decides what gets taught or whether
   * it lands. That is `KnowledgeSystem.teach`, unchanged and shared, because a
   * second implementation of "what could you pass on to them" would drift from
   * the first and the drift would surface as a mystifying difference between
   * being taught and asking to be.
   */
  private doAsk(person: Person, ctx: ActionContext): void {
    const teacher = this.approach(person, ctx);
    if (!teacher) return;

    // A child holds what it knows at level zero and cannot explain it — the
    // rule `KnowledgeSystem.teach` already enforces, said out loud here so the
    // asker is told why rather than watching a lesson produce nothing.
    if (teacher.isChild) {
      this.abandon(person, 'too_young_to_teach', ctx);
      return;
    }

    if (person.actionTimer <= 0) {
      person.actionTimer = TEACH_TICKS;
      return;
    }
    person.actionTimer--;
    if (person.actionTimer > 0) return;

    // Whether they agree at all. Their opinion of the asker, not the asker's of
    // them: being willing to spend an afternoon on somebody is a fact about the
    // teacher. A roll rather than a threshold, so that a cool relationship
    // makes a lesson unlikely rather than impossible — a flat cut-off would
    // make the whole channel unavailable to exactly the newcomers who most need
    // it, which is how a band of strangers stays a band of strangers.
    const standing = ctx.relationships.opinion(teacher.id, person.id) / 100;
    const willing = Math.min(0.95, Math.max(0.05,
      0.4 + standing * 0.5 + (teacher.traits.industriousness - 0.5) * 0.1));
    person.practice('persuade', 0.3);
    teacher.socialCooldownUntil = ctx.tick + SOCIAL_COOLDOWN;

    if (!ctx.rng.chance(willing)) {
      telemetry.count('ask_refused');
      this.stop(person, 'would_not_teach', ctx, 'asked_');
      return;
    }

    const regard = ctx.relationships.opinion(person.id, teacher.id) / 100;
    const taught = ctx.knowledge.teach(teacher, person, regard, ctx.tick, ctx.rng);
    if (!taught) {
      // Two different disappointments under one roof, and they are worth
      // telling apart: either the teacher had nothing the asker could follow,
      // or the explanation simply did not land this time. `teach` counts the
      // second itself as `teaching_failed`.
      telemetry.count('ask_taught_nothing');
      this.stop(person, 'learned_nothing', ctx, 'asked_');
      return;
    }

    telemetry.count('ask_taught');
    // The deed is the teacher's, because it is the teacher who gave something
    // away — the same gift `doTeach` emits, and it has to be attributed the
    // same way or asking would quietly be worth less socially than being
    // offered.
    ctx.social.emit('teach', teacher, person, 0.6, ctx.tick, ctx.peopleHash, ctx.sightRadius);
    ctx.onInsight(person, 'was shown how by ' + teacher.name, 'gain');
    this.finishSocial(person, ctx.tick);
  }

  /**
   * Making something out of what is in the pack, to a recipe.
   *
   * Table-driven since the recipes moved to `RECIPES`. The hand axe used to be
   * written into this function, into the radial menu and into the scorer — the
   * same fact in three places, which is how two copies of an idea drift apart.
   *
   * **The interruption check is the point of this pass.** There was none.
   * `workTicks` divided by a novice's 0.35 `skillFactor` is 258 ticks, more
   * than a whole in-game day, and for every one of them the knapper was
   * `committed`: the brain does not re-plan while a timer runs, so with no
   * check inside nothing whatever could reach them. Not thirst, not hunger, not
   * cold, not being attacked. That is exactly the omission `AGENTS.md` blames
   * for the two worst bugs this project has had, and it had been sitting in the
   * one action nobody had looked at.
   *
   * It also meant a craft never called `stop()`, so it never reached the
   * player's floater and never set the order aside for `resume` to pick back
   * up — the whole of M6c was bypassed here.
   */
  private doCraft(person: Person, ctx: ActionContext): void {
    const recipe = person.targetRecipe === null ? null : RECIPES[person.targetRecipe];
    if (!recipe) {
      this.abandon(person, 'no_recipe', ctx);
      return;
    }
    if (techPower(person, recipe.tech) <= 0) {
      this.abandon(person, 'dont_know_how', ctx);
      return;
    }
    if (!hasIngredients(person.inventory, recipe)) {
      this.abandon(person, 'lack_materials', ctx);
      return;
    }

    // M8.1, mechanism 4. Some things are made at a place, and this is the walk
    // to it.
    //
    // `doCraft` deliberately does not go looking for a station: buildings have
    // no spatial hash and `optimizations.md` owns the decision that those scans
    // stay linear, so whoever issued the order — the scorer, or the menu —
    // names the one to use. Checked before the timer is armed rather than after,
    // so that somebody sent to a quern that was demolished while they walked
    // gives up on arrival instead of grinding air.
    if (recipe.station !== undefined) {
      const stationId = recipe.station;
      const station = this.reachBuilding(person, ctx, {
        ok: building => building.complete && building.def.id === stationId,
        reason: 'no_station_' + stationId,
      });
      if (!station) return;
    }

    // Hours already spent on this same recipe come off the timer.
    //
    // A novice's hand axe is 258 ticks and thirst reaches them at about 400 —
    // less than 200 after a resume — so an interrupted craft used to start again
    // from nothing, over and over. `AGENTS.md` puts the line for this at around
    // 140 workTicks. Building and felling bank on the site and the trunk, which
    // is better because anyone can take the job up; a craft has nothing to bank
    // on until the final tick, when the item appears, so it banks on the crafter.
    const bankKey = 'craft:' + recipe.id;
    if (person.actionTimer <= 0) {
      const total = Math.ceil(recipe.workTicks / person.skillFactor(recipe.skill));
      person.actionTimer = Math.max(1, total - person.bankedFor(bankKey));
      return;
    }
    person.actionTimer--;
    person.workedTicks++;
    person.bankWork(bankKey);
    if (person.actionTimer > 0) {
      // `ignoreLaden`, for the same reason felling passes it: nothing is taken
      // out of the pack and nothing is put into it until the final tick, so a
      // full pack is not a reason to stop — and an interrupted craft loses only
      // the walk back, because the hours are banked above.
      const stop = this.interruption(person, ctx, { ignoreLaden: true });
      if (stop) {
        // Counted apart from the generic `work_ended_` tally so that
        // `crafting-is-interruptible` can tell whether this one action can be
        // reached at all — which, for the whole of the game's history, it
        // could not.
        telemetry.count('craft_interrupted');
        this.stop(person, stop, ctx);
      }
      return;
    }

    for (const [itemId, count] of Object.entries(recipe.ingredients)) {
      person.inventory.remove(itemId, count);
    }
    for (const [itemId, count] of Object.entries(recipe.output)) {
      person.inventory.add(itemId, count);
    }
    person.practice(recipe.skill, 3);
    person.clearWorkBank();
    telemetry.count('crafted_' + recipe.id);
    person.chronicle.push({
      tick: ctx.tick,
      ageDays: person.age,
      text: 'made a ' + recipe.label.toLowerCase(),
      kind: 'did',
    });
    this.finish(person);
  }


  // -------------------------------------------------------------------------
  // Records
  // -------------------------------------------------------------------------

  /**
   * What this person could usefully write down.
   *
   * Something they know that is not already recorded anywhere. Recording what
   * is already on a stone across the valley is not worthless in the fiction —
   * two copies survive a fire better than one — but it is worthless to the
   * simulation, and a scorer that could not tell the difference would have a
   * literate band cutting the same word into every rock on the island.
   */
  private worthRecording(person: Person, ctx: ActionContext): string | null {
    for (const tech of person.knownTech) {
      if (!TECH[tech as Tech]) continue;
      if (ctx.recorded.has(tech)) continue;
      return tech;
    }
    return null;
  }

  /**
   * True if this person can make marks in this form, and take them back out.
   *
   * One function rather than the bare string `'writing'` written out in five
   * places. M8.1's `ochre` is the reason: a painted picture is legible to
   * anybody who can recognise what it is a picture of, so literacy stopped
   * being one question and became a property of the form. `InscriptionDef`
   * carries it, and the clay tablet's old hardcoded second gate folds into the
   * same field.
   */
  private canUse(person: Person, def: InscriptionDef): boolean {
    return techPower(person, def.literacy) > 0;
  }

  /** The best form this person can presently write on, or null. */
  private inscriptionForm(person: Person): InscriptionDef | null {
    // Clay first when it is known and affordable: it holds two and costs less
    // work. Stone next, the permanent one, so a band that has both writes its
    // cheap notes on clay and still has rock for what matters. Ochre last
    // despite being the cheapest, because it is the worst record of the three
    // and is only ever reached by somebody who cannot do better — which is
    // exactly the band that has never worked out writing at all, and is the
    // whole reason the node exists.
    const order: InscriptionForm[] = ['clay', 'stone', 'ochre'];
    for (const form of order) {
      const def = INSCRIPTIONS[form];
      if (!this.canUse(person, def)) continue;
      const affordable = Object.entries(def.materials)
        .every(([itemId, count]) => person.inventory.count(itemId) >= count);
      if (affordable) return def;
    }
    return null;
  }

  /**
   * Cutting something you know into something that will outlast you.
   *
   * The one channel in this game that is not a conversation, and the only way
   * anything survives a winter that kills everybody who understood it. It is
   * deliberately the most expensive of the four: materials, a long job, and a
   * reader at the other end who has to be literate before any of it counts.
   */
  private doInscribe(person: Person, ctx: ActionContext): void {
    // Asked of the *forms* rather than of `writing`, because since M8.1 they
    // are different questions: somebody who knows only `ochre` can leave a
    // painting on a rock and cannot cut a word into one.
    if (!Object.values(INSCRIPTIONS).some(def => this.canUse(person, def))) {
      this.abandon(person, 'cannot_write', ctx);
      return;
    }

    // A stone somebody has already started, walked to first. Half-cut records
    // are the normal state of affairs now that work banks on them — a carver
    // breaks off to drink and comes back, or somebody else finishes it — and a
    // scorer that could not aim at one would leave them lying about for ever.
    const aim = person.targetInscriptionId === null
      ? null
      : ctx.inscriptionsById.get(person.targetInscriptionId);
    if (aim && aim.unfinished) {
      // Per form, not in general. Walking across the valley to finish somebody
      // else's carved stone when all you know is how to grind red earth is the
      // sort of thing that would have gone unnoticed for months.
      if (!this.canUse(person, aim.def)) {
        this.abandon(person, 'cannot_write', ctx);
        return;
      }
      person.targetX = aim.x;
      person.targetY = aim.y;
      if (!this.travel(person, ctx)) return;
      this.cut(person, aim, ctx);
      return;
    }

    // The stone under their own hands, checked **before** asking what is worth
    // recording. That order is not cosmetic: a technology is claimed the moment
    // the first mark is made, so by the second tick "what is worth writing
    // down" no longer includes the thing they are in the middle of writing
    // down. Asked the other way round, a carver abandoned their own half-cut
    // stone on the tick after starting it, every time, with the reason
    // "everything they know is already written down".
    const started = ctx.unfinishedAt(person.x, person.y);
    if (started && this.canUse(person, started.def)) {
      this.cut(person, started, ctx);
      return;
    }

    const tech = this.worthRecording(person, ctx);
    if (tech === null) {
      this.abandon(person, 'nothing_to_record', ctx);
      return;
    }
    const def = this.inscriptionForm(person);
    if (!def) {
      this.abandon(person, 'lack_materials', ctx);
      return;
    }

    {
      // Nothing under way. Add to a record with room on it if there is one, and
      // start a fresh one otherwise — which is what makes a clay tablet's
      // capacity of two mean anything, and why a library fills rather than
      // sprawls.
      // A record under their feet with room left on it — a clay tablet holding
      // one of its two, say. Anything full is not worth walking round.
      const here = ctx.inscriptionAt(person.x, person.y);
      const spare = here && !here.isFull && here.def.id === def.id ? here : null;
      const fresh = spare ?? ctx.inscribe(def.id, person.x, person.y, person);
      if (!fresh || !fresh.begin(tech)) {
        this.abandon(person, 'nowhere_to_write', ctx);
        return;
      }
      // Claimed the moment the first mark is made, not at the next daily
      // recount. Two people who start on the same morning would otherwise both
      // pick the same word, and a run produced seven separate stones all saying
      // "writing" while half the things anybody knew went unrecorded.
      ctx.claimRecord(tech);
      // The materials go the moment the first mark is made. A carving abandoned
      // half way is flint spent, which is most of what makes writing a
      // commitment rather than a habit.
      for (const [itemId, count] of Object.entries(def.materials)) {
        person.inventory.remove(itemId, count);
      }
      this.cut(person, fresh, ctx);
    }
  }

  /** One tick of carving, wherever the record came from. */
  private cut(person: Person, target: Inscription, ctx: ActionContext): void {
    if (!target.unfinished) {
      this.abandon(person, 'nothing_to_record', ctx);
      return;
    }
    person.workedTicks++;
    if (!target.addWork(person.skillFactor(target.def.skill))) {
      // `ignoreLaden` for the same reason felling passes it: nothing goes into
      // the pack, so a full one is not a reason to put the chisel down. Being
      // stopped here costs only the ticks not yet spent — the work already done
      // is on the stone.
      const stop = this.interruption(person, ctx, { ignoreLaden: true });
      if (stop) this.stop(person, stop, ctx);
      return;
    }

    const done = target.techs[target.techs.length - 1]!;
    person.practice(target.def.skill, 2);
    telemetry.count('recorded_' + done);
    // Per form as well as per technology. M8.1's `ochre` is the only record in
    // the game that is not writing, and "did anybody paint anything?" cannot be
    // answered from a count of what was written down.
    telemetry.count('inscribed_' + target.def.id);
    const label = TECH[done as Tech].label.toLowerCase();
    person.chronicle.push({
      tick: ctx.tick,
      ageDays: person.age,
      text: 'cut ' + label + ' into ' + target.def.label.toLowerCase(),
      kind: 'milestone',
    });
    ctx.onInsight(person, 'wrote down ' + label, 'gain');
    this.finish(person);
  }

  /**
   * Reading what somebody else cut.
   *
   * **Literacy is the gate, and it is the point of the whole feature.** A
   * record grants nothing at all to somebody who cannot read, so a band can sit
   * on a library holding the answer to its own dark age and starve beside it.
   * That is what makes writing an exception bought on purpose rather than a
   * free second copy of `knownTech`.
   */
  private doRead(person: Person, ctx: ActionContext): void {
    const record = person.targetInscriptionId === null
      ? null
      : ctx.inscriptionsById.get(person.targetInscriptionId);
    if (!record) {
      this.abandon(person, 'record_gone', ctx);
      return;
    }
    if (!this.canUse(person, record.def)) {
      this.abandon(person, 'cannot_read', ctx);
      return;
    }

    person.targetX = record.x;
    person.targetY = record.y;
    if (!this.travel(person, ctx)) return;

    // What is on it that they could take in. Checked before the work rather
    // than after, so nobody spends half a day staring at something they already
    // know — and `requires` gates a record exactly as it gates a lesson.
    const useful = record.techs.filter(tech =>
      !person.knownTech.has(tech) &&
      TECH[tech as Tech] !== undefined &&
      prerequisitesMet(tech as Tech, person.knownTech));
    if (useful.length === 0) {
      this.abandon(person, 'nothing_new_on_it', ctx);
      return;
    }

    if (person.actionTimer <= 0) {
      person.actionTimer = Math.ceil(READ_TICKS / person.skillFactor('teach'));
      return;
    }
    person.actionTimer--;
    person.workedTicks++;
    if (person.actionTimer > 0) {
      const stop = this.interruption(person, ctx, { ignoreLaden: true });
      if (stop) this.stop(person, stop, ctx);
      return;
    }

    const tech = useful[0]!;
    ctx.knowledge.receiveFromRecord(person, tech as Tech);
    person.practice('teach', 1);
    telemetry.count('read_' + tech);
    const label = TECH[tech as Tech].label.toLowerCase();
    person.chronicle.push({
      tick: ctx.tick,
      ageDays: person.age,
      text: 'read ' + label + ' off ' + record.def.label.toLowerCase() +
        ' cut by ' + record.authorName,
      kind: 'milestone',
    });
    ctx.onInsight(person, 'read ' + label + ' off a stone', 'gain');
    this.finish(person);
  }

  // -------------------------------------------------------------------------
  // Research
  // -------------------------------------------------------------------------

  /**
   * The idea this person would get furthest with by working on it.
   *
   * An idea being tested is excluded: there is nothing to think about while you
   * are waiting to find out whether the thing you built works. Everything else
   * — newly conceived, half researched, proven and being improved — is fair
   * game, and the least advanced comes first so that nobody leaves an idea
   * hanging at nine tenths while polishing something they already have.
   */
  private workableIdea(person: Person): Idea | null {
    // Named by the player, if they named one. `targetTech` is only ever set by
    // an order out of the radial menu, so every AI-planned think and argument
    // still falls through to the choice below and is unchanged.
    //
    // A named technology that is no longer workable — proven while they walked
    // over, or dropped as stale — deliberately does *not* fall back to
    // whatever else is in their head. Being handed a different conversation
    // from the one you asked for is worse than being told it is too late, and
    // the caller turns this null into a refusal that says so.
    if (person.targetTech !== null) {
      return person.ideas.find(idea =>
        idea.tech === person.targetTech &&
        idea.stage !== 'prototyped' &&
        idea.insight < 1) ?? null;
    }
    let best: Idea | null = null;
    for (const idea of person.ideas) {
      if (idea.stage === 'prototyped') continue;
      if (idea.insight >= 1) continue;
      if (best === null || idea.insight < best.insight) best = idea;
    }
    return best;
  }

  /**
   * Sitting with a problem.
   *
   * Solitary research. Slow, free, and the only route available to somebody
   * with nobody to talk to — which, after a bad winter, is most people.
   */
  private doPonder(person: Person, ctx: ActionContext): void {
    const idea = this.workableIdea(person);
    if (!idea) {
      this.abandon(person,
        person.targetTech !== null ? 'idea_moved_on' : 'nothing_to_think_about', ctx);
      return;
    }

    if (person.actionTimer <= 0) {
      person.actionTimer = PONDER_TICKS;
      return;
    }
    person.actionTimer--;
    person.workedTicks++;
    idea.effort++;
    if (person.actionTimer > 0) {
      // Thinking needs a head, not hands, so a full pack is no reason to stop —
      // but hunger and cold still reach them, which is the whole point of this
      // check existing on every long action.
      const stop = this.interruption(person, ctx, { ignoreLaden: true });
      if (stop) this.stop(person, stop, ctx);
      return;
    }

    const def = TECH[idea.tech];
    // Thinking goes better where the records are — the library's whole effect,
    // and the reason it is worth seven hundred ticks of building. Read as a
    // place rather than as a possession: anybody sitting in it gets it,
    // including somebody from the band across the valley.
    const shelvesNear = ctx.inLibrary(person.x, person.y);
    const chance = Math.min(0.85,
      (0.18 + person.traits.intelligence * 0.3 + person.traits.curiosity * 0.15
        + person.skillFactor(def.skill) * 0.2) * (shelvesNear ? LIBRARY_INSIGHT : 1));
    if (!ctx.rng.chance(chance)) {
      telemetry.count('ponder_nothing');
      // Nothing came of it, and the player is told so. An hour of a character's
      // day disappearing without explanation is the exact complaint this
      // project's standing rule about refusals exists to answer.
      this.stop(person, 'nothing_came_of_it', ctx, 'thought_');
      return;
    }

    person.practice(def.skill, 0.4);
    this.breakthrough(person, idea, BREAKTHROUGH, ctx, 'ponder');
    this.finish(person);
  }

  /**
   * Arguing a problem out with somebody whose skills bear on it.
   *
   * Far faster than thinking alone and correspondingly harder to arrange: it
   * needs a willing partner, in reach, who actually knows something about the
   * thing — and it goes through the ordinary social cooldown, so nobody spends
   * their life in conversation.
   */
  private doDiscuss(person: Person, ctx: ActionContext): void {
    const idea = this.workableIdea(person);
    if (!idea) {
      this.abandon(person,
        person.targetTech !== null ? 'idea_moved_on' : 'nothing_to_think_about', ctx);
      return;
    }
    const partner = this.approach(person, ctx);
    if (!partner) return;

    const def = TECH[idea.tech];
    // What a partner brings: they have handled the materials, or they already
    // understand what the thing rests on. Somebody with neither is not being
    // rude, they simply have nothing to offer on this particular problem.
    const theirSkill = partner.skills[def.skill];
    const theirGrounding = def.requires.filter(r => partner.knownTech.has(r)).length;
    if (partner.isChild || (theirSkill < 12 && theirGrounding === 0)) {
      this.abandon(person, 'partner_ignorant', ctx);
      return;
    }
    const regard = ctx.relationships.opinion(partner.id, person.id) / 100;
    if (regard < -0.2) {
      this.abandon(person, 'partner_unwilling', ctx);
      return;
    }

    if (person.actionTimer <= 0) {
      person.actionTimer = DISCUSS_TICKS;
      return;
    }
    person.actionTimer--;
    idea.effort++;
    if (person.actionTimer > 0) return;

    const repeat = idea.discussedWith.includes(partner.id);
    if (!repeat) idea.discussedWith.push(partner.id);

    // `tallyFactor` is what `marking` buys, and it is deliberately applied to
    // the *arguer's* tallies rather than the partner's: it is your evidence you
    // are putting on the ground between you.
    const chance = Math.min(0.9,
      (0.2 + partner.skillFactor(def.skill) * 0.35
        + (partner.traits.intelligence - 0.5) * 0.4
        + Math.max(0, regard) * 0.3) * tallyFactor(person)
    ) * (repeat ? REPEAT_DISCUSSION : 1);

    partner.socialCooldownUntil = ctx.tick + SOCIAL_COOLDOWN;
    person.practice('persuade', 0.3);

    if (!ctx.rng.chance(chance)) {
      telemetry.count('discuss_nothing');
      this.stop(person, 'nothing_came_of_it', ctx, 'talked_');
      person.socialCooldownUntil = ctx.tick + SOCIAL_COOLDOWN;
      return;
    }

    // A conversation that produced something is worth more than an hour alone,
    // which is what makes a band with an expert in it different from a band of
    // strangers who happen to live together.
    partner.practice(def.skill, 0.3);
    this.breakthrough(person, idea, BREAKTHROUGH * 1.4, ctx, 'discuss');
    this.finishSocial(person, ctx.tick);
  }

  /** Insight jumps, and everybody watching is told about it. */
  private breakthrough(
    person: Person,
    idea: Idea,
    amount: number,
    ctx: ActionContext,
    route: string
  ): void {
    const def = TECH[idea.tech];
    telemetry.count('breakthrough_' + route);
    const refined = ctx.knowledge.advance(person, idea, amount, ctx.tick);
    if (refined) {
      ctx.onInsight(person, refined, 'gain');
      return;
    }
    person.chronicle.push({
      tick: ctx.tick,
      ageDays: person.age,
      text: 'saw further into ' + def.label.toLowerCase(),
      kind: 'did',
    });
    ctx.onInsight(person, 'a breakthrough on ' + def.label.toLowerCase(), 'gain');
  }

  /**
   * Building the first one.
   *
   * The step where an idea stops being talk and costs real materials. It does
   * not prove anything: a prototype works at half strength and unreliably, and
   * whether it is any good is settled later, in use.
   */
  private doPrototype(person: Person, ctx: ActionContext): void {
    const idea = person.ideas.find(
      candidate => candidate.stage === 'researching' && candidate.insight >= PROTOTYPE_AT
    ) ?? null;
    if (!idea) {
      this.abandon(person, 'nothing_to_build_yet', ctx);
      return;
    }

    const def = TECH[idea.tech];
    const missing = Object.entries(def.prototype)
      .some(([itemId, count]) => person.inventory.count(itemId) < count);
    if (missing) {
      this.abandon(person, 'lack_materials', ctx);
      return;
    }

    // Banked like a craft, and more urgently: at 120 base ticks a novice needs
    // 343 of them, which is most of a full stretch of thirst. Building the first
    // one of anything was among the longest single pulls in the game.
    const bankKey = 'prototype:' + idea.tech;
    if (person.actionTimer <= 0) {
      const total = Math.ceil(PROTOTYPE_TICKS / person.skillFactor(def.skill));
      person.actionTimer = Math.max(1, total - person.bankedFor(bankKey));
      return;
    }
    person.actionTimer--;
    person.workedTicks++;
    person.bankWork(bankKey);
    if (person.actionTimer > 0) {
      const stop = this.interruption(person, ctx, { ignoreLaden: true });
      if (stop) this.stop(person, stop, ctx);
      return;
    }

    for (const [itemId, count] of Object.entries(def.prototype)) {
      person.inventory.remove(itemId, count);
    }
    idea.stage = 'prototyped';
    person.clearWorkBank();
    person.practice(def.skill, 2);
    telemetry.count('prototyped_' + idea.tech);
    person.chronicle.push({
      tick: ctx.tick,
      ageDays: person.age,
      text: 'built the first ' + def.label.toLowerCase() + ' anyone had ever built',
      kind: 'did',
    });
    ctx.onInsight(person, 'built a ' + def.label.toLowerCase() + ' to try', 'idea');
    this.finish(person);
  }

  private doGive(person: Person, ctx: ActionContext): void {
    const other = this.approach(person, ctx);
    if (!other) return;

    if (person.actionTimer <= 0) {
      person.actionTimer = GIVE_TICKS;
      return;
    }
    person.actionTimer--;
    if (person.actionTimer > 0) return;

    const foodId = person.inventory.bestFood();
    if (!foodId) {
      this.abandon(person, 'nothing_to_give', ctx);
      return;
    }
    const units = Math.max(1, Math.min(3, Math.floor(person.inventory.count(foodId) / 2)));
    const given = person.inventory.remove(foodId, units);
    if (given === 0) {
      this.abandon(person, 'nothing_to_give', ctx);
      return;
    }
    other.inventory.add(foodId, given);

    const nutrition = (ITEMS[foodId]?.nutrition ?? 0) * given;
    ctx.social.emit(
      'share_food', person, other,
      Math.min(1, nutrition / 60),
      ctx.tick, ctx.peopleHash, ctx.sightRadius
    );
    telemetry.count('gift_given');
    this.finishSocial(person, ctx.tick);
  }

  private doSteal(person: Person, ctx: ActionContext): void {
    const other = this.approach(person, ctx);
    if (!other) return;

    if (person.actionTimer <= 0) {
      person.actionTimer = STEAL_TICKS;
      return;
    }
    person.actionTimer--;
    if (person.actionTimer > 0) return;

    const carried = other.inventory.entries();
    if (carried.length === 0) {
      this.abandon(person, 'nothing_to_steal', ctx);
      return;
    }

    // Take the most valuable stack, not a random one — a thief chooses.
    let bestId = carried[0]![0];
    let bestValue = -1;
    for (const [id, count] of carried) {
      const value = (ITEMS[id]?.baseValue ?? 1) * count;
      if (value > bestValue) {
        bestValue = value;
        bestId = id;
      }
    }

    const units = Math.max(1, Math.ceil(other.inventory.count(bestId) / 2));
    const taken = other.inventory.remove(bestId, units);
    if (taken === 0) {
      this.abandon(person, 'nothing_to_steal', ctx);
      return;
    }
    person.inventory.add(bestId, taken);

    const worth = (ITEMS[bestId]?.baseValue ?? 1) * taken;
    ctx.social.emit(
      'theft', person, other,
      Math.min(1, worth / 12),
      ctx.tick, ctx.peopleHash, ctx.sightRadius
    );
    telemetry.count('theft_succeeded');
    this.finishSocial(person, ctx.tick);
  }

  private doAttack(person: Person, ctx: ActionContext): void {
    const quarry = person.targetPersonId === null
      ? null
      : ctx.peopleById.get(person.targetPersonId);
    // Give up the chase. A victim who runs must be able to get away, or fleeing
    // is theatre: attacker and quarry move at the same speed, so a pursuit that
    // never ends is a death sentence with extra steps.
    if (quarry && person.distanceTo(quarry) > PURSUIT_LIMIT) {
      telemetry.count('pursuit_abandoned');
      this.finish(person);
      return;
    }

    const other = this.approach(person, ctx);
    if (!other) return;

    // A swing costs a moment: without a wind-up, two people in reach trade
    // dozens of blows per second and every fight is instantly lethal.
    if (person.actionTimer <= 0) {
      person.actionTimer = ATTACK_WINDUP;
      return;
    }
    person.actionTimer--;
    if (person.actionTimer > 0) return;

    // Until phase 5 this line had **no item term at all**: a man with a spear hit
    // exactly as hard as a man with his hands, which made every weapon in the
    // game a decoration. The weapon is scaled through `techPower`, so a refined
    // design is worth more than a first attempt at one, and armour comes off the
    // blow at the far end.
    const weapon = weaponOf(person, false);
    const armed = 1 + (weapon === null ? 0 : weapon.damage * weapon.power);
    if (weapon !== null) telemetry.count('armed_blow');
    const attack = person.skillFactor('fight') *
      (0.6 + person.traits.aggression * 0.8) * armed;
    const defence = other.skillFactor('fight') * 0.7;
    const damage = Math.max(3, (attack - defence * 0.5) * 22 * ctx.rng.range(0.6, 1.4)) *
      (1 - armourOf(other));

    other.health -= damage;
    other.lastHarmedBy = person.id;
    other.lastHarmedTick = ctx.tick;
    person.practice('fight', 1.2);

    // Landing the blow takes some of the anger out of it.
    ctx.social.dischargeGrudge(person.id, other.id, GRUDGE_DISCHARGE, ctx.tick);
    other.practice('fight', 0.4);
    telemetry.count('blow_landed');

    if (other.health <= 0) {
      other.die('killed by ' + person.name);
      telemetry.count('death_murder');
      ctx.social.emit('murder', person, other, 1, ctx.tick, ctx.peopleHash, ctx.sightRadius);
      this.finish(person);
      return;
    }

    ctx.social.emit(
      'assault', person, other,
      Math.min(1, damage / 40),
      ctx.tick, ctx.peopleHash, ctx.sightRadius
    );

    // Keep swinging. A fight is a sequence of blows; ending the action after
    // one meant an ordered attack stopped by itself after a couple of seconds
    // and the player had to re-issue it for every hit. An NPC finishes here
    // instead and re-scores next tick, so they can break off once the odds turn
    // against them — which is the whole point of the boldness term.
    if (person.order === 'attack') person.actionTimer = 0;
    else this.finish(person);
  }
}
