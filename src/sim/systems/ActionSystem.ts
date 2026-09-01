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
import type { KnowledgeSystem } from './KnowledgeSystem.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';
import type { RNG } from '../core/RNG.ts';
import { ITEMS } from '../entities/Item.ts';
import { telemetry } from '../core/Telemetry.ts';

export interface ActionContext {
  world: World;
  movement: MovementSystem;
  nodesById: Map<number, ResourceNode>;
  buildingsById: Map<number, Building>;
  treesById: Map<number, Tree>;
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
}

/** How close two people must be to hand something over, or land a blow. */
const REACH = 1.6;

/** Ticks a conversation occupies. Roughly half an in-game hour. */
const TALK_TICKS = 45;

/** Ticks to hand something over and be thanked for it. */
const GIVE_TICKS = 15;

/** Ticks a courtship visit takes. Longer than a conversation; it is one. */
const COURT_TICKS = 60;

/** Ticks to show somebody how a thing is done. Longer than any conversation. */
const TEACH_TICKS = 90;

/** No single stretch of work runs longer than this, whatever else is true. */
const MAX_WORK_STRETCH = 900;

/** Ticks to take something that is not yours without being obvious about it. */
const STEAL_TICKS = 30;

/** Ticks before a person will deliberately approach anyone again. */
const SOCIAL_COOLDOWN = 220;

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
      case 'eat': this.doEat(person); break;
      case 'forage':
      case 'gather': this.doHarvest(person, ctx); break;
      case 'pick': this.doPickFruit(person, ctx); break;
      case 'chop': this.doChop(person, ctx); break;
      case 'rest': this.doRest(person); break;
      case 'flee': this.doFlee(person, ctx); break;
      case 'haul': this.doHaul(person, ctx); break;
      case 'build': this.doBuild(person, ctx); break;
      case 'store': this.doStore(person, ctx); break;
      case 'take': this.doTake(person, ctx); break;
      case 'shelter': this.doShelter(person, ctx); break;
      case 'talk': this.doTalk(person, ctx); break;
      case 'court': this.doCourt(person, ctx); break;
      case 'teach': this.doTeach(person, ctx); break;
      case 'craft': this.doCraft(person, ctx); break;
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

  /** Ends the current action cleanly, releasing any player order with it. */
  private finish(person: Person): void {
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
  private abandon(person: Person, reason: string): void {
    telemetry.count('abandoned_' + reason);
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
      this.abandon(person, 'no_water');
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

  private doEat(person: Person): void {
    const foodId = person.inventory.bestFood();
    if (!foodId) {
      this.abandon(person, 'no_food');
      return;
    }
    if (person.inventory.remove(foodId, 1) === 0) {
      this.abandon(person, 'no_food');
      return;
    }
    // Cooking makes food go further. It is the plainest possible payoff for
    // knowing something, and it compounds: a band that cooks needs a third less
    // forage than one that does not, and can therefore support more people on
    // the same ground.
    const cooked = person.knownTech.has('cooking') ? 1.35 : 1;
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
  private interruption(person: Person, ctx: ActionContext): string | null {
    if (person.isLaden) return 'hands_full';
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
    if (person.needs.thirst > 35) return 'thirsty';
    if (person.needs.hunger > 40) return 'hungry';
    if (person.needs.cold > 45) return 'cold';

    // A hard ceiling on any one stretch, so no combination of conditions can
    // leave somebody locked in a job forever.
    if (person.workedTicks > MAX_WORK_STRETCH) return 'long_enough';
    return null;
  }

  private doHarvest(person: Person, ctx: ActionContext): void {
    const node = person.targetNodeId === null ? null : ctx.nodesById.get(person.targetNodeId);
    if (!node || node.depleted) {
      this.abandon(person, 'node_gone');
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

    const yieldUnits = Math.max(1, Math.round(1 + person.skillFactor(node.def.skill)));
    const room = Math.max(0, person.carryCapacity - person.carrying);
    const taken = node.take(Math.min(yieldUnits, room));
    if (taken > 0) {
      person.inventory.add(node.def.itemId, taken);
      person.practice(node.def.skill, 0.6);
      telemetry.count('harvest_' + node.kind);
    }

    // Keep going unless something stops us.
    const stop = node.depleted ? 'node_empty' : this.interruption(person, ctx);
    if (stop) {
      telemetry.count('work_ended_' + stop);
      this.finish(person);
      return;
    }
    person.actionTimer = Math.ceil(node.def.harvestTicks / person.skillFactor(node.def.skill));
  }

  /** Picking fruit off a standing tree. Same rhythm as any other harvest. */
  private doPickFruit(person: Person, ctx: ActionContext): void {
    const tree = person.targetTreeId === null ? null : ctx.treesById.get(person.targetTreeId);
    if (!tree || !tree.standing || tree.fruit < 1) {
      this.abandon(person, 'no_fruit');
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
    const picked = tree.pick(Math.min(Math.max(1, Math.round(person.skillFactor('forage') * 2)), room));
    if (picked > 0 && tree.def.fruitItem) {
      person.inventory.add(tree.def.fruitItem, picked);
      person.practice('forage', 0.5);
      telemetry.count('picked_' + tree.def.fruitItem);
    }

    const stop = tree.fruit < 1 ? 'tree_bare' : this.interruption(person, ctx);
    if (stop) {
      telemetry.count('work_ended_' + stop);
      this.finish(person);
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
      this.abandon(person, 'tree_gone');
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
      const stop = this.interruption(person, ctx);
      if (stop) {
        telemetry.count('work_ended_' + stop);
        this.finish(person);
      }
      return;
    }

    const wood = tree.woodYield;
    tree.standing = false;
    person.inventory.add('wood', Math.min(wood, Math.max(1, person.carryCapacity - person.carrying)));
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
      this.abandon(person, 'site_gone');
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
      this.abandon(person, 'nothing_to_haul');
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
      this.abandon(person, 'already_built');
      return;
    }
    if (!site.materialsReady) {
      // Deliver what we carry, then go find the rest.
      if (site.wants(person.inventory)) {
        person.action = 'haul';
        return;
      }
      this.abandon(person, 'site_needs_materials');
      return;
    }

    // Every long job needs this. An ordered builder is `committed`, so the brain
    // will not re-plan for them, and without a check here a chief could put
    // someone on a hut and they would work through hunger, thirst and nightfall
    // until the roof went on or they died — which is what happened.
    const stop = this.interruption(person, ctx);
    if (stop) {
      telemetry.count('work_ended_' + stop);
      this.finish(person);
      return;
    }

    const work = person.skillFactor('build');
    person.workedTicks++;
    person.practice('build', 0.25);
    if (site.addWork(work)) {
      telemetry.count('building_completed');
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
      this.abandon(person, 'not_a_store');
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
      this.abandon(person, 'store_full');
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
      this.abandon(person, 'store_empty');
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
      this.abandon(person, 'target_gone');
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
      this.abandon(person, 'already_wed');
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
   * Making a hand axe: flint, a haft, and knowing how the two go together.
   *
   * The first thing in the game that only knowledge unlocks. An axe halves
   * felling time, which is the difference between a hut being a season's work
   * and an afternoon's.
   */
  private doCraft(person: Person, ctx: ActionContext): void {
    if (!person.knownTech.has('hafting')) {
      this.abandon(person, 'dont_know_how');
      return;
    }
    if (!person.inventory.has('flint') || !person.inventory.has('sticks')) {
      this.abandon(person, 'lack_materials');
      return;
    }

    if (person.actionTimer <= 0) {
      person.actionTimer = Math.ceil(90 / person.skillFactor('knap'));
      return;
    }
    person.actionTimer--;
    person.workedTicks++;
    if (person.actionTimer > 0) return;

    person.inventory.remove('flint', 1);
    person.inventory.remove('sticks', 1);
    person.inventory.add('handaxe', 1);
    person.practice('knap', 3);
    telemetry.count('crafted_handaxe');
    person.chronicle.push({
      tick: ctx.tick, ageDays: person.age, text: 'made a hand axe', kind: 'did',
    });
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
      this.abandon(person, 'nothing_to_give');
      return;
    }
    const units = Math.max(1, Math.min(3, Math.floor(person.inventory.count(foodId) / 2)));
    const given = person.inventory.remove(foodId, units);
    if (given === 0) {
      this.abandon(person, 'nothing_to_give');
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
      this.abandon(person, 'nothing_to_steal');
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
      this.abandon(person, 'nothing_to_steal');
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
