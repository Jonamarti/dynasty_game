/**
 * Utility AI: the decision layer.
 *
 * Every think tick a person scores each candidate action and takes the best.
 * This replaces the finite state machine used in the previous project for one
 * concrete reason: an FSM encodes *transitions* ("if hungry and not fleeing,
 * go to seek_food"), which explode combinatorially as behaviours are added,
 * while a utility score encodes *desire* ("food is worth this much to me right
 * now"), which composes. Adding stealing later means adding one scorer, not
 * auditing every transition.
 *
 * The scores are kept on the person for the inspector, because the single most
 * useful debugging question in a simulation like this is "why did she do that?"
 * and the honest answer is the score table.
 *
 * M0 implements the survival actions. M1 adds the social ones (give, trade,
 * steal, talk, attack, teach) on the same interface.
 */
import type { Person } from '../entities/Person.ts';
import type { ResourceNode } from '../entities/ResourceNode.ts';
import type { World } from '../core/World.ts';
import type { TimeManager } from '../core/TimeManager.ts';
import type { RNG } from '../core/RNG.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';
import type { Building } from '../entities/Building.ts';
import type { Tree } from '../entities/Tree.ts';
import { ITEMS } from '../entities/Item.ts';

export interface BrainContext {
  world: World;
  time: TimeManager;
  rng: RNG;
  nodeHash: SpatialHash<ResourceNode>;
  peopleHash: SpatialHash<Person>;
  shoreHash: SpatialHash<{ x: number; y: number }>;
  relationships: RelationshipGraph;
  buildings: Building[];
  treeHash: SpatialHash<Tree>;
  sightRadius: number;
}

export interface ScoredAction {
  id: string;
  score: number;
}

/** Last think's score table, for the inspector. Not part of simulation state. */
export const lastScores = new Map<number, ScoredAction[]>();

interface FoundTargets {
  water: { x: number; y: number } | null;
  foodNode: ResourceNode | null;
  matNode: ResourceNode | null;
  site: Building | null;
  shelter: Building | null;
  fruitTree: Tree | null;
  fellTree: Tree | null;
  storeTarget: Building | null;
  larderTarget: Building | null;
  companion: Person | null;
  suitor: Person | null;
  student: Person | null;
  victim: Person | null;
  beneficiary: Person | null;
  fleeFrom: Person | null;
}

/**
 * Urgency curve. Squaring makes low needs nearly ignorable and high needs
 * overwhelming, which is what stops people from constantly interrupting useful
 * work to top off a need that is only at 30.
 */
/** Ticks before a person will strike up a conversation with the same neighbour. */
const TALK_COOLDOWN = 500;

/** Nutrition a person keeps for themselves before giving any away. */
const GIVING_RESERVE = 90;

function urgencyCurve(value: number): number {
  const u = value / 100;
  return u * u;
}

export class Brain {
  /**
   * Chooses and sets up an action. Returns the chosen action id.
   */
  think(person: Person, ctx: BrainContext): string {
    const { scores, found } = this.score(person, ctx);
    const chosen = scores[0]?.id ?? 'wander';
    this.setup(person, chosen, ctx, found);
    return chosen;
  }

