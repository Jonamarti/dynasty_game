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
import { isFoodKind } from '../entities/ResourceNode.ts';
import type { World } from '../core/World.ts';
import type { TimeManager } from '../core/TimeManager.ts';
import type { RNG } from '../core/RNG.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { Relationship, RelationshipGraph } from '../social/Relationships.ts';
import { telemetry } from '../core/Telemetry.ts';
import { CONVERSATION_MODES, chooseMode } from '../social/Conversation.ts';
import { isTrap } from '../entities/Building.ts';
import type { Building } from '../entities/Building.ts';
import type { Tree } from '../entities/Tree.ts';
import type { Animal } from '../entities/Animal.ts';
import { ITEMS } from '../entities/Item.ts';
import {
  TECH, quarryReachFactor, techPower, prerequisitesMet, type Tech,
} from '../knowledge/Tech.ts';
import {
  RECIPES, hasIngredients, recipeFor, recipeUsing, nutritionPerUnit,
} from '../entities/Recipe.ts';
import { INSCRIPTIONS, type Inscription } from '../entities/Inscription.ts';
import { pressedByNeed } from '../systems/ActionSystem.ts';
import type { NeedsConfig } from '../core/Config.ts';
import { PROTOTYPE_AT, type Idea } from '../knowledge/Synthesis.ts';
import { JOBS, WORK_ACTIONS } from '../entities/Job.ts';

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
  animalHash: SpatialHash<Animal>;
  inscriptionHash: SpatialHash<Inscription>;
  /** Everything written down anywhere, so nobody cuts the same word twice. */
  recorded: ReadonlySet<string>;
  sightRadius: number;
  /**
   * Need rates and the base work limits.
   *
   * Here so the scorer asks `pressedByNeed` the same question `ActionSystem`
   * will ask a tick later. Before the limits moved into config the two shared a
   * module constant; they must not come apart now that a scenario can move them.
   */
  needs: NeedsConfig;
  /**
   * Who leads each band, so that standing with the person who leads yours is
   * something anybody can want rather than something only `BandSystem` knows.
   *
   * `BandSystem.chiefByBand` itself, handed straight in rather than copied:
   * `Band.chiefId` is written at the same moment and two readings of who leads
   * a band is one too many.
   */
  chiefByBand: ReadonlyMap<number, number>;
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
  quarry: Animal | null;
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
  /** The child a `teach_child` is aimed at. See the scorer for why it is separate. */
  childPupil: Person | null;
  /** Whoever an `ask` would be addressed to: the teacher, not the pupil. */
  mentor: Person | null;
  colleague: Person | null;
  victim: Person | null;
  beneficiary: Person | null;
  fleeFrom: Person | null;
  /** Which entry of `RECIPES` a chosen `craft` would make. */
  recipe: string | null;
  /** The station a `craft` is to be done at, for the recipes that need one. */
  craftStation: Building | null;
  /** The record a chosen `read` is aimed at. */
  record: Inscription | null;
  /** A half-cut record a chosen `inscribe` should go and finish. */
  unfinished: Inscription | null;
  /** Who a `tend` is aimed at, and which beast a `tame` is coaxing. */
  patient: Person | null;
  strayAnimal: Animal | null;
}

/**
 * Urgency curve. Squaring makes low needs nearly ignorable and high needs
 * overwhelming, which is what stops people from constantly interrupting useful
 * work to top off a need that is only at 30.
 */
/**
 * Ticks before a person will strike up a conversation with the same neighbour.
 *
 * No longer one number. It was 500 flat, chosen when every conversation in the
 * game cost forty-five ticks and answered loneliness outright; with the rungs
 * of `Conversation.ts` the same figure meant a band could nod at each other
 * once a fortnight and never climb off the bottom rung — familiarity never
 * reached `chat`, so no story was ever passed on and the gossip channel closed
 * altogether. How soon you can say something to somebody again depends on what
 * you last said to them, so the gate is the rung's own cooldown: a greeting is
 * repeatable within the hour, an evening is not.
 */
function talkGate(rel: Relationship, tick: number): number {
  return CONVERSATION_MODES[chooseMode(rel, tick)].cooldown;
}

/**
 * The pull toward one's own people, and toward whoever leads them.
 *
 * Note 2: the owner wanted a reason to cultivate a relationship with the tribe
 * and its leader, and there was none. Every social scorer read `opinion`, which
 * is a fact about two individuals — so a band was a set of people who happened
 * to share a camp, and its chief was somebody the band system elected daily and
 * nobody had any reason to go and talk to.
 *
 * Loyalty is what turns belonging into a motive, and grievance is what undoes
 * it: the account is `grievance * (1 - loyalty)`, exactly the `defiance` figure
 * `BandSystem.considerRebellion` already spends when somebody refuses their
 * chief, leaves over him, or challenges him outright. One account, so that a
 * person on the edge of walking out is visibly the same person who has stopped
 * seeking him out — rather than two unrelated numbers that happen to point the
 * same way.
 *
 * The chief's figure is not much larger than a bandmate's. It is a reason to
 * cross the camp, not a reason to do nothing else: a band where everybody
 * queues to talk to the chief is a court, and this is a stone age.
 */
const BAND_BOND = 0.25;
const CHIEF_BOND = 0.7;

/**
 * How much a hunt is worth, before the odds and the size of the animal.
 *
 * Tuned against the score table rather than by feel. Below about 6 nothing in
 * the world ever hunts at all — berry bushes outnumber animals six to one, so
 * they are always nearer, and proximity alone settled every comparison. Around
 * 9, hunting tops the table for roughly one think in forty, which is a band
 * that eats meat sometimes and does not abandon the bushes.
 */
const HUNT_APPETITE = 9;

/**
 * How much a trip to the store is worth, before distance and stock.
 *
 * Above `forage`'s 1.6 on purpose: a stocked pit is a certainty and a bush is a
 * walk and a gamble, and in winter the bushes are not regrowing at all.
 */
const TAKE_APPETITE = 4.2;

/** Items in a store above which it is fully worth crossing the camp for. */
const LARDER_WORTH_THE_WALK = 40;

