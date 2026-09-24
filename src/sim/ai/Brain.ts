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
import { isBuried } from '../core/Snow.ts';
import type { World } from '../core/World.ts';
import type { TimeManager } from '../core/TimeManager.ts';
import type { RNG } from '../core/RNG.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { Relationship, RelationshipGraph } from '../social/Relationships.ts';
import { telemetry } from '../core/Telemetry.ts';
import { CONVERSATION_MODES, chooseMode } from '../social/Conversation.ts';
import { isTrap, isHeap, isHerd, isWell } from '../entities/Building.ts';
import { SOW_SEED, SPREAD_LOAD } from '../entities/Field.ts';
import type { Building } from '../entities/Building.ts';
import type { Household } from '../entities/Household.ts';
import type { BandRelations } from '../social/BandRelations.ts';
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
import { pressedByNeed, EARSHOT } from '../systems/ActionSystem.ts';
import type { NeedsConfig } from '../core/Config.ts';
import { MAX_IDEAS, PROTOTYPE_AT, type Idea } from '../knowledge/Synthesis.ts';
import { JOBS, WORK_ACTIONS } from '../entities/Job.ts';
import { chooseAmongBest } from '../core/Choice.ts';
import { fightingPower, vulnerabilityOf } from '../social/Vulnerability.ts';
import { mayUse } from '../social/Property.ts';
import {
  homeRange, homeward, fearOf, wariness, STRANGER_AVERSION, DREAD_FLEE_AT, DREAD_FLEE_RANGE,
  DEFEND_AT, DEFEND_BELOW_STANDING, WARN_GRACE, WARN_MEMORY, DEFEND_CEILING, INNER_SHARE,
} from '../social/Fear.ts';
import { INVESTIGATE, CONCEAL, CONCEAL_WATER_REACH } from '../social/Investigation.ts';
import type { Corpse } from '../entities/Corpse.ts';
import {
  isCaptive, isEscapee, captorWatching, ESCAPE, ESCAPE_HOME, HOME_REACHED, CAPTURE_OVER_PREDATION,
  RAID_CAPTURE,
} from '../social/Captivity.ts';
import { TERRITORY_RADIUS } from '../systems/BandSystem.ts';
import {
  caughtOffender, usingPropertyOf, isHeld, isBound, helpCaller, BIND_HELD, PATROL, PATROL_REACH,
  PATROL_LINGER, assailantOf, RESPOND,
  CAUGHT_WARN, CAUGHT_MEMORY, CAUGHT_RESTRAIN, RESTRAIN_NERVE, CALL_MEMORY, CALL_FOR_HELP, ANSWER_CALL,
} from '../social/Defence.ts';
import { offerFor, OFFER_AT_LEAST, REFUSAL_COOLDOWN, AMENDS } from '../social/Amends.ts';
import {
  ownPeopleLicence, tailLicence, conscienceBrake, strangerBrake, mischiefChild, CORRECT,
} from '../social/Restraint.ts';

export interface BrainContext {
  world: World;
  time: TimeManager;
  rng: RNG;
  /**
   * The stream the final choice is drawn from, kept apart from `rng`.
   *
   * `rng` is drawn from inside `score` — `wander`'s jitter, and twice in
   * `setup` — and `score` runs for the player on every rendered frame. Keeping
   * the choice on its own stream is what makes "turn the softening off and land
   * back on the old world exactly" true rather than nearly true.
   */
  choiceRng: RNG;
  /** `Config.ai.choiceSpread`. See `core/Choice.ts`. */
  choiceSpread: number;
  nodeHash: SpatialHash<ResourceNode>;
  peopleHash: SpatialHash<Person>;
  shoreHash: SpatialHash<{ x: number; y: number }>;
  /** M11 phase 16: the bodies, for a killer hiding one. */
  corpseHash?: SpatialHash<Corpse>;
  relationships: RelationshipGraph;
  buildings: Building[];
  treeHash: SpatialHash<Tree>;
  animalHash: SpatialHash<Animal>;
  inscriptionHash: SpatialHash<Inscription>;
  /** Everything written down anywhere, so nobody cuts the same word twice. */
  recorded: ReadonlySet<string>;
  /**
   * How much of its resting fertility a plot still has, 0 to 1.
   *
   * A callback into `Simulation.soilReport` rather than sixteen tile reads in
   * the scorer: this is asked on every think tick and the simulation already
   * computes it for the panel and the health report. One implementation of
   * "how tired is this ground" was the point of `soilReport` in the first
   * place.
   */
  soilWear: (field: Building) => number;
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
  /** How deep the snow lies right now, and whether that is allowed to hide
   * anything — see `Snow.ts` and `Simulation.isBuried`. */
  snowDepth: number;
  snowBuries: boolean;
  /** For `store`'s hoarding term: which building a person's own household calls home. */
  householdsById: ReadonlyMap<number, Household>;
  /** For `mayUse`'s reading of how two bands currently stand. */
  bandRelations: BandRelations;
  /**
   * `sabotage`'s candidates, already filtered and grouped by owner —
   * `Simulation.sabotageCandidatesByBand`'s own comment explains why this is
   * computed once per tick rather than once per person.
   */
  sabotageCandidatesByBand: ReadonlyMap<number, Building[]>;
  /**
   * Each founding band's camp, for M11 phase 14's readers of fear: how far a
   * frightened person will range from it, and which way they drift back.
   * Optional so that a test building a context by hand need not invent a
   * camp; absent, fear has nowhere to pull anybody toward.
   */
  homes?: ReadonlyMap<number, { x: number; y: number }>;
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
  /** Whose building a `sabotage` is aimed at — M11 phase 11b. */
  sabotageTarget: Building | null;
  companion: Person | null;
  suitor: Person | null;
  /** A willing training partner for `spar`. See the scorer for why it is same-band only. */
  sparPartner: Person | null;
  student: Person | null;
  /** The child a `teach_child` is aimed at. See the scorer for why it is separate. */
  childPupil: Person | null;
  /** Whoever an `ask` would be addressed to: the teacher, not the pupil. */
  mentor: Person | null;
  colleague: Person | null;
  /**
   * Whoever a `steal` or a `threaten` is aimed at: the one carrying something.
   *
   * Separate from `foe` since M11 phase 2c, and it had to be. Both were read
   * off this one field, and `steal` writes it unconditionally while the old
   * `attack` line wrote it only `if (!victim)` — so somebody who had both a
   * laden neighbour and a hated one in sight scored `attack` against the enemy
   * and then swung at the neighbour. The grudge that justified the blow and the
   * person who received it were two different people.
   */
  victim: Person | null;
  /** Whoever an `attack` is aimed at. Never merged with `victim`; see above. */
  foe: Person | null;
  /** Which route chose `foe` — revenge, predation, territory or caught. Telemetry only. */
  attackRoute: string;
  /**
   * The outsider a `warn` is aimed at, M11 phase 14b. Its own field rather
   * than `foe`, because the revenge and predation routes overwrite `foe`
   * after the territorial one has chosen, and a warning must go to the person
   * it was scored against.
   */
  intruder: Person | null;
  /** One of this person's own people a `restrain` is aimed at, M11 phase 15b. */
  restrainee: Person | null;
  /** A child of the band a `correct` is aimed at. See `Restraint.ts`. */
  correctee: Person | null;
  /** Whoever a `make_amends` goes to, M12 phase 2a. See `Amends.ts`. */
  amendsTo: Person | null;
  /** Whoever an `answer_call` goes to, M11 phase 15b.4. */
  helpCallerTarget: Person | null;
  /** Somebody held by one of this person's own, for a `bind`, M11 phase 15c. */
  bindTarget: Person | null;
  /** Where on the band's ground a guard's `patrol` goes next, M11 phase 15e. */
  patrolPoint: { x: number; y: number } | null;
  /** Where the body was found, for an `investigate`, M11 phase 16d. */
  investigatePoint: { x: number; y: number } | null;
  /** The body a killer means to hide, for a `drag` or a `dismember`. */
  concealCorpse: Corpse | null;
  /** Who a `gift` goes to, and what, M11 phase 17a. */
  giftee: Person | null;
  giftItem: string | null;
  beneficiary: Person | null;
  /**
   * Who a `trade` is aimed at. Not merged with `beneficiary`: `give` and
   * `trade` can both be scored in the same tick, toward different people —
   * one need-driven, one not — and `setup` must send `trade` to the partner
   * it was actually scored against.
   */
  tradePartner: Person | null;
  fleeFrom: Person | null;
  /** Where a `flee` runs to, found while scoring — `escapeFrom`. */
  fleePoint: { x: number; y: number } | null;
  /** Which entry of `RECIPES` a chosen `craft` would make. */
  recipe: string | null;
  /** The station a `craft` is to be done at, for the recipes that need one. */
  craftStation: Building | null;
  /** The plot a `sow` or a `reap` is aimed at. One field, two different verbs. */
  fieldTarget: Building | null;
  /** The record a chosen `read` is aimed at. */
  record: Inscription | null;
  /** A half-cut record a chosen `inscribe` should go and finish. */
  unfinished: Inscription | null;
  /** Who a `tend` is aimed at, and which beast a `tame` is coaxing. */
  patient: Person | null;
  strayAnimal: Animal | null;
  /**
   * Who a `slander` or a `praise` is *about*. The listener is `companion`,
   * the same person `talk` would have gone to — see the scorer for why
   * sharing that pick is deliberate rather than a shortcut. Two fields
   * because both can be scored in the same tick — a person can have grounds
   * for both at once, about two different people.
   */
  slanderSubjectId: number | null;
  praiseSubjectId: number | null;
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
 * How many tiles of extra walk a fully greedy person will accept to store at
 * their own household's home rather than the nearest band store.
 *
 * M11 phase 6b: the commit that makes `Household.homeBuildingId` matter
 * rather than merely exist. Without this term every store is interchangeable
 * and wealth comes out identically distributed across every household in the
 * band, which is a phase about inequality shipping with nothing that produces
 * any. Scaled by `greed` the same way the willingness to store at all already
 * is, so the two pull in the direction the trait's name promises: a greedy
 * person is not just reluctant to give food to the band, they would rather
 * carry it a little further and keep it where only their own family can draw
 * on it.
 */
const HOARD_PULL = 8;

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
 * `ponder`, `reflect` and `discuss` are in neither set, for the reason the
 * social verbs are not: wanting to be *working* is not the same as wanting to
 * think, and an industrious person who would not sit down with a problem is a
 * worse caricature than the one this trait already risks. `reflect` is the
 * closest call of the three — it looks like doing nothing — but an
 * industriousness penalty on it would mean the hardest workers are the people
 * ideas never occur to, which is a claim about the world nobody made.
 * `prototype` is work — it is a person building a thing out of materials — and
 * is weighted as such.
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
/**
 * How worn a plot has to be before anybody thinks of spreading compost on it.
 *
 * As a share of what the same ground carries untouched — the same statistic the
 * panel shows and `isGroundSpent` judges on, so "in good heart" means one thing
 * in this game and not three. At 0.97 a plot is worth dressing as soon as it
 * has given one harvest, which is what a farmer would actually do.
 */
const COMPOST_WANTED = 0.97;

/**
 * The ceiling on preying upon somebody weaker, and it is low on purpose.
 *
 * Revenge is scored from `grudge * grudge * boldness * (0.5 + aggression *
 * 2.5)`, which reaches roughly 3 for a furious, well-matched aggressor.
 * Predation's own terms already cost it an order of magnitude before this is
 * applied — squared helplessness, a nerve term half the population fails, and
 * a privacy divisor — and this holds what is left well under a hungry person's
 * reasons to go and find food instead.
 *
 * The number to watch when changing it is not how often anybody fights. It is
 * the age distribution of the dead: this route aims itself at children and
 * elders by construction, so a value that is too high shows up first as a world
 * that has stopped having old people in it.
 *
 * **Swept, because the window turned out to be narrow.** Murders over one run,
 * and people alive at the end against the peak:
 *
 *     value   lean                century
 *     none    43/46,  0 murders   64/64,  2 murders
 *     0.55    35/46,  0           -
 *     0.9     43/46,  0           59/59,  7
 *     1.3     41/45,  0           50/50, 14
 *     1.8     33/48,  5           25/35, 23
 *     3       27/43, 25           -
 *     10       4/37, 42           -
 *
 * Between "never fires once" and "the band consumes itself" there is less than
 * a factor of four, which is the same cliff the revenge route's own comment
 * describes from the other side. Above about 1.3 the feedback loop takes over:
 * a killing gives every onlooker a grudge, the grudges feed the *revenge*
 * route, and the revenge route needs no defenceless target at all.
 *
 * One property worth keeping, because it was not designed and is better than
 * what was: **`lean` sees no murders at all until 1.8, while the comfortable
 * `century` sees seven at 0.9.** Predation is leisure, not desperation — a
 * hungry person goes and forages, because `hunger` outscores this by a wide
 * margin. Scarcity in this world produces theft; it is *ease* that produces
 * predators.
 *
 * **0.7 rather than 0.9, and the twenty-seed cohort is why.** The two buy the
 * same violence — seven murders on `century` and 59 alive of a peak of 59,
 * identically — but one of them is nearly free and the other is not:
 *
 *                        none     0.7      0.9
 *     mean survival     100.0%   99.9%    98.3%
 *     technologies       11.8    11.8     11.4
 *     past the roots     11.1    10.4      9.7
 *     taught            674.6   671.0    608.3
 *
 * A tenth of all teaching in the world is not a price worth paying for
 * violence that 0.7 already supplies. Anyone raising this should check the
 * transmission column before the death count: it moves first, and it moves
 * because teaching needs somebody with years to be taught.
 */
/**
 * How far somebody will go out of their way toward a listener who has not heard
 * their news, in the same units as `opinion`.
 *
 * `bond` is 12 and buys about a dozen tiles of walking toward one's own chief.
 * This is under half of that at full salience, which is the intended ordering:
 * news redirects a conversation that was going to happen, it does not
 * manufacture one across the camp. That is the same argument the `bond` comment
 * below already makes for why belonging is absent from `talk`'s own score.
 */
const NEWS_PULL = 5;

/**
 * What having something untold is worth on `talk`'s own score.
 *
 * Sits beside the 0.09 floor rather than scaling the loneliness term, and is of
 * the same order as it: a fresh grievance roughly doubles a comfortable
 * person's baseline inclination to go and find somebody. Bigger than this and
 * `ai-uses-many-actions` starts reporting a world that does nothing but talk,
 * which is the failure the floor's own comment already warns about from the
 * other direction.
 */
const NEWS_URGE = 0.1;

const PREDATION = 0.7;

/**
 * The verbs `ActionSystem.interruption` can end on the tick after they begin,
 * for a need past the working line or a blow, and that answer no need of
 * their own — so a scorer that offered them then would watch them stop and
 * offer them again. Every work verb already asks `pressedByNeed` on its own
 * route, with the need it answers exempted; these never did. M12 phase 2c.
 */
/**
 * `escapeFrom`'s fan: straight away first, then ever wider either side, up to
 * a right angle and a little past it — running *across* an attacker's path is
 * still running, and running toward them is not.
 */
const ESCAPE_TURNS = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.1, -2.1];
const ESCAPE_DISTANCES = [14, 10, 7, 4];