  /**
   * Scores the options without acting on them, and records the table.
   *
   * Split out from `think` for the player: their body is driven by input, not
   * by the scorer, but they are still a person with appetites, and the HUD
   * shows what their character is inclined to do. It also means the debugging
   * surface and the game surface are the same code path, so a score table that
   * looks wrong in play is the same one the tools print.
   */
  score(person: Person, ctx: BrainContext): { scores: ScoredAction[]; found: FoundTargets } {
    const scores: ScoredAction[] = [];
    // Hysteresis: whatever you are already doing is worth a little more than
    // starting something else. Without this people dither on the spot, walking
    // half way to the water, half way to a bush, and satisfying neither need.
    const current = person.action;
    const add = (id: string, score: number) => {
      const weighted = id === current ? score * 1.25 : score;
      if (weighted > 0) scores.push({ id, score: weighted });
    };

    let fruitTree: Tree | null = null;
    let fellTree: Tree | null = null;

    const thirst = urgencyCurve(person.needs.thirst);
    const hunger = urgencyCurve(person.needs.hunger);
    const fatigue = urgencyCurve(person.needs.fatigue);

    // --- Drink -------------------------------------------------------------
    const water = this.findWater(person, ctx);
    if (water) {
      add('drink', thirst * 3.0 * this.proximityBonus(person, water, ctx.sightRadius));
    }

    // --- Eat what you already carry ---------------------------------------
    // Weighted well above foraging: eating from your own pack costs no travel,
    // so a hungry person holding berries should always eat before setting out
    // for more. Getting this wrong is subtle and lethal — people harvested
    // plenty, carried it around, and starved with full packs.
    const carriedFood = person.inventory.bestFood();
    if (carriedFood) {
      add('eat', hunger * 3.2);
    }

    // --- Forage / hunt -----------------------------------------------------
    const foodNode = this.findNode(person, ctx, n => (n.kind === 'berries' || n.kind === 'game') && !n.depleted);
    if (foodNode) {
      // Hunger drives foraging only to the extent it is not already answered by
      // what you carry — but the reserve is generous. A first attempt cut the
      // drive as soon as a person held two berries, so they picked one meal at a
      // time, walked back and forth all day and starved anyway. People forage in
      // bulk: keep picking until the pack covers the current deficit plus a
      // day's buffer.
      const carriedNutrition = person.inventory.entries()
        .reduce((sum, [id, count]) => sum + (ITEMS[id]?.nutrition ?? 0) * count, 0);
      const shortfall = Math.max(0.15, 1 - carriedNutrition / (person.needs.hunger + 70));
      // Greed is a standing wish to stockpile past immediate need — the seed of
      // hoarders, traders, and people worth stealing from.
      const stockpileWish = person.traits.greed * 0.25;
      add(
        'forage',
        (hunger * 1.6 * shortfall + stockpileWish) *
          this.proximityBonus(person, foodNode, ctx.sightRadius)
      );
    }

    // --- Pick fruit --------------------------------------------------------
    // Orchard fruit is worth more per trip than berries and only exists in its
    // season, which is what gives the year a shape: a glut in autumn worth
    // storing, and nothing on the branches in spring.
    fruitTree = ctx.treeHash.findNearest(person.x, person.y, ctx.sightRadius * 2,
      t => t.standing && t.fruit >= 1 &&
        ctx.world.sameRegion(person.x, person.y, t.x, t.y));
    if (fruitTree) {
      const carriedNutrition = this.carriedNutrition(person);
      const shortfall = Math.max(0.15, 1 - carriedNutrition / (person.needs.hunger + 70));
      // A laden fruit tree is a far better haul than a bush, and only exists
      // for part of the year, so it should pull people off berries while it
      // lasts. That seasonal swing is most of what gives the year a shape.
      const laden = Math.min(1, fruitTree.fruit / 8);
      add('pick', (hunger * 2.3 * shortfall + person.traits.greed * 0.35) * (0.6 + laden * 0.7)
        * this.proximityBonus(person, fruitTree, ctx.sightRadius));
    }

    // --- Gather materials --------------------------------------------------
    let matNode = this.findNode(person, ctx,
      n => (n.kind === 'flint' || n.kind === 'sticks') && !n.depleted);
    if (matNode) {
      // Only the genuinely comfortable pick up rocks and firewood. The gate is
      // hard rather than gradual because the first version used a soft
      // "1 - urgency" term, which still scored 0.64 for someone at hunger 55:
      // bands spent their lives stacking deadwood they had no use for and
      // starved next to the woodpile.
      const comfort = 1 - Math.max(
        person.needs.hunger, person.needs.thirst, person.needs.fatigue
      ) / 100;
      const idleness = Math.max(0, comfort - 0.5) * 2;
      add('gather', idleness * idleness * (0.15 + person.traits.curiosity * 0.3)
        * this.proximityBonus(person, matNode, ctx.sightRadius));
    }

    // --- Social ------------------------------------------------------------
    const neighbours = ctx.peopleHash
      .queryRadius(person.x, person.y, ctx.sightRadius)
      .filter(other => other.alive && other.id !== person.id);


    const loneliness = urgencyCurve(person.needs.company);
    let companion: Person | null = null;
    let victim: Person | null = null;
    let beneficiary: Person | null = null;
    let fleeFrom: Person | null = null;
    let site: Building | null = null;
    let shelter: Building | null = null;
    let storeTarget: Building | null = null;
    let larderTarget: Building | null = null;
    let suitor: Person | null = null;
    let student: Person | null = null;


    // Deliberate social approaches are rationed; violence and flight are not.
    const socialReady = ctx.time.tick >= person.socialCooldownUntil;

    if (neighbours.length > 0 && socialReady) {
      // Talk to whoever you like most nearby. Talking is how loneliness is
      // answered and, not incidentally, how every rumor in the world travels.
      // Somebody you have not just spoken to. Without this cooldown two people
      // standing together re-open the same conversation forever and never do
      // anything else.
      const freshCompany = neighbours.filter(other => {
        const rel = ctx.relationships.peek(person.id, other.id);
        return !rel || ctx.time.tick - rel.lastContact > TALK_COOLDOWN;
      });
      companion = this.pickBest(freshCompany, other =>
        ctx.relationships.opinion(person.id, other.id) + 5 - person.distanceTo(other)
      );
      if (companion) {
        const regard = ctx.relationships.opinion(person.id, companion.id) / 100;
        // The floor matters more than the loneliness term. People with nothing
        // pressing to do should talk, not wander: conversation is the only
        // channel gossip travels down, and a band that never chats never learns
        // anything about anyone.
        add('talk', (loneliness * 1.8 + 0.09) * (1 + regard * 0.5)
          * this.proximityBonus(person, companion, ctx.sightRadius));
      }

      // Court: unmarried adults, not close kin, who already think well of each
      // other. Courtship is slow on purpose — romance accumulates over many
      // meetings rather than being decided in one, so a marriage is the record
      // of a relationship rather than a dice roll.
      if (!person.isChild && person.spouseId === null) {
        const suitors = neighbours.filter(other =>
          !other.isChild &&
          other.spouseId === null &&
          other.sex !== person.sex &&
          ctx.relationships.kinship(person.id, other.id) < 25 &&
          ctx.relationships.opinion(person.id, other.id) > 5
        );
        const match = this.pickBest(suitors, other =>
          ctx.relationships.opinion(person.id, other.id) +
          ctx.relationships.romance(person.id, other.id) -
          person.distanceTo(other) * 2
        );
        if (match) {
          const regard = ctx.relationships.opinion(person.id, match.id) / 100;
          const ardour = ctx.relationships.romance(person.id, match.id) / 100;
          add('court', (0.25 + regard * 0.7 + ardour * 0.9)
            * this.proximityBonus(person, match, ctx.sightRadius));
          suitor = match;
        }
      }

      // Teach: passing something on to somebody who lacks it.
      //
      // Weighted by the teacher's own skill and by tradition — the people most
      // inclined to hand knowledge on are the ones who value continuity — and
      // sharply by age. An elder with something to pass on and not many years
      // left to do it in is the single most valuable person in a band.
      if (!person.isChild && person.knownTech.size > 0) {
        const pupils = neighbours.filter(other =>
          !other.isChild &&
          [...person.knownTech].some(t => !other.knownTech.has(t))
        );
        const pupil = this.pickBest(pupils, other =>
          ctx.relationships.opinion(person.id, other.id) +
          (other.knownTech.size < person.knownTech.size ? 20 : 0) -
          person.distanceTo(other) * 2
        );
        if (pupil) {
          const urgency = person.isElder ? 1.6 : 1;
          add('teach', (0.2 + person.skillFactor('teach') * 0.4)
            * (0.5 + person.traits.tradition) * urgency
            * this.proximityBonus(person, pupil, ctx.sightRadius));
          student = pupil;
        }
      }

      // Give: generosity toward people you already like. Cheap for the giver
      // and worth a great deal to the receiver, which is what makes gifts the
      // strongest social lever available before there is any currency.
      // A day's food is kept back before anyone is generous with the rest. The
      // first version reserved almost nothing, so two well-fed people passed the
      // same handful of berries between them twenty-six thousand times in a
      // twelve-day run — each transfer a public act of generosity that every
      // bystander dutifully admired.
      const spareFood = this.carriedNutrition(person) - person.needs.hunger - GIVING_RESERVE;
      if (spareFood > 0) {
        // And only ever to someone hungrier than you. Generosity that flows
        // uphill is just an infinite loop with good manners.
        const hungrier = neighbours.filter(other =>
          other.needs.hunger > person.needs.hunger + 15
        );
        beneficiary = this.pickBest(hungrier, other => {
          const regard = ctx.relationships.opinion(person.id, other.id);
          // Kin first, and children before anyone. A band that would not feed
          // its own young does not have a second generation.
          const kin = ctx.relationships.kinship(person.id, other.id);
          const young = other.isChild ? 40 : 0;
          return regard + kin + young + other.needs.hunger * 0.4 - person.distanceTo(other) * 2;
        });
        if (beneficiary) {
          const regard = Math.max(0, ctx.relationships.opinion(person.id, beneficiary.id)) / 100;
          const theirNeed = beneficiary.needs.hunger / 100;
          add('give', (0.3 + regard * 0.8 + theirNeed * 0.5) *
            (1 - person.traits.greed * 0.7) * (0.3 + person.traits.loyalty)
            * this.proximityBonus(person, beneficiary, ctx.sightRadius));
        }
      }

      // Steal: wanting what someone else has, weighed against being seen.
      // The privacy term is the interesting one — it makes thieves wait for an
      // empty clearing, and it means a crowded camp polices itself.
      const carrier = this.pickBest(neighbours, other =>
        other.inventory.total - person.distanceTo(other) * 2
      );
      if (carrier && carrier.inventory.total > 0) {
        const onlookers = ctx.peopleHash
          .queryRadius(carrier.x, carrier.y, ctx.sightRadius)
          .filter(o => o.alive && o.id !== person.id && o.id !== carrier.id).length;
        // Thieves prefer privacy but do not require solitude; an opportunist
        // will risk a crowd for something worth having.
        const privacy = 1 / (1 + onlookers * 0.45);
        const dislike = Math.max(0, -ctx.relationships.opinion(person.id, carrier.id)) / 100;
        add('steal',
          (hunger * 0.8 + person.traits.greed * 0.35 + dislike * 0.4) *
          (1 - person.traits.loyalty * 0.6) * privacy *
          this.proximityBonus(person, carrier, ctx.sightRadius));
        victim = carrier;
      }

    }

    // --- Violence ----------------------------------------------------------
    // Scored outside the social cooldown: a fight is a rapid exchange of blows,
    // and someone who has just handed over a gift must still be able to defend
    // themselves.
    const enemy = neighbours.length === 0 ? null : this.pickBest(neighbours, other =>
      -ctx.relationships.opinion(person.id, other.id) - person.distanceTo(other)
    );
    if (enemy) {
      const grudge = Math.max(0, -ctx.relationships.opinion(person.id, enemy.id)) / 100;
      // The bar is high, and deliberately so. The first version let a single
      // witnessed theft justify violence, and a band would consume itself in a
      // fortnight: one theft produced a revenge beating, the beating gave every
      // onlooker a grudge, and the grudges produced more beatings. Most
      // ill-feeling should produce gossip and avoidance, not blood.
      if (grudge > 0.5) {
        // Nobody picks a fight they expect to lose. This protects a thief's
        // victim from being murdered by a stronger neighbour, and makes a crowd
        // genuinely protective: allies standing nearby are counted, so
        // hostility in a full camp stays verbal.
        const myPower = person.skillFactor('fight') * (person.health / 100);
        const theirPower = enemy.skillFactor('fight') * (enemy.health / 100);
        const theirFriends = neighbours.filter(other =>
          other.id !== enemy.id &&
          ctx.relationships.opinion(other.id, enemy.id) > 15
        ).length;
        const boldness = Math.max(0, myPower - theirPower * 0.8) / (1 + theirFriends);

        add('attack', grudge * grudge * boldness *
          (0.5 + person.traits.aggression * 2.5)
          * this.proximityBonus(person, enemy, ctx.sightRadius));
        if (!victim) victim = enemy;
      }
    }

    // --- Building ----------------------------------------------------------
    // Unfinished work in camp draws comfortable people. Deliberately scored
    // just above idle gathering, so a band gets its huts up during the good
    // weather rather than only when someone is already freezing.
    const comfortNow = 1 - Math.max(
      person.needs.hunger, person.needs.thirst, person.needs.fatigue
    ) / 100;
    if (comfortNow > 0.45) {
      site = this.pickBest(
        ctx.buildings.filter(b => !b.complete),
        b => -person.distanceTo({ x: b.centerX, y: b.centerY })
      );
      if (site) {
        const ready = site.materialsReady;
        const canHelp = ready || site.wants(person.inventory);
        if (canHelp) {
          add(ready ? 'build' : 'haul',
            (comfortNow - 0.45) * 1.4 * (0.4 + person.skillFactor('build'))
              * this.proximityBonus(person, { x: site.centerX, y: site.centerY }, ctx.sightRadius));
        } else {
          // Nothing to build with: go and fetch what the site is short of.
          const pending = site;
          const missing = Object.keys(pending.def.materials)
            .find(id => pending.stillNeeds(id) > 0);
          // Timber comes from a standing tree and nothing else; everything
          // else is picked up off the ground.
          if (missing === 'wood') {
            // Prefer the biggest tree that is actually worth the axe. Felling
            // saplings for a hut is how a wood becomes a clearing.
            const candidate = ctx.treeHash.findNearest(
              person.x, person.y, ctx.sightRadius * 3,
              t => t.standing && t.isMature &&
                ctx.world.sameRegion(person.x, person.y, t.x, t.y)
            );
            if (candidate) {
              add('chop', (comfortNow - 0.45) * 1.5 * (0.4 + person.skillFactor('build'))
                * this.proximityBonus(person, candidate, ctx.sightRadius));
              fellTree = candidate;
            }
          } else {
            const kindFor: Record<string, string> = {
              sticks: 'sticks', thatch: 'reeds', mud: 'clay', flint: 'flint',
            };
            const wantedKind = missing ? kindFor[missing] : undefined;
            if (wantedKind) {
              const source = this.findNode(person, ctx, n => n.kind === wantedKind && !n.depleted);
              if (source) {
                add('gather_for_site', (comfortNow - 0.45) * 1.2
                  * this.proximityBonus(person, source, ctx.sightRadius));
                matNode = source;
              }
            }
          }
        }
      }
    }

    // --- Store and withdraw ------------------------------------------------
    // The two halves of surviving a winter. Storing is a comfortable-weather
    // job; withdrawing is what you do when you are hungry and the bushes are
    // bare, which in winter is most of the time.
    const stores = ctx.buildings.filter(b => b.complete && b.def.storage > 0);
    if (stores.length > 0) {
      const carried = this.carriedNutrition(person);
      const surplus = carried - person.needs.hunger - GIVING_RESERVE;
      if (surplus > 0 && comfortNow > 0.4) {
        const store = this.pickBest(
          stores.filter(b => b.storageFree > 0 && b.ownerBandId === person.bandId),
          b => -person.distanceTo({ x: b.centerX, y: b.centerY })
        );
        if (store) {
          add('store', 0.35 * (1 - person.traits.greed * 0.5)
            * this.proximityBonus(person, { x: store.centerX, y: store.centerY }, ctx.sightRadius));
          storeTarget = store;
        }
      }

      if (!carriedFood && person.needs.hunger > 25) {
        const larder = this.pickBest(
          stores.filter(b => b.ownerBandId === person.bandId && b.store.bestFood() !== null),
          b => -person.distanceTo({ x: b.centerX, y: b.centerY })
        );
        if (larder) {
          // Weighted above foraging: a full pit beats a picked-over bush, and
          // this is the behaviour that makes stored food worth having.
          add('take', hunger * 2.4
            * this.proximityBonus(person, { x: larder.centerX, y: larder.centerY }, ctx.sightRadius));
          storeTarget = storeTarget ?? larder;
          larderTarget = larder;
        }
      }
    }

    // --- Shelter -----------------------------------------------------------
    // Cold sends people indoors. This is the payoff for building anything at
    // all, and the reason a winter is now survivable.
    if (person.needs.cold > 25) {
      shelter = this.pickBest(
        ctx.buildings.filter(b => b.complete && b.def.shelter > 0.2),
        b => b.def.shelter * 40 - person.distanceTo({ x: b.centerX, y: b.centerY })
      );
      if (shelter) {
        add('shelter', urgencyCurve(person.needs.cold) * 2.6 * shelter.def.shelter
          * this.proximityBonus(person, { x: shelter.centerX, y: shelter.centerY }, ctx.sightRadius));
      }
    }

    // --- Flee --------------------------------------------------------------
    // Being hurt outranks everything. A fight the loser can walk away from is
    // the normal outcome; a fight neither party can leave is always a killing.
    const recentlyHarmed = ctx.time.tick - person.lastHarmedTick < 300;
    const threat = person.lastHarmedBy === null
      ? null
      : neighbours.find(other => other.id === person.lastHarmedBy) ?? null;
    if (recentlyHarmed && threat) {
      const hurt = 1 - person.health / 100;
      const outmatched = Math.max(
        0,
        threat.skillFactor('fight') * threat.health / 100 -
          person.skillFactor('fight') * person.health / 100
      );
      add('flee', (hurt * 2.5 + outmatched * 2 + 0.4) * (1.4 - person.traits.aggression));
      fleeFrom = threat;
    }

    // --- Craft -------------------------------------------------------------
    // A hand axe, once somebody knows how. Scored well above idle gathering
    // because the payoff is large and obvious: everything involving wood halves.
    if (
      person.knownTech.has('hafting') &&
      !person.inventory.has('handaxe') &&
      person.inventory.has('flint') &&
      person.inventory.has('sticks')
    ) {
      add('craft', 0.55 * (0.4 + person.skillFactor('knap')));
    }

    // --- Rest --------------------------------------------------------------
    add('rest', fatigue * (ctx.time.isNight ? 2.4 : 1.2));

    // --- Wander ------------------------------------------------------------
    // A small floor so a person with nothing pressing still looks alive, and so
    // the action distribution never collapses to a single behaviour. Kept low:
    // wandering must never out-score real work, or people mill about while
    // their needs climb.
    add('wander', 0.02 + ctx.rng.next() * 0.03);

    scores.sort((a, b) => b.score - a.score);
    lastScores.set(person.id, scores.slice(0, 6));
    return {
      scores,
      found: {
        water, foodNode, matNode, companion, suitor, student, victim, beneficiary, fleeFrom,
        site, shelter, storeTarget, larderTarget, fruitTree, fellTree,
      },
    };
  }