/**
 * The least nourishing fruit that existed before M8.1 hung acorns on the oak.
 *
 * Used as the divisor in `worthRatio`, so that every fruit the game already had
 * scores exactly as it did and only the inedible ones are discounted. See the
 * note there — the whole reason for the constant is that it makes a change to
 * the commonest tree on the island invisible to every world that cannot grind.
 */
const LEANEST_FRUIT = 13;

/**
 * How hurt somebody has to be before anyone will sit with them.
 *
 * Not 100. `needs.recoveryRate` mends a scratch on its own in a few hundred
 * ticks, and a healer who downs tools for every graze is a healer who never
 * forages — the same reasoning the larder floor uses about walking to a store
 * that holds one berry.
 */
const TEND_WORTH_IT = 80;

/**
 * How full a trap has to be before anybody walks out to it, 0-1.
 *
 * Not zero, because a trap holding one fish is a walk for one fish, and not one,
 * because a trap that has to be brimming is a trap that spends its life full and
 * catching nothing.
 */
const TRAP_WORTH_A_ROUND = 0.4;

/**
 * What emptying a full trap is worth to somebody who is not hungry.
 *
 * Sits between storing (0.35) and the pull of an actual appetite, because that
 * is what it is: a chore worth more than tidying a pit and less than a meal.
 * Traps are the only thing in the game that produces while nobody watches, and
 * they are also the only thing that stops producing when nobody comes.
 */
const TRAP_ROUND = 1.1;

/** Nutrition a person keeps for themselves before giving any away. */
const GIVING_RESERVE = 90;

/**
 * The same, for one's own small children. Far lower, deliberately.
 *
 * A day's food held back before being generous with a neighbour is prudence.
 * The same reserve applied to a hungry two-year-old of your own household is
 * how a band fails to raise a second generation.
 */
const DEPENDANT_RESERVE = 15;

/**
 * The verbs `industriousness` pulls away from.
 *
 * Named sets rather than a flag on each `add` call because the scorer has two
 * dozen terms and a per-call argument would have been forgotten at half of
 * them. Social verbs are in neither: wanting to work is not the same as being
 * unsociable, and folding the two together made industrious people into
 * hermits, which then suppressed both teaching and courtship. The other half of
 * the pair, `WORK_ACTIONS`, moved to `Job.ts` when `SocialSystem` gained a
 * second use for it.
 *
 * `ponder` and `discuss` are in neither set, for the reason the social verbs
 * are not: wanting to be *working* is not the same as wanting to think, and an
 * industrious person who would not sit down with a problem is a worse
 * caricature than the one this trait already risks. `prototype` is work — it is
 * a person building a thing out of materials — and is weighted as such.
 */
const IDLE_ACTIONS = new Set(['rest', 'wander']);

/**
 * How much a settled job leans someone toward its own work and away from
 * everyone else's.
 *
 * A smaller pair measured as "close to 1" only shifted `jobs-bias-work`'s
 * margin a few points either side of zero on `crowded` and `harsh-winter` —
 * both scenarios where survival stress and the chief's own `directWork`
 * orders already crowd the action distribution, so a gentle lean was noise
 * beside them. This is the value that held a positive margin across every
 * scenario in `sim:check:all` while leaving `ai-uses-many-actions`'
 * distribution intact — a forager who is starving still eats first, and a
 * hunter still helps build in a hard winter.
 */