const CUT_OFF_AT_ONCE: ReadonlySet<string> = new Set([
  'talk', 'warn', 'threaten', 'slander', 'praise', 'correct', 'make_amends',
]);

/**
 * How recently somebody must have hit this person for hitting back to be
 * self-defence rather than revenge, in ticks — a few exchanges of blows
 * (`ATTACK_WINDUP` apart), not a day. And the grudge self-defence is treated
 * as carrying, whatever opinion says: just past the revenge gate, so the blow
 * is weighed by boldness like any other but is never refused for want of a
 * grievance. The owner's note of 2026-09-24.
 */
const SELF_DEFENCE_WINDOW = 30;
const SELF_DEFENCE_GRUDGE = 0.7;

/**
 * How much dread of somebody holds back a blow nursed against them. At full
 * dread a grudge is worth under a third of its weight: the man who broke your
 * arm is the man you do not go looking for.
 */
const DREAD_BRAKE = 0.7;

/**
 * How defenceless somebody has to look before predation is considered at all.
 *
 * A hard floor rather than a smooth falloff, because the thing being modelled
 * is a decision a person makes about somebody in front of them — "they could
 * not stop me" — and a smooth curve turns that into a faint, permanent
 * inclination to hurt everybody slightly weaker, which is a different and much
 * worse world.
 */
const PREY_AT = 0.45;

const JOB_BIAS_UP = 1.3;
const JOB_BIAS_DOWN = 0.85;

function urgencyCurve(value: number): number {
  const u = value / 100;
  return u * u;
}

export class Brain {