  /** Highest-scoring candidate, or null for an empty list. Deterministic. */
  private pickBest<T>(items: T[], score: (item: T) => number): T | null {
    let best: T | null = null;
    let bestScore = -Infinity;
    for (const item of items) {
      const value = score(item);
      if (value > bestScore) {
        bestScore = value;
        best = item;
      }
    }
    return best;
  }

  private carriedNutrition(person: Person): number {
    return person.inventory.entries()
      .reduce((sum, [id, count]) => sum + (ITEMS[id]?.nutrition ?? 0) * count, 0);
  }

  /** Closer targets are worth more, but distance never zeroes a desperate need. */
  private proximityBonus(person: Person, target: { x: number; y: number }, sight: number): number {
    const d = person.distanceTo(target);
    return 0.45 + 0.55 * Math.max(0, 1 - d / (sight * 2));
  }

  private findWater(person: Person, ctx: BrainContext): { x: number; y: number } | null {
    // Thirst searches much further than sight — people know where the river is
    // even when they cannot see it — but only on their own landmass. Walking at
    // water you cannot reach is how a band starves in sight of a lake.
    return ctx.shoreHash.findNearest(person.x, person.y, ctx.sightRadius * 6,
      tile => ctx.world.sameRegion(person.x, person.y, tile.x, tile.y));
  }