const JOB_BIAS_UP = 1.3;
const JOB_BIAS_DOWN = 0.85;

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
    // Industriousness is appetite for work, not speed at it.
    //
    // It biases the *scorer* and nothing else: it never touches how fast a job
    // actually goes. Work rates set the whole food economy, which is measured
    // across ten seeds rather than in one run, so a trait quietly moving them
    // would not show up until a population collapsed and nobody would know why.
    // Kept to a narrow band for the reason every coefficient here is: they are
    // calibrated against each other, and a wide multiplier on half the verbs
    // would silently disable gates elsewhere.
    const drive = 0.8 + person.traits.industriousness * 0.4;
    const idle = 1.2 - person.traits.industriousness * 0.4;
    // Only `WORK_ACTIONS` are biased by a job. Damping social or research
    // verbs for a hunter would make a job a personality change rather than a
    // work assignment, and eating, drinking and fleeing must never be leaned
    // against by an occupation.
    const job = person.job ? JOBS[person.job] : null;
    const add = (id: string, score: number) => {
      const appetite = WORK_ACTIONS.has(id) ? drive : IDLE_ACTIONS.has(id) ? idle : 1;
      const jobBias = job && WORK_ACTIONS.has(id)
        ? (job.actions.includes(id) ? JOB_BIAS_UP : JOB_BIAS_DOWN)
        : 1;
      const weighted = (id === current ? score * 1.25 : score) * appetite * jobBias;
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
    // Data-driven rather than `n.kind === 'berries'`, so fish count as food
    // too — see `isFoodKind` and m8_plan_the_ages.md, mechanism 2.
    const foodNode = this.findNode(person, ctx, n => isFoodKind(n) && !n.depleted);
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
    const carriedNutrition = this.carriedNutrition(person);
    const shortfall = Math.max(0.15, 1 - carriedNutrition / (person.needs.hunger + 70));
    const pickScore = (tree: Tree): number => {
      // A laden fruit tree is a far better haul than a bush, and only exists
      // for part of the year, so it should pull people off berries while it
      // lasts. That seasonal swing is most of what gives the year a shape.
      const laden = Math.min(1, tree.fruit / 8);
      return (hunger * 2.3 * shortfall + person.traits.greed * 0.35) * (0.6 + laden * 0.7)
        * this.worthRatio(this.fruitWorth(person, tree))
        * this.proximityBonus(person, tree, ctx.sightRadius);
    };
    // Two candidates rather than one, and the reason is worth recording because
    // the single-candidate version was written first and measured.
    // `findNearest` returns the *nearest* match, so widening one predicate to
    // include acorns quietly replaced the apple two steps further on with an
    // oak underfoot — everywhere, all autumn. Total fruit picked fell by a fifth
    // and not one acorn was ground, because the oak won the search and then lost
    // the score. Scoring the nearest edible tree against the nearest tree worth
    // anything at all fixes it, and in a world where nobody can grind the two
    // queries return the same tree and this costs one extra hash lookup.
    const reachable = (t: Tree): boolean =>
      t.standing && t.fruit >= 1 && ctx.world.sameRegion(person.x, person.y, t.x, t.y);
    const edible = ctx.treeHash.findNearest(person.x, person.y, ctx.sightRadius * 2,
      t => reachable(t) && (ITEMS[t.def.fruitItem ?? '']?.nutrition ?? 0) > 0);
    const worthwhile = ctx.treeHash.findNearest(person.x, person.y, ctx.sightRadius * 2,
      t => reachable(t) && this.fruitWorth(person, t) > 0);
    fruitTree = !edible ? worthwhile
      : !worthwhile || worthwhile.id === edible.id ? edible
      : pickScore(worthwhile) > pickScore(edible) ? worthwhile : edible;
    if (fruitTree) add('pick', pickScore(fruitTree));

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
    let craftRecipe: string | null = null;
    let craftStation: Building | null = null;
    let craftScore = 0;
    let record: Inscription | null = null;
    let unfinished: Inscription | null = null;
    let shelter: Building | null = null;
    let storeTarget: Building | null = null;
    let larderTarget: Building | null = null;
    let suitor: Person | null = null;
    let student: Person | null = null;
    let childPupil: Person | null = null;
    let mentor: Person | null = null;
    let patient: Person | null = null;
    let strayAnimal: Animal | null = null;


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
        if (!rel) return true;
        return ctx.time.tick - rel.lastContact > talkGate(rel, ctx.time.tick);
      });
      companion = this.pickBest(freshCompany, other =>
        ctx.relationships.opinion(person.id, other.id) + 5 - person.distanceTo(other)
        // Worth about a dozen tiles of walking toward whoever leads your band,
        // and a couple toward anybody else in it. In opinion's units because
        // everything else in this comparison is.
        + this.bond(person, other, ctx) * 12
      );
      if (companion) {
        const regard = ctx.relationships.opinion(person.id, companion.id) / 100;
        // How much of the loneliness this particular conversation would
        // actually answer. A greeting settles a quarter of it, and pulling
        // somebody across the camp with the full weight of their loneliness to
        // collect a quarter of it is how the rungs first cost this world
        // people: the six ticks of a greeting are nothing beside the thirty
        // spent walking to deliver it, and across twenty seeds that walk
        // doubled starvation while `talk` itself rose by under two per cent of
        // all ticks. The price of a rung lives in `Conversation.ts`, and the
        // scorer has to read it or the cheap rungs are not cheap at all.
        const worth = CONVERSATION_MODES[
          chooseMode(ctx.relationships.peek(person.id, companion.id), ctx.time.tick)
        ].relief;
        // The floor matters more than the loneliness term. People with nothing
        // pressing to do should talk, not wander: conversation is the only
        // channel gossip travels down, and a band that never chats never learns
        // anything about anyone. It is deliberately *not* scaled by the rung —
        // striking up an acquaintance with somebody you barely know is the
        // whole of what the floor is for.
        // Note that `bond` is deliberately absent here, and present in the
        // choice of companion above. Belonging decides *who* you cross the
        // camp for; it is not a reason to spend more of the day talking, and
        // when it was one — a `* (1 + bond * 0.6)` on this line — twenty seeds
        // said so: transmission fell from 416.3 lessons passed on to 395.9 and
        // technologies known from 10.3 to 10.1, because the same social
        // cooldown that rations conversation rations arguing a design out, and
        // talk won more of it. The pull toward one's own people costs nothing
        // if it only redirects a conversation that was going to happen anyway.
        add('talk', (loneliness * 1.8 * worth + 0.09) * (1 + regard * 0.5)
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
        // Something they could actually take in, not merely something they do
        // not have: `KnowledgeSystem.teach` drops anything whose prerequisites
        // the pupil is missing, so without this the scorer would keep sending
        // people to teach a lesson that cannot land. It matters far more for
        // children, who start with nothing to build on.
        const canLearn = (other: Person) =>
          [...person.knownTech].some(t =>
            TECH[t as Tech] !== undefined &&
            !other.knownTech.has(t) &&
            prerequisitesMet(t as Tech, other.knownTech));

        const pupils = neighbours.filter(other => !other.isChild && canLearn(other));
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

        // Teaching a child, scored separately from teaching an adult.
        //
        // Its own term rather than a wider filter on the one above, because the
        // two are not the same act and must not compete on the same weights: an
        // adult is chosen for how much they lack and how well you get on, and a
        // child is chosen because it is *yours*. A shared scorer would have
        // every elder in the band teaching the same brightest child, and nobody
        // teaching their own.
        //
        // Rewritten to `teach` in `setup`, the idiom `feed` and
        // `gather_for_site` already use: the action system does not need to
        // know the difference, only the scorer does.
        const young = neighbours.filter(other => other.isChild && canLearn(other));
        const heir = this.pickBest(young, other =>
          (other.motherId === person.id || other.fatherId === person.id ? 40 : 0) +
          ctx.relationships.kinship(person.id, other.id) * 0.5 +
          ctx.relationships.opinion(person.id, other.id) * 0.3 -
          person.distanceTo(other) * 2
        );
        if (heir) {
          const mine = heir.motherId === person.id || heir.fatherId === person.id;
          // An elder with something to hand on and not many years left to do it
          // in is the most valuable person in a band, and handing it to their
          // own grandchildren is the whole shape of a dynasty.
          const urgency = person.isElder ? 1.8 : 1;
          add('teach_child', (0.08 + person.skillFactor('teach') * 0.16)
            * (0.5 + person.traits.tradition) * urgency * (mine ? 1.5 : 0.7)
            * this.proximityBonus(person, heir, ctx.sightRadius));
          childPupil = heir;
        }
      }

      // Ask: the same lesson, wanted from the other end.
      //
      // Outside the `knownTech.size > 0` block above on purpose, because the
      // person with the most to gain from asking is the one who knows nothing
      // — a child, who cannot teach and until now had no way to seek anything
      // out either. Children weigh it higher than adults for the same reason
      // `teach_child` weighs an elder higher: that is where the channel
      // actually carries anything.
      //
      // Curiosity rather than tradition, which is the axis `teach` uses.
      // Wanting to know and wanting things to carry on are different
      // dispositions, and a band where the same trait drove both ends of a
      // lesson would have the incurious never learning from anyone.
      {
        const couldShowMe = (other: Person) =>
          [...other.knownTech].some(t =>
            TECH[t as Tech] !== undefined &&
            !person.knownTech.has(t) &&
            prerequisitesMet(t as Tech, person.knownTech));

        // The willingness roll in `doAsk` is on the teacher's opinion of the
        // asker, so somebody who cannot stand them is a wasted afternoon. The
        // scorer refuses to send anyone there rather than paying ninety ticks
        // to find out, which is the same courtesy `discuss` already extends.
        const mentors = neighbours.filter(other =>
          !other.isChild &&
          couldShowMe(other) &&
          ctx.relationships.opinion(other.id, person.id) >= -20);
        const found = this.pickBest(mentors, other =>
          other.knownTech.size * 2 +
          ctx.relationships.opinion(person.id, other.id) -
          person.distanceTo(other) * 2
        );
        if (found) {
          add('ask', (0.1 + person.traits.curiosity * 0.26)
            * (person.isChild ? 1.6 : 1)
            * this.proximityBonus(person, found, ctx.sightRadius));
          mentor = found;
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
      //
      // Feeding your own small children is not generosity and is not governed
      // by the same reserve. An infant cannot forage, cannot walk to a bush and
      // cannot ask; it eats what a parent hands it or it does not eat. With one
      // reserve for everybody, the people starving in a long run were newborns
      // and toddlers — ages 0, 0, 0, 1, 3, 3, 5 in one two-year sample — while
      // their parents walked around holding food they were not desperate enough
      // to part with.
      const carriedNut = this.carriedNutrition(person);
      const dependants = neighbours.filter(other =>
        other.isChild &&
        (person.childIds.includes(other.id) || other.householdId === person.householdId) &&
        other.needs.hunger > person.needs.hunger + 5
      );
      const spareForKin = carriedNut - person.needs.hunger - DEPENDANT_RESERVE;
      const spareFood = carriedNut - person.needs.hunger - GIVING_RESERVE;

      if (spareForKin > 0 && dependants.length > 0) {
        beneficiary = this.pickBest(dependants,
          other => other.needs.hunger - person.distanceTo(other) * 2);
        if (beneficiary) {
          // Scored well above ordinary giving and barely weighted by
          // temperament: a greedy parent still feeds their own child.
          add('feed', (0.8 + (beneficiary.needs.hunger / 100) * 1.4)
            * (1 - person.traits.greed * 0.25)
            * this.proximityBonus(person, beneficiary, ctx.sightRadius));
        }
      } else if (spareFood > 0) {
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
          // And one's own band before strangers, which is the half of note 2
          // that is about the tribe rather than the leader. Well under `kin`:
          // a gift is how you court a chief and blood still comes first.
          return regard + kin + young + this.bond(person, other, ctx) * 12
            + other.needs.hunger * 0.4 - person.distanceTo(other) * 2;
        });
        if (beneficiary) {
          const regard = Math.max(0, ctx.relationships.opinion(person.id, beneficiary.id)) / 100;
          const theirNeed = beneficiary.needs.hunger / 100;
          add('give', (0.3 + regard * 0.8 + theirNeed * 0.5
              + this.bond(person, beneficiary, ctx) * 0.6) *
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
            // A material the site wants may be something nobody can pick up.
            // The granary asks for six pots, and a pot is made rather than
            // found: `kindFor` had no entry for it, so `wantedKind` came out
            // undefined, `gather_for_site` was never scored, and the site sat
            // six pots short for ever. That is how a building could be gated
            // behind a real technology, listed in the build menu, and still be
            // unbuildable — the same shape of defect as the longhouse, and just
            // as silent.
            //
            // Fetch what the recipe is made of instead; the craft scorer below
            // turns the parts into the thing once they are in the pack.
            let wanted = missing;
            const short = wanted ? recipeFor(wanted) : null;
            if (short) {
              wanted = techPower(person, short.tech) > 0
                ? Object.keys(short.ingredients)
                  .find(id => person.inventory.count(id) < short.ingredients[id]!)
                : undefined;
            }
            const wantedKind = wanted ? kindFor[wanted] : undefined;
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
        // A trap is somewhere food comes *from*. Filling one with berries would
        // be a person carefully stopping their own snare line from catching
        // anything, because a full trap stops accruing.
        const store = this.pickBest(
          stores.filter(b => b.storageFree > 0 && b.ownerBandId === person.bandId &&
            !isTrap(b.def)),
          b => -person.distanceTo({ x: b.centerX, y: b.centerY })
        );
        if (store) {
          add('store', 0.35 * (1 - person.traits.greed * 0.5)
            * this.proximityBonus(person, { x: store.centerX, y: store.centerY }, ctx.sightRadius));
          storeTarget = store;
        }
      }

      // Two different reasons to walk to a store, scored against each other and
      // added once, because `take` can only aim at one building.
      const nearness = (b: Building): number =>
        this.proximityBonus(person, { x: b.centerX, y: b.centerY }, ctx.sightRadius);
      let bestTake = 0;
      let takeTarget: Building | null = null;
      const wantTake = (b: Building | null, score: number): void => {
        if (b && score > bestTake) {
          bestTake = score;
          takeTarget = b;
        }
      };

      // 1. Hunger. What you are carrying, measured against what you need — not
      //    merely whether you hold a single berry.
      //
      //    The gate used to be `!carriedFood`, so one berry in the pack ruled
      //    the store out entirely. In winter people forage more or less
      //    constantly and therefore almost always hold *something*, which is how
      //    a band came to starve beside a pit holding fourteen hundred items:
      //    over a two-year run `take` accounted for a thousand ticks out of a
      //    million.
      //
      //    The candidate is the nearest store with food in it, and that ranking
      //    is deliberately left alone. Ranking it by expected score instead —
      //    fullness times nearness, which is what the trap round below uses —
      //    looks more principled and measured eight points of mean survival
      //    worse across ten seeds of the default scenario, in worlds with no
      //    traps in them at all. Traps get walked to by the separate route
      //    below rather than by bending this one.
      if (carried < person.needs.hunger && person.needs.hunger > 25) {
        const larder = this.pickBest(
          stores.filter(b => b.ownerBandId === person.bandId && b.store.bestFood() !== null),
          b => -person.distanceTo({ x: b.centerX, y: b.centerY })
        );
        // Weighted well above foraging, and scaled by how well stocked it is. A
        // full pit is a certainty; a bush in February is a walk and a gamble.
        if (larder) {
          wantTake(larder,
            hunger * TAKE_APPETITE * (0.4 + 0.6 * this.stocked(larder)) * nearness(larder));
        }
      }

      // 2. The round. Emptying a trap is a chore somebody does because it is
      //    theirs and it is full, not because they are hungry — and without this
      //    the whole of mechanism 3 quietly fails.
      //
      //    Measured, before it existed: across ten seeds traps stood full for
      //    fifty trap-days a run while people went hungry beside them, because
      //    hunger is what put anybody near a store and a trap is out at the
      //    treeline. A full trap has also stopped catching, so the food that is
      //    in it is costing more food.
      //
      //    Behind the same comfort gate as storing, and it is the same idea: a
      //    round of the traps is a fair-weather job, and somebody who is cold,
      //    parched or exhausted has better things to do than walk the treeline.
      if (comfortNow > 0.4) {
        const round = this.pickBest(
          stores.filter(b => isTrap(b.def) && b.ownerBandId === person.bandId &&
            b.store.bestFood() !== null && this.stocked(b) >= TRAP_WORTH_A_ROUND),
          b => this.stocked(b) * nearness(b)
        );
        if (round) wantTake(round, TRAP_ROUND * this.stocked(round) * nearness(round));
      }

      if (takeTarget) {
        add('take', bestTake);
        storeTarget = storeTarget ?? takeTarget;
        larderTarget = takeTarget;
      }
    }

    // --- Hunt --------------------------------------------------------------
    // Meat is worth several times what a handful of berries is, and a hunt can
    // fail, so this is scored on expected return rather than on hunger alone:
    // a poor hunter should keep picking berries and a good one should go out.
    let quarry: Animal | null = null;
    if (!person.isChild && !person.isLaden) {
      // Tracking is what turns hunting from a thing you stumble into to a
      // thing you go out and do: it widens the search before proximity gets to
      // settle the comparison, which it otherwise always does.
      quarry = ctx.animalHash.findNearest(
        person.x, person.y,
        ctx.sightRadius * 1.5 * quarryReachFactor(person),
        a => a.alive
      );
      // Do not *begin* a chase already over the line, the same rule crafting
      // learned. A hunt checks its interruption during the work rather than
      // between pulls, so a thirsty hunter arms a chase, is stopped on the next
      // tick, re-scores, and picks the same quarry again. It cost 786 abandoned
      // attempts per finished axe when crafting had this shape; when thirst
      // started answering to exertion it cost a two-year run **eleven thousand**
      // broken-off chases and the whole population, because a world of people
      // starting hunts is a world where nobody forages.
      //
      // `'hunger'` because hunting is *for* food: being hungry is the reason to
      // go, not a reason to stay. Thirst and cold still hold somebody back.
      if (quarry && !pressedByNeed(person, ctx.needs.workLimits, 'hunger')) {
        const odds = Math.max(0.05, Math.min(0.9,
          person.skillFactor('hunt') * (1 - quarry.def.evasion) + 0.15
        ));
        // Expected return, not appetite. A kill is worth several bushes and a
        // hunt can fail, so the two terms have to be multiplied out or the
        // scorer cannot tell a boar from a hare — and with hunger alone driving
        // it, foraging won every single time and nobody in the world ever
        // hunted at all.
        const payoff = quarry.def.meat / 20;
        add('hunt', hunger * HUNT_APPETITE * odds * payoff
          * this.proximityBonus(person, quarry, ctx.sightRadius));
      }
    }

    // --- Shelter and sleep -------------------------------------------------
    // Cold sends people indoors. This is the payoff for building anything at
    // all, and the reason a winter is now survivable. The same roof is also
    // where anyone tired enough goes to bed, so both are scored off one search.
    if (person.needs.cold > 25 || (ctx.time.isNight && person.needs.fatigue > 20)) {
      shelter = this.pickBest(
        ctx.buildings.filter(b => b.complete && b.def.shelter > 0.2),
        b => b.def.shelter * 40 - person.distanceTo({ x: b.centerX, y: b.centerY })
      );
      if (shelter) {
        const nearness =
          this.proximityBonus(person, { x: shelter.centerX, y: shelter.centerY }, ctx.sightRadius);
        add('shelter', urgencyCurve(person.needs.cold) * 2.6 * shelter.def.shelter * nearness);
        // Above `rest` at night by construction, and below it by day: a roof
        // within reach after dark is where a tired person should be, and
        // sleeping through the afternoon is not.
        add('sleep', fatigue * (ctx.time.isNight ? 3.2 : 1.0) * nearness);
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

    // --- Research ----------------------------------------------------------
    // Thinking, arguing and building the first one. All three are gated on
    // comfort the way gathering is, and for the same reason: a person with an
    // idea and an empty stomach should be foraging. The risk this whole section
    // carries is stealing ticks from food, and if survival drops across twenty
    // seeds after this milestone, the cause is here rather than in the
    // synthesis maths.
    let colleague: Person | null = null;
    const idea = this.workableIdea(person);
    // Devices only. A practice reaches the same stage by being used — see
    // `KnowledgeSystem.settleIntoPractice` — and scoring a `prototype` for one
    // would send somebody off to build a plant lore, which is the sentence the
    // owner's note was about.
    const buildable = person.ideas.find(candidate =>
      candidate.stage === 'researching' && candidate.insight >= PROTOTYPE_AT &&
      TECH[candidate.tech].kind === 'device') ?? null;

    if (comfortNow > 0.45 && idea) {
      const spare = (comfortNow - 0.45) * 2;
      // Deliberately close to `gather`, which is the other thing a comfortable
      // person does with a spare hour. It was half again higher on a first pass
      // and thinking became the sixth most common activity in the world, ahead
      // of building and sleeping, which is not a stone age.
      add('ponder', spare * spare * (0.18 + person.traits.curiosity * 0.3)
        * (0.4 + person.traits.intelligence));

      if (socialReady && neighbours.length > 0) {
        const def = TECH[idea.tech];
        // Somebody who has handled the materials or understands what the thing
        // rests on. A partner with neither has nothing to offer, and the action
        // would refuse on arrival — the scorer should not send anyone there.
        const informed = neighbours.filter(other =>
          !other.isChild &&
          (other.skills[def.skill] >= 12 ||
            def.requires.some(required => other.knownTech.has(required))) &&
          ctx.relationships.opinion(other.id, person.id) >= -20
        );
        colleague = this.pickBest(informed, other =>
          other.skills[def.skill] +
          ctx.relationships.opinion(person.id, other.id) -
          person.distanceTo(other) * 2
        );
        if (colleague) {
          add('discuss', spare * (0.3 + person.traits.curiosity * 0.4)
            * this.proximityBonus(person, colleague, ctx.sightRadius));
        }
      }
    }

    if (buildable) {
      const def = TECH[buildable.tech];
      const ready = Object.entries(def.prototype)
        .every(([itemId, count]) => person.inventory.count(itemId) >= count);
      if (ready) {
        // Scored like crafting, and for the same reason: the materials are
        // already in hand, the payoff is large, and leaving a finished design
        // unbuilt while carrying everything it needs is the one outcome here
        // that would read as broken.
        add('prototype', 0.6 * (0.4 + person.skillFactor(def.skill)));
      }
    }

    // --- Craft -------------------------------------------------------------
    // Table-driven, so a new recipe needs no edit here. Two reasons to make
    // something, deliberately at different weights: one you want for yourself
    // (`keep`, which today is the hand axe and its halving of every job
    // involving wood), and one a half-built structure is waiting on.
    //
    // The site case scores higher because it is the last link of a chain
    // somebody has already walked most of — dig the clay, carry it back, make
    // the pot — and a chain that gets abandoned at its last link never finishes.
    //
    // Nobody starts one while a need is already over the line that stops work.
    // A craft is a single long pull rather than a run of short ones, so its
    // interruption check fires *during* the job: somebody one point past the
    // thirst threshold would arm a two-hundred-tick timer, be stopped on the
    // next tick, re-score and choose it again. The threshold is asked of
    // `ActionSystem` rather than copied, because two copies of a number like
    // this drift and the drift resurfaces as exactly that thrash.
    for (const recipe of
      pressedByNeed(person, ctx.needs.workLimits) ? [] : Object.values(RECIPES)) {
      if (techPower(person, recipe.tech) <= 0) continue;
      if (!hasIngredients(person.inventory, recipe)) continue;
      const output = Object.keys(recipe.output)[0]!;
      const forSelf = person.inventory.count(output) < recipe.keep;
      const forSite = site !== null && site.stillNeeds(output) > 0;
      if (!forSelf && !forSite) continue;

      // M8.1, mechanism 4. A station recipe carries a walk, and without the
      // `proximityBonus` every other scorer with a destination already uses it
      // would score identically to a stationless one and then lose to whatever
      // is underfoot — which, since proximity dominates this scorer, means never
      // firing at all.
      //
      // Somebody else's quern is not offered, matching the rule the store
      // scorer already applies: `Building.ownerBandId` is honoured in exactly
      // one place today and this is the second. Deciding access by the standing
      // between two bands instead is the owner's O4, and it belongs in one place
      // for both when it lands.
      let station: Building | null = null;
      let nearness = 1;
      if (recipe.station !== undefined) {
        const stationId = recipe.station;
        station = this.pickBest(
          ctx.buildings.filter(b =>
            b.complete && b.def.id === stationId && b.ownerBandId === person.bandId &&
            ctx.world.sameRegion(person.x, person.y, b.centerX, b.centerY)),
          b => -person.distanceTo({ x: b.centerX, y: b.centerY })
        );
        if (!station) continue;
        nearness = this.proximityBonus(
          person, { x: station.centerX, y: station.centerY }, ctx.sightRadius);
      }

      const score = (forSite ? 0.75 : 0.55) * (0.4 + person.skillFactor(recipe.skill)) * nearness;
      if (score > craftScore) {
        craftScore = score;
        craftRecipe = recipe.id;
        craftStation = station;
      }
    }
    if (craftRecipe !== null) add('craft', craftScore);

    // --- M8.1: music, medicine and the animal that follows you --------------
    //
    // All three are placed here, after work and before writing, because all
    // three are what somebody does when there is nothing pressing — and all
    // three are gated on `pressedByNeed` for the reason crafting is: they are
    // long jobs with their interruption check *inside* the pull, so a person
    // one point over the line would start one and be stopped on the next tick.
    if (!pressedByNeed(person, ctx.needs.workLimits)) {
      // Play: worth doing when the people around you are lonely, not only when
      // you are. This is the first scorer in the game that reads somebody
      // else's need as its own reason, which is exactly what a flute is for —
      // `talk` answers two people and a tune answers everybody in earshot.
      if (person.inventory.has('flute') && techPower(person, 'flute') > 0) {
        const lonelyNear = neighbours.reduce(
          (worst, other) => Math.max(worst, other.needs.company), person.needs.company);
        add('play', urgencyCurve(lonelyNear) * 1.5 + 0.05);
      }

      // Tend: somebody hurt, in your own band, who is not you. Weighted by how
      // badly and by kinship, because sitting with the sick for four hundred
      // ticks is something people do for their own before they do it for
      // anyone.
      if (techPower(person, 'herbalism') > 0) {
        patient = this.pickBest(
          neighbours.filter(other => other.health < TEND_WORTH_IT &&
            other.bandId === person.bandId),
          other => (100 - other.health) + ctx.relationships.opinion(person.id, other.id) * 0.4
            - person.distanceTo(other)
        );
        if (patient) {
          const hurt = (100 - patient.health) / 100;
          add('tend', hurt * 1.6 * (0.4 + person.skillFactor('heal'))
            * (1 + ctx.relationships.opinion(person.id, patient.id) / 200)
            * this.proximityBonus(person, patient, ctx.sightRadius));
        }
      }

      // Tame: an animal near enough to walk up to, food in the pack to spare,
      // and none of your own already following you. Scored low and gated hard,
      // because it spends food in a world where food is the constraint and most
      // attempts come to nothing — which is the honest shape of the first
      // domestication anybody attempted.
      if (techPower(person, 'taming') > 0 && !person.isChild) {
        const carried = this.carriedNutrition(person);
        const spare = carried - person.needs.hunger - GIVING_RESERVE;
        const hasOne = [...ctx.animalHash.queryRadius(person.x, person.y, ctx.sightRadius * 2)]
          .some(a => a.alive && a.tamedBy === person.id);
        if (spare > 0 && !hasOne) {
          strayAnimal = ctx.animalHash.findNearest(
            person.x, person.y, ctx.sightRadius,
            a => a.alive && a.tamedBy === null &&
              ctx.world.sameRegion(person.x, person.y, a.x, a.y));
          if (strayAnimal) {
            // Calmer beasts are worth trying and skittish ones are not, which
            // is the only place in the game `Animal.temperament` is read and
            // the reason it has been sitting on that class since M6a.
            //
            // Weighted by how well this person *hunts*, which is the term that
            // makes the verb viable at all. A companion is worth 35% on every
            // hunt for the rest of its life, so the best hunter in the band has
            // the most to gain from one — and without saying so the scorer sees
            // only "spear it now" against "feed it and walk away hungry", and
            // hunting wins every time. Measured: handing `culture` a spear took
            // taming from fifteen meals offered in a run to none.
            add('tame', 0.5 * (1 - strayAnimal.temperament)
              * (0.35 + person.skillFactor('hunt'))
              * this.proximityBonus(person, strayAnimal, ctx.sightRadius));
          }
        }
      }
    }

    // --- Writing and reading ------------------------------------------------
    // The fourth channel, and the only one that crosses a death. Both are long
    // and both are gated on comfort, for the same reason crafting is: they are
    // discretionary jobs of a couple of hundred ticks, and a person already
    // over the interruption line would start one and be stopped on the next
    // tick.
    // Gated on being able to use *some* form rather than on `writing`, which
    // since M8.1 is a different question: `ochre` is a record and is not
    // writing, and it is the only one of the three most bands ever reach.
    const anyForm = Object.values(INSCRIPTIONS)
      .some(def => techPower(person, def.literacy) > 0);
    if (!pressedByNeed(person, ctx.needs.workLimits) && anyForm) {
      // Writing: something you know that is nowhere on the ground yet.
      const unrecorded = [...person.knownTech].some(t =>
        TECH[t as Tech] !== undefined && !ctx.recorded.has(t));
      const canCut = Object.values(INSCRIPTIONS).some(def =>
        techPower(person, def.literacy) > 0 &&
        Object.entries(def.materials)
          .every(([itemId, count]) => person.inventory.count(itemId) >= count));
      // A stone somebody left half cut, theirs or anybody's. Finishing one is
      // strictly better than starting another: the flint is already spent and
      // the work is already banked, and a world where every carving is
      // abandoned at half is a world with no records in it.
      const halfCut = ctx.inscriptionHash.findNearest(
        person.x, person.y, ctx.sightRadius * 2,
        candidate => candidate.unfinished &&
          techPower(person, candidate.def.literacy) > 0 &&
          ctx.world.sameRegion(person.x, person.y, candidate.x, candidate.y)
      );
      if (halfCut) {
        add('inscribe', (0.45 + person.traits.tradition * 0.4)
          * this.proximityBonus(person, halfCut, ctx.sightRadius));
        unfinished = halfCut;
      } else if (unrecorded && canCut) {
        // Weighted by tradition rather than by curiosity: cutting a thing into
        // rock is an act about the people who come after you, not about
        // finding anything out. An elder does it hardest, for the same reason
        // an elder teaches hardest.
        add('inscribe', (0.3 + person.traits.tradition * 0.5)
          * (person.isElder ? 1.5 : 1)
          * (0.4 + person.skillFactor('knap') * 0.3));
      }

      // Reading: a record within reach with something on it you could take in.
      const nearest = ctx.inscriptionHash.findNearest(
        person.x, person.y, ctx.sightRadius * 2,
        candidate => candidate.techs.some(t =>
          !person.knownTech.has(t) &&
          TECH[t as Tech] !== undefined &&
          prerequisitesMet(t as Tech, person.knownTech)) &&
          ctx.world.sameRegion(person.x, person.y, candidate.x, candidate.y)
      );
      if (nearest) {
        // Scored high. Walking to a stone and getting a whole technology off it
        // is the best return on a couple of hundred ticks available anywhere in
        // the game, and it should look like it from the outside.
        add('read', (0.7 + person.traits.curiosity * 0.6)
          * this.proximityBonus(person, nearest, ctx.sightRadius));
        record = nearest;
      }
    }

    // --- Rest --------------------------------------------------------------
    // Still here for people with no roof, which after a bad winter is most of
    // them. Sleeping is strictly better and scores higher when it is available.
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
        water, foodNode, matNode, companion, suitor, student, childPupil, mentor, colleague,
        victim, beneficiary, fleeFrom,
        quarry,
        site, shelter, storeTarget, larderTarget, fruitTree, fellTree,
        recipe: craftRecipe, craftStation, record, unfinished,
        patient, strayAnimal,
      },
    };
  }

  /**
   * The idea this person would get furthest with by working on it.
   *
   * Deliberately the same rule `ActionSystem.workableIdea` applies, because the
   * scorer choosing one idea and the action working on another is how you get a
   * person who thinks about hafting all day and never finishes anything.
   */
  private workableIdea(person: Person): Idea | null {
    let best: Idea | null = null;
    for (const candidate of person.ideas) {
      if (candidate.stage === 'prototyped') continue;
      if (candidate.insight >= 1) continue;
      if (best === null || candidate.insight < best.insight) best = candidate;
    }
    return best;
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

  /**
   * What one unit of a tree's fruit is worth to *this* person, in nutrition.
   *
   * Not `ITEMS[...].nutrition`, because M8.1 hangs the first inedible fruit in
   * the game on the commonest tree in it. A raw acorn is worth nothing — that
   * is why nobody ever ate one raw — and worth a good deal to somebody who owns
   * a quern and knows what to do at it. Without this the scorer below, which
   * weighs a tree by how hungry the person is, would send starving people up an
   * oak for a pocketful of tannin.
   *
   * Discounted for the work still to come: an acorn is not food until it has
   * been carried to a stone and ground, and something that is food *now* should
   * win the tie.
   */
  private fruitWorth(person: Person, tree: Tree): number {
    const itemId = tree.def.fruitItem;
    if (itemId === null) return 0;
    const direct = ITEMS[itemId]?.nutrition ?? 0;
    if (direct > 0) return direct;
    const recipe = recipeUsing(itemId);
    if (!recipe || techPower(person, recipe.tech) <= 0) return 0;
    return nutritionPerUnit(recipe, itemId) * 0.6;
  }

  /**
   * How much of a fruit tree's ordinary pull an unusually poor fruit deserves.
   *
   * The divisor is the least nourishing fruit that existed before acorns did, so
   * **every fruit in the game up to M8.1 clamps to 1 and this term is a no-op
   * for them by construction** — which is what makes hanging fruit on the oak a
   * change no existing scenario can feel. An acorn comes out around a half.
   */
  private worthRatio(worth: number): number {
    return Math.min(1, worth / LEANEST_FRUIT);
  }

  private carriedNutrition(person: Person): number {
    return person.inventory.entries()
      .reduce((sum, [id, count]) => sum + (ITEMS[id]?.nutrition ?? 0) * count, 0);
  }

  /**
   * How certain a meal this store is, 0-1.
   *
   * Measured against what the thing *can* hold, never past the floor: a snare
   * holding ten of ten is a certainty, a granary holding ten of four hundred is
   * a rumour, and against a flat constant the two scored the same. For every
   * store the game had before traps — forty upwards — this is exactly the
   * expression it replaced.
   */
  private stocked(store: Building): number {
    const worthTheWalk = Math.min(LARDER_WORTH_THE_WALK, store.def.storage);
    return Math.min(1, store.store.total / worthTheWalk);
  }

  /**
   * How strongly this person is pulled toward that one as *one of their own*,
   * 0 to about 0.9.
   *
   * Zero across a band boundary, and zero toward somebody they have a grudge
   * against in proportion to how little loyalty they have left — see
   * `BAND_BOND`. Nothing here reads how the *other* person feels: belonging is
   * a fact about the one doing the belonging, which is why a chief nobody
   * likes still has a band and an outcast who likes everybody does not.
   */
  private bond(person: Person, other: Person, ctx: BrainContext): number {
    if (other.bandId !== person.bandId || other.id === person.id) return 0;
    const base = ctx.chiefByBand.get(person.bandId) === other.id ? CHIEF_BOND : BAND_BOND;
    const grievance = Math.max(0, -ctx.relationships.opinion(person.id, other.id)) / 100;
    const defiance = grievance * (1 - person.traits.loyalty);
    return base * (0.3 + person.traits.loyalty) * (1 - defiance);
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
      case 'hunt': {
        const animal = found.quarry;
        if (animal) {
          person.targetAnimalId = animal.id;
          person.targetX = animal.x;
          person.targetY = animal.y;
        }
        break;
      }
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
      case 'sleep':
      case 'shelter': {
        const building =
          action === 'shelter' || action === 'sleep' ? found.shelter :
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
      case 'read':
        if (found.record) {
          person.targetInscriptionId = found.record.id;
          person.targetX = found.record.x;
          person.targetY = found.record.y;
        }
        break;
      case 'inscribe':
        // Aimed at a half-cut stone when there is one, and otherwise cut where
        // they stand. A record is a place as much as a thing, and choosing
        // where a *new* one ought to go would mean deciding where records live
        // — which is what a library is for, and the library decides it by being
        // somewhere people already are.
        if (found.unfinished) {
          person.targetInscriptionId = found.unfinished.id;
          person.targetX = found.unfinished.x;
          person.targetY = found.unfinished.y;
        }
        break;
      case 'tend':
        if (found.patient) {
          person.targetPersonId = found.patient.id;
          person.targetX = found.patient.x;
          person.targetY = found.patient.y;
        }
        break;
      case 'tame':
        if (found.strayAnimal) {
          person.targetAnimalId = found.strayAnimal.id;
          person.targetX = found.strayAnimal.x;
          person.targetY = found.strayAnimal.y;
        }
        break;
      case 'play':
        // Played where they stand. A tune has no destination.
        break;
      case 'craft':
        // The only target a craft has is what is being made. Without this the
        // action would find `targetRecipe` null — `clearTarget` at the top of
        // this function having just wiped it — and abandon itself on the very
        // first tick.
        person.targetRecipe = found.recipe;
        // And where, for a station recipe. `doCraft` will not go looking for
        // one; the scorer chose it above and this is how it is handed over.
        if (found.craftStation) {
          person.targetBuildingId = found.craftStation.id;
          person.targetX = found.craftStation.centerX;
          person.targetY = found.craftStation.centerY;
        }
        break;
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
      case 'teach_child':
      case 'ask':
      case 'discuss':
      case 'court':
      case 'feed':
      case 'give':
      case 'steal':
      case 'attack': {
        // `feed` is ordinary giving aimed at one's own hungry child; the action
        // system does not need to know the difference, only the scorer does.
        // Same arrangement as `gather_for_site`.
        if (action === 'feed') person.action = 'give';
        if (action === 'teach_child') person.action = 'teach';
        const other =
          action === 'talk' ? found.companion :
          action === 'teach' ? found.student :
          action === 'teach_child' ? found.childPupil :
          action === 'ask' ? found.mentor :
          action === 'discuss' ? found.colleague :
          action === 'court' ? found.suitor :
          action === 'feed' || action === 'give' ? found.beneficiary :
          found.victim;
        if (other) {
          person.targetX = other.x;
          person.targetY = other.y;
          person.targetPersonId = other.id;
          // Whether the person somebody crossed the camp for was the one
          // leading their band. Counted because `bond` is otherwise a term in
          // a scorer with no visible consequence: `AGENTS.md` says to chase the
          // report rather than the check, and without this line "people court
          // their chief" is an assertion in a comment and nothing else.
          if (ctx.chiefByBand.get(person.bandId) === other.id) {
            telemetry.count('sought_out_chief_' + action);
          }
        }
        break;
      }
      // 'eat', 'rest', 'ponder' and 'prototype' happen where you stand and need
      // no target.
    }
  }
}