  /**
   * Chooses and sets up an action. Returns the chosen action id.
   *
   * `allowed`, when given, restricts the choice to those verbs and returns
   * **null** rather than falling back to `wander` when none of them scored.
   * That distinction is the whole reason the parameter exists: it is how the
   * player's character in `urgent` autonomy goes to the water without also
   * wandering off whenever there is no water — see `sim/ai/Autonomy.ts`. A
   * filtered call that found nothing has left the person exactly as it found
   * them, and the caller is the one that knows what to say about it.
   */
  think(person: Person, ctx: BrainContext, allowed?: ReadonlySet<string>): string | null {
    const { scores, found } = this.score(person, ctx);
    // `score` sorts descending and only keeps positive scores, so the best
    // thing this person is inclined to do is at the front of whichever list
    // survives the filter — and the filtered list is still sorted, which is
    // what `chooseAmongBest` needs.
    //
    // The filter allocates, so it only runs when there is one: an unrestricted
    // think is by far the common case and walks the original array.
    const pool = allowed ? scores.filter(s => allowed.has(s.id)) : scores;
    // At `choiceSpread: 0` this is `pool[0]` and takes no draw, which is why
    // the commit that introduced it was bit-identical. Above 0 it picks among
    // the options within a band of the best — see `core/Choice.ts` for why a
    // band and not a temperature, and for why the draw is here in `think`
    // rather than in `score`.
    const chosen = chooseAmongBest(pool, ctx.choiceRng, ctx.choiceSpread)?.id
      ?? (allowed ? null : 'wander');
    if (chosen === null) return null;
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
    // too — see `nodeWorth` below and m8_plan_the_ages.md, mechanism 2.
    //
    // **Food is what this person can make food out of**, which is not the same
    // question as what is edible where it stands — see `nodeWorth`. That is the
    // only thing M8.2 changed here, and the alternative was measured and
    // rejected: a version that chose the *best* food in sight rather than the
    // nearest one looked obviously smarter and killed the whole processing
    // branch of the game, because a forager who walks past poor food never
    // gathers anything a quern could ever be used on. On `millers` it took the
    // things made at a station from 26 to nothing. Foraging is opportunistic,
    // and the technologies that turn what is underfoot into food depend on it
    // being so.
    const foodNode = this.findNode(person, ctx,
      n => !n.depleted && this.nodeWorth(person, n) > 0);
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
    // Everyone near enough to see **and reach**.
    //
    // The region test is the same one `findNode`, the fruit picker, the shelter
    // search, the animal search and the shore search all apply, and people were
    // the one kind of candidate in the whole scorer that never got it. On an
    // island map that is not academic: somebody across a narrow channel is
    // comfortably inside `sightRadius` and cannot be walked to at all, so every
    // social verb — talk, teach, ask, give, steal, threaten, attack — could be
    // scored, chosen and set up against a target the router will then refuse.
    //
    // It surfaced when `untold` landed, and the mechanism is worth recording
    // because it is exactly the kind that hides: **a stranger you have never
    // spoken to is, by definition, someone who has not heard your news**, so a
    // term that pulls toward an uninformed listener pulls hardest toward the
    // unreachable one. `stewards` went from 0 stuck walking ticks in 252,542 to
    // 3,267 in 225,107, with `walk_blocked` and `abandoned_cannot_reach` going
    // 0 -> 76 and recovery attempts 0 -> 298, none of which found a route.
    //
    // Filtered here rather than in seven scorers, for the reason the house
    // style gives: seven copies of a predicate is how seven answers drift.
    const neighbours = ctx.peopleHash
      .queryRadius(person.x, person.y, ctx.sightRadius)
      .filter(other => other.alive && other.id !== person.id &&
        ctx.world.sameRegion(person.x, person.y, other.x, other.y));


    const loneliness = urgencyCurve(person.needs.company);
    let companion: Person | null = null;
    let victim: Person | null = null;
    let foe: Person | null = null;
    let beneficiary: Person | null = null;
    let tradePartner: Person | null = null;
    let fleeFrom: Person | null = null;
    let fleePoint: { x: number; y: number } | null = null;
    let intruder: Person | null = null;
    let restrainee: Person | null = null;
    let correctee: Person | null = null;
    let amendsTo: Person | null = null;
    let helpCallerTarget: Person | null = null;
    let bindTarget: Person | null = null;
    let patrolPoint: { x: number; y: number } | null = null;
    let investigatePoint: { x: number; y: number } | null = null;
    let concealCorpse: Corpse | null = null;
    let giftee: Person | null = null;
    let giftItem: string | null = null;
    let site: Building | null = null;
    let craftRecipe: string | null = null;
    let craftStation: Building | null = null;
    let craftScore = 0;
    let record: Inscription | null = null;
    let unfinished: Inscription | null = null;
    let shelter: Building | null = null;
    let storeTarget: Building | null = null;
    let larderTarget: Building | null = null;
    let sabotageTarget: Building | null = null;
    let suitor: Person | null = null;
    let sparPartner: Person | null = null;
    let student: Person | null = null;
    let childPupil: Person | null = null;
    let mentor: Person | null = null;
    let patient: Person | null = null;
    let strayAnimal: Animal | null = null;
    let slanderSubjectId: number | null = null;
    let praiseSubjectId: number | null = null;


    // Deliberate social approaches are rationed; violence and flight are not.
    const socialReady = ctx.time.tick >= person.socialCooldownUntil;

    if (neighbours.length > 0 && socialReady) {
      // Talk to whoever you like most nearby. Talking is how loneliness is
      // answered and, not incidentally, how every rumor in the world travels.
      // Somebody you have not just spoken to. Without this cooldown two people
      // standing together re-open the same conversation forever and never do
      // anything else.
      // What this person is carrying that somebody nearby might not have heard.
      //
      // The owner's rule is that nothing is known until it is seen or told, and
      // the machinery for it was already right: `emit` tells the victim and
      // whoever was in sight and nobody else, a victim's memory floors at
      // `VICTIM_FLOOR` so it never fades, and `converse` passes the best untold
      // story on. The half that was missing is the *wanting to*. A robbed man
      // would keep his grievance for the rest of his life and mention it only
      // if loneliness happened to send him to somebody, which is why a theft in
      // an empty clearing could stay unknown for a season with the victim
      // walking past the whole band every day.
      //
      // Read once per think tick rather than per candidate — see
      // `Memory.bestStory` for why that matters here.
      const myNews = person.memory.bestStory();
      const newsWeight = myNews === null ? 0 : myNews.salience;
      const untold = (other: Person) =>
        myNews !== null && !other.memory.has(myNews.eventId) ? newsWeight : 0;

      // M11 phase 14b: a frightened person keeps to their own — as a
      // preference over company, never a refusal. See `STRANGER_AVERSION`.
      // Since 2026-09-24 nobody is quite at ease with a stranger: see
      // `Fear.wariness`.
      const freshCompany = neighbours.filter(other => {
        const rel = ctx.relationships.peek(person.id, other.id);
        if (!rel) return true;
        return ctx.time.tick - rel.lastContact > talkGate(rel, ctx.time.tick);
      });
      companion = this.pickBest(freshCompany, other =>
        ctx.relationships.opinion(person.id, other.id) + 5 - person.distanceTo(other)
        - (other.bandId === person.bandId ? 0 : wariness(person,
          ctx.bandRelations.standing(person.bandId, other.bandId)) * STRANGER_AVERSION)
        // Worth about a dozen tiles of walking toward whoever leads your band,
        // and a couple toward anybody else in it. In opinion's units because
        // everything else in this comparison is.
        + this.bond(person, other, ctx) * 12
        // And toward somebody who has not heard it yet. Weaker than `bond`, on
        // purpose: news decides *which* of two equally close friends you go to,
        // it does not send you across the camp to a stranger. The person who
        // has already heard it is still perfectly good company — they are just
        // not who you would pick if you had a choice.
        + untold(other) * NEWS_PULL
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
        // Having something to say is a reason to say it, and it is added to
        // the floor rather than multiplied into the loneliness term: somebody
        // who has just been robbed wants to tell people *whether or not* they
        // are lonely, and a multiplier would have given the news nothing to
        // work with in exactly the case it matters most — a comfortable,
        // well-companioned person who has just been wronged.
        const news = untold(companion);
        add('talk', (loneliness * 1.8 * worth + 0.09 + news * NEWS_URGE)
          * (1 + regard * 0.5)
          * this.proximityBonus(person, companion, ctx.sightRadius));

        // Slander and praise: the sharpest bad story and the sharpest good
        // one this person is carrying, told to the same listener `talk`
        // would go to and framed as a judgement of whoever they are about.
        // Notes 6 and 8 — nobody invents a story, and `malice` is what makes
        // somebody want to tell the bad one unkindly rather than merely
        // mention it.
        //
        // Deliberately *not* `myNews` above: `DEED_SALIENCE` weighs a wrong
        // far above a kindness and a victim's memory of it never fades, so
        // the single most-vivid thing almost anybody is carrying is a
        // grievance. Scoring gossip from `myNews` alone left `praise`
        // unreachable for anyone who had ever witnessed anything bad — which
        // by the second season is everybody. See `Memory.bestSignedStory`.
        const signedNews = person.memory.bestSignedStory();
        const badNews = signedNews.bad;
        // The 0.15 floor matches `bestStoryAbout`'s own — scoring this from a
        // fainter memory would send somebody on a walk `doSlander` can only
        // refuse at the other end.
        if (badNews && badNews.salience >= 0.15 &&
            badNews.actorId !== person.id && badNews.actorId !== companion.id &&
            !companion.memory.has(badNews.eventId)) {
          // Privacy, on the model `steal` already uses below: what a gossip
          // actually risks is being overheard running somebody down, not the
          // walk over. A crowd does not kill the urge, it just makes
          // somebody wait for a thinner one — note 6/3c, the half of
          // "nothing is known unless seen or told" that applies to a
          // conversation as much as to a theft.
          const listenerId = companion.id;
          const onlookers = ctx.peopleHash
            .queryRadius(person.x, person.y, ctx.sightRadius)
            .filter(o => o.alive && o.id !== person.id && o.id !== listenerId).length;
          const privacy = 1 / (1 + onlookers * 0.45);
          add('slander', badNews.salience * (0.4 + person.traits.malice * 1.4) * privacy
            * this.proximityBonus(person, companion, ctx.sightRadius));
          slanderSubjectId = badNews.actorId;
        }
        const goodNews = signedNews.good;
        if (goodNews && goodNews.salience >= 0.15 &&
            goodNews.actorId !== person.id && goodNews.actorId !== companion.id &&
            !companion.memory.has(goodNews.eventId)) {
          add('praise', goodNews.salience * (0.25 + person.traits.loyalty * 0.5)
            * this.proximityBonus(person, companion, ctx.sightRadius));
          praiseSubjectId = goodNews.actorId;
        }
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

      // Spar: a willing bandmate to train against. Note 5's "no warriors"
      // problem (docs/bugs.md, M11 phase 2) had two honest fixes, and the
      // owner chose both — this is the deliberate half. Same-band only,
      // because the point is internal training, not a proxy for the real
      // thing `attack` already covers between rivals.
      //
      // Two independent reasons to want it: aggression, a trait that
      // otherwise only ever points toward hurting somebody, and being
      // outmatched — `skillFactor('fight')` sits at its floor of 0.35 for
      // almost everyone today, so `outmatched` will read near zero for a
      // while and grow meaningful only once this verb and `doHunt`'s trickle
      // have actually spread the skill out.
      if (!person.isChild) {
        const willing = neighbours.filter(other =>
          !other.isChild && other.bandId === person.bandId &&
          ctx.relationships.opinion(person.id, other.id) >= 0);
        const partner = this.pickBest(willing, other =>
          ctx.relationships.opinion(person.id, other.id) - person.distanceTo(other) * 2);
        if (partner) {
          const outmatched = Math.max(0, 0.5 - person.skillFactor('fight'));
          add('spar', (0.1 + person.traits.aggression * 0.5 + outmatched * 0.6)
            * this.proximityBonus(person, partner, ctx.sightRadius));
          sparPartner = partner;
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

      // Trade: a mutual exchange of surplus with somebody from *another*
      // band, M11 phase 7b's third `BandRelations` engine. Deliberately not
      // an `else if` beside `give` above — a person can have both a hungry
      // neighbour to feed and a spare basket to trade away in the same
      // think, toward two different people, the same shape `slanderSubjectId`
      // /`praiseSubjectId` already keep separate. Gated on the *other*
      // person's own surplus too, read directly off their carried food
      // rather than guessed at, so nobody is scored toward a partner with
      // nothing to trade back.
      if (spareFood > 0) {
        const foreigners = neighbours.filter(other => other.bandId !== person.bandId);
        tradePartner = this.pickBest(foreigners, other => {
          const theirSpare = this.carriedNutrition(other) - other.needs.hunger - GIVING_RESERVE;
          if (theirSpare <= 0) return -Infinity;
          return theirSpare - person.distanceTo(other) * 2;
        });
        if (tradePartner) {
          const regard = Math.max(0, ctx.relationships.opinion(person.id, tradePartner.id)) / 100;
          add('trade', (0.25 + regard * 0.5) * (1 - person.traits.greed * 0.4)
            * this.proximityBonus(person, tradePartner, ctx.sightRadius));
        }
      }

      // Steal: wanting what someone else has, weighed against being seen.
      // The privacy term is the interesting one — it makes thieves wait for an
      // empty clearing, and it means a crowded camp polices itself.
      // The owner's note of 2026-09-24: robbing one's own people is the far
      // tail of greed, or desperation, and nothing else — so somebody without
      // that licence does not so much as look at a bandmate's pack, and a
      // laden stranger further off is still a candidate. See `Restraint.ts`.
      const robOwn = ownPeopleLicence(person, person.traits.greed, person.needs.hunger / 100);
      const carrier = this.pickBest(
        robOwn > 0 ? neighbours : neighbours.filter(other => other.bandId !== person.bandId),
        other => other.inventory.total - person.distanceTo(other) * 2
      );
      if (carrier && carrier.inventory.total > 0) {
        const ownPeople = carrier.bandId === person.bandId;
        // A child who has been corrected holds back — from their own people's
        // packs by one conscience, from a stranger's by the other, which only
        // a people that minds such things teaches (M12 phase 2d). An adult's
        // upbringing about their own is already inside `robOwn`; about
        // strangers it is `strangerBrake`, and weaker, because need comes
        // first against another people.
        const restraint = ownPeople
          ? robOwn * (person.isChild ? conscienceBrake(person) : 1)
          : person.isChild ? conscienceBrake(person, true) : strangerBrake(person);
        const onlookers = ctx.peopleHash
          .queryRadius(carrier.x, carrier.y, ctx.sightRadius)
          .filter(o => o.alive && o.id !== person.id && o.id !== carrier.id).length;
        // Thieves prefer privacy but do not require solitude; an opportunist
        // will risk a crowd for something worth having.
        const privacy = 1 / (1 + onlookers * 0.45);
        const dislike = Math.max(0, -ctx.relationships.opinion(person.id, carrier.id)) / 100;
        // Who the target is, and not only what they are carrying.
        //
        // Until this term existed `steal` was the one predatory verb in the
        // game that read nothing at all about its victim: a laden elder and a
        // laden warrior scored identically, and proximity decided between
        // them. `attack` and `threaten` had both always weighed the odds.
        //
        // It is an **addend, not a multiplier**, and that is the whole design.
        // A multiplier would make robbing an equal impossible rather than
        // merely less attractive, which is wrong twice over: hunger should
        // still drive a desperate person to rob somebody who can fight back,
        // and a `steal` that can only ever be aimed downward would make the
        // strongest person in a band untouchable. So weakness is one more
        // reason among the existing three, not a gate on any of them.
        //
        // Weighted below `hunger` on purpose. Need is still the main engine of
        // theft in this world; opportunism is a thumb on the scale.
        const easyMark = vulnerabilityOf(carrier, person);
        // M11 phase 7c, Brain's one reader of `BandRelations`, and the last
        // of the three — see this method's own note on why it is alone in
        // its commit. 0 at neutral or friendly standing, so it never props
        // up a score that used to stand on its own; up to 1 at open
        // hostility, where it is worth about as much as `dislike` already
        // is. Deliberately one-sided: a good relationship between two bands
        // does not make stealing from a stranger *more* appealing than it
        // already reads as, only a bad one makes it appeal more.
        const bandHostility = this.bandHostility(person, carrier.bandId, ctx);
        add('steal',
          (hunger * 0.8 + person.traits.greed * 0.35 + dislike * 0.4 +
            easyMark * person.traits.greed * 0.5 + bandHostility * 0.3) *
          (1 - person.traits.loyalty * 0.6) * privacy * restraint *
          this.proximityBonus(person, carrier, ctx.sightRadius));
        victim = carrier;

        // Threaten: the same want, met by menace instead of stealth. It gets
        // no help from privacy — a demand is made to the victim's face — but
        // it only appeals once the demander could plausibly make it stick,
        // which is the fight-skill gap `menaceOver` itself reads: below a
        // real edge, biting off more than you can chew, and the safer
        // stealthy option is preferred. A loyal person still will not do it;
        // an aggressive one barely needs the excuse `dislike` provides.
        const edge = person.skillFactor('fight') - carrier.skillFactor('fight');
        // Menacing one's own is the tail of aggression, not of greed.
        const menace = ownPeople
          ? ownPeopleLicence(person, person.traits.aggression, person.needs.hunger / 100)
          : strangerBrake(person);
        if (edge > 0.05 && menace > 0 && !person.isChild) {
          add('threaten',
            (hunger * 0.7 + person.traits.greed * 0.3 + dislike * 0.35 + bandHostility * 0.25) *
            (0.4 + person.traits.aggression * 1.2) * (1 - person.traits.loyalty * 0.55) *
            Math.min(1.3, 0.3 + edge * 2.5) * menace *
            this.proximityBonus(person, carrier, ctx.sightRadius));
        }
      }

    }

    // --- Sabotage ------------------------------------------------------------
    // The building-shaped half of predation, M11 phase 11b: wrecking what a
    // rival band leans on rather than what one member of it happens to be
    // carrying. `bandHostility` gates the whole thing at the door — it is
    // zero at neutral or friendly standing by design, so this never fires
    // between bands with no quarrel, only ever amplifying a hostility that
    // already exists, the same one-sided rule `attack`'s cross-band term
    // already follows. No `hunger` term: `steal` is need answering itself,
    // this is a band's standing grudge acting on a building instead of a
    // person, and mixing the two would make a well-fed pacifist band start
    // burning huts the moment its granary ran low.
    //
    // Walks `sabotageCandidatesByBand` rather than `ctx.buildings` directly —
    // see `Simulation.sabotageCandidatesByBand`'s own comment. That map is
    // already grouped by owner and already excludes anything not worth
    // considering regardless of who is asking, so the only work left here is
    // per *band*, not per *building*: skip this person's own band and any
    // band it has no quarrel with — one `Map` lookup each, `bandHostility`'s
    // whole cost — before ever touching that band's buildings, and only then
    // pay for `sameRegion` and `mayUse`'s spatial query on the few that remain.
    {
      let sabotageCandidate: Building | null = null;
      let sabotageDistance = Infinity;
      for (const [ownerBandId, owned] of ctx.sabotageCandidatesByBand) {
        if (ownerBandId === person.bandId) continue;
        if (this.bandHostility(person, ownerBandId, ctx) <= 0) continue;
        for (const b of owned) {
          if (!ctx.world.sameRegion(person.x, person.y, b.centerX, b.centerY)) continue;
          const access = mayUse(person, b, ctx);
          if (access.watched || access.ours) continue;
          const d = person.distanceTo({ x: b.centerX, y: b.centerY });
          if (d < sabotageDistance) {
            sabotageDistance = d;
            sabotageCandidate = b;
          }
        }
      }
      if (sabotageCandidate) {
        const hostility = this.bandHostility(person, sabotageCandidate.ownerBandId, ctx);
        add('sabotage',
          hostility * (0.3 + person.traits.aggression * 1.3) *
          (1 - person.traits.loyalty * 0.5) *
          // Always another people's building: the conscience about strangers.
          (person.isChild ? conscienceBrake(person, true) : strangerBrake(person)) *
          this.proximityBonus(person, sabotageCandidate, ctx.sightRadius));
        sabotageTarget = sabotageCandidate;
      }
    }

    // --- Violence ----------------------------------------------------------
    // Scored outside the social cooldown: a fight is a rapid exchange of blows,
    // and someone who has just handed over a gift must still be able to defend
    // themselves.
    let attackScore = 0;
    // Which of the four routes below won `foe`, counted only if `attack` is
    // the action finally chosen — `npm run sim:check` reports it, and without
    // it there is no telling a revenge killing from a predator's.
    let attackRoute = '';
    // The owner's note of 2026-09-24, measured: before this, 534 of 1018
    // blows chosen in `century` were aimed at a child, and a child is
    // corrected, never beaten (`correct` below). Nor does a child pick a
    // fight: one who is hit runs, which `flee` already answers. Filtered
    // before the pick rather than after it, so that a hated child in view
    // cannot hide the hated adult behind them.
    const adults = person.isChild ? [] : neighbours.filter(other => !other.isChild);
    // Whoever is hitting this person right now comes first, whoever else is
    // hated more: the owner's note that "some do not defend themselves". A
    // blow that had not yet soured opinion past the revenge gate below left
    // its victim standing there taking the next one. Striking back is not a
    // question anybody's temperament or band gets a say in; whether they can
    // win still is, and somebody outmatched runs instead (`flee`).
    const assailant = person.lastHarmedBy === null ||
      ctx.time.tick - person.lastHarmedTick > SELF_DEFENCE_WINDOW
      ? undefined
      : adults.find(other => other.id === person.lastHarmedBy);
    const enemy = assailant ?? (adults.length === 0 ? null : this.pickBest(adults, other =>
      -ctx.relationships.opinion(person.id, other.id) - person.distanceTo(other)
    ));
    if (enemy) {
      const selfDefence = enemy === assailant;
      const grudge = Math.max(selfDefence ? SELF_DEFENCE_GRUDGE : 0,
        -ctx.relationships.opinion(person.id, enemy.id) / 100);
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
        // `fightingPower` is this exact expression, moved to
        // `social/Vulnerability.ts` so that `steal` can ask the same question
        // rather than growing a second answer to it. Unchanged here, on
        // purpose: the commit that extracted it was bit-identical.
        const myPower = fightingPower(person);
        const theirPower = fightingPower(enemy);
        const theirFriends = neighbours.filter(other =>
          other.id !== enemy.id &&
          ctx.relationships.opinion(other.id, enemy.id) > 15
        ).length;
        const boldness = Math.max(0, myPower - theirPower * 0.8) / (1 + theirFriends);

        // Stashed rather than added, because predation below competes for the
        // same verb and the winner has to set `foe` as well as the score. Two
        // `add('attack', ...)` calls would put two rows with one id into a
        // table the HUD and `npm run why` both read as a list of distinct
        // options, and mutating the row after the fact would bypass the
        // appetite and hysteresis multipliers `add` applies.
        //
        // M11 phase 7c: a multiplier, not a second addend beside `grudge`,
        // and deliberately after the `grudge > 0.5` gate rather than folded
        // into it — the gate stays a question about this one enemy, and
        // `bandHostility` only ever amplifies a blow already justified by
        // personal grievance, up to 1.5x at open war between the two bands.
        // Inside a band, a grudge is answered with gossip, avoidance, a
        // faction or exile — and with a blow only by the far tail of the
        // temperament curve (`Restraint.IN_GROUP_TAIL`), about one person in
        // a hundred. Across a band line the grudge stands as it always has.
        const licence = selfDefence || enemy.bandId !== person.bandId
          ? 1 : tailLicence(person.traits.aggression) * conscienceBrake(person);
        // And fear of this particular person holds a hand back: somebody who
        // has hurt you before is somebody you expect to hurt you again. The
        // owner's "fear should brake the attacks too". Not when they are
        // hurting you now — that is when fear turns into fighting back or
        // running, and `flee` is scored below.
        const dread = selfDefence ? 0 : ctx.relationships.dread(person.id, enemy.id) / 100;
        attackScore = grudge * grudge * boldness *
          (0.5 + person.traits.aggression * 2.5) *
          (1 + this.bandHostility(person, enemy.bandId, ctx) * 0.5) *
          licence * (1 - dread * DREAD_BRAKE)
          * this.proximityBonus(person, enemy, ctx.sightRadius);
        foe = enemy;
        attackRoute = selfDefence ? 'self_defence' : 'revenge';
      }
    }

    // --- Predation ---------------------------------------------------------
    // The second half of the owner's note: someone aggressive, facing someone
    // defenceless, does not need a grudge first.
    //
    // The revenge route above is the only way to `attack` there has ever been,
    // and it is gated on `grudge > 0.5` — opinion below -50. **Nothing reaches
    // it.** The `lean` scenario exists precisely to put the world under
    // pressure, it runs at 23% hostile relationships against the default
    // world's 5%, and on the build where that scenario was introduced `attack`
    // did not appear in its action table at all. A world three times more
    // bitter than normal produced no violence whatsoever, because bitterness is
    // not what that gate measures. So this is not a coefficient that wants
    // raising; it is a route that does not exist.
    //
    // Everything about this one is built to keep it rare and keep it ugly:
    //
    //  - **It picks the weakest neighbour, not the most hated.** A different
    //    question needs a different candidate, and pointing predation at the
    //    enemy the revenge route already found would just be revenge with a
    //    lower bar.
    //  - **`helpless` is squared.** A slight edge is worth almost nothing; this
    //    only speaks up for somebody who is genuinely defenceless.
    //  - **`aggression` is thresholded at the midpoint, not scaled from zero.**
    //    Traits are drawn around 0.5, so roughly half of everyone alive can
    //    never take this route at all, however convenient the target. That is
    //    the difference between a world with predators in it and a world where
    //    everyone is one.
    //  - **Never against kin.** Blood is the one line this does not cross,
    //    checked on `kinship` rather than on household so it holds for a
    //    brother in another band.
    //  - **Their allies stop it**, exactly as in revenge, and being seen makes
    //    it worse rather than better — `privacy` is borrowed from `steal`,
    //    because this is the same fear a thief has and not the fear a brawler
    //    has. A man avenging an insult wants witnesses; a man beating a
    //    cripple for their pack does not.
    //
    // It is scored as a candidate against the revenge route rather than added
    // beside it, because two `add('attack', ...)` calls would put two rows with
    // one id into a table the HUD and `npm run why` both read as a list of
    // distinct options.
    // Never a child, and one's own people only by the far tail — the same
    // two lines the revenge route above now keeps.
    const preyLicence = tailLicence(person.traits.aggression) * conscienceBrake(person);
    const candidates = adults.filter(other => other.bandId !== person.bandId || preyLicence > 0);
    const prey = candidates.length === 0 ? null : this.pickBest(candidates, other =>
      vulnerabilityOf(other, person) * 12 - person.distanceTo(other)
    );
    if (prey) {
      const score = this.predationAppeal(person, prey, neighbours, ctx) *
        (prey.bandId === person.bandId ? preyLicence : strangerBrake(person));
      // Only if it beats what revenge already offered, and only then does the
      // blow change hands — so the score and the target never come apart, the
      // way they did before `foe` existed.
      if (score > attackScore) {
        attackScore = score;
        foe = prey;
        attackRoute = 'predation';
      }
    }

    // --- Territory -----------------------------------------------------------
    // M11 phase 14b, the third route to `attack` and the last reader of fear:
    // a frightened person defends the band's ground. See `DEFEND_AT` in
    // `Fear.ts` for the order — warned first, struck only if they stay.
    //
    // `warn` is stashed rather than added for the same reason `attack` is:
    // since phase 15b a second route offers it too, and two rows with one id
    // would read in `npm run why` as two distinct options.
    let warnScore = 0;
    // `restrain` has three routes since phase 15d — one of your own caught at
    // it, an outsider caught at it, and a captive to be taken — stashed for
    // the same reason `warn` and `attack` are.
    let restrainScore = 0;
    {
      const home = ctx.homes?.get(person.bandId);
      const fear = fearOf(person);
      if (home && fear >= DEFEND_AT && !person.isChild) {
        const innerSq = (TERRITORY_RADIUS * INNER_SHARE) ** 2;
        const trespasser = this.pickBest(neighbours.filter(other =>
          other.bandId !== person.bandId && !other.isChild &&
          ctx.homes!.has(other.bandId) &&
          (other.x - home.x) ** 2 + (other.y - home.y) ** 2 <= innerSq &&
          ctx.bandRelations.standing(person.bandId, other.bandId) < DEFEND_BELOW_STANDING &&
          ctx.relationships.kinship(person.id, other.id) === 0
        ), other => -person.distanceTo(other));
        if (trespasser) {
          const since = ctx.time.tick - person.warnedOffTick;
          const warned = person.warnedOffId === trespasser.id && since < WARN_MEMORY;
          if (!warned) {
            warnScore = (0.3 + fear) * (0.5 + person.traits.aggression) *
              this.proximityBonus(person, trespasser, ctx.sightRadius);
            intruder = trespasser;
          } else if (since >= WARN_GRACE) {
            // Nobody picks a fight they expect to lose, here as in revenge.
            // Their allies count against it; the defender's own band standing
            // round them is what makes a camp dangerous to walk into.
            const myPower = fightingPower(person);
            const theirPower = fightingPower(trespasser);
            const mine = neighbours.filter(other =>
              other.bandId === person.bandId && other.id !== person.id && !other.isChild).length;
            const theirs = neighbours.filter(other =>
              other.bandId === trespasser.bandId && other.id !== trespasser.id && !other.isChild).length;
            const boldness = Math.max(0, myPower * (1 + mine * 0.25) - theirPower * 0.8) / (1 + theirs);
            const score = Math.min(DEFEND_CEILING, fear * boldness * (0.5 + person.traits.aggression * 2)) *
              this.proximityBonus(person, trespasser, ctx.sightRadius);
            if (score > attackScore) {
              attackScore = score;
              foe = trespasser;
              attackRoute = 'territory';
              telemetry.count('defend_territory_chosen');
            }
          }
        }
      }
    }

    // --- Caught in the act ---------------------------------------------------
    // M11 phase 15b, the witness's ladder, outsider rung (owner's note 9).
    // Somebody who saw an outsider take, use or wreck what belongs to their
    // people (`Defence.noteCaught`) warns them off, and strikes if they are
    // still there once `WARN_GRACE` has passed — the same two steps and the
    // same bookkeeping as the defence of the ground above, because it is the
    // same act with a different reason for it. What is different is the
    // trigger: this needs no fear and no inner territory, only to have seen
    // it. A thief caught at a store on the edge of the band's land is caught
    // all the same.
    //
    // Only while the offender is in sight: a thief who has got away is a
    // grievance, and grievances already have revenge.
    {
      const caughtId = caughtOffender(person, ctx.time.tick);
      const offender = caughtId === null || person.isChild
        ? undefined
        : neighbours.find(other => other.id === caughtId);
      // A child of the band is `correct`'s, below, and not held down; a
      // child of another people is warned off and never struck.
      if (offender && offender.bandId === person.bandId && !offender.isChild) {
        // M11 phase 15b.3, the rung for one of the witness's own people: hold
        // them back rather than warn them off. Only somebody the witness can
        // hope to hold, with the bandmates standing by them; the one who
        // cannot — or who tried and lost — is 15b.4's, calling for help. Kin
        // are not exempt, unlike every blow in this file: holding back your
        // own brother is exactly what a brother does.
        //
        // Not while a need would break the struggle off. **Measured**: without
        // this gate `century` offered the rung 581 times and won 21 holds,
        // while 102 struggles stopped for thirst and 77 for cold on their
        // first tick — the scorer kept choosing a hold the executor would not
        // let them begin, the ping-pong `pressedByNeed` exists to prevent.
        const tick = ctx.time.tick;
        if (!isHeld(offender, tick) && tick - person.restrainFailedTick > CAUGHT_MEMORY &&
          !pressedByNeed(person, ctx.needs.workLimits)) {
          const standingBy = neighbours.filter(other =>
            other.bandId === person.bandId && other.id !== offender.id && !other.isChild &&
            other.distanceTo(offender) <= 4).length;
          const mine = fightingPower(person) * (1 + standingBy * 0.5);
          if (mine >= fightingPower(offender) * RESTRAIN_NERVE) {
            restrainScore = CAUGHT_RESTRAIN * (0.5 + person.traits.loyalty) *
              this.proximityBonus(person, offender, ctx.sightRadius);
            restrainee = offender;
            telemetry.count('caught_restrain_offered');
          } else if (tick - person.calledForHelpTick > CALL_MEMORY) {
            // M11 phase 15b.4: too strong to hold alone — call for help.
            add('call_for_help', CALL_FOR_HELP * (0.5 + person.traits.loyalty));
            telemetry.count('caught_call_offered');
          }
        } else if (!isHeld(offender, tick) && tick - person.calledForHelpTick > CALL_MEMORY &&
          !pressedByNeed(person, ctx.needs.workLimits)) {
          // Tried to hold them and lost: the next rung is the same shout.
          add('call_for_help', CALL_FOR_HELP * (0.5 + person.traits.loyalty));
          telemetry.count('caught_call_offered');
        }
      } else if (offender && offender.bandId !== person.bandId &&
        ctx.relationships.kinship(person.id, offender.id) === 0) {
        const fear = fearOf(person);
        const since = ctx.time.tick - person.warnedOffTick;
        const warned = person.warnedOffId === offender.id && since < WARN_MEMORY;
        if (!warned) {
          const score = CAUGHT_WARN * (1 + fear) * (0.5 + person.traits.aggression) *
            this.proximityBonus(person, offender, ctx.sightRadius);
          if (score > warnScore) {
            warnScore = score;
            intruder = offender;
            telemetry.count('caught_warn_offered');
          }
        } else if (since >= WARN_GRACE && !offender.isChild &&
          usingPropertyOf(offender, person.bandId, id => ctx.buildings.find(b => b.id === id))) {
          // The same sizing-up as the defence of the ground, with the stake
          // of having seen it in place of the fear that route needs.
          //
          // Only against somebody still at it, warned and back at the store
          // or the hut. **Measured**: the first version struck anybody
          // caught and still in sight once the grace was up, and across
          // twenty seeds of `century` it cost twelve points of survival,
          // raised blows between peoples by a fifth and murders by nearly a
          // third, and moved the violence *away* from the camps — a thief
          // who had stopped and wandered off was beaten wherever the witness
          // next saw them, and every such beating seeded a revenge.
          const myPower = fightingPower(person);
          const theirPower = fightingPower(offender);
          const mine = neighbours.filter(other =>
            other.bandId === person.bandId && other.id !== person.id && !other.isChild).length;
          const theirs = neighbours.filter(other =>
            other.bandId === offender.bandId && other.id !== offender.id && !other.isChild).length;
          // M11 phase 15d, capture in the act: with a rope in hand, a warned
          // offender still at it is held and tied rather than struck — the
          // holder ties them (`ActionSystem.doRestrain`) and the rope makes
          // them this band's captive. Same nerve test as holding one's own.
          if (person.inventory.count('rope') > 0 && techPower(person, 'cordage') > 0 &&
            !isHeld(offender, ctx.time.tick) && !pressedByNeed(person, ctx.needs.workLimits) &&
            myPower * (1 + mine * 0.5) >= theirPower * RESTRAIN_NERVE) {
            const score = CAUGHT_RESTRAIN * (0.5 + person.traits.loyalty) *
              this.proximityBonus(person, offender, ctx.sightRadius);
            if (score > restrainScore) {
              restrainScore = score;
              restrainee = offender;
              telemetry.count('caught_capture_offered');
            }
          }
          const boldness = Math.max(0, myPower * (1 + mine * 0.25) - theirPower * 0.8) / (1 + theirs);
          const score = Math.min(DEFEND_CEILING,
            (0.5 + fear * 0.5) * boldness * (0.5 + person.traits.aggression * 2)) *
            this.proximityBonus(person, offender, ctx.sightRadius);
          if (score > attackScore) {
            attackScore = score;
            foe = offender;
            attackRoute = 'caught';
            telemetry.count('caught_attack_offered');
          }
        }
      }
    }
    if (warnScore > 0) add('warn', warnScore);

    // --- Correcting a child --------------------------------------------------
    // The owner's note of 2026-09-24: "if a child does something wrong — steals,
    // say — the members of the tribe correct them, and the child does not do
    // it again." Any adult of the band who saw it (`Restraint.noteMischief`),
    // not only a parent: a band raises its children together. Not while a need
    // would break it off, the gate every rung of the witness's ladder keeps.
    {
      const childId = person.isChild ? null : mischiefChild(person, ctx.time.tick);
      const child = childId === null ? undefined : neighbours.find(other => other.id === childId);
      if (child && child.isChild && child.bandId === person.bandId &&
        !pressedByNeed(person, ctx.needs.workLimits)) {
        add('correct', CORRECT * (0.5 + person.traits.loyalty) *
          this.proximityBonus(person, child, ctx.sightRadius));
        correctee = child;
        telemetry.count('correct_offered');
      }
    }

    // --- Making amends ---------------------------------------------------------
    // M12 phase 2a. A debt is paid when three things meet: the one owed is
    // here and still minds it, there is enough in hand to make a real offer
    // (`OFFER_AT_LEAST`), and something in this person wants it squared.
    // Inside a band that is loyalty and upbringing; toward another people it
    // is the upbringing their own people gave them about strangers (phase 2d)
    // and fear of the one they wronged — wergild was always partly the price
    // of not being paid back in kind. Greed holds on to the goods.
    if (!person.isChild && person.debts.length > 0 && !pressedByNeed(person, ctx.needs.workLimits)) {
      let best = 0;
      for (const debt of person.debts) {
        if (ctx.time.tick - debt.refusedTick < REFUSAL_COOLDOWN) continue;
        const owed = neighbours.find(other => other.id === debt.toId);
        if (!owed) continue;
        // Nobody pays a debt nobody minds: read off the face of the one owed.
        const resentment = Math.min(1, Math.max(0, -ctx.relationships.opinion(owed.id, person.id) / 50));
        if (resentment <= 0) continue;
        const offer = offerFor(person, debt);
        if (offer.value < debt.worth * OFFER_AT_LEAST) continue;
        const dread = ctx.relationships.dread(person.id, owed.id) / 100;
        const duty = owed.bandId === person.bandId
          ? (0.3 + person.traits.loyalty) * (0.5 + person.conscience)
          : 0.2 + person.conscienceAbroad * 0.8 + dread * 0.8;
        const score = AMENDS * duty * resentment * (1 - person.traits.greed * 0.6) *
          this.proximityBonus(person, owed, ctx.sightRadius);
        if (score > best) {
          best = score;
          amendsTo = owed;
        }
      }
      if (best > 0) {
        add('make_amends', best);
        telemetry.count('amends_offered');
      }
    }

    // --- Taking captives -------------------------------------------------------
    // M11 phase 15d. Two routes; the third way in, capture in the act, is the
    // witness's ladder above.
    //
    // The first: somebody carrying a rope, among a people this one is at odds
    // with, who finds one of them defenceless. The predation route's own appeal (`predationAppeal`), so
    // the same victim is weighed the same way, raised by
    // `CAPTURE_OVER_PREDATION` — with a rope in hand a captive is worth more
    // than a beating, and the capture displacing the blow is what keeps this
    // from adding to the killing. Held, then tied by the holder, then theirs.
    if (!person.isChild && person.captiveOf === null && person.inventory.count('rope') > 0 &&
      techPower(person, 'cordage') > 0 && !pressedByNeed(person, ctx.needs.workLimits)) {
      const tick = ctx.time.tick;
      const quarry = this.pickBest(neighbours.filter(other =>
        other.bandId !== person.bandId && !other.isChild && !isHeld(other, tick) &&
        this.bandHostility(person, other.bandId, ctx) > 0
      ), other => vulnerabilityOf(other, person) * 12 - person.distanceTo(other));
      if (quarry) {
        const score = this.predationAppeal(person, quarry, neighbours, ctx) * CAPTURE_OVER_PREDATION;
        if (score > restrainScore) {
          restrainScore = score;
          restrainee = quarry;
          telemetry.count('capture_offered');
        }
      }
    }
    // The second, the raid's: a raider on the people they came for takes
    // whoever the party can overpower between them — see `RAID_CAPTURE`. The same nerve test as
    // holding one's own, counting the raiders standing by. **No rope of
    // their own needed**: whoever can, holds, and whichever of the party has
    // a rope ties (the bind rung above). Measured: gated on the holder's own
    // rope like the other two routes, `lean`'s twelve raids offered it not
    // once.
    if (!person.isChild && person.captiveOf === null && person.raidingBandId !== null &&
      ctx.time.tick < person.raidingUntil && !pressedByNeed(person, ctx.needs.workLimits)) {
      const tick = ctx.time.tick;
      const raided = person.raidingBandId;
      const target = this.pickBest(neighbours.filter(other =>
        other.bandId === raided && !other.isChild && !isHeld(other, tick) &&
        ctx.relationships.kinship(person.id, other.id) === 0
      ), other => -person.distanceTo(other));
      if (target) {
        const raiders = neighbours.filter(other =>
          other.raidingBandId === raided && tick < other.raidingUntil &&
          other.distanceTo(target) <= 6).length;
        if (fightingPower(person) * (1 + raiders * 0.5) >= fightingPower(target) * RESTRAIN_NERVE) {
          const score = RAID_CAPTURE * this.proximityBonus(person, target, ctx.sightRadius);
          if (score > restrainScore) {
            restrainScore = score;
            restrainee = target;
            telemetry.count('raid_capture_offered');
          }
        }
      }
    }
    if (restrainScore > 0) add('restrain', restrainScore);

    // --- Patrol ------------------------------------------------------------------
    // M11 phase 15e. A guard walks the band's ground — past its own
    // buildings, stores first, because that is where a thief or a saboteur
    // comes. **Measured**: the first round was a ring at half the territory's
    // radius, and `guards-see` failed on three of the four scenarios with
    // guards in them — a guard out on the ring found strangers no more often
    // than anybody working near camp, because strangers came *to* the camp.
    //
    // The round is a fixed walk, not a search: which building, or which point
    // of the ring for a band with none, comes from the time and the guard's
    // own id, so rounds spread and two guards walk different ones — no draw,
    // because nothing about a patrol is chance and a draw here would move
    // every stream after `actionRng`.
    if (person.job === 'guard' && !person.isChild && person.captiveOf === null &&
      !pressedByNeed(person, ctx.needs.workLimits)) {
      const home = ctx.homes?.get(person.bandId);
      if (home) {
        const round = Math.floor(ctx.time.tick / PATROL_LINGER) + person.id * 7;
        const own = ctx.buildings.filter(b =>
          b.ownerBandId === person.bandId && b.complete && !b.ruined &&
          ctx.world.sameRegion(person.x, person.y, b.centerX, b.centerY));
        if (own.length > 0) {
          own.sort((a, b) => (b.def.storage > 0 ? 1 : 0) - (a.def.storage > 0 ? 1 : 0) || a.id - b.id);
          const stores = own.filter(b => b.def.storage > 0).length;
          // Every other round at a store, when there is one.
          const pool = stores > 0 && round % 2 === 0 ? own.slice(0, stores) : own;
          const at = pool[round % pool.length]!;
          patrolPoint = { x: at.centerX, y: at.centerY };
        }
        for (let k = 0; k < 6 && !patrolPoint; k++) {
          const angle = (round + k) * 2.399963;
          const x = home.x + Math.cos(angle) * TERRITORY_RADIUS * PATROL_REACH;
          const y = home.y + Math.sin(angle) * TERRITORY_RADIUS * PATROL_REACH;
          if (ctx.world.isWalkable(x, y) && ctx.world.sameRegion(person.x, person.y, x, y)) {
            patrolPoint = { x, y };
          }
        }
        if (patrolPoint) add('patrol', PATROL);
      }
    }

    // --- Investigating a killing ---------------------------------------------------
    // M11 phase 16d. An open investigation draws its investigator back to
    // where the body was found until it is solved or given up. See
    // `Investigation.ts`.
    if (person.investigation) {
      const open = person.investigation;
      if (ctx.time.tick > open.untilTick) {
        person.investigation = null;
        telemetry.count('murder_unsolved');
      } else if (!person.isChild && !pressedByNeed(person, ctx.needs.workLimits) &&
        ctx.world.sameRegion(person.x, person.y, open.x, open.y)) {
        add('investigate', INVESTIGATE);
        investigatePoint = { x: open.x, y: open.y };
      }
    }

    // --- A gift -------------------------------------------------------------------
    // M11 phase 17a: wealth into standing. Somebody carrying more of a made
    // thing than they want for themselves (`RecipeDef.keep`) gives the spare
    // to one of their own who has none — the big man's generosity, and a
    // deed (`gift`) that raises their household's renown (6c) and warms
    // whoever sees it. Weighed like giving food, by regard, bond, greed and
    // loyalty; only ever to somebody without one, so nobody is loaded with a
    // second axe they will only give away again.
    if (!person.isChild && !pressedByNeed(person, ctx.needs.workLimits)) {
      for (const recipe of Object.values(RECIPES)) {
        if (recipe.keep <= 0) continue;
        const itemId = Object.keys(recipe.output)[0]!;
        if (person.inventory.count(itemId) <= recipe.keep) continue;
        const to = this.pickBest(neighbours.filter(other =>
          other.bandId === person.bandId && !other.isChild && other.inventory.count(itemId) === 0 &&
          other.carrying < other.carryCapacity
        ), other => ctx.relationships.opinion(person.id, other.id) + this.bond(person, other, ctx) * 12 -
          person.distanceTo(other) * 2);
        if (!to) continue;
        const regard = Math.max(0, ctx.relationships.opinion(person.id, to.id)) / 100;
        add('gift', (0.3 + regard * 0.8 + this.bond(person, to, ctx) * 0.6) *
          (1 - person.traits.greed * 0.7) * (0.3 + person.traits.loyalty) *
          this.proximityBonus(person, to, ctx.sightRadius));
        giftee = to;
        giftItem = itemId;
        telemetry.count('gift_offered');
        break;
      }
    }

    // --- Hiding a body -------------------------------------------------------------
    // M11 phase 16's gate. A killer whose killing nobody saw, still marked by
    // it, with nobody else about, hides the body: into the water if there is
    // water within reach of it, cut up past knowing if not. **Measured, and
    // the reason it exists**: without it `bodies-are-found` found every body
    // in `lean`, `craft` and `stewards` — a killing nobody saw could no longer
    // be a perfect crime by construction, but it could not be one by effort
    // either, which is the half of the owner's note the finding makes matter.
    if (person.lastKillId !== null && person.lastKillUnseen && ctx.corpseHash &&
      ctx.time.tick < person.bloodiedUntil && !person.isChild &&
      !pressedByNeed(person, ctx.needs.workLimits) &&
      !neighbours.some(other => !other.isChild)) {
      const victim = person.lastKillId;
      const body = ctx.corpseHash.queryRadius(person.x, person.y, ctx.sightRadius * 2)
        .find(c => c.person.id === victim && !c.dismembered);
      if (body) {
        const water = ctx.shoreHash.findNearest(body.x, body.y, CONCEAL_WATER_REACH,
          tile => ctx.world.sameRegion(body.x, body.y, tile.x, tile.y));
        add(water ? 'drag' : 'dismember', CONCEAL * (0.5 + person.traits.malice));
        concealCorpse = body;
        telemetry.count(water ? 'conceal_drag_offered' : 'conceal_cut_offered');
      }
    }

    // --- Escape ------------------------------------------------------------------
    // M11 phase 15d. A captive with nobody of the captor band in sight slips
    // away — the mirror of `mayUse`, attention and not permission — and a
    // cowed one is less likely to try. Once away, the same verb is the walk
    // home, picked back up after every drink until the old camp is near.
    if (!person.isChild && !pressedByNeed(person, ctx.needs.workLimits)) {
      if (isCaptive(person)) {
        if (!captorWatching(person, ctx.peopleHash, ctx.sightRadius)) {
          add('escape', ESCAPE * (1 - fearOf(person) * 0.7));
          telemetry.count('escape_offered');
        }
      } else if (isEscapee(person)) {
        const home = ctx.homes?.get(person.captiveFrom!);
        if (home && Math.hypot(person.x - home.x, person.y - home.y) > HOME_REACHED) {
          add('escape', ESCAPE_HOME);
        }
      }
    }

    // --- Tying up -------------------------------------------------------------
    // M11 phase 15c. Somebody who knows `cordage` and carries a rope ties up
    // a person one of their own is holding. Never their own kin — tying a
    // brother is a step past holding him back — and only a person held by
    // this band, so a rope is never how anybody joins somebody else's fight.
    if (!person.isChild && person.inventory.count('rope') > 0 && techPower(person, 'cordage') > 0 &&
      !pressedByNeed(person, ctx.needs.workLimits)) {
      const tick = ctx.time.tick;
      const held = this.pickBest(neighbours.filter(other => {
        if (!isHeld(other, tick) || isBound(other, tick) || other.heldBy === null) return false;
        if (ctx.relationships.kinship(person.id, other.id) > 0) return false;
        const holder = neighbours.find(h => h.id === other.heldBy);
        return holder !== undefined && holder.bandId === person.bandId;
      }), other => -person.distanceTo(other));
      if (held) {
        add('bind', BIND_HELD * this.proximityBonus(person, held, ctx.sightRadius));
        bindTarget = held;
        telemetry.count('bind_offered');
      }
    }

    // --- Answering a call ----------------------------------------------------
    // M11 phase 15b.4. Somebody heard a shout for help. Only from one of their
    // own people, kin, or a friend: a stranger's shout is a stranger's
    // business. They come not knowing what it is about; the caller tells them
    // when they get there (`ActionSystem.doAnswerCall`).
    {
      const callerId = helpCaller(person, ctx.time.tick);
      if (callerId !== null && !person.isChild && !pressedByNeed(person, ctx.needs.workLimits)) {
        const caller = ctx.peopleHash
          .queryRadius(person.x, person.y, EARSHOT * 1.5)
          .find(other => other.id === callerId && other.alive);
        if (caller && ctx.world.sameRegion(person.x, person.y, caller.x, caller.y) &&
          (caller.bandId === person.bandId ||
            ctx.relationships.kinship(person.id, caller.id) > 0 ||
            ctx.relationships.opinion(person.id, caller.id) > 15)) {
          add('answer_call', ANSWER_CALL * (0.5 + person.traits.loyalty) *
            this.proximityBonus(person, caller, ctx.sightRadius));
          helpCallerTarget = caller;
        }
      }
    }

    // One row, whichever reason won it, with `foe` naming the person that
    // reason was about.
    if (attackScore > 0) add('attack', attackScore);

    // --- Building ----------------------------------------------------------
    // Unfinished work in camp draws comfortable people. Deliberately scored
    // just above idle gathering, so a band gets its huts up during the good
    // weather rather than only when someone is already freezing.
    const comfortNow = 1 - Math.max(
      person.needs.hunger, person.needs.thirst, person.needs.fatigue
    ) / 100;
    if (comfortNow > 0.45) {
      site = this.pickBest(
        ctx.buildings.filter(b =>
          !b.complete ||
          // M11 phase 11b: a sabotaged building of one's own band draws the
          // same builder a fresh frame would, at the same skill and the same
          // comfort gate — a hut does not know the difference between never
          // having walls and having lost them, and `materialsReady` is
          // trivially true on anything already once delivered, so this falls
          // straight into the `ready` branch below and needs no branch of its
          // own. Not a foreign building: `Building.repair` asks nobody's
          // permission, but nothing here should send someone across a band
          // line to volunteer for it either.
          (b.durability !== null && b.durability < b.def.workTicks &&
            b.ownerBandId === person.bandId)),
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

    // --- Sow, spread and reap ----------------------------------------------
    //
    // M8.2. Two verbs over one target, and the target is chosen by what is
    // standing on it: a ripe field wants reaping and a bare one wants sowing,
    // and no plot is ever both. Both are scored the way `store` and `take` are,
    // on proximity against the band's own ground, because **proximity dominates
    // this scorer** — a field sited across the valley is the fish trap that
    // filled up and was never emptied again, and the planner sites plots near
    // the fire for exactly that reason.
    let fieldTarget: Building | null = null;
    const plots = ctx.buildings.filter(b =>
      b.crop !== null && b.complete && !b.ruined && this.canUse(person, b, ctx));
    if (plots.length > 0) {
      const nearestPlot = (want: (b: Building) => boolean): Building | null =>
        this.pickBest(plots.filter(want),
          b => -person.distanceTo({ x: b.centerX, y: b.centerY }));

      // Reaping first, and it wins ties with sowing by being worth more: a ripe
      // crop is food standing in a field with a week to live, and a bare plot
      // will still be bare tomorrow. Hunger raises it the way it raises
      // foraging, and `greed` carries the rest — bringing in a harvest is the
      // most stockpiling act in the game.
      const ripe = nearestPlot(b => b.crop!.isRipe);
      if (ripe) {
        add('reap',
          (0.9 + hunger * 1.4 + person.traits.greed * 0.4) *
            this.proximityBonus(person, { x: ripe.centerX, y: ripe.centerY }, ctx.sightRadius));
        fieldTarget = ripe;
      }

      // Spreading, which pays nothing this year either, and is the only thing
      // anybody ever does for the sake of a field their grandchildren will
      // reap. Scored on how worn the ground actually is, so a band with a heap
      // and a plot in good heart leaves it alone — `doSpread` refuses on the
      // same test, and a scorer that sent people to spread compost on ground
      // that wants none is a band walking back and forth all season.
      //
      // Above sowing and below reaping: a tired plot is worth putting right
      // before it is worth sowing again, and a ripe crop is worth more than
      // either because it is food with a week to live.
      if (techPower(person, 'composting') > 0 &&
          (person.inventory.count('compost') >= SPREAD_LOAD || this.hasCompost(person, ctx))) {
        const worn = this.pickBest(
          plots.filter(b => ctx.soilWear(b) < COMPOST_WANTED),
          b => -person.distanceTo({ x: b.centerX, y: b.centerY }));
        if (worn) {
          // Weighted like a harvest rather than like a chore, and it is the
          // scarcity of compost that makes that safe: a heap makes about one
          // load a day and a spreading costs four, so a band can do this once
          // every few days however much it wants to. Measured first at half
          // this, where `stewards` rotted down twenty-one loads over three
          // years, left its heaps standing full for a hundred and twenty-four
          // days and spread **nothing** — the option was on the table and
          // never once beat being slightly hungry.
          add('spread',
            (2.2 + (1 - ctx.soilWear(worn)) * 2.0) *
              this.proximityBonus(person, { x: worn.centerX, y: worn.centerY }, ctx.sightRadius));
          fieldTarget = worn;
        }
      }

      // Sowing, which pays nothing today. It is gated on everything `doSow`
      // refuses on — the knowledge, the seed in hand, the season — because a
      // scorer that sends somebody across the camp to be turned away is how a
      // band spends a spring walking to a field and back. The ground itself is
      // *not* tested here: `groundSpent` is sixteen tile reads and this runs on
      // every think tick, so a plot worked out is caught by the refusal, which
      // then tells the player something they need to hear.
      if (!ripe && ctx.time.growth > 0 && techPower(person, 'farming') > 0 &&
          person.inventory.count('grain') >= SOW_SEED) {
        const bare = nearestPlot(b => b.crop!.isFallow);
        if (bare) {
          add('sow',
            (0.55 + person.traits.industriousness * 0.35) *
              this.proximityBonus(person, { x: bare.centerX, y: bare.centerY }, ctx.sightRadius));
          fieldTarget = bare;
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
        // Which building this person's own household calls home, so a greedy
        // person can be pulled toward it below. Null for anyone whose
        // household has never slept under a roof yet.
        const home = person.householdId === null
          ? null
          : ctx.householdsById.get(person.householdId)?.homeBuildingId ?? null;

        // A trap is somewhere food comes *from*. Filling one with berries would
        // be a person carefully stopping their own snare line from catching
        // anything, because a full trap stops accruing. A pen is the same
        // argument — see `BuildingDef.herd`.
        const store = this.pickBest(
          stores.filter(b => b.storageFree > 0 && this.canUse(person, b, ctx) &&
            !isTrap(b.def) && !isHerd(b.def)),
          b => -person.distanceTo({ x: b.centerX, y: b.centerY }) +
            (home !== null && b.id === home ? person.traits.greed * HOARD_PULL : 0)
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
          stores.filter(b => this.canUse(person, b, ctx) && b.store.bestFood() !== null),
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
      //    A pen gets the same route, for the same reason, measured the same
      //    way: `farmers` bred 27 meat into a pen and culled none of it before
      //    this, sitting at capacity for 43 of the run's days, because the
      //    ordinary hungry-larder route below picks the *nearest* store with
      //    food in it and a general granary sitting closer than the pen made
      //    the pen invisible regardless of what was in it — exactly the trap
      //    failure, one building along.
      //
      //    Behind the same comfort gate as storing, and it is the same idea: a
      //    round of the traps and pens is a fair-weather job, and somebody who
      //    is cold, parched or exhausted has better things to do than walk out
      //    to the treeline or the fence.
      if (comfortNow > 0.4) {
        const round = this.pickBest(
          stores.filter(b => (isTrap(b.def) || isHerd(b.def)) && this.canUse(person, b, ctx) &&
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
        // `!b.ruined`, M11 phase 11b: sent to a sabotaged roof, the scorer's
        // own promise — warmer the moment they arrive — would simply be false,
        // the same wasted-trip failure a ruined well's exclusion above avoids.
        ctx.buildings.filter(b =>
          b.complete && !b.ruined && b.def.shelter > 0.2 && this.canUse(person, b, ctx)),
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
    // M12 phase 2c: only where there is somewhere to run. See `escapeFrom`.
    const escapeFromThreat = recentlyHarmed && threat ? this.escapeFrom(person, threat, ctx) : null;
    if (recentlyHarmed && threat && escapeFromThreat) {
      const hurt = 1 - person.health / 100;
      const outmatched = Math.max(
        0,
        threat.skillFactor('fight') * threat.health / 100 -
          person.skillFactor('fight') * person.health / 100
      );
      add('flee', (hurt * 2.5 + outmatched * 2 + 0.4) * (1.4 - person.traits.aggression));
      fleeFrom = threat;
      fleePoint = escapeFromThreat;
    } else if (!(recentlyHarmed && threat)) {
      // M11 phase 14b: somebody you dread, close by, is reason enough to go,
      // whether or not they have raised a hand today. The most dreaded one,
      // weighed against how near they are. Below the fresh-harm case above,
      // which is a person bleeding; this is a person remembering.
      const reach = ctx.sightRadius * DREAD_FLEE_RANGE;
      let dreaded: Person | null = null;
      let worst = 0;
      for (const other of neighbours) {
        const dread = ctx.relationships.dread(person.id, other.id);
        if (dread < DREAD_FLEE_AT) continue;
        const distance = person.distanceTo(other);
        if (distance > reach) continue;
        const weight = dread * (1 - distance / (reach + 1));
        if (weight > worst) {
          worst = weight;
          dreaded = other;
        }
      }
      const away = dreaded ? this.escapeFrom(person, dreaded, ctx) : null;
      if (dreaded && away) {
        const dread = ctx.relationships.dread(person.id, dreaded.id) / 100;
        add('flee', (dread * 1.5 + 0.2) * (1.4 - person.traits.aggression));
        fleeFrom = dreaded;
        fleePoint = away;
        telemetry.count('fled_from_dread_considered');
      }
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

    // Note 4: the verb for somebody with nothing in their head. Strictly the
    // complement of `ponder` below — `idea` is null here and non-null there —
    // so the two never compete, and the risk this carries is not that it beats
    // thinking but that it beats *foraging*. Priced well under `ponder` for
    // that reason: sitting with a real problem should be worth more of a day
    // than sitting with none, and `Brain.ts` already records what happened the
    // one time thinking was priced too near work.
    //
    // The "not fatigued" half of the condition is already in `comfortNow`,
    // which is one minus the worst of hunger, thirst and fatigue: at the 0.45
    // gate a person is below 55 fatigue. A second explicit test would be a
    // second opinion about the same thing.
    if (comfortNow > 0.45 && !idea && ctx.time.tick >= person.reflectCooldownUntil) {
      const spare = (comfortNow - 0.45) * 2;
      add('reflect', spare * spare * (0.10 + person.traits.curiosity * 0.16)
        * (0.4 + person.traits.intelligence));
    }

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
      // A foreign workshop is physically usable when nobody from its band is
      // there to stop you. The same predicate governs stores, fields, shelters
      // and execution; this scorer must not promise work the action system will
      // refuse on arrival under a different ownership rule.
      let station: Building | null = null;
      let nearness = 1;
      if (recipe.station !== undefined) {
        const stationId = recipe.station;
        station = this.pickBest(
          ctx.buildings.filter(b =>
            b.complete && b.def.id === stationId && this.canUse(person, b, ctx)),
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

      // Toast: `brewing`'s answer to the same question, on the same terms —
      // worth doing for the people around you, not only for yourself. Scored
      // a little below `play`, since a cup is spent in one round where a
      // flute goes on giving for as long as somebody keeps playing it.
      if (person.inventory.has('beer') && techPower(person, 'brewing') > 0) {
        const lonelyNear = neighbours.reduce(
          (worst, other) => Math.max(worst, other.needs.company), person.needs.company);
        add('toast', urgencyCurve(lonelyNear) * 1.3 + 0.05);
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
      //
      // A `reminder` record needs the same two extra guards `ActionSystem.
      // doRead` applies before it will call the tech useful: no second idea
      // about a thing already conceived, and no idea at all with both slots
      // full. Without them the scorer kept finding a painting "readable"
      // forever — the tech never leaves `knownTech`, because a reminder was
      // never going to put it there — so people walked over, got turned away
      // with `nothing_new_on_it`, and immediately scored the same walk again.
      // Measured on `craft`: population visibly balled up around painted rock
      // and `perf-budget`/`spatial-hash-spreads` both failed from the
      // clustering, on a scenario that passed clean before this file changed.
      const nearest = ctx.inscriptionHash.findNearest(
        person.x, person.y, ctx.sightRadius * 2,
        candidate => candidate.techs.some(t =>
          !person.knownTech.has(t) &&
          TECH[t as Tech] !== undefined &&
          prerequisitesMet(t as Tech, person.knownTech) &&
          (candidate.def.fidelity === 'instruction' ||
            (!person.ideaFor(t) && person.ideas.length < MAX_IDEAS))) &&
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

    // --- Words that would be cut off, and being set upon ---------------------
    // M12 phase 2c. Here, after every route has had its say, because both
    // questions are about the table as a whole rather than about any one row.
    const setUpon = assailantOf(person, id => neighbours.find(other => other.id === id), ctx.time.tick);
    // A word said, a warning, a telling-off: `ActionSystem.interruption` ends
    // each of them on the tick after it begins if a need is past the working
    // line or somebody is hitting this person, and the scorer used to offer
    // them anyway. Measured on `century`: 12,173 of 14,589 conversations and
    // 5,056 of 6,145 warnings were chosen, cut off, and chosen again, while
    // the person stood there thirsty — the loop that looked, from outside,
    // like somebody who would neither run nor fight.
    if (setUpon || pressedByNeed(person, ctx.needs.workLimits)) {
      let kept = 0;
      for (const row of scores) if (!CUT_OFF_AT_ONCE.has(row.id)) scores[kept++] = row;
      scores.length = kept;
    }
    // The owner's note 4: somebody being beaten runs or hits back. Which of the
    // two is the scorer's own reckoning — `flee` weighs how badly they are
    // hurt and outmatched, the self-defence route weighs the odds of winning —
    // and only the winner is lifted, over everything else, to `RESPOND`.
    // Written onto the row rather than through `add`, whose hysteresis and
    // appetite this is deliberately above.
    if (setUpon) {
      const flee = fleeFrom === setUpon ? scores.find(row => row.id === 'flee') : undefined;
      const strike = foe === setUpon ? scores.find(row => row.id === 'attack') : undefined;
      const answer = strike && (!flee || strike.score > flee.score) ? strike : flee;
      if (answer) {
        answer.score = Math.max(answer.score, RESPOND);
        telemetry.count('set_upon_' + answer.id);
      } else if (!person.isChild) {
        // Nowhere to run (`escapeFrom` found nothing, so `flee` was never
        // offered) and the odds said not to fight: cornered, they fight
        // anyway. A child cornered has neither, and cowers.
        // One row per verb: an `attack` another route aimed at somebody else
        // is re-aimed here rather than joined by a second.
        const aimed = scores.find(row => row.id === 'attack');
        if (aimed) aimed.score = Math.max(aimed.score, RESPOND);
        else scores.push({ id: 'attack', score: RESPOND });
        foe = setUpon;
        attackRoute = 'cornered';
        telemetry.count('set_upon_cornered');
      }
    }

    scores.sort((a, b) => b.score - a.score);
    lastScores.set(person.id, scores.slice(0, 6));
    return {
      scores,
      found: {
        water, foodNode, matNode, companion, suitor, sparPartner, student, childPupil, mentor, colleague,
        victim, foe, attackRoute, intruder, restrainee, correctee, amendsTo, helpCallerTarget, bindTarget, patrolPoint, investigatePoint, concealCorpse, giftee, giftItem, beneficiary, tradePartner, fleeFrom, fleePoint,
        quarry,
        site, shelter, storeTarget, larderTarget, sabotageTarget, fruitTree, fellTree,
        recipe: craftRecipe, craftStation, fieldTarget, record, unfinished,
        patient, strayAnimal, slanderSubjectId, praiseSubjectId,
      },
    };
  }

  /**
   * Somewhere to run to from `from`, or null if there is nowhere.
   *
   * M12 phase 2c. This used to live in `setup` and try only the line straight
   * away from the threat, at four distances. Against a coast or the edge of
   * the map every one of those is under water or off the world, so `flee`
   * was chosen, given no destination, ended where it stood, and was chosen
   * again — measured on `century`, a man in the north-east corner stood
   * `idle` through three blows with `flee` at the top of his table every
   * tick. Now the fan widens, nearest to straight-away first, and a person
   * with truly nowhere to go is not offered `flee` at all: the scorer's floor
   * for somebody set upon then falls to hitting back, which is what a
   * cornered animal does too.
   */
  private escapeFrom(person: Person, from: Person, ctx: BrainContext): { x: number; y: number } | null {
    const away = Math.atan2(person.y - from.y, person.x - from.x);
    for (const turn of ESCAPE_TURNS) {
      const angle = away + turn;
      for (const distance of ESCAPE_DISTANCES) {
        const tx = Math.round(person.x + Math.cos(angle) * distance);
        const ty = Math.round(person.y + Math.sin(angle) * distance);
        if (ctx.world.isWalkable(tx, ty)) return { x: tx, y: ty };
      }
    }
    return null;
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

  /**
   * How much worse `person`'s band stands with `target`'s band than
   * neutral, 0 to 1. Zero within a band and zero at neutral or friendly
   * standing — this only ever speaks up for open hostility, never against
   * it, on the same reasoning `bond` above keeps belonging one-sided.
   *
   * M11 phase 7c: `steal`, `threaten` and both routes to `attack` each read
   * this once, and it is the only place in `Brain` that reads
   * `BandRelations` at all — deliberately the last of the three readers and
   * alone in its own commit, so a change to `bands-take-sides` measures one
   * thing rather than three at once.
   *
   * Takes a band id rather than a `Person`, since M11 phase 11b's `sabotage`
   * has no person on the other end of it — only a building's `ownerBandId` —
   * and a second copy of this arithmetic for buildings is exactly the drift
   * `AGENTS.md` warns about. Every call site already had a `Person` or a
   * `Building` in hand; passing `.bandId` costs nothing at any of them.
   */
  private bandHostility(person: Person, targetBandId: number, ctx: BrainContext): number {
    if (targetBandId === person.bandId) return 0;
    return Math.max(0, -ctx.bandRelations.standing(person.bandId, targetBandId)) / 100;
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
    const shore = ctx.shoreHash.findNearest(person.x, person.y, ctx.sightRadius * 6,
      tile => ctx.world.sameRegion(person.x, person.y, tile.x, tile.y));

    // `well`: open to anyone the way natural water is — see
    // `ActionSystem.waterWithinReach` — so this asks only whether one exists
    // and is finished, not `canUse`. Buildings are a plain array rather than a
    // spatial hash, on the same call every station lookup already makes: a
    // well is rare enough that scanning it costs nothing a hash would save.
    let well: { x: number; y: number } | null = null;
    let wellDist = Infinity;
    for (const building of ctx.buildings) {
      // `!building.ruined`, M11 phase 11b: a scorer that sent people to a
      // sabotaged well would have them walk there, find nothing, and stand
      // confused — the exact impossible-walk failure `canUse`'s own header
      // warns about, one mechanism further on.
      if (!building.complete || building.ruined || !isWell(building.def)) continue;
      const d = person.distanceTo({ x: building.centerX, y: building.centerY });
      if (d < wellDist) {
        wellDist = d;
        well = { x: building.centerX, y: building.centerY };
      }
    }
    if (!well) return shore;
    if (!shore) return well;
    return wellDist < person.distanceTo(shore) ? well : shore;
  }

  /**
   * The food node worth the walk, rather than the nearest one.
   *
   * Nutrition per harvest against distance, over the same candidates
   * `findNode` would have considered. The falloff is gentle — a bush twice as
   * far away has to be about twice as nourishing — because proximity dominates
   * this scorer for good reasons elsewhere and the point here is only to stop a
   * poor food that happens to be underfoot from beating a good one a few tiles
   * off.
   *
   * Two searches rather than one pass over everything: `findNearest` walks the
   * spatial hash in rings and stops, and rebuilding that into a scan of every
   * node within sight would be paid on every think tick by every person in the
   * world. Instead the nearest is found first, and then a second search asks
   * whether anything meaningfully better is within reach of it.
   */
  /**
   * True if this person's band has compost anywhere it can be fetched from.
   *
   * Heaps and stores alike, and the same reasoning `ActionSystem.nearestHeap`
   * records: `doStore` empties a whole pack into the larder, so a band's muck
   * spends a good deal of its life in the storage pit rather than on the heap
   * that made it. A scorer that only looked at heaps offered the errand while
   * the action refused it, which is the two halves disagreeing in front of the
   * player.
   */
  private hasCompost(person: Person, ctx: BrainContext): boolean {
    return ctx.buildings.some(b =>
      b.complete && this.canUse(person, b, ctx) &&
      (isHeap(b.def) || b.def.storage > 0) && b.store.count('compost') > 0);
  }


  /**
   * What beating `prey` for what they have is worth to `person` — the
   * predation route's whole expression, and since M11 phase 15d the base of
   * taking them captive too. One copy, because a capture that read the same
   * victim differently from the beating it replaces would drift from it the
   * first time either was tuned. Zero for kin and for anybody without the
   * nerve.
   */
  private predationAppeal(
    person: Person, prey: Person, neighbours: Person[], ctx: BrainContext
  ): number {
    if (ctx.relationships.kinship(person.id, prey.id) !== 0) return 0;
    const nerve = Math.max(0, person.traits.aggression - 0.5) * 2;
    if (nerve <= 0) return 0;
    const helpless = vulnerabilityOf(prey, person);
    const theirFriends = neighbours.filter(other =>
      other.id !== prey.id &&
      ctx.relationships.opinion(other.id, prey.id) > 15
    ).length;
    const onlookers = ctx.peopleHash
      .queryRadius(prey.x, prey.y, ctx.sightRadius)
      .filter(o => o.alive && o.id !== person.id && o.id !== prey.id).length;
    const unseen = 1 / (1 + onlookers * 0.45);
    // A threshold rather than a square, and a soft divisor rather than a
    // hard one. The first version of this multiplied six suppressors
    // together — helplessness squared, nerve, privacy, loyalty, and a
    // division by every ally the target had — and produced scores around
    // 0.0003, two orders of magnitude below `wander`. It never fired once
    // in either instrumented world. That is the failure `AGENTS.md` names:
    // "if a new action never fires, the reason is almost always that
    // something else is nearer", and `hunt` scoring nothing until its
    // coefficient reached nine is the precedent.
    //
    // The fix is the shape, not the constant. `helpless` gates instead of
    // squaring, so a genuinely defenceless target is worth its full value
    // rather than a quarter of it; and allies divide softly, because in a
    // band where everyone regards everyone at +6 and rising, `theirFriends`
    // is most of the camp and a hard divisor is a flat veto.
    // The same `bandHostility` multiplier the revenge route uses, for the
    // same reason: it amplifies an appetite the rest of the expression
    // already justifies rather than creating one of its own.
    return helpless < PREY_AT ? 0 : helpless * nerve * unseen *
      (1 - person.traits.loyalty * 0.8) / (1 + theirFriends * 0.3) *
      PREDATION * (1 + this.bandHostility(person, prey.bandId, ctx) * 0.5) *
      this.proximityBonus(person, prey, ctx.sightRadius);
  }

  /**
   * A building the scorer may honestly promise this person can use.
   *
   * Ownership used to imply reachability because each band's structures sit
   * around its own fire. Once an unwatched foreign building became a real
   * candidate, stores and fields across a narrow channel started winning on
   * distance and produced forty-one impossible walks in `farmers`. Property
   * and path regions are separate facts, but every scorer needs both.
   */
  private canUse(person: Person, building: Building, ctx: BrainContext): boolean {
    return !mayUse(person, building, ctx).watched &&
      ctx.world.sameRegion(person.x, person.y, building.centerX, building.centerY);
  }

  /**
   * What one harvest off a node is worth to *this* person, in nutrition.
   *
   * The node-side twin of `fruitWorth`, and it exists for the same reason one
   * tier later: M8.1 hung an inedible fruit on the commonest tree in the game
   * and M8.2 puts an inedible harvest on the grass. A stand of wild grain is
   * worth nothing to somebody who cannot grind it and a good deal to somebody
   * who can, and a scorer that reads `ITEMS[...].nutrition` alone sends the
   * hungry to stand in a wheat field chewing husks.
   *
   * Discounted by the same 0.6 the fruit version uses, for the same reason:
   * grain is not food until it has been carried to a stone, and something that
   * is food now should win the tie.
   */
  private nodeWorth(person: Person, node: ResourceNode): number {
    const direct = ITEMS[node.def.itemId]?.nutrition ?? 0;
    if (direct > 0) return direct;
    // Everything below is the inedible case — flint, sticks, clay and wild
    // grain — and only the last of them has a recipe that turns it into food.
    // Cheap enough now that `recipeUsing` is indexed, but the early return
    // above is what keeps the ordinary case to one property read.
    const recipe = recipeUsing(node.def.itemId);
    if (!recipe || techPower(person, recipe.tech) <= 0) return 0;
    return nutritionPerUnit(recipe, node.def.itemId) * 0.6;
  }

  private findNode(
    person: Person,
    ctx: BrainContext,
    filter: (n: ResourceNode) => boolean
  ): ResourceNode | null {
    // M11 phase 14b: a frightened person works near home. See `homeRange`.
    const home = ctx.homes?.get(person.bandId);
    const range = home ? homeRange(person) : Infinity;
    const rangeSq = range * range;
    return ctx.nodeHash.findNearest(person.x, person.y, ctx.sightRadius * 2,
      n => filter(n) && ctx.world.sameRegion(person.x, person.y, n.x, n.y) &&
        !(n.def.groundLevel && ctx.snowBuries && isBuried(n.x, n.y, ctx.snowDepth, ctx.treeHash)) &&
        (range === Infinity || (n.x - home!.x) ** 2 + (n.y - home!.y) ** 2 <= rangeSq));
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
      case 'drag':
      case 'dismember':
        if (found.concealCorpse) {
          person.targetCorpseId = found.concealCorpse.id;
          person.targetX = found.concealCorpse.x;
          person.targetY = found.concealCorpse.y;
        }
        break;
      case 'investigate':
        if (found.investigatePoint) {
          person.targetX = found.investigatePoint.x;
          person.targetY = found.investigatePoint.y;
        }
        break;
      case 'patrol':
        if (found.patrolPoint) {
          person.targetX = found.patrolPoint.x;
          person.targetY = found.patrolPoint.y;
        }
        break;
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
      case 'sabotage':
      case 'haul':
      case 'sow':
      case 'reap':
      case 'spread':
      case 'sleep':
      case 'shelter': {
        const building =
          action === 'shelter' || action === 'sleep' ? found.shelter :
          action === 'take' ? found.larderTarget :
          action === 'store' ? found.storeTarget :
          action === 'sabotage' ? found.sabotageTarget :
          action === 'sow' || action === 'reap' || action === 'spread'
            ? found.fieldTarget :
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
      case 'toast':
        // Drunk where they stand, on the same terms as `play`.
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
        // M11 phase 14b: centred part of the way home for somebody afraid,
        // so an idle walk drifts back to camp rather than out of it. The same
        // two draws per attempt either way; only where the box sits moves.
        const home = ctx.homes?.get(person.bandId);
        const pull = home ? homeward(person) : 0;
        const cx = home ? person.x + (home.x - person.x) * pull : person.x;
        const cy = home ? person.y + (home.y - person.y) * pull : person.y;
        for (let attempt = 0; attempt < 8; attempt++) {
          const tx = Math.round(cx + ctx.rng.range(-r, r));
          const ty = Math.round(cy + ctx.rng.range(-r, r));
          if (ctx.world.isWalkable(tx, ty)) {
            person.targetX = tx;
            person.targetY = ty;
            break;
          }
        }
        break;
      }
      case 'flee':
        // Worked out while scoring, so that `flee` is only ever offered where
        // there is somewhere to run to. See `escapeFrom`.
        if (found.fleePoint) {
          person.targetX = found.fleePoint.x;
          person.targetY = found.fleePoint.y;
        }
        break;
      case 'talk':
      case 'teach':
      case 'teach_child':
      case 'ask':
      case 'discuss':
      case 'court':
      case 'spar':
      case 'feed':
      case 'give':
      case 'gift':
      case 'trade':
      case 'steal':
      case 'threaten':
      case 'warn':
      case 'restrain':
      case 'correct':
      case 'make_amends':
      case 'bind':
      case 'answer_call':
      case 'attack':
      case 'slander':
      case 'praise': {
        // `feed` is ordinary giving aimed at one's own hungry child; the action
        // system does not need to know the difference, only the scorer does.
        // Same arrangement as `gather_for_site`.
        if (action === 'feed') person.action = 'give';
        // M11 phase 17a: a gift is giving a named thing.
        if (action === 'gift') {
          person.action = 'give';
          person.targetItemId = found.giftItem;
        }
        if (action === 'teach_child') person.action = 'teach';
        const other =
          action === 'talk' ? found.companion :
          action === 'teach' ? found.student :
          action === 'teach_child' ? found.childPupil :
          action === 'ask' ? found.mentor :
          action === 'discuss' ? found.colleague :
          action === 'court' ? found.suitor :
          action === 'spar' ? found.sparPartner :
          action === 'feed' || action === 'give' ? found.beneficiary :
          action === 'gift' ? found.giftee :
          action === 'trade' ? found.tradePartner :
          action === 'attack' ? found.foe :
          action === 'warn' ? found.intruder :
          action === 'restrain' ? found.restrainee :
          action === 'correct' ? found.correctee :
          action === 'make_amends' ? found.amendsTo :
          action === 'bind' ? found.bindTarget :
          action === 'answer_call' ? found.helpCallerTarget :
          action === 'slander' || action === 'praise' ? found.companion :
          found.victim;
        if (other) {
          if (action === 'attack') {
            telemetry.count('attack_route_' + found.attackRoute);
            if (other.bandId === person.bandId) telemetry.count('attack_own_band_' + found.attackRoute);
            if (other.isChild) telemetry.count('attack_child_' + found.attackRoute);
          }
          person.targetX = other.x;
          person.targetY = other.y;
          person.targetPersonId = other.id;
          // Who a `slander` or `praise` is *about* — the listener above is
          // who it is *told to*. See `Person.targetSubjectId`.
          if (action === 'slander' || action === 'praise') {
            person.targetSubjectId = action === 'slander'
              ? found.slanderSubjectId : found.praiseSubjectId;
          }
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
      // 'eat', 'rest', 'ponder', 'reflect' and 'prototype' happen where you
      // stand and need no target.
    }
  }
}