  private findNode(
    person: Person,
    ctx: BrainContext,
    filter: (n: ResourceNode) => boolean
  ): ResourceNode | null {
    return ctx.nodeHash.findNearest(person.x, person.y, ctx.sightRadius * 2,
      n => filter(n) && ctx.world.sameRegion(person.x, person.y, n.x, n.y));
  }

  private setup(
    person: Person,
    action: string,
    ctx: BrainContext,
    found: FoundTargets
  ): void {
    person.clearTarget();
    person.action = action;

    switch (action) {
      case 'drink':
        if (found.water) {
          person.targetX = found.water.x;
          person.targetY = found.water.y;
        }
        break;
      case 'pick':
      case 'chop': {
        const tree = action === 'pick' ? found.fruitTree : found.fellTree;
        if (tree) {
          person.targetTreeId = tree.id;
          person.targetX = tree.x;
          person.targetY = tree.y;
        }
        break;
      }
      case 'store':
      case 'take':
      case 'build':
      case 'haul':
      case 'shelter': {
        const building =
          action === 'shelter' ? found.shelter :
          action === 'take' ? found.larderTarget :
          action === 'store' ? found.storeTarget :
          found.site;
        if (building) {
          person.targetBuildingId = building.id;
          person.targetX = building.centerX;
          person.targetY = building.centerY;
        }
        break;
      }
      case 'forage':
      case 'gather_for_site':
      case 'gather': {
        // `gather_for_site` is ordinary gathering aimed at a material a
        // construction site is short of; the action system does not need to
        // know the difference, only the scorer does.
        if (action === 'gather_for_site') person.action = 'gather';
        const node = action === 'forage' ? found.foodNode : found.matNode;
        if (node) {
          person.targetX = node.x;
          person.targetY = node.y;
          person.targetNodeId = node.id;
        }
        break;
      }
      case 'wander': {
        // A short hop rather than a cross-map trek, so wandering reads as
        // milling about camp instead of migration.
        const r = ctx.sightRadius;
        for (let attempt = 0; attempt < 8; attempt++) {
          const tx = Math.round(person.x + ctx.rng.range(-r, r));
          const ty = Math.round(person.y + ctx.rng.range(-r, r));
          if (ctx.world.isWalkable(tx, ty)) {
            person.targetX = tx;
            person.targetY = ty;
            break;
          }
        }
        break;
      }
      case 'flee': {
        // Run to a walkable tile directly away from whoever hurt you.
        const from = found.fleeFrom;
        if (from) {
          const dx = person.x - from.x;
          const dy = person.y - from.y;
          const length = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
          for (const distance of [14, 10, 7, 4]) {
            const tx = Math.round(person.x + (dx / length) * distance);
            const ty = Math.round(person.y + (dy / length) * distance);
            if (ctx.world.isWalkable(tx, ty)) {
              person.targetX = tx;
              person.targetY = ty;
              break;
            }
          }
        }
        break;
      }
      case 'talk':
      case 'teach':
      case 'court':
      case 'give':
      case 'steal':
      case 'attack': {
        const other =
          action === 'talk' ? found.companion :
          action === 'teach' ? found.student :
          action === 'court' ? found.suitor :
          action === 'give' ? found.beneficiary :
          found.victim;
        if (other) {
          person.targetX = other.x;
          person.targetY = other.y;
          person.targetPersonId = other.id;
        }
        break;
      }
      // 'eat' and 'rest' happen where you stand and need no target.
    }
  }
}
