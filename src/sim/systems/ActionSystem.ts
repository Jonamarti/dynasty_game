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
import type { MovementSystem } from './MovementSystem.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { SocialSystem } from '../social/SocialSystem.ts';
import type { Building } from '../entities/Building.ts';
import type { Tree } from '../entities/Tree.ts';
import type { Animal } from '../entities/Animal.ts';
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
  techPower, type Tech,
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
export const WORK_LIMITS = { thirst: 35, hunger: 40, cold: 45 } as const;

/**
 * True if a need is already past the point where work stops.
 *
 * Deliberately without the lookahead `interruption` applies: this answers "is it
 * sensible to begin?", not "will the next cycle carry them over?".
 */
export function pressedByNeed(person: Person): boolean {
  return person.needs.thirst > WORK_LIMITS.thirst ||
    person.needs.hunger > WORK_LIMITS.hunger ||
    person.needs.cold > WORK_LIMITS.cold;
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
      case 'shelter': this.doShelter(person, ctx); break;
      case 'sleep': this.doSleep(person, ctx); break;
      case 'talk': this.doTalk(person, ctx); break;
      case 'court': this.doCourt(person, ctx); break;
      case 'teach': this.doTeach(person, ctx); break;
      case 'craft': this.doCraft(person, ctx); break;
      case 'inscribe': this.doInscribe(person, ctx); break;
      case 'read': this.doRead(person, ctx); break;
      case 'ponder': this.doPonder(person, ctx); break;
      case 'discuss': this.doDiscuss(person, ctx); break;
      case 'prototype': this.doPrototype(person, ctx); break;
      case 'give': this.doGive(person, ctx); break;
      case 'steal': this.doSteal(person, ctx); break;
      case 'attack': this.doAttack(person, ctx); break;
      case 'goto':
        // A walk order. Identical to wandering except that arriving ends it,
        // so the person stands where they were sent.
        if (ctx.movement.step(person)) this.finish(person);
        break;
      case 'wander':
      default:
        ctx.movement.step(person);
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
    const arrived = ctx.movement.step(person);
    if (!arrived) return;

    // Movement stops within 0.6 tiles of the target, so the rounded position can
    // land on the tile next door. Test the neighbourhood rather than one tile,
    // otherwise people walk to the water's edge and then refuse to drink.
    if (!this.waterWithinReach(person.x, person.y, ctx)) {
      this.abandon(person, 'no_water', ctx);
      return;
    }
    person.needs.thirst = Math.max(0, person.needs.thirst - 6);
    telemetry.count('drink');
    if (person.needs.thirst <= 0) this.finish(person);
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
    // A committed worker does not re-plan — that is the point — so these are
    // the *only* thing that lets a need reach them. Setting them near the
    // lethal line (80+) meant people stripped a bush while dying of thirst and
    // a healthy band was at 82 thirst inside a fortnight. They sit instead
    // where the scorer would have started preferring the need anyway, so
    // continuation buys uninterrupted work through mild need and nothing more.
    // Note that a need parks *at* its threshold: work continues right up to the
    // line and stops there, so wherever these sit is where the population's
    // average hunger and thirst will settle. They are set low for that reason,
    // not because the danger starts here.
    //
    // `lookaheadTicks` asks the question one work cycle ahead: would finishing
    // the next pull leave them over the line? Without it, whether a job is ever
    // interrupted depends entirely on how long the job runs — a berry bush is
    // stripped in 148 ticks and never crosses the threshold, a flint outcrop
    // takes 416 and always does. Same code, same rule, and from outside it looks
    // like berries are uninterruptible and flint is not.
    const ahead = opts.lookaheadTicks ?? 0;
    if (person.needs.thirst + ctx.needs.thirstRate * ahead > WORK_LIMITS.thirst) return 'thirsty';
    if (person.needs.hunger + ctx.needs.hungerRate * ahead > WORK_LIMITS.hunger) return 'hungry';
    // Cold is read as it stands: its rate depends on the season and the roof
    // overhead, so projecting it forward from a per-tick constant would be a
    // guess dressed up as arithmetic.
    if (person.needs.cold > WORK_LIMITS.cold) return 'cold';

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

    if (!ctx.movement.step(person)) return;

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
    const nextPull = Math.ceil(node.def.harvestTicks / person.skillFactor(node.def.skill));
    const stop = node.depleted
      ? 'node_empty'
      : this.interruption(person, ctx, { lookaheadTicks: nextPull });
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
    if (!ctx.movement.step(person)) return;

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

    const stop = tree.fruit < 1 ? 'tree_bare' : this.interruption(person, ctx);
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
    if (!ctx.movement.step(person)) return;

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
    if (ctx.movement.step(person)) {
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
   */
  private reachBuilding(person: Person, ctx: ActionContext): Building | null {
    const building = person.targetBuildingId === null
      ? null
      : ctx.buildingsById.get(person.targetBuildingId);
    if (!building) {
      this.abandon(person, 'site_gone', ctx);
      return null;
    }
    if (building.contains(person.x, person.y)) return building;

    person.targetX = building.centerX;
    person.targetY = building.centerY;
    ctx.movement.step(person);
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

    if (!store.complete || store.def.storage === 0) {
      this.abandon(person, 'not_a_store', ctx);
      return;
    }

    let moved = 0;
    for (const [itemId, count] of person.inventory.entries()) {
      const room = store.storageFree - moved;
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

    // Food first: taking from the store is nearly always about eating.
    const foodId = store.store.bestFood();
    const itemId = foodId ?? store.store.entries()[0]?.[0];
    if (!itemId) {
      this.abandon(person, 'store_empty', ctx);
      return;
    }
    const taken = store.store.remove(itemId, Math.min(6, store.store.count(itemId)));
    person.inventory.add(itemId, taken);
    telemetry.count('withdrawn', taken);
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
    const stop = this.interruption(person, ctx);
    if (stop) {
      telemetry.count('hunt_ended_' + stop);
      this.finish(person);
      return;
    }
    person.workedTicks++;

    if (distance > REACH) {
      person.targetX = animal.x;
      person.targetY = animal.y;
      ctx.movement.step(person);
      return;
    }

    // Within reach: strike. Skill against the animal's evasion, so a novice
    // after a hare mostly goes hungry and an expert after a boar mostly does
    // not — and both outcomes happen, which is what makes it a hunt.
    person.practice('hunt', 0.6);
    person.practice('track', 0.2);
    // A blown animal is far easier to bring down than a fresh one, which is
    // what makes the chase itself worth something rather than just a delay.
    const chance = Math.max(0.05, Math.min(0.9,
      person.skillFactor('hunt') * (1 - animal.def.evasion) + 0.15
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

    person.chronicle.push({
      tick: ctx.tick,
      ageDays: person.age,
      text: 'brought down a ' + animal.def.label.toLowerCase(),
      kind: 'did',
    });
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
    if (person.distanceTo(other) <= REACH) return other;

    person.targetX = other.x;
    person.targetY = other.y;
    ctx.movement.step(person);
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

    if (person.actionTimer <= 0) {
      person.actionTimer = Math.ceil(recipe.workTicks / person.skillFactor(recipe.skill));
      return;
    }
    person.actionTimer--;
    person.workedTicks++;
    if (person.actionTimer > 0) {
      // `ignoreLaden`, for the same reason felling passes it: nothing is taken
      // out of the pack and nothing is put into it until the final tick, so a
      // full pack is not a reason to stop — and an interrupted craft therefore
      // loses nothing and can be resumed from the beginning at no cost.
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

  /** The best form this person can presently write on, or null. */
  private inscriptionForm(person: Person): InscriptionDef | null {
    // Clay first when it is known and affordable: it holds two and costs less
    // work. Stone is the fallback and the permanent one, so a band that has
    // both writes its cheap notes on clay and still has rock for what matters.
    const order: InscriptionForm[] = ['clay', 'stone'];
    for (const form of order) {
      const def = INSCRIPTIONS[form];
      if (form === 'clay' && techPower(person, 'clay_tablet') <= 0) continue;
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
    if (techPower(person, 'writing') <= 0) {
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
      person.targetX = aim.x;
      person.targetY = aim.y;
      if (!ctx.movement.step(person)) return;
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
    if (started) {
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
    if (techPower(person, 'writing') <= 0) {
      this.abandon(person, 'cannot_read', ctx);
      return;
    }

    person.targetX = record.x;
    person.targetY = record.y;
    if (!ctx.movement.step(person)) return;

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
      this.abandon(person, 'nothing_to_think_about', ctx);
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
      this.abandon(person, 'nothing_to_think_about', ctx);
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

    if (person.actionTimer <= 0) {
      person.actionTimer = Math.ceil(PROTOTYPE_TICKS / person.skillFactor(def.skill));
      return;
    }
    person.actionTimer--;
    person.workedTicks++;
    if (person.actionTimer > 0) {
      const stop = this.interruption(person, ctx, { ignoreLaden: true });
      if (stop) this.stop(person, stop, ctx);
      return;
    }

    for (const [itemId, count] of Object.entries(def.prototype)) {
      person.inventory.remove(itemId, count);
    }
    idea.stage = 'prototyped';
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

    const attack = person.skillFactor('fight') * (0.6 + person.traits.aggression * 0.8);
    const defence = other.skillFactor('fight') * 0.7;
    const damage = Math.max(3, (attack - defence * 0.5) * 22 * ctx.rng.range(0.6, 1.4));

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
