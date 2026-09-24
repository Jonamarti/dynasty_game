/**
 * The simulation: owns the world, the people, the clock and the systems, and
 * runs them in a fixed order every step.
 *
 * Two rules this file enforces, both learned from the previous project:
 *
 *  1. **One `step()` is one simulation step.** No hidden amplification. The
 *     previous project's `tick()` secretly ran ten steps, which made every
 *     tick budget in its test harness wrong by an order of magnitude.
 *  2. **Nothing here imports a renderer or touches the DOM.** The renderer
 *     reads this; this never reaches back. That is what lets the headless
 *     harness run exactly the code the browser runs.
 */
import { RNG } from './RNG.ts';
import { World } from './World.ts';
import { TimeManager } from './TimeManager.ts';
import { advanceSnowDepth, isBuried } from './Snow.ts';
import { SPENT_BELOW, isGroundSpent } from './Soil.ts';
import { SpatialHash } from './SpatialHash.ts';
import { telemetry } from './Telemetry.ts';
import { makeConfig, type SimConfig, type DeepPartial } from './Config.ts';
import { Person, resetPersonIds } from '../entities/Person.ts';
import { ITEMS, Inventory } from '../entities/Item.ts';
import { ResourceNode, resetResourceIds, isFoodKind, type ResourceKind } from '../entities/ResourceNode.ts';
import { NeedsSystem } from '../systems/NeedsSystem.ts';
import { MovementSystem } from '../systems/MovementSystem.ts';
import { Pathfinder } from './Pathfinder.ts';
import { ActionSystem } from '../systems/ActionSystem.ts';
import { Brain, type BrainContext } from '../ai/Brain.ts';
import {
  stallReason, survivalActions, urgentNeeds, type Autonomy,
} from '../ai/Autonomy.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { BandRelations } from '../social/BandRelations.ts';
import { SocialSystem, resetEventIds } from '../social/SocialSystem.ts';
import { DEFAULT_NORMS, VARIABLE_NORMS, DEED_WEIGHT, type Norms, type EventType } from '../social/Events.ts';
import { STRANGER_REGARD_MEAN, STRANGER_REGARD_SPREAD } from '../social/Restraint.ts';
import { pruneDebts, debtTo, offerFor, OFFER_AT_LEAST, DEBT_DAYS } from '../social/Amends.ts';
import {
  judgeOwn, answerDemand, DISMISSED_GRUDGE, SHAME_RENOWN, REFUSED_STANDING, type Case,
} from '../social/Justice.ts';
import {
  Building, BUILDINGS, isTrap, isHerd, isStructure, resetBuildingIds, type BuildingDef,
} from '../entities/Building.ts';
import { accrueUnits } from './Progress.ts';
import { decayMood } from './Mood.ts';
import { consumeFood, decayMacroBalance, decayMacroTarget } from './Macros.ts';
import { isHeld } from '../social/Defence.ts';
import { wouldInvestigate, noticeBloodied, INVESTIGATION_DAYS } from '../social/Investigation.ts';
import { knowledgeOfPerson, corpseIdentity } from '../social/Knowledge.ts';
import { Household, resetHouseholdIds } from '../entities/Household.ts';
import { Tree, resetTreeIds } from '../entities/Tree.ts';
import { giftWorth } from '../social/Events.ts';
import { ItemPile, resetPileIds } from '../entities/ItemPile.ts';
import { Corpse, resetCorpseIds, stageOf, WOUNDS_SHOW_FOR, GONE_AFTER } from '../entities/Corpse.ts';
import {
  Animal, resetAnimalIds, SPECIES, SPECIES_DEFS, type Species,
} from '../entities/Animal.ts';
import { WildlifeSystem } from '../systems/WildlifeSystem.ts';
import { ForestSystem, seedInitialForest } from '../systems/ForestSystem.ts';
import {
  LifeSystem, setChildFactory, findHeir, settleEstate,
} from '../systems/LifeSystem.ts';
import { linkFamily } from '../social/SocialSystem.ts';
import { BandSystem, TERRITORY_RADIUS } from '../systems/BandSystem.ts';
import { foundBand, type FoundingContext } from '../systems/Founding.ts';
import { KnowledgeSystem, countHolders } from '../systems/KnowledgeSystem.ts';
import { ORDER_REFUSED, type Notice } from '../knowledge/Synthesis.ts';
import {
  eraFor, techPower, ERA_ORDER, ERAS, TECHS, type EraDef, type Tech,
} from '../knowledge/Tech.ts';
import { RECIPES, type RecipeDef } from '../entities/Recipe.ts';
import { standingOver, type AuthorityContext } from '../social/Authority.ts';
import { mayUse, type PropertyUse } from '../social/Property.ts';
import {
  bandHasShape, bandOf, rankIn, type BandRank, type RankContext,
} from '../social/Rank.ts';
import { JOBS, type JobId } from '../entities/Job.ts';
import {
  Inscription, INSCRIPTIONS, resetInscriptionIds, type InscriptionForm,
} from '../entities/Inscription.ts';
import { NAME_ONSETS, NAME_CODAS } from '../../data/names.ts';
import { t, aNoun, theNoun, language } from '../../i18n/i18n.ts';
import { sightIntruders, SIGHTING_EVERY, type Sightings, type Territory } from '../social/Fear.ts';
import { BandMaps, MAP_CELL } from '../social/BandMaps.ts';
import { CAPTIVE_ADOPTION_DAYS, CAPTIVE_DAILY_MOOD_LOSS, isCaptive } from '../social/Captivity.ts';

/**
 * Something somebody worked out, waiting to be reported. See
 * `Simulation.insights`.
 *
 * A separate queue from `interruptions` because it answers a different
 * question. That one says why a thing the player asked for stopped; this one
 * says that somebody in view has just had an idea, made a breakthrough, built
 * a thing that did not work, or improved a design they already had. Research
 * moves in jumps precisely so that there is something here to report.
 */
export interface InsightNotice {
  personId: number;
  text: string;
  kind: 'idea' | 'gain' | 'setback';
}

/**
 * A use of another band's structure that one of its owners saw — M11 phase
 * 15a. See `Simulation.watchedUses`.
 */
export interface WatchedNotice {
  personId: number;
  use: PropertyUse;
}

/** One ended action, waiting to be reported. See `Simulation.interruptions`. */
export interface StopNotice {
  personId: number;
  /** What they were doing, captured before the action reset to `idle`. */
  action: string;
  /** The raw reason id; `stopReasonLabel` turns it into something readable. */
  reason: string;
  /**
   * Which recipe a `craft` was making, captured here because `finish` clears it.
   *
   * Without it the report would read "making something stopped", which is
   * exactly the shrug this whole channel exists to replace.
   */
  recipe: string | null;
}

/**
 * Stops worth coming back to.
 *
 * A need, not a fact about the world: "he went for a drink" is an interruption,
 * "the tree is gone" is the end of the matter.
 */
const RESUMABLE_STOPS = new Set(['thirsty', 'hungry', 'cold']);

/**
 * Ticks between passes over who is working beside whom.
 *
 * Forty, so six of them fall in a working day. Often enough that an afternoon
 * spent on the same bush reads as an afternoon spent together, and rare enough
 * that the spatial query it costs does not show up beside the rest of the step.
 */
const ALONGSIDE_EVERY = 40;

/**
 * What knowing how to organise work adds to the chance a job order sticks.
 *
 * Scaled by `techPower`, so it runs 0.05 for somebody who has only thought the
 * practice through, 0.10 once it is known and 0.14 fully refined. Deliberately
 * small against the terms in `standingOver`, where headship alone is 0.55: the
 * technology is what makes arranging work *possible*, and refining it makes a
 * leader smoother at it, but neither buys compliance a resented chief has not
 * earned. It exists so that `maxRefinement` on `division_of_labour` means
 * something — a refinement ceiling above a node whose only effect is a gate
 * would be declared-but-inert content of exactly the kind this project keeps
 * finding.
 */
const ORGANISED_ORDER_BONUS = 0.1;

/** Ticks an interrupted order waits to be resumed before it is forgotten. */
const RESUME_WINDOW = 2000;

/**
 * How an order from somebody else is put to the player — M11 phase 13f. Only
 * the verbs a chief or a household head actually hands out; anything else
 * falls back to its id.
 */
export const ORDER_WORDS: Record<string, string> = {
  sabotage: 'wreck a rival building',
  take: 'take from a rival store',
  build: 'work on a building',
  haul: 'carry materials to a site',
};

/**
 * Where the outcast band's id starts, clear of every founding band's. Named
 * (M11 phase 12c) because the renderer has to tell the outcasts apart to give
 * them their own neutral colour rather than whichever tribe's their id
 * happened to fall on modulo the palette.
 */
export const OUTCAST_BAND_ID_BASE = 1000;

/**
 * Renown retained per in-game day, M11 phase 6c. Slower than the 0.985
 * `RelationshipGraph` uses for its `deeds` component, deliberately: an
 * opinion is one person's fading recollection, renown is a household's own
 * record of itself and has to still mean something after the person who
 * earned it has died.
 */
const RENOWN_DECAY_PER_DAY = 0.997;

export interface Band {
  id: number;
  name: string;
  /**
   * Camp centre; people spawn around it, and `BandSystem.considerTerritory`
   * reads a foreign face's distance from it (M11 phase 7b).
   */
  homeX: number;
  homeY: number;
  /**
   * What this culture makes of each kind of deed. Bands differ, which is what
   * lets an outlaw find somewhere their reputation does not follow them.
   */
  norms: Norms;
  /**
   * How much this people minds a wrong done by one of its own to a stranger,
   * 0 to 1 — M12 phase 2d, `Restraint.STRANGER_REGARD_MEAN`. What it corrects
   * its children for, and so the kind of adults it raises.
   */
  strangerRegard: number;
  /** Whoever the band currently holds in the highest regard. Null if empty. */
  chiefId: number | null;
  /** Absolute day the present chief took office. Null while there is none. */
  chiefSince: number | null;
  /** Coarse cells this band has formally marked as its ground (M12 phase 5a). */
  claimedCells?: Set<string>;
  /** True for the standing-place of the exiled: no camp, no chief, no norms. */
  outcast?: boolean;
}

export class Simulation {
  readonly config: SimConfig;
  readonly rng: RNG;
  readonly world: World;
  readonly time: TimeManager;

  people: Person[] = [];
  nodes: ResourceNode[] = [];
  buildings: Building[] = [];
  trees: Tree[] = [];
  piles: ItemPile[] = [];
  /** Every body lying where somebody died — M11 phase 16a. See `Corpse.ts`. */
  corpses: Corpse[] = [];
  animals: Animal[] = [];
  households: Household[] = [];
  bands: Band[] = [];
  /** Visitor band -> owner band permission, expiring at an absolute day. */
  private readonly territoryPermissions = new Map<string, number>();

  /**
   * Knowledge the world has, counted from the adults alive right now.
   *
   * Not stored anywhere — recounted daily — which is the whole conceit: when
   * the last person who can fire clay dies, pottery leaves the world and the
   * granary stops being buildable, with no bookkeeping anywhere to say so.
   */
  readonly knownTech = new Set<string>();

  /**
   * Knowledge that is written down somewhere, whether or not anybody alive
   * knows it.
   *
   * The deliberate exception, and the point of writing. `knownTech` is what a
   * society can presently *do*; this is what it could get back. The two come
   * apart exactly when a band loses its last holder of something and still has
   * the stone — which is the dark age this milestone exists to make possible,
   * and it is only recoverable by somebody who can read.
   *
   * **Strictly `instruction` records — stone and clay.** M9's `ochre` used to
   * count here too, before `InscriptionDef.fidelity` split what reading one
   * gives back. A painting is not something a society can *get back*: reading
   * it only sparks an idea that still has to be worked out from nothing, same
   * as anybody who noticed it unaided, so counting it here overstated what a
   * band actually holds in reserve. See `rememberedTech` for that half.
   */
  readonly recordedTech = new Set<string>();

  /**
   * Knowledge some `reminder` record could spark, whether or not anybody
   * alive has had that idea yet.
   *
   * `ochre`'s half of what `recordedTech` used to conflate with it. Nothing
   * here is recoverable the way `recordedTech` is — reading one of these
   * lands a `conceived` idea, not a finished design — so the two sets answer
   * different questions and neither substitutes for the other.
   */
  readonly rememberedTech = new Set<string>();

  /**
   * What is written down **or being written down right now**.
   *
   * A separate set from `recordedTech`, and the distinction is load-bearing in
   * both directions. This one is what a would-be carver asks, so that seven
   * people do not spend a week each cutting the same word into seven different
   * stones — which is exactly what happened before it existed, because the
   * daily recount could not see a carving that was still under way.
   *
   * `recordedTech` stays strictly what is *legible*, because that is what the
   * checks and the panel mean by "recoverable": a half-cut stone holds nothing
   * and an abandoned one is a waste of flint, not a library.
   */
  readonly recordsInHand = new Set<string>();

  inscriptions: Inscription[] = [];
  readonly inscriptionsById = new Map<number, Inscription>();
  /** Records are static once cut, so the index is rebuilt only on change. */
  readonly inscriptionHash = new SpatialHash<Inscription>(8);
  /** The person the player currently inhabits. Null in headless runs. */
  player: Person | null = null;
  /**
   * Direction the player is holding this step, or null. Set by the input layer
   * and consumed inside `step()`, so player movement happens on the simulation
   * clock like everyone else's rather than on the frame clock.
   */
  playerIntent: { dx: number; dy: number } | null = null;

  readonly peopleHash = new SpatialHash<Person>(8);
  readonly nodeHash = new SpatialHash<ResourceNode>(8);
  /** Static: the shoreline never moves, so this is built once at construction. */
  readonly shoreHash = new SpatialHash<{ x: number; y: number }>(8);
  readonly nodesById = new Map<number, ResourceNode>();
  readonly peopleById = new Map<number, Person>();
  readonly buildingsById = new Map<number, Building>();
  readonly householdsById = new Map<number, Household>();
  readonly treesById = new Map<number, Tree>();
  /** Trees are static between fellings, so the index is rebuilt only on change. */
  readonly treeHash = new SpatialHash<Tree>(8);
  readonly pileHash = new SpatialHash<ItemPile>(8);
  readonly pilesById = new Map<number, ItemPile>();
  /** Rebuilt only when a body is added or taken away, like `pileHash`. */
  readonly corpseHash = new SpatialHash<Corpse>(8);
  readonly corpsesById = new Map<number, Corpse>();
  readonly animalHash = new SpatialHash<Animal>(8);
  readonly animalsById = new Map<number, Animal>();

  /** Why the most recent order was refused. Read by the UI, then cleared. */
  lastRefusal: string | null = null;

  /**
   * How deep the snow lies, 0-`SNOW_MAX_DEPTH`. Advanced once a day in
   * `advanceDay` from `time.temperature`, and read by `isBuried` — see
   * `Snow.ts`'s header for why this is a scalar rather than a tile array.
   */
  snowDepth = 0;

  /**
   * `sabotageCandidatesByBand`'s own comment explains what this holds and
   * why it is cached at all. Refreshed once a day, in the same daily block
   * `snowDepth` and `bandRelations.decay()` update in; empty until the first
   * day turns over, which is fine — nobody has anything to sabotage on the
   * day the world is founded either.
   */
  private sabotageCache: Map<number, Building[]> = new Map();

  /**
   * How much of itself the player's character looks after. See `steerPlayer`.
   *
   * Lives on the simulation rather than in the UI because `step` is what reads
   * it, and it survives succession on purpose: it is a statement about how this
   * player wants to play, not about the person they are currently playing, and
   * an heir who inherits the estate and not the setting would be a small nasty
   * surprise at the worst possible moment. Defaults to `manual`, which is
   * exactly the behaviour every build before M9 phase 6 had — no headless run
   * possesses anybody, so no scenario can reach any other value.
   */
  autonomy: Autonomy = 'manual';

  /**
   * Why the player's character, left to look after itself, is doing nothing.
   *
   * Polled by the UI every frame rather than consumed once like `lastRefusal`,
   * because this is a *standing* condition — thirsty with no water in sight
   * stays true until one of the two facts changes — and a read-once slot would
   * flash the reason for a frame and then leave the player watching a mode that
   * appears to be broken.
   */
  autonomyStall: string | null = null;

  /**
   * Actions that ended for a reason, oldest first, waiting to be told about.
   *
   * `lastRefusal` answers "why would he not start?"; this answers "why did he
   * stop?", which until now nothing anywhere could answer. Every reason
   * `ActionSystem` produces used to be a telemetry counter and nothing else, so
   * an order simply ended and the character went back to thinking.
   *
   * A queue rather than a single slot because several people can stop on the
   * same step and the UI reads once a frame. Only people under an *order* are
   * recorded — an NPC breaking off to drink is ordinary life, not news — and
   * the queue is capped so a headless run that never drains it cannot grow
   * without bound.
   */
  readonly interruptions: StopNotice[] = [];
  private readonly interruptionCap = 32;

  /**
   * Foreign structures used in sight of an owner, waiting to be told about —
   * M11 phase 15a.
   *
   * Being watched used to stop the use outright, and the stop reached the
   * player as `property_guarded` through `interruptions`. It no longer stops
   * anything, so it needs its own channel: a player who has just emptied a
   * rival's store in front of its owner must be told that somebody saw, or
   * the cost the witness now carries in their memory is invisible from inside
   * the game. Recorded on the same terms as `noteStop` — the player's direct
   * actions and people under an order — and capped the same way.
   */
  readonly watchedUses: WatchedNotice[] = [];

  /**
   * Calls for help, waiting to be told about — M11 phase 15b.4. Every call
   * goes in; `main.ts` shows the ones the player's character was close enough
   * to hear, because hearing it is the only way anybody knows.
   */
  readonly helpCalls: { callerId: number; x: number; y: number }[] = [];

  /** Ideas, breakthroughs and failed prototypes, waiting to be told about. */
  readonly insights: InsightNotice[] = [];

  /** Set when the player's character dies, so the UI can offer the succession. */
  succession: { died: Person; heir: Person | null } | null = null;

  readonly relationships = new RelationshipGraph();
  /** How each pair of bands stands with the other. M11 phase 7a. */
  readonly bandRelations = new BandRelations();
  readonly social: SocialSystem;
  private readonly normsByBand = new Map<number, Norms>();
  /** Each band's `strangerRegard`, for `SocialSystem` — the same arrangement as `normsByBand`. */
  private readonly strangerRegardByBand = new Map<number, number>();

  private readonly needsSystem: NeedsSystem;
  /**
   * The one A* instance this world uses, for `MovementSystem`, the health
   * checks and later `Brain` alike — two definitions of "can they get there"
   * is one too many, and the checks should measure the same instance the
   * simulation actually walks people with.
   */
  readonly pathfinder: Pathfinder;
  private readonly movementSystem: MovementSystem;
  private readonly actionSystem = new ActionSystem();
  private readonly brain = new Brain();
  private readonly lifeSystem = new LifeSystem();
  private readonly forestSystem = new ForestSystem();
  readonly bandSystem = new BandSystem();
  private readonly knowledgeSystem = new KnowledgeSystem();
  private readonly wildlifeSystem = new WildlifeSystem();
  private readonly knowledgeRng: RNG;
  private readonly wildlifeRng: RNG;
  private readonly recordRng: RNG;
  /** Recomputed daily from who is alive. An era can be lost as well as gained. */
  // The first rung itself, not a hand-written copy of it. The copy that used
  // to sit here was a second list nothing kept in step with `ERAS` — the same
  // defect `ERA_ORDER` was derived to fix — and it went stale the moment the
  // ladder was renamed to the real archaeological periods.
  era: EraDef = ERAS[0]!;
  /** Living holders per tech, for the UI and the health report. */
  readonly techHolders = new Map<Tech, number>();
  private readonly lifeRng: RNG;
  private readonly forestRng: RNG;

  /** Separate RNG streams so adding a draw in one system does not shift others. */
  private readonly aiRng: RNG;
  private readonly actionRng: RNG;
  private readonly commandRng: RNG;
  /**
   * The stream `Brain.think` draws from when it has a real choice to make.
   *
   * Its own stream, and not `aiRng`, because `aiRng` is already drawn from
   * inside `score` — the jitter on `wander` and two draws in `setup`. Sharing
   * it would interleave "which of these did they pick" with "where exactly did
   * they wander to", and the whole reason `config.ai.choiceSpread` can be set
   * back to 0 and land on the old world exactly is that this stream is untouched
   * at that value.
   */
  private readonly choiceRng: RNG;
  /**
   * `shareTheHearth`'s own stream, M11 phase 9b.
   *
   * A household's nightly chance of a lesson passing under its own roof is a
   * draw per roof per night, and it needed a stream that is not shared with
   * anything else for the same reason `choiceRng` did: it is forked genuinely
   * last, after `choiceRng`, so that a world built before this phase existed
   * is bit-identical to one built after it except for what actually gets
   * taught at a hearth.
   */
  private readonly hearthRng: RNG;

  constructor(overrides: DeepPartial<SimConfig> = {}) {
    this.config = makeConfig(overrides);
    this.rng = new RNG(this.config.seed);

    // Fork order is part of the seed contract; do not reorder these.
    const worldRng = this.rng.fork();
    const spawnRng = this.rng.fork();
    this.aiRng = this.rng.fork();
    const moveRng = this.rng.fork();

    this.world = new World(this.config.world, worldRng);
    this.time = new TimeManager(this.config.time);

    this.needsSystem = new NeedsSystem(this.config.needs);
    this.pathfinder = new Pathfinder(this.world);
    this.movementSystem = new MovementSystem(this.world, moveRng, this.pathfinder);
    this.social = new SocialSystem(
      this.relationships, this.normsByBand, this.bandRelations, this.strangerRegardByBand);
    this.social.onMarriage = (a, b) => this.mergeHouseholds(a, b);
    this.social.onDeed = (actor, type, magnitude) => this.accrueRenown(actor, type, magnitude);
    this.actionRng = this.rng.fork();
    this.lifeRng = this.rng.fork();
    this.forestRng = this.rng.fork();
    this.commandRng = this.rng.fork();
    this.knowledgeRng = this.rng.fork();
    // Appended, never inserted. The fork order is part of the seed contract:
    // slotting a new stream in above `knowledgeRng` would shift every draw in
    // every system below it and silently invalidate every saved seed.
    this.wildlifeRng = this.rng.fork();
    // Appended after `wildlifeRng`, for the same reason. Records decay on their
    // own stream so that adding one does not move the wildlife.
    this.recordRng = this.rng.fork();
    // *** DO NOT APPEND A NEW STREAM HERE. *** This is the end of the *named*
    // block, not the end of the fork order: three more forks are taken below —
    // `seedInitialForest`'s anonymous one, then `fishRng`, then `grainRng` —
    // and a stream slotted in here consumes the draw the forest expects and
    // silently replants every wood in every saved seed. The genuine append
    // point is the line after `grainRng`. See `AGENTS.md`, which carries the
    // numbered table and the instruction to add a row to it when you append.

    resetPersonIds();
    resetResourceIds();
    resetEventIds();
    resetBuildingIds();
    resetHouseholdIds();
    resetTreeIds();
    resetPileIds();
    resetCorpseIds();
    resetInscriptionIds();
    resetAnimalIds();

    // Births need to construct people, but LifeSystem cannot import the Person
    // constructor without a cycle (Person -> Memory -> Events, and Simulation
    // owns them all), so the factory is injected here.
    setChildFactory((mother, childRng) => {
      const name = childRng.pick(NAME_ONSETS) + childRng.pick(NAME_CODAS);
      const child = new Person(name, mother.x, mother.y, mother.bandId, childRng, this.time.daysPerYear);
      // Stamped here as well as in `applyLearning`: the sweep catches everyone
      // already alive when the setting changes, this catches everyone born after.
      child.skillGain = this.config.learning.skillGain;
      return child;
    });

    this.shoreHash.rebuild(this.world.shoreTiles);

    // The wood is planted before anything else looks for it: a band founded in
    // a clearing and a band founded under oaks have very different prospects.
    this.trees = seedInitialForest(
      this.world, this.rng.fork(), this.config.world.treeDensity, this.time.daysPerYear
    );
    for (const tree of this.trees) this.treesById.set(tree.id, tree);
    this.treeHash.rebuild(this.trees);

    // Forked last, genuinely last: every other fork call in this constructor
    // sits above this line. `spawnResources`, `spawnHerds` and `spawnPeople`
    // all draw from the single shared `spawnRng` forked at the top, and
    // touching that draw sequence — by inserting a fork above it, or by adding
    // fish to its own `plan` array — would shift every herd and every person
    // in every saved seed. See "a seed trap that sits above all four" in
    // m8_plan_the_ages.md. Fish get a dedicated stream instead, and are spawned
    // in their own pass after people, so the pre-change world is bit-identical
    // except for the fish.
    const fishRng = this.rng.fork();
    // M8.2, appended after the fish for exactly the reason the paragraph above
    // gives. Wild grain is spawned in its own pass after everything else, so a
    // world built before farming existed is bit-identical to one built after it
    // except for the stands of cereal themselves.
    const grainRng = this.rng.fork();
    // M11 phase 1a, and appended HERE rather than beside the other named
    // streams for the reason `AGENTS.md`'s table now spells out: the named
    // block ends eleven forks in, and three more are taken below it. This is
    // the genuine end of the fork order. Anything appended above this line
    // consumes a draw the forest, the fish or the grain expects.
    this.choiceRng = this.rng.fork();
    // M11 phase 9b, appended after `choiceRng` for the identical reason:
    // `AGENTS.md`'s table exists precisely so the next stream lands here
    // rather than back at the comment three forks up that looks like an
    // invitation.
    this.hearthRng = this.rng.fork();
    // M12 phase 2d, appended after `hearthRng` for the same reason again, and
    // drawn in its own pass after every band exists: a people's regard for
    // strangers. Drawn from `spawnRng` beside the norms it belongs with, it
    // would have moved every herd and person after the first band.
    const cultureRng = this.rng.fork();

    this.spawnResources(spawnRng);
    this.spawnHerds(spawnRng);
    this.spawnPeople(spawnRng);
    this.spawnFish(fishRng);
    this.spawnWildGrain(grainRng);
    this.spawnCulture(cultureRng);
    this.rebuildHashes();
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  private spawnResources(rng: RNG): void {
    const cfg = this.config.world;
    const plan: [ResourceKind, number][] = [
      ['berries', cfg.berryBushes],
      ['flint', cfg.flintOutcrops],
      ['sticks', cfg.deadwood],
      ['reeds', cfg.reedBeds],
      ['clay', cfg.clayBanks],
    ];

    for (const [kind, quoted] of plan) {
      const count = this.scaledCount(quoted);
      let placed = 0;
      let attempts = 0;
      const maxAttempts = count * 60;
      while (placed < count && attempts < maxAttempts) {
        attempts++;
        const spot = this.world.randomWalkable(rng, 1);
        if (!spot) continue;
        if (!this.suitsBiome(kind, spot.x, spot.y)) continue;
        const node = new ResourceNode(kind, spot.x, spot.y, rng);
        this.nodes.push(node);
        this.nodesById.set(node.id, node);
        placed++;
      }
    }
  }

  /**
   * Places fishing spots on the shore, on their own RNG stream and in their
   * own pass after everything else has been placed — see the comment above
   * the `fishRng` fork in the constructor.
   */
  private spawnFish(rng: RNG): void {
    const count = this.scaledCount(this.config.world.fishingSpots);
    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 60;
    while (placed < count && attempts < maxAttempts) {
      attempts++;
      const spot = this.world.randomWalkable(rng, 1);
      if (!spot) continue;
      if (!this.suitsBiome('fish', spot.x, spot.y)) continue;
      const node = new ResourceNode('fish', spot.x, spot.y, rng);
      this.nodes.push(node);
      this.nodesById.set(node.id, node);
      placed++;
    }
  }

  /**
   * Stands of wild cereal on open grass, on their own stream and in their own
   * pass — the same treatment fishing spots got, for the same reason.
   *
   * This is where farming starts, and it has to exist before `farming` does: a
   * band cannot sow what it has never gathered. See the note on `grain` in
   * `Item.ts` for why raw grain is worth eating at all.
   */
  private spawnWildGrain(rng: RNG): void {
    const count = this.scaledCount(this.config.world.wildGrainPatches);
    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 60;
    while (placed < count && attempts < maxAttempts) {
      attempts++;
      const spot = this.world.randomWalkable(rng, 1);
      if (!spot) continue;
      if (!this.suitsBiome('wild_grain', spot.x, spot.y)) continue;
      const node = new ResourceNode('wild_grain', spot.x, spot.y, rng);
      this.nodes.push(node);
      this.nodesById.set(node.id, node);
      placed++;
    }
  }

  /**
   * Scatters herds across the grass and the woods.
   *
   * Herds rather than individuals: a herd is the unit that gets spooked and the
   * unit worth walking across the island for, and scattering forty lone deer
   * produces neither.
   */
  private spawnHerds(rng: RNG): void {
    for (let h = 0, herds = this.scaledCount(this.config.world.gameHerds); h < herds; h++) {
      const species: Species = rng.pick(SPECIES as unknown as Species[]);
      const def = SPECIES_DEFS[species];

      let home: { x: number; y: number } | null = null;
      for (let attempt = 0; attempt < 40 && !home; attempt++) {
        const spot = this.world.randomWalkable(rng, 1);
        if (!spot) continue;
        const biome = this.world.biomeAt(spot.x, spot.y);
        if (biome === 'grass' || biome === 'forest') home = spot;
      }
      if (!home) continue;

      const size = Math.max(1, Math.round(def.herdSize * rng.range(0.6, 1.4)));
      for (let i = 0; i < size; i++) {
        const spot = this.world.findWalkableNear(
          Math.round(home.x + rng.range(-3, 3)),
          Math.round(home.y + rng.range(-3, 3))
        ) ?? home;
        const animal = new Animal(species, spot.x, spot.y, h, rng);
        this.animals.push(animal);
        this.animalsById.set(animal.id, animal);
      }
    }
  }

  /**
   * A resource count from the config, scaled to the island's size — see
   * `WorldConfig.resourceScale`. At the default scale of 1 this is the count
   * itself, so no existing world moves.
   */
  private scaledCount(count: number): number {
    return Math.round(count * this.config.world.resourceScale);
  }

  /** Resources cluster where they belong, which is what gives regions character. */
  private suitsBiome(kind: ResourceKind, x: number, y: number): boolean {
    const biome = this.world.biomeAt(x, y);
    switch (kind) {
      case 'berries': return (biome === 'grass' || biome === 'forest') && this.world.fertilityAt(x, y) > 0.3;
      // Fallen branches collect where there are branches to fall: a stick pile
      // far from any tree is just litter the map put there.
      case 'sticks':
        return (biome === 'forest' || biome === 'grass' || biome === 'hills') &&
          this.treeHash.findNearest(x, y, 6, t => t.standing) !== null;
      case 'flint': return biome === 'hills' || biome === 'beach';
      // Reeds and clay both belong at the water's edge, which quietly makes
      // shoreline the most valuable ground to camp on.
      case 'reeds': return biome === 'beach' && this.world.isShore(x, y);
      case 'clay': return (biome === 'beach' || biome === 'grass') && this.world.isShore(x, y);
      case 'fish': return biome === 'beach' && this.world.isShore(x, y);
      // Open ground only. Wild cereal is a grass and it wants sun, so a stand
      // under the canopy would be a stand nobody would ever find — and the
      // fertility floor is higher than the berry bush's because thin ground
      // carries scrub, not a crop worth gathering.
      case 'wild_grain':
        return biome === 'grass' && this.world.fertilityAt(x, y) > 0.42;
    }
  }

  /**
   * Each people's regard for strangers — M12 phase 2d. A bell curve, like
   * every trait here; see `Restraint.STRANGER_REGARD_MEAN` for what it moves.
   */
  private spawnCulture(rng: RNG): void {
    for (const band of this.bands) {
      if (band.outcast) continue;
      band.strangerRegard = Math.max(0.02, Math.min(0.98,
        rng.gaussian(STRANGER_REGARD_MEAN, STRANGER_REGARD_SPREAD)));
      this.strangerRegardByBand.set(band.id, band.strangerRegard);
    }
  }

  private spawnPeople(rng: RNG): void {
    const { bands, peoplePerBand } = this.config.population;

    for (let b = 0; b < bands; b++) {
      // Camps want water within reach; a band placed in the middle of a rock
      // field would simply die, which makes for a poor test scenario.
      // Big enough to forage across, and with water in reach. A camp on a
      // pinched headland is a death sentence: greedy movement cannot route
      // around the shoreline, so the band starves in sight of food.
      const minLand = Math.max(400, this.world.width * this.world.height * 0.05);
      let home = this.world.randomWalkableInLargeRegion(rng, minLand);
      for (let attempt = 0; attempt < 60 && home; attempt++) {
        if (this.hasWaterNear(home.x, home.y, 20)) break;
        home = this.world.randomWalkableInLargeRegion(rng, minLand);
      }
      home = home ?? this.world.randomWalkable(rng, 200);
      if (!home) continue;

      const norms: Norms = { ...DEFAULT_NORMS };
      for (const variable of VARIABLE_NORMS) {
        norms[variable.type] = rng.range(variable.min, variable.max);
      }

      const band: Band = {
        id: b,
        // Two draws, then the words: `t` takes nothing from `rng`, so the
        // language a world is generated in cannot move the draws after it.
        name: t('{name} band', { name: rng.pick(NAME_ONSETS) + rng.pick(NAME_CODAS) }),
        homeX: home.x,
        homeY: home.y,
        norms,
        // Drawn in `spawnCulture`, on its own stream, once every band exists.
        strangerRegard: STRANGER_REGARD_MEAN,
        chiefId: null,
        chiefSince: null,
        claimedCells: new Set(),
      };
      this.bands.push(band);
      this.normsByBand.set(band.id, norms);

      // Every band starts with plans rather than buildings: a hut site and a
      // storage pit marked out at the camp centre, waiting for someone to
      // fetch the wood. This is what makes construction observable in a
      // headless run without the player having to place anything.
      this.placeCampSites(band, rng);

      // The band is filled with families rather than with unrelated adults.
      // See `systems/Founding.ts` — every part of it goes through the same code
      // an in-game marriage, birth or adoption would.
      const founded = foundBand(band, peoplePerBand, this.foundingContext(rng));
      for (const person of founded.people) {
        // Knowledge the scenario says the founders already hold. Adults only:
        // a child holding a technology would be able to teach it, and children
        // are excluded from the knowledge system on purpose. Empty for every
        // world a player starts — see `PopulationConfig.startingTech`.
        //
        // `startingTechByBand`, when the scenario sets it, replaces this per
        // band rather than handing every band the same list — see its own
        // comment for why `scribes` needs that.
        if (!person.isChild) {
          const granted = this.config.population.startingTechByBand?.[b]
            ?? this.config.population.startingTech;
          for (const tech of granted) {
            person.knownTech.add(tech as Tech);
          }
        }
        this.people.push(person);
        this.peopleById.set(person.id, person);
      }
      for (const household of founded.households) {
        this.households.push(household);
        this.householdsById.set(household.id, household);
      }
    }
  }

  /**
   * The handles `Founding` needs. Exposed as a method so character creation can
   * build a tribe through exactly the same path world generation does.
   */
  foundingContext(rng: RNG): FoundingContext {
    return {
      world: this.world,
      rng,
      relationships: this.relationships,
      social: this.social,
      makePerson: (name, x, y, bandId, personRng) => {
        const person = new Person(name, x, y, bandId, personRng, this.time.daysPerYear);
        person.skillGain = this.config.learning.skillGain;
        return person;
      },
      placeNear: (x, y) => this.world.findWalkableNear(x, y) ?? { x, y },
    };
  }

  /** Marks out a band's first two structures somewhere near their camp. */
  private placeCampSites(band: Band, rng: RNG): void {
    // Two huts, because one three-by-three shelter cannot hold a band of
    // fifteen through a winter, and nobody but the player can order a new one
    // built until bands plan for themselves in M3.
    for (const defId of ['mud_hut', 'mud_hut', 'storage_pit']) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const x = Math.round(band.homeX + rng.range(-6, 6));
        const y = Math.round(band.homeY + rng.range(-6, 6));
        if (this.place(defId, x, y, band.id)) break;
      }
    }
  }

  /**
   * Adds a newborn to the world and to their family.
   *
   * Kinship edges are written in both directions here rather than derived on
   * demand, because opinion is read constantly and walking a family tree on
   * every lookup would be the most expensive thing in the social layer.
   */
  private registerBirth(child: Person, mother: Person, father: Person | null): void {
    this.people.push(child);
    this.peopleById.set(child.id, child);

    mother.childIds.push(child.id);
    if (father) father.childIds.push(child.id);

    const household = child.householdId === null
      ? null
      : this.householdsById.get(child.householdId);
    if (household) household.add(child.id);

    linkFamily(child, [mother, father], this.relationships);

    const text = t('{mother} bore {child}', { mother: mother.name, child: child.name });
    mother.chronicle.push({
      tick: this.time.tick, ageDays: mother.age, text, kind: 'milestone',
    });
    child.chronicle.push({
      tick: this.time.tick, ageDays: 0, text: t('was born'), kind: 'milestone',
    });
    telemetry.count('birth');
  }

  /**
   * Everything that follows a death: goods pass, the household finds a new
   * head, and if the player's own character has died, an heir is nominated.
   *
   * Driven from `cleanupDead` rather than from each cause of death, so old age,
   * starvation and a flint knife all settle an estate the same way.
   */
  private settleAffairs(person: Person): void {
    person.affairsSettled = true;
    telemetry.count('death_settled');

    const heir = findHeir(person, this.peopleById);
    const household = person.householdId === null
      ? null
      : this.householdsById.get(person.householdId) ?? null;
    const home = household?.homeBuildingId == null
      ? null
      : this.buildingsById.get(household.homeBuildingId) ?? null;

    settleEstate(person, heir, home, (x, y, itemId, count) => this.dropAt(x, y, itemId, count));

    if (household) {
      household.remove(person.id);
      if (household.headId === person.id) {
        // The head is gone. The heir takes the household if they are in it;
        // otherwise the eldest remaining member does.
        const candidates = household.memberIds
          .map(id => this.peopleById.get(id))
          .filter((p): p is Person => !!p && p.alive)
          .sort((a, b) => b.age - a.age);
        const successor = (heir && household.memberIds.includes(heir.id))
          ? heir
          : candidates[0] ?? null;
        if (successor) {
          household.headId = successor.id;
          successor.chronicle.push({
            tick: this.time.tick,
            ageDays: successor.age,
            text: t('became head of the {name} household', { name: household.name }),
            kind: 'milestone',
          });
          telemetry.count('succession');
        } else {
          household.endedTick = this.time.tick;
          telemetry.count('household_extinct');
        }
      }
    }

    // M11 phase 16c: the widow is *not* told here. This cleared her
    // `spouseId` on the tick of the death, so the wife of a man killed in a
    // clearing nobody saw could be courted the next day without anybody
    // having said a word to her. She is widowed when she knows: see
    // `SocialSystem.absorb` and `findBodies`.

    if (person.isPlayer) {
      this.succession = { died: person, heir };
      telemetry.count('player_died');
    }
  }

  /** Moves a person into another household, leaving whichever they were in. */
  private joinHousehold(person: Person, household: Household): void {
    if (person.householdId === household.id) return;
    const previous = person.householdId === null
      ? null
      : this.householdsById.get(person.householdId);
    if (previous) {
      previous.remove(person.id);
      if (previous.extinct) previous.endedTick = this.time.tick;
    }
    household.add(person.id);
    person.householdId = household.id;
  }

  /**
   * Merges two newlyweds into one household: the elder's, since the head is
   * the one with standing. The younger's household dissolves into it.
   */
  mergeHouseholds(a: Person, b: Person): void {
    const elder = a.age >= b.age ? a : b;
    const younger = elder === a ? b : a;
    const target = elder.householdId === null
      ? null
      : this.householdsById.get(elder.householdId);
    if (!target) return;

    const source = younger.householdId === null
      ? null
      : this.householdsById.get(younger.householdId);
    if (source && source.id !== target.id) {
      for (const memberId of [...source.memberIds]) {
        const member = this.peopleById.get(memberId);
        if (member) this.joinHousehold(member, target);
      }
      // What used to be `source.store` moving to `target.store` is now
      // either a transfer between the two households' home buildings, or
      // nothing to do at all: if the target has no home of its own yet, the
      // couple's goods simply stay wherever the source's already sit and the
      // household keeping them is now named for the target.
      if (source.homeBuildingId !== null) {
        if (target.homeBuildingId === null) {
          target.homeBuildingId = source.homeBuildingId;
        } else if (target.homeBuildingId !== source.homeBuildingId) {
          const from = this.buildingsById.get(source.homeBuildingId);
          const to = this.buildingsById.get(target.homeBuildingId);
          if (from && to) {
            for (const [itemId, count] of from.store.entries()) {
              to.store.add(itemId, from.store.remove(itemId, count));
            }
          }
        }
      }
      source.endedTick = this.time.tick;
    }
    younger.surname = target.name;
  }

  /**
   * A deed moves the standing of the household behind it, not only the
   * opinions of whoever saw it.
   *
   * **M11 phase 6c.** `SocialSystem.onDeed` is the same pattern `onMarriage`
   * already uses, for the same reason: a household is this class's business,
   * not the social layer's, which only knows people and what they feel about
   * each other. Unlike `RelationshipGraph.addDeed`, this is not filtered
   * through any one observer's culture or hearsay — renown is the family's
   * own record of what it has done, read the same way by everyone, which is
   * exactly what makes it something a stranger can respect before they have
   * ever met you.
   */
  private accrueRenown(actor: Person, type: EventType, magnitude: number): void {
    if (actor.householdId === null) return;
    const household = this.householdsById.get(actor.householdId);
    if (!household) return;
    // Unclamped, deliberately, unlike `Relationship.deeds`: that component
    // feeds directly into a -100..100 opinion scale and has to fit inside
    // it, but every reader of `renown` (`standingOver`, `chooseChief`) asks
    // for it only *relative to the band's own average* — see phase 6d. A hard
    // ceiling here would let enough ordinary generosity saturate every
    // long-lived household at the same value, erasing exactly the gap the
    // rest of this phase exists to let open.
    household.renown += DEED_WEIGHT[type] * (0.5 + magnitude * 0.5);
  }

  // -------------------------------------------------------------------------
  // Authority and exile
  // -------------------------------------------------------------------------

  private authorityContext(): AuthorityContext {
    return {
      relationships: this.relationships,
      householdsById: this.householdsById,
      buildingsById: this.buildingsById,
      chiefByBand: this.bandSystem.chiefByBand,
      bands: this.bands,
      day: this.time.day,
    };
  }

  /**
   * What `leader` could make `subordinate` do, and how likely they are to.
   *
   * `foreign` is M11 phase 11c: an order aimed at a structure belonging to
   * some band other than the subordinate's own costs what a crime costs, not
   * what the verb costs. See `Authority.FOREIGN_PROPERTY_COST`. Every caller
   * that asks about a verb with no structure behind it — a job, a fight, the
   * Ties panel — leaves it alone and gets exactly the answer it always did.
   */
  standing(leader: Person, subordinate: Person, action: string, foreign = false) {
    return standingOver(leader, subordinate, action, this.authorityContext(), foreign);
  }

  /**
   * Whether an order's target is a structure belonging to somebody else's
   * band, the one question `standing`'s `foreign` flag answers.
   *
   * Read off the *subordinate's* band rather than the leader's, because the
   * imposition being priced is theirs: it is the person walking into the
   * rival camp who risks being caught in it.
   */
  private ordersForeignProperty(subordinate: Person, buildingId: number | undefined): boolean {
    if (buildingId === undefined) return false;
    const building = this.buildingsById.get(buildingId);
    return building !== undefined && building.ownerBandId !== subordinate.bandId;
  }

  private rankContext(): RankContext {
    return {
      householdsById: this.householdsById,
      chiefByBand: this.bandSystem.chiefByBand,
      peopleById: this.peopleById,
      bands: this.bands,
    };
  }

  /**
   * The band somebody actually lives in, by the same rule the ranks use.
   *
   * Not `person.bandId` alone: somebody who married into a household of
   * another band belongs where the household is (`Rank.bandOf`). The tribe
   * graph's "own band only" filter asks this rather than comparing ids, so it
   * can never disagree with the "other bands" row it is hiding.
   */
  bandIdOf(person: Person): number {
    return bandOf(person, this.rankContext());
  }

  /**
   * Where each of `ids` stands in `subject`'s band, or null when that band has
   * no shape to speak of.
   *
   * M9.5 phase 4e, and the tribe graph's only route to the pyramid it draws.
   * The panel hands in the people it is about to draw and gets back a rung
   * apiece; it never works a rank out for itself, because a rank is a claim
   * about who would be obeyed and `Rank.ts` derives that from the very terms
   * `standingOver` adds up. Null means "draw the flat sociogram", which is
   * what a band whose chief has never had the idea of `division_of_labour`
   * gets — see `Rank.bandHasShape`.
   */
  ranksAround(subject: Person, ids: Iterable<number>): Map<number, BandRank> | null {
    const ctx = this.rankContext();
    const bandId = bandOf(subject, ctx);
    if (!bandHasShape(bandId, ctx)) return null;
    const ranks = new Map<number, BandRank>();
    for (const id of ids) {
      const person = this.peopleById.get(id);
      if (person) ranks.set(id, rankIn(person, bandId, ctx));
    }
    return ranks;
  }

  /**
   * Issues an order to someone else, subject to their willingness.
   *
   * Returns whether it was obeyed. A refusal is public and costs the leader
   * some regard in the eyes of whoever refused — telling someone to do
   * something they will not do is itself a move, and a bad one.
   */
  command(
    leader: Person,
    subordinate: Person,
    action: string,
    target: Parameters<Simulation['order']>[2] = {}
  ): boolean {
    if (!leader.alive || !subordinate.alive) return false;
    if (leader.id === subordinate.id) return this.order(leader, action, target);

    // M12 phase 4c: a captive has no standing to refuse a direct order from
    // the people holding them. Keeping this exception here, at the same seam
    // as every other order, means the player and the AI get the same forced
    // labour rule instead of one of them quietly bypassing it.
    if (isCaptive(subordinate) && subordinate.captiveOf === leader.bandId &&
      leader.captiveOf === null) {
      telemetry.count('captive_order_obeyed');
      subordinate.mood.add('purpose', -2, 'forced labour', this.time.tick);
      return this.order(subordinate, action, target);
    }

    const standing = this.standing(leader, subordinate, action,
      this.ordersForeignProperty(subordinate, target.buildingId));
    if (this.commandRng.next() >= standing.chance) {
      telemetry.count('order_refused');
      if (standing.byRank) telemetry.count('order_refused_by_rank');
      // Recorded on the leader as well as counted: see `assignJob` below, and
      // `division_of_labour`'s friction spark, which this is the heaviest
      // source of.
      leader.noteSaw(ORDER_REFUSED);
      // Why they refused, in the words `standingOver` already wrote for exactly
      // this purpose. It was being computed one line above and thrown away, so
      // a social refusal reached the player as a bare "X refuses" — while the
      // Ties tab showed this same sentence right up until the moment it
      // mattered. The standing rule is that a refusal says why.
      this.lastRefusal = standing.because;
      subordinate.chronicle.push({
        tick: this.time.tick,
        ageDays: subordinate.age,
        // English has always written the action id here ("over haul"); a
        // translation says what was asked, where it has the words for it.
        text: t('refused {name} over {action}', {
          name: leader.name,
          action: language() !== 'en' && ORDER_WORDS[action] ? t(ORDER_WORDS[action]!) : action,
        }),
        kind: 'did',
      });
      // Being refused stings, and it is the refuser who thinks less of you for
      // having asked something they were not willing to do.
      this.relationships.addDeed(subordinate.id, leader.id, -3, this.time.tick);
      return false;
    }

    telemetry.count('order_obeyed');
    // M11 phase 13f. A chief's order reaches the player's character exactly
    // as it reaches anybody else's — that is the pillar — but it used to do so
    // in silence: a chief calling a raid, or directing work, would set an
    // idle player walking toward a rival's granary and nothing on screen said
    // who had sent them, or why they had stopped answering to the player.
    if (subordinate.isPlayer) {
      const who = knowledgeOfPerson(subordinate, leader, this.relationships).displayName;
      this.noteInsight(subordinate, t('{who} sent you to {order}', {
        who, order: ORDER_WORDS[action] ? t(ORDER_WORDS[action]!) : action,
      }), 'setback');
    }
    if (standing.byRank) {
      telemetry.count('order_obeyed_by_rank');
      // The only way `chiefdom` is ever practised: an order that landed on
      // somebody who is neither your kin nor under your roof, and landed
      // because of the rank rather than in spite of having none. `noteDid` is
      // what carries a practice toward `TRIES_TO_TEST`.
      leader.noteDid('preside');
    }
    return this.order(subordinate, action, target);
  }

  /**
   * Casts someone out of their band.
   *
   * The exiled keep everything except belonging: their memories, their kin,
   * their grudges and their goods all come with them. What they lose is the
   * standing regard of a band and the roof over a camp, which in a hard winter
   * is most of what a band is for.
   */
  private exile(person: Person, band: Band, factionSize: number): void {
    this.removeBandMembership(person);
    void factionSize;
    void band;
  }

  /**
   * Takes in a wandering outcast. The mirror of `exile`, and the two dangers
   * its own header flags apply here too: `Household.bandId` is what
   * `headsAHouseIn` reads, and the household the outcast left behind was
   * deliberately not touched when they were cast out, so it still names their
   * old band. Founding a fresh one-person household under the adopting band is
   * therefore not a convenience, it is what lets them be counted as belonging
   * here at all.
   */
  private adopt(person: Person, band: Band): void {
    const previous = person.householdId === null
      ? null
      : this.householdsById.get(person.householdId);
    // M11 phase 15d: an escaped captive coming home. Their household was never
    // touched when they were taken — that is what `captiveFrom` is for — so
    // it still names this band, and they go back into it rather than
    // founding a new one: the door home is the family they left.
    if (previous && person.captiveFrom === band.id && previous.bandId === band.id) {
      person.captiveFrom = null;
      person.bandId = band.id;
      person.clearTarget();
      person.forgetPlans();
      person.action = 'idle';
      telemetry.count('captive_came_home');
      return;
    }
    person.captiveFrom = null;
    if (previous) {
      previous.remove(person.id);
      if (previous.extinct) previous.endedTick = this.time.tick;
    }

    const household = new Household(person.surname, person.id, band.id, this.time.tick);
    this.households.push(household);
    this.householdsById.set(household.id, household);
    household.add(person.id);
    person.householdId = household.id;

    person.bandId = band.id;
    person.clearTarget();
    person.forgetPlans();
    person.action = 'idle';
  }

  /**
   * Once a day, whoever has a body in sight finds it — M11 phase 16c. Once
   * each, and deterministic: it is a question of where people are standing.
   *
   * What they find depends on what they can tell. A fresh body is somebody,
   * whether the finder knew them or not — the way a stranger seen stealing
   * is remembered as that stranger — and the finding becomes a story about
   * them (`body_found`) that the finder carries and tells. One gone over past
   * the finder's knowing, bones, or a body cut up is only remains: found, and
   * about nobody.
   */
  private findBodies(): void {
    const perDay = this.config.time.ticksPerDay;
    for (const corpse of this.corpses) {
      const stage = stageOf(corpse, this.time.tick, perDay);
      for (const finder of this.peopleHash.queryRadius(corpse.x, corpse.y, this.config.sightRadius)) {
        if (!finder.alive || finder.isChild || corpse.foundBy.has(finder.id)) continue;
        // For `bodies-are-found`: the first time anybody at all comes upon it.
        if (corpse.foundBy.size === 0) telemetry.count('corpse_first_found');
        corpse.foundBy.add(finder.id);
        const knows = stage === 'fresh' && !corpse.dismembered
          ? true
          : corpseIdentity(finder, corpse, this.relationships, stage).identified;
        if (!knows) {
          telemetry.count('remains_found');
          continue;
        }
        corpse.foundEventId = this.social.findBody(
          finder, corpse.person, corpse.foundEventId, corpse.x, corpse.y, this.time.tick);
        // M11 phase 16e: in the finder's own life, named as they knew them.
        finder.chronicle.push({
          tick: this.time.tick, ageDays: finder.age, kind: 'milestone',
          text: t('found the body of {name}', {
            name: knowledgeOfPerson(finder, corpse.person, this.relationships).displayName,
          }),
        });
        // And to the player, if they saw it happen or it was them: the only
        // two ways they could know — including of a body they had hidden.
        const player = this.player;
        if (player && player.alive) {
          const dead = knowledgeOfPerson(player, corpse.person, this.relationships).displayName;
          if (finder.id === player.id) {
            this.noteInsight(player, t('You found the body of {name}', { name: dead }), 'setback');
          } else if (player.distanceTo(finder) <= this.config.sightRadius) {
            const who = knowledgeOfPerson(player, finder, this.relationships).displayName;
            this.noteInsight(player, t('{finder} has found the body of {name}', {
              finder: who.charAt(0).toUpperCase() + who.slice(1), name: dead,
            }), 'setback');
          }
        }
        // M11 phase 16d: wounds on a body somebody cares about start an
        // investigation. See `Investigation.ts` for who cares.
        if (corpse.wounded && finder.investigation === null &&
          wouldInvestigate(finder, corpse.person, this.relationships, this.normsByBand.get(finder.bandId))) {
          finder.investigation = {
            deadId: corpse.person.id,
            x: corpse.x,
            y: corpse.y,
            diedTick: corpse.diedTick,
            untilTick: this.time.tick + INVESTIGATION_DAYS * perDay,
            asked: new Set(),
          };
          telemetry.count('investigation_opened');
        }
      }
    }
  }

  /** Takes a body out of the world: sunk, or scattered by the years. */
  private removeCorpse(corpse: Corpse): void {
    if (!this.corpsesById.delete(corpse.id)) return;
    this.corpses = this.corpses.filter(c => c.id !== corpse.id);
    this.corpseHash.rebuild(this.corpses);
  }

  /**
   * Makes somebody a captive of the band of whoever tied them up — M11 phase
   * 15d. A rope from one of their own is only a rope. See `Captivity.ts` for
   * what a captive is and why they are simply moved into the captor band.
   */
  private takeCaptive(person: Person, binder: Person): void {
    if (binder.bandId === person.bandId) return;
    const captors = this.bands.find(b => b.id === binder.bandId);
    if (!captors || captors.outcast) return;
    const from = this.bands.find(b => b.id === person.bandId);
    // An outcast taken is taken from nowhere: there is no camp for them to
    // walk back to, and the escapee's road home needs one.
    person.captiveFrom = from && !from.outcast ? from.id : null;
    person.captiveOf = captors.id;
    person.captiveSince = this.time.tick;
    // A child taken away is not only a state change. It is the kind of public
    // wrong a whole people carries, so witnesses must see the event while the
    // victim still belongs to their old band; changing bandId first would make
    // the social event blame the captor's own people instead.
    if (person.isChild) {
      this.social.emit('abduction', binder, person, 1, this.time.tick,
        this.peopleHash, this.config.sightRadius);
      telemetry.count('child_abducted');
    }
    person.bandId = captors.id;
    person.job = null;
    person.resume = null;
    person.forgetPlans();
    telemetry.count('taken_captive');
    person.chronicle.push({
      tick: this.time.tick, ageDays: person.age,
      text: t('was taken captive by the {band}', { band: captors.name }), kind: 'suffered',
    });
    binder.chronicle.push({
      tick: this.time.tick, ageDays: binder.age,
      text: t('took {name} captive', { name: person.name }), kind: 'did',
    });
    this.noteStop(person, person.action, 'taken_captive');
  }

  /**
   * A captive slips away — M11 phase 15d. Out of the captor band and into
   * the outcasts, remembering `captiveFrom`, so the road home and the
   * adoption at the end of it both know where they are going.
   */
  private escape(person: Person): void {
    const captors = this.bands.find(b => b.id === person.captiveOf);
    person.captiveOf = null;
    person.captiveSince = null;
    const outcasts = this.outcastBand();
    person.bandId = outcasts.id;
    person.job = null;
    person.chronicle.push({
      tick: this.time.tick, ageDays: person.age,
      text: t('escaped from the {band}', { band: captors?.name ?? '' }), kind: 'milestone',
    });
  }

  /**
   * Pays a captor to release somebody. The payer must belong to the captive's
   * old band and stand at the captor's camp; goods go to the captor directly,
   * so this is a real exchange rather than a menu-only pardon.
   */
  ransomCaptive(payer: Person, captive: Person, itemId: string, count: number): boolean {
    if (!payer.alive || !captive.alive || !isCaptive(captive) || count <= 0) return false;
    if (payer.bandId !== captive.captiveFrom || payer.distanceTo(captive) > 6) return false;
    if (!payer.inventory.has(itemId, count)) return false;
    const captor = this.people.find(person =>
      person.alive && person.bandId === captive.captiveOf && !person.isChild);
    if (!captor) return false;
    payer.inventory.remove(itemId, count);
    captor.inventory.add(itemId, count);
    const oldBand = captive.captiveFrom;
    captive.captiveOf = null;
    captive.captiveSince = null;
    captive.boundBy = null;
    captive.boundUntil = -9999;
    captive.bandId = this.outcastBand().id;
    captive.captiveFrom = oldBand;
    captive.clearTarget();
    captive.forgetPlans();
    captive.action = 'idle';
    telemetry.count('captive_ransomed');
    captive.chronicle.push({
      tick: this.time.tick, ageDays: captive.age,
      text: t('was released for a ransom'), kind: 'milestone',
    });
    payer.chronicle.push({
      tick: this.time.tick, ageDays: payer.age,
      text: t('paid a ransom for {name}', { name: captive.name }), kind: 'did',
    });
    return true;
  }

  /** Once per day, children who have lived long enough among their captors are
   * adopted into a captor household. Adults remain forced labourers until
   * escape, rescue or a later social rule gives them another way out. */
  private settleCaptives(): void {
    const adoptionTicks = CAPTIVE_ADOPTION_DAYS * this.config.time.ticksPerDay;
    for (const captive of this.people) {
      if (!captive.alive || !isCaptive(captive)) continue;
      captive.mood.add('belonging', -CAPTIVE_DAILY_MOOD_LOSS, 'captivity', this.time.tick);
      captive.mood.add('security', -CAPTIVE_DAILY_MOOD_LOSS, 'captivity', this.time.tick);
      if (!captive.isChild || captive.captiveSince === null ||
        this.time.tick - captive.captiveSince < adoptionTicks) continue;
      const band = this.bands.find(candidate => candidate.id === captive.captiveOf);
      const chief = band?.chiefId === null || band?.chiefId === undefined
        ? null : this.peopleById.get(band.chiefId);
      const household = chief?.householdId === null || chief?.householdId === undefined
        ? null : this.householdsById.get(chief.householdId);
      if (!band || !household) continue;
      const previous = captive.householdId === null ? null : this.householdsById.get(captive.householdId);
      if (previous) {
        previous.remove(captive.id);
        if (previous.extinct) previous.endedTick = this.time.tick;
      }
      captive.householdId = household.id;
      captive.surname = household.name;
      household.add(captive.id);
      captive.captiveOf = null;
      captive.captiveFrom = null;
      captive.captiveSince = null;
      captive.boundBy = null;
      captive.boundUntil = -9999;
      telemetry.count('captive_adopted');
      captive.chronicle.push({
        tick: this.time.tick, ageDays: captive.age,
        text: t('was adopted by the {household}', { household: household.name }), kind: 'milestone',
      });
    }
  }

  /**
   * Takes someone out of their band, whether they were cast out or left of
   * their own accord.
   *
   * Shared by `exile` and by `BandSystem.considerRebellion`'s "leave" outcome
   * — the mechanical effect is identical, only the story attached to it
   * differs, and that story is the caller's to tell in the chronicle.
   */
  private removeBandMembership(person: Person): void {
    const outcasts = this.outcastBand();
    person.bandId = outcasts.id;
    person.clearTarget();
    person.forgetPlans();
    person.action = 'idle';
  }

  /**
   * Assigns somebody's job, or clears it with `null`.
   *
   * A standing arrangement rather than a one-off task, but still an order:
   * asking someone else to spend their days differently goes through the same
   * compliance roll `command` does, with its own entry in `ORDER_COST`.
   * Assigning your own job always succeeds, the same exception `command`
   * makes for yourself — *once somebody has had the idea at all.*
   *
   * **M9.5 phase 4c: the idea is a technology, and it is the gate.** Before
   * `division_of_labour` there is no such thing as setting one person to one
   * task, for the player or for a chief, and the attempt is refused in the
   * words of the world rather than quietly doing nothing. What is gated is
   * *legitimate* authority, not authority: `doThreaten` from 4a still takes
   * food off a neighbour by menace, and it still works on a stranger and
   * across a band boundary, which this never will. That contrast is the whole
   * point of the node.
   *
   * The gate is tested **before the compliance draw**, so a band that has not
   * had the idea spends no `commandRng` at all rather than burning one draw a
   * day per band on a question that cannot be answered yes.
   */
  assignJob(leader: Person, subordinate: Person, job: JobId | null): boolean {
    if (!leader.alive || !subordinate.alive) return false;

    // Held by the individual doing the arranging, like every other technology
    // in this game — there is no global unlock and no band-wide one either.
    // `techPower` is half strength for a practice that has been thought
    // through but not yet made a habit of, which is what lets the practice be
    // tried at all; see this node's entry in `Tech.ts`.
    const organising = techPower(leader, 'division_of_labour');
    if (organising <= 0) {
      telemetry.count('job_unimagined');
      this.lastRefusal =
        t('{name} has never had the idea of setting one person to one task', { name: leader.name });
      return false;
    }

    if (leader.id === subordinate.id) {
      subordinate.job = job;
      telemetry.count('job_assigned');
      // Deciding to spend your own days one way is still the practice being
      // put to use, and it is the only route a person with nobody to arrange
      // has. `noteDid` is what moves a practice toward `TRIES_TO_TEST`.
      leader.noteDid('assign');
      return true;
    }

    const standing = this.standing(leader, subordinate, 'job');
    // What refinement means for a node whose other effect is a gate: knowing
    // how to ask. A half-formed notion buys a little, a practised hand buys
    // more, and none of it is large enough to make a resented leader obeyed —
    // the terms in `standingOver` still dominate.
    const chance = Math.min(0.98, standing.chance + ORGANISED_ORDER_BONUS * organising);
    if (this.commandRng.next() >= chance) {
      telemetry.count('job_refused');
      this.lastRefusal = standing.because;
      // Being told no is one of the senses an idea is built out of, and it is
      // the *leader* it happens to. `division_of_labour`'s friction spark is
      // this line; see `SAW_WORDS.order_refused`.
      leader.noteSaw(ORDER_REFUSED);
      subordinate.chronicle.push({
        tick: this.time.tick,
        ageDays: subordinate.age,
        text: t('refused to take up work for {name}', { name: leader.name }),
        kind: 'did',
      });
      this.relationships.addDeed(subordinate.id, leader.id, -3, this.time.tick);
      return false;
    }

    subordinate.job = job;
    telemetry.count('job_assigned');
    leader.noteDid('assign');
    subordinate.chronicle.push({
      tick: this.time.tick,
      ageDays: subordinate.age,
      text: job !== null
        ? t('was put to work as a {job}', { job: t(JOBS[job].label).toLowerCase() })
        : t('was released from their work'),
      kind: 'milestone',
    });
    return true;
  }

  /**
   * Outsiders seen standing on each band's ground, by whom it was seen and
   * when — M11 phase 14a. Written only by `lookForIntruders`; read from 14c by
   * the territory engine, which until then counted every foreigner within
   * range of a camp whether or not anybody from the band was looking.
   */
  readonly sightings: Sightings = new Map();
  /**
   * What each band has seen of the land, M11 phase 14d — the first memory of
   * places in the game, and the seed of M12's world map. See `BandMaps`.
   * Created on first use, from the world's size.
   */
  private bandMapsStore: BandMaps | null = null;
  get bandMaps(): BandMaps {
    this.bandMapsStore ??= new BandMaps(this.world.width, this.world.height);
    return this.bandMapsStore;
  }
  private readonly sightingScratch: Person[] = [];

  /** Every founding band's camp, for the brain's readers of fear. */
  private bandHomes(): Map<number, { x: number; y: number }> {
    const homes = new Map<number, { x: number; y: number }>();
    for (const band of this.bands) {
      if (!band.outcast) homes.set(band.id, { x: band.homeX, y: band.homeY });
    }
    return homes;
  }

  private lookForIntruders(): void {
    const territories = new Map<number, Territory>();
    for (const band of this.bands) {
      if (band.outcast) continue;
      territories.set(band.id, { bandId: band.id, homeX: band.homeX, homeY: band.homeY });
    }
    const outcast = this.bands.find(b => b.outcast)?.id;
    sightIntruders(
      this.people, this.peopleHash, territories, TERRITORY_RADIUS, this.config.sightRadius,
      this.time.tick, this.sightings, outcast, this.sightingScratch);
    // M11 phase 16d: the same looking-around sees who has blood on them.
    noticeBloodied(this.people, this.peopleHash, this.config.sightRadius, this.time.tick);
    // The same looking-around writes what each band knows of the land.
    for (const person of this.people) {
      if (!person.alive || person.bandId === outcast) continue;
      this.bandMaps.observe(person.bandId, person.x, person.y, this.config.sightRadius, this.nodeHash);
    }
  }

  /** The band of no band. Created the first time anyone is cast out. */
  private outcastBand(): Band {
    const existing = this.bands.find(b => b.outcast);
    if (existing) return existing;

    const band: Band = {
      id: this.bands.length + OUTCAST_BAND_ID_BASE,
      name: t('the outcast'),
      homeX: this.world.width / 2,
      homeY: this.world.height / 2,
      norms: { ...DEFAULT_NORMS },
      strangerRegard: STRANGER_REGARD_MEAN,
      chiefId: null,
      chiefSince: null,
      claimedCells: new Set(),
      outcast: true,
    };
    this.bands.push(band);
    this.normsByBand.set(band.id, band.norms);
    this.strangerRegardByBand.set(band.id, band.strangerRegard);
    return band;
  }

  /**
   * Recounts who knows what, and what age that makes it.
   *
   * `knownTech` on the simulation is derived from the population rather than
   * stored, which is the whole point: when the last person who could fire clay
   * dies, pottery leaves the world and the granary stops being buildable — with
   * no bookkeeping anywhere to say so.
   */
  private refreshEra(): void {
    const living = this.livingPeople();
    // Counted from **adults**, not from everybody alive.
    //
    // Since phase 4 a child can be taught and can pick things up by watching,
    // and their knowledge is real — they keep it, and it becomes the world's
    // the day they grow up. But it is latent: they cannot pass it on, and what
    // this count answers is what a society can presently *do*. Two concrete
    // reasons beyond the story. The era fraction divides holders by adults, so
    // counting children in the numerator alone could put it over one and
    // advance an age on a cohort of six-year-olds. And `knownTech` is what
    // gates the build menu: a band should not be able to raise a granary
    // because somebody's daughter once watched a pot being fired.
    //
    // The consequence is deliberate and is one of the better stories this model
    // tells: a technology whose last adult holder dies leaves the world, and
    // comes back years later when the child who was watching is grown.
    const adultsAlive = living.filter(p => !p.isChild);
    const holders = countHolders(adultsAlive);
    this.techHolders.clear();
    for (const [tech, count] of holders) this.techHolders.set(tech, count);

    this.knownTech.clear();
    for (const tech of TECHS) {
      if ((holders.get(tech) ?? 0) > 0) this.knownTech.add(tech);
    }

    const adults = adultsAlive.length;
    const era = eraFor(holders, adults);
    if (era.id !== this.era.id) {
      telemetry.count(
        ERA_ORDER.indexOf(era.id) > ERA_ORDER.indexOf(this.era.id)
          ? 'era_advanced'
          : 'era_lost'
      );
    }
    this.era = era;
  }

  // -------------------------------------------------------------------------
  // Goods on the ground
  // -------------------------------------------------------------------------

  /**
   * Puts something down where a person is standing.
   *
   * Merges into a pile already underfoot rather than making a second one, so a
   * camp does not fill up with single-berry heaps.
   */
  drop(person: Person, itemId: string, count: number): ItemPile | null {
    const taken = person.inventory.remove(itemId, count);
    if (taken === 0) return null;

    let pile = this.pileHash.findNearest(person.x, person.y, 1.2);
    if (!pile) {
      pile = new ItemPile(Math.round(person.x), Math.round(person.y), person.id, this.time.tick);
      this.piles.push(pile);
      this.pilesById.set(pile.id, pile);
      this.pileHash.rebuild(this.piles);
    }
    pile.contents.add(itemId, taken);
    telemetry.count('dropped', taken);
    return pile;
  }

  /**
   * Puts goods on the ground at a place rather than at a person.
   *
   * `drop` takes them out of somebody's pack; this is for yields that never
   * reached a pack at all — the timber from a tree felled by someone whose
   * hands were already full.
   */
  dropAt(x: number, y: number, itemId: string, count: number): void {
    if (count <= 0) return;
    let pile = this.pileHash.findNearest(x, y, 1.2);
    if (!pile) {
      pile = new ItemPile(Math.round(x), Math.round(y), null, this.time.tick);
      this.piles.push(pile);
      this.pilesById.set(pile.id, pile);
      this.pileHash.rebuild(this.piles);
    }
    pile.contents.add(itemId, count);
    telemetry.count('dropped', count);
  }

  /**
   * Picks a pile back up, as far as the carrier has room for.
   *
   * `itemId`/`count` omitted means everything, in pile order — today's
   * behaviour, byte-for-byte, which is what every AI caller still wants. M9.3
   * gave the player a choice of item and amount without changing that default.
   */
  takeFromPile(person: Person, pile: ItemPile, itemId?: string, count?: number): number {
    let moved = 0;
    if (itemId !== undefined) {
      const room = person.carryCapacity - person.carrying;
      const want = Math.min(count ?? pile.contents.count(itemId), pile.contents.count(itemId), room);
      if (want > 0) {
        moved = pile.contents.remove(itemId, want);
        person.inventory.add(itemId, moved);
      }
    } else {
      for (const [id, stackCount] of pile.contents.entries()) {
        const room = person.carryCapacity - person.carrying - moved;
        if (room <= 0) break;
        const taken = pile.contents.remove(id, Math.min(stackCount, room));
        person.inventory.add(id, taken);
        moved += taken;
      }
    }
    if (pile.empty) this.removePile(pile);
    if (moved > 0) telemetry.count('picked_up', moved);
    return moved;
  }

  private removePile(pile: ItemPile): void {
    this.pilesById.delete(pile.id);
    this.piles = this.piles.filter(p => p.id !== pile.id);
    this.pileHash.rebuild(this.piles);
  }

  /**
   * Eats one unit from the pack — the Kit's *Eat* button. Returns whether
   * anything was eaten. Goes through `consumeFood`, the same function eating
   * by order does, so the two can never again disagree about what a meal is.
   */
  eatItem(person: Person, itemId: string): boolean {
    return consumeFood(person, itemId);
  }

  /**
   * Hands a stack to somebody else.
   *
   * Emits the same `share_food` deed the AI's own giving does when the goods are
   * food, so generosity from the panel is witnessed and remembered exactly like
   * generosity in the field. Anything else is a plain transfer.
   *
   * `count` defaults to the whole stack, which is what every call site before
   * M9 phase 2 always moved — `handOver` itself was never the problem note 9
   * found; the panel calling it with no way to ask for less was.
   */
  handOver(giver: Person, receiver: Person, itemId: string, count = giver.inventory.count(itemId)): number {
    const room = receiver.carryCapacity - receiver.carrying;
    if (room <= 0) {
      this.lastRefusal = t('{name} cannot carry any more', { name: receiver.name });
      return 0;
    }
    const moved = giver.inventory.remove(itemId, Math.min(room, count, giver.inventory.count(itemId)));
    if (moved === 0) return 0;
    receiver.inventory.add(itemId, moved);

    const nutrition = (ITEMS[itemId]?.nutrition ?? 0) * moved;
    if (nutrition > 0) {
      this.social.emit('share_food', giver, receiver, Math.min(1, nutrition / 60),
        this.time.tick, this.peopleHash, this.config.sightRadius);
    } else {
      // M11 phase 17a: anything else handed over is a gift, and a gift is a
      // deed — see `giftWorth`.
      this.social.emit('gift', giver, receiver, giftWorth(itemId, moved),
        this.time.tick, this.peopleHash, this.config.sightRadius);
    }
    telemetry.count('handed_over', moved);
    return moved;
  }

  /**
   * Puts a stack into a store. Returns how much fitted.
   *
   * `count` defaults to the whole stack, matching `handOver`'s default and
   * `drop`'s existing signature — the panel is what gained a way to ask for
   * less, in M9 phase 2, not this method.
   */
  storeItem(person: Person, store: Building, itemId: string, count = person.inventory.count(itemId)): number {
    const access = this.mayUseBuilding(person, store);
    if (!access.ours) {
      // The inventory-panel shortcut does not run through ActionSystem, so it
      // must cross the same property boundary here or clicking an item would
      // bypass the rule obeyed by walking to the store.
      //
      // M11 phase 15a: and, like `ActionSystem.useProperty`, being watched no
      // longer refuses. The deed is emitted either way, and the witnesses in
      // sight of it take it into their memories; the player is told that they
      // were seen rather than that they could not.
      this.social.emit('trespass', person, null, 0.5, this.time.tick,
        this.peopleHash, this.config.sightRadius, true, store.ownerBandId);
      telemetry.count(access.watched ? 'property_used_watched' : 'property_used_unseen');
      if (access.watched) this.noteWatched(person, access, true);
    }
    const moved = store.accept(person.inventory, itemId, count);
    if (moved === 0) return 0;
    telemetry.count('stored', moved);
    return moved;
  }

  /** The marked band owning a coarse cell, or null on unclaimed ground. */
  territoryOwnerAt(x: number, y: number): number | null {
    const key = `${Math.floor(x / MAP_CELL)},${Math.floor(y / MAP_CELL)}`;
    for (const band of this.bands) {
      if (!band.outcast && band.claimedCells?.has(key)) return band.id;
    }
    return null;
  }

  hasTerritoryPermission(person: Person, ownerBandId: number): boolean {
    return (this.territoryPermissions.get(`${person.id}:${ownerBandId}`) ?? -1) >= this.time.day;
  }

  /**
   * A neighbour asks the owner for a one-day pass. Good relations make a free
   * answer possible; a strained relationship is still negotiable while the
   * owner's stores are comfortable, which is the peaceful alternative to
   * treating every foreign gatherer as a thief.
   */
  requestTerritoryPermission(visitor: Person, owner: Person): boolean {
    if (!visitor.alive || !owner.alive || visitor.bandId === owner.bandId ||
      owner.isChild || visitor.distanceTo(owner) > this.config.sightRadius) return false;
    const band = this.bands.find(candidate => candidate.id === owner.bandId);
    if (!band || band.outcast || !band.claimedCells ||
      this.territoryOwnerAt(visitor.x, visitor.y) !== band.id) return false;
    const stores = this.buildings.filter(building =>
      building.ownerBandId === band.id && building.complete && building.def.storage >= 100);
    const abundance = stores.length === 0 ? 0 : stores.reduce((sum, store) =>
      sum + (store.def.storage - store.storageFree) / store.def.storage, 0) / stores.length;
    const regard = this.bandRelations.standing(visitor.bandId, band.id);
    const needsTribute = regard < 0 || abundance < 0.35;
    const tribute = visitor.inventory.bestFood();
    if (needsTribute && tribute === null) {
      telemetry.count('territory_permission_refused');
      return false;
    }
    if (needsTribute) {
      visitor.inventory.remove(tribute!, 1);
      owner.inventory.add(tribute!, 1);
      telemetry.count('territory_tribute_paid');
    }
    this.territoryPermissions.set(`${visitor.id}:${band.id}`, this.time.day + 1);
    telemetry.count('territory_permission_granted');
    visitor.chronicle.push({
      tick: this.time.tick, ageDays: visitor.age,
      text: t('was allowed to gather by the {band}', { band: band.name }), kind: 'did',
    });
    return true;
  }

  /**
   * Withdraws a named stack from a store for the direct transfer panel.
   *
   * The panel is deliberately not allowed to edit either inventory itself:
   * capacity, ownership and telemetry must remain the same answers as the
   * order/action path. Keeping the inverse here also prevents a UI shortcut
   * from taking more than the carrier can actually hold.
   */
  takeItem(person: Person, store: Building, itemId: string, count: number): number {
    const access = this.mayUseBuilding(person, store);
    if (!access.ours) {
      this.lastRefusal = t('this store is not yours');
      return 0;
    }
    if (!store.complete || store.def.storage <= 0 || store.ruined) {
      this.lastRefusal = t('this is not a working store');
      return 0;
    }
    const room = Math.max(0, person.carryCapacity - person.carrying);
    const moved = store.store.remove(itemId, Math.min(room, count, store.store.count(itemId)));
    if (moved <= 0) {
      this.lastRefusal = room <= 0 ? t('{name} cannot carry any more', { name: person.name }) : t('there was nothing to take');
      return 0;
    }
    person.inventory.add(itemId, moved);
    telemetry.count('withdrawn', moved);
    return moved;
  }

  /**
   * The store within arm's reach that this person would sooner use: their own
   * band's (or a close ally's) first, then one nobody is watching, and only
   * then one an owner can see.
   *
   * M11 phase 15a: a watched store used to be left out entirely, the same
   * veto `useProperty` applied. It is offered now because using it is
   * possible, and `storeItem` tells the player who saw — but it is still the
   * last choice, so standing between your own pit and a rival's does not
   * quietly turn every click into a trespass.
   */
  storeWithinReach(person: Person) {
    let best: Building | null = null;
    let bestRank = Infinity;
    for (const b of this.buildings) {
      if (!b.complete || b.def.storage <= 0 || !b.contains(person.x, person.y, 2)) continue;
      const use = this.mayUseBuilding(person, b);
      const rank = use.ours ? 0 : use.watched ? 2 : 1;
      if (rank < bestRank) {
        bestRank = rank;
        best = b;
      }
    }
    return best;
  }

  /** The one ownership answer shared by direct UI actions and simulation work. */
  mayUseBuilding(person: Person, building: Building): PropertyUse {
    return mayUse(person, building, {
      peopleHash: this.peopleHash,
      sightRadius: this.config.sightRadius,
      bandRelations: this.bandRelations,
    });
  }

  /**
   * Every complete, unruined, non-field structure, grouped by who owns it —
   * M11 phase 11b, cached on `sabotageCache` and refreshed once a day rather
   * than recomputed for every person's `think`, or even every tick.
   *
   * `Brain`'s `sabotage` scoring needs to ask, for each person thinking, "does
   * any band mine is hostile with own a building worth wrecking?" What is
   * true about a building — complete, standing, worth knocking down — does
   * not depend on who is asking, only `mayUse`'s witness question does.
   * Filtering and grouping it here, once, and handing every person's `think`
   * the same map turns what would otherwise be an O(people × buildings) scan
   * on every tick into one O(buildings) pass a day, each person then only
   * ever touching the few entries that belong to a band they are actually
   * hostile with — almost always none at all, and never more than a handful
   * of bands.
   *
   * Both halves of the saving were measured, not guessed. Sharing the scan
   * across people but still rebuilding it fresh every tick — the first thing
   * tried — closed most of the gap and not all of it: `lean`'s large, long
   * running population went from roughly 1,700 steps/s back up to roughly
   * 1,870, still short of the 2,000 floor `perf-budget` holds it to, a floor
   * this scenario cleared by only about 150 steps/s before this feature
   * existed. Moving the refresh from every tick to once a day — the same
   * cadence `bandRelations.decay()` and `snowDepth` already update on — is
   * what closed the rest: nothing about which buildings exist and stand
   * changes fast enough to need checking sixty times over between one sunrise
   * and the next. A building that finishes being wrecked or repaired between
   * two refreshes is still checked for real the moment anybody actually walks
   * up to it, in `ActionSystem.doSabotage` itself, so a stale entry here costs
   * at most a wasted walk for the AI, never a wrong outcome — and never
   * anything at all for a player's own explicit order, which never consults
   * this cache in the first place.
   */
  private sabotageCandidatesByBand(): Map<number, Building[]> {
    const byBand = new Map<number, Building[]>();
    for (const building of this.buildings) {
      if (!building.complete || building.ruined) continue;
      // Fields included since M11 phase 17c: see `ActionSystem.doSabotage`.
      if (!isStructure(building.def)) continue;
      const list = byBand.get(building.ownerBandId);
      if (list) list.push(building);
      else byBand.set(building.ownerBandId, [building]);
    }
    return byBand;
  }

  /** The pile under a point, if any. */
  pileAt(x: number, y: number): ItemPile | null {
    return this.pileHash.findNearest(x, y, 1.2);
  }

  /** Takes a felled tree out of the world and its index. */
  private removeTree(tree: Tree): void {
    this.treesById.delete(tree.id);
    this.trees = this.trees.filter(t => t.id !== tree.id);
    this.treeHash.rebuild(this.trees);
  }

  /**
   * Records that somebody's order ended, for the UI to read.
   *
   * Only orders: the queue exists so the player can be told why the thing they
   * asked for stopped happening, and an NPC who broke off foraging because they
   * were thirsty is not answering any question the player asked.
   */
  /**
   * Records that somebody saw further into something.
   *
   * Unlike `noteStop` this is *not* limited to people under orders. Knowledge
   * is the one thing in this world that outlives the person who found it, and a
   * neighbour working something out in front of you is worth knowing about
   * whether or not you told them to. Whether it is shown is decided by whoever
   * knows what the player can see; the cap is here so that a headless run which
   * never drains the queue cannot grow without bound.
   */
  /**
   * What is on somebody's mind right now: everything a spark could fire on.
   *
   * Exposed for the tech web, which answers "why has this not occurred to me?"
   * and must answer it out of the *same* situation `tryConceive` decides on.
   * A panel that assembled its own view of what a person is holding and feeling
   * would eventually disagree with the simulation, and the disagreement would
   * read as a bug in the game rather than in the panel.
   */
  noticeOf(person: Person): Notice {
    return this.knowledgeSystem.notice(person, {
      world: this.world,
      season: this.time.season,
    });
  }

  private noteInsight(person: Person, text: string, kind: 'idea' | 'gain' | 'setback'): void {
    this.insights.push({ personId: person.id, text, kind });
    if (this.insights.length > this.interruptionCap) this.insights.shift();
  }

  /**
   * `direct` is for the UI's own shortcuts, `storeItem`, which only ever run
   * because the player clicked something — whoever they were acting for.
   */
  private noteWatched(person: Person, use: PropertyUse, direct = false): void {
    if (!direct && person.order === null && !person.isPlayer) return;
    this.watchedUses.push({ personId: person.id, use });
    if (this.watchedUses.length > this.interruptionCap) this.watchedUses.shift();
  }

  // -------------------------------------------------------------------------
  // Justice — M12 phase 2b, `social/Justice.ts`
  // -------------------------------------------------------------------------

  /**
   * `teller` has put `told` to `chief`, who judges it. Returns what came of it,
   * as the stop reason the teller is shown.
   *
   * Three cases, by who the accused belongs to. One of the chief's own
   * people wronged one of theirs: `judgeOwn`. One of the chief's own wronged
   * a stranger, and the stranger's chief sent word: `answerDemand`. Somebody
   * of another people wronged one of the chief's: nothing the chief can order
   * — it goes on their docket, to be put to that people (`parley`).
   */
  private hearComplaint(teller: Person, chief: Person, told: Case): string {
    const accused = this.peopleById.get(told.accusedId);
    const plaintiff = this.peopleById.get(told.plaintiffId);
    if (!accused || !accused.alive || !plaintiff || !plaintiff.alive) return 'case_gone';
    // Heard, not seen: the story of it passes to the chief the way any story
    // does, so what the chief thinks of the accused moves as hearsay moves it.
    this.tellTheWrong(teller, chief, accused, plaintiff);

    if (accused.bandId !== chief.bandId) {
      if (!chief.docket.some(c => c.accusedId === told.accusedId && c.plaintiffId === told.plaintiffId)) {
        chief.docket.push(told);
      }
      telemetry.count('case_taken_up');
      return 'chief_takes_it_up';
    }

    const debt = debtTo(accused, plaintiff.id);
    if (!debt) return 'case_settled';
    const canPay = offerFor(accused, debt).value >= debt.worth * OFFER_AT_LEAST;
    const foreign = plaintiff.bandId !== chief.bandId;
    if (foreign) {
      const band = this.bands.find(b => b.id === chief.bandId);
      const verdict = answerDemand(chief, accused, band?.strangerRegard ?? 0.5,
        this.bandRelations.standing(chief.bandId, plaintiff.bandId), this.relationships, canPay);
      telemetry.count('demand_' + verdict);
      if (verdict === 'refuse') {
        this.bandRelations.add(chief.bandId, plaintiff.bandId, -REFUSED_STANDING);
        const text = t('{chief} refused what another people asked for {name}', { chief: chief.name, name: plaintiff.name });
        chief.chronicle.push({ tick: this.time.tick, ageDays: chief.age, text, kind: 'did' });
        return 'demand_refused';
      }
      return verdict === 'order' ? this.orderAmends(chief, accused, plaintiff) : this.shame(chief, accused, plaintiff);
    }

    const verdict = judgeOwn(chief, plaintiff, accused, this.relationships, canPay);
    telemetry.count('verdict_' + verdict);
    if (verdict === 'dismiss') {
      this.relationships.addDeed(plaintiff.id, chief.id, -DISMISSED_GRUDGE, this.time.tick);
      const text = t('{chief} would not hear {name} against {accused}',
        { chief: chief.name, name: plaintiff.name, accused: accused.name });
      plaintiff.chronicle.push({ tick: this.time.tick, ageDays: plaintiff.age, text, kind: 'suffered' });
      return 'chief_dismissed';
    }
    return verdict === 'order' ? this.orderAmends(chief, accused, plaintiff) : this.shame(chief, accused, plaintiff);
  }

  /**
   * A chief puts a case to `envoy`, one of the accused's people. Their chief
   * answers on the spot; anybody else carries it home, and it waits on their
   * telling (`complain`) — the owner's rule, and why a demand made to a
   * herdsman at the edge of the woods may never reach anybody.
   */
  private putToEnvoy(chief: Person, envoy: Person, told: Case): string {
    const accused = this.peopleById.get(told.accusedId);
    const plaintiff = this.peopleById.get(told.plaintiffId);
    if (!accused || !accused.alive || !plaintiff || !plaintiff.alive) return 'case_gone';
    this.tellTheWrong(chief, envoy, accused, plaintiff);
    if (this.bandSystem.chiefByBand.get(envoy.bandId) === envoy.id) {
      telemetry.count('parley_with_chief');
      const outcome = this.hearComplaint(chief, envoy, told);
      return outcome === 'demand_refused' ? 'demand_refused' : 'demand_answered';
    }
    envoy.carriedDemand = told;
    telemetry.count('demand_carried');
    return 'demand_carried';
  }

  /** The chief orders amends made. Refused, it is shamed instead. */
  private orderAmends(chief: Person, accused: Person, plaintiff: Person): string {
    // The player is told, not moved: an order from a chief is the player's to
    // obey or not, and `command` would take their character out of their hands.
    if (accused.isPlayer) {
      const text = t('{chief} ordered {name} to make amends to {other}',
        { chief: chief.name, name: accused.name, other: plaintiff.name });
      accused.chronicle.push({ tick: this.time.tick, ageDays: accused.age, text, kind: 'suffered' });
      this.noteInsight(accused, text, 'setback');
      telemetry.count('amends_ordered');
      return 'chief_ordered_amends';
    }
    if (this.command(chief, accused, 'make_amends', { personId: plaintiff.id })) {
      const text = t('{chief} ordered {name} to make amends to {other}',
        { chief: chief.name, name: accused.name, other: plaintiff.name });
      accused.chronicle.push({ tick: this.time.tick, ageDays: accused.age, text, kind: 'suffered' });
      telemetry.count('amends_ordered');
      return 'chief_ordered_amends';
    }
    telemetry.count('amends_order_defied');
    return this.shame(chief, accused, plaintiff);
  }

  /**
   * A public shaming: the chief tells the wrong to everybody of the band in
   * sight — hearsay, so it moves each of them as a story does — and the
   * accused's household loses renown for it. No blow, no goods: what is taken
   * is standing, which is what a household in a stratifying band has to lose.
   */
  private shame(chief: Person, accused: Person, plaintiff: Person): string {
    for (const listener of this.peopleHash.queryRadius(chief.x, chief.y, this.config.sightRadius)) {
      if (!listener.alive || listener.id === chief.id || listener.bandId !== chief.bandId) continue;
      this.tellTheWrong(chief, listener, accused, plaintiff);
    }
    const household = accused.householdId === null ? null : this.householdsById.get(accused.householdId);
    if (household) household.renown -= SHAME_RENOWN;
    this.relationships.addDeed(accused.id, chief.id, -DISMISSED_GRUDGE / 2, this.time.tick);
    const text = t('{chief} shamed {name} before the band', { chief: chief.name, name: accused.name });
    accused.chronicle.push({ tick: this.time.tick, ageDays: accused.age, text, kind: 'suffered' });
    chief.chronicle.push({ tick: this.time.tick, ageDays: chief.age, text, kind: 'did' });
    telemetry.count('shamed');
    return 'chief_shamed_them';
  }

  /** Passes on `teller`'s own memory of what `accused` did to `plaintiff`, if they still have it. */
  private tellTheWrong(teller: Person, listener: Person, accused: Person, plaintiff: Person): void {
    let story = null;
    for (const memory of teller.memory.all()) {
      if (memory.actorId !== accused.id || memory.targetId !== plaintiff.id) continue;
      if (DEED_WEIGHT[memory.type] >= 0) continue;
      if (!story || memory.salience > story.salience) story = memory;
    }
    if (story) this.social.tellStory(teller, listener, story, this.peopleById);
  }

  /**
   * Daily, M12 phase 2b: a chief's own grievance against a stranger goes on
   * their own docket with no walk to anybody — they are who it would be
   * taken to — and cases nobody has put to the other people in a year go.
   */
  private keepDockets(): void {
    const stale = DEBT_DAYS * this.config.time.ticksPerDay;
    for (const [bandId, chiefId] of this.bandSystem.chiefByBand) {
      const chief = this.peopleById.get(chiefId);
      if (!chief || !chief.alive) continue;
      for (const grievance of chief.grievances) {
        if (grievance.lodged || grievance.againstBandId === bandId) continue;
        grievance.lodged = true;
        chief.docket.push({
          plaintiffId: chief.id, plaintiffBandId: bandId,
          accusedId: grievance.againstId, accusedBandId: grievance.againstBandId,
          kind: grievance.kind, tick: grievance.tick,
        });
      }
    }
    for (const person of this.people) {
      if (person.docket.length > 0) person.docket = person.docket.filter(c => this.time.tick - c.tick <= stale);
      if (person.carriedDemand && this.time.tick - person.carriedDemand.tick > stale) person.carriedDemand = null;
    }
  }

  private noteStop(person: Person, action: string, reason: string): void {
    // Being held down is news to the player whatever they were doing — even
    // standing idle, when there was no order to stop — because from then on
    // their keys do nothing, and a character that will not move needs a
    // reason on screen.
    if (person.order === null &&
      !(person.isPlayer && (reason === 'restrained' || reason === 'bound' || reason === 'taken_captive'))) return;
    this.interruptions.push({
      personId: person.id, action, reason, recipe: person.targetRecipe,
    });
    if (this.interruptions.length > this.interruptionCap) this.interruptions.shift();

    // An order broken off for a need is set aside, not thrown away. Called
    // before `finish` clears the targets, which is the only moment the order is
    // still fully described. Reasons that are not needs — the tree is gone, the
    // bush is empty — are not worth coming back to.
    if (!RESUMABLE_STOPS.has(reason)) return;
    person.resume = {
      action,
      expiresAt: this.time.tick + RESUME_WINDOW,
      nodeId: person.targetNodeId,
      treeId: person.targetTreeId,
      buildingId: person.targetBuildingId,
      personId: person.targetPersonId,
      animalId: person.targetAnimalId,
      recipe: person.targetRecipe,
      inscriptionId: person.targetInscriptionId,
      pileId: person.targetPileId,
      tech: person.targetTech,
      itemId: person.targetItemId,
      count: person.targetItemCount,
      x: person.targetX,
      y: person.targetY,
    };
  }

  /**
   * Picks an interrupted order back up once the need behind it is answered.
   *
   * The thresholds are well below the ones that interrupted the work, so a
   * person cannot ping-pong between the bush and the river: they have to be
   * genuinely comfortable again, not merely one point under the line.
   */
  private resumeOrders(person: Person): void {
    const pending = person.resume;
    if (!pending) return;
    // Not "only while idle": a person is idle for exactly the one tick between
    // finishing something and the brain planning the next thing, and the odds of
    // that tick coinciding with them being comfortable again are poor. The real
    // condition is that they are under no other order and not mid-job.
    if (person.order !== null || person.actionTimer > 0) return;

    if (this.time.tick > pending.expiresAt) {
      person.resume = null;
      telemetry.count('resume_expired');
      return;
    }
    // Comfortable, not merely under the line that interrupted them: thirst is
    // interrupted at 35, so coming back at 34 would break off again within the
    // minute and the pair would ping-pong.
    if (person.needs.thirst > 20 || person.needs.hunger > 25 || person.needs.cold > 25) return;

    person.resume = null;
    const ok = this.order(person, pending.action, {
      nodeId: pending.nodeId ?? undefined,
      treeId: pending.treeId ?? undefined,
      buildingId: pending.buildingId ?? undefined,
      personId: pending.personId ?? undefined,
      animalId: pending.animalId ?? undefined,
      recipeId: pending.recipe ?? undefined,
      inscriptionId: pending.inscriptionId ?? undefined,
      pileId: pending.pileId ?? undefined,
      techId: pending.tech ?? undefined,
      itemId: pending.itemId ?? undefined,
      count: pending.count ?? undefined,
      x: pending.nodeId === null && pending.treeId === null &&
        pending.buildingId === null && pending.personId === null &&
        pending.animalId === null && pending.pileId === null
        ? pending.x ?? undefined : undefined,
      y: pending.nodeId === null && pending.treeId === null &&
        pending.buildingId === null && pending.personId === null &&
        pending.animalId === null && pending.pileId === null
        ? pending.y ?? undefined : undefined,
    });
    // A refusal here is ordinary — the bush was stripped while they drank — and
    // must not surface as a refusal message the player never asked for.
    this.lastRefusal = null;
    telemetry.count(ok ? 'order_resumed' : 'resume_impossible');
  }

  /**
   * Who slept under the same roof, handed to `SocialSystem.hearth`.
   *
   * Called from the daily block, which runs at `tick % ticksPerDay === 0` —
   * midnight, by `TimeManager.daylight`, which is precisely when the people
   * who are going to sleep indoors are lying in them. That is why this is a
   * sample of one moment rather than a tally kept through the night: a night
   * has a middle, and it costs one pass over the population instead of a
   * counter on every sleeping tick.
   *
   * The containment test is `reachBuilding`'s own, with a tile of margin.
   * Somebody still walking to the hut has `action === 'sleep'` and
   * `targetBuildingId` set, and has shared nothing with anybody yet.
   */
  private shareTheHearth(): void {
    const byRoof = new Map<number, Person[]>();
    for (const person of this.people) {
      if (!person.alive || person.action !== 'sleep') continue;
      if (person.targetBuildingId === null) continue;
      const roof = this.buildingsById.get(person.targetBuildingId);
      if (!roof || !roof.complete || roof.def.shelter <= 0) continue;
      if (!roof.contains(person.x, person.y, 1)) continue;
      const under = byRoof.get(roof.id);
      if (under) under.push(person);
      else byRoof.set(roof.id, [person]);

      // M11 phase 6a: the same midnight sample that pairs people for a
      // hearth conversation is the cheapest honest reading of where a
      // household actually lives, so it doubles as that.
      if (person.householdId !== null) {
        const household = this.householdsById.get(person.householdId);
        if (household) household.homeBuildingId = roof.id;
      }
    }
    for (const under of byRoof.values()) {
      this.social.hearth(under, this.time.tick);
      // M11 phase 9b: the same sample, spent a second way. `SocialSystem.
      // hearth` is what a night under one roof does to a relationship;
      // `hearthRng` is its own stream so that whether a lesson is attempted
      // tonight never shifts which pairs warm to each other, or vice versa.
      this.knowledgeSystem.hearthLesson(
        under, this.hearthRng, this.time.tick,
        (person, text, kind) => this.noteInsight(person, text, kind));
    }
  }

  /** Takes a killed animal out of the world and its index. */
  private removeAnimal(animal: Animal): void {
    this.animalsById.delete(animal.id);
    this.animals = this.animals.filter(a => a.id !== animal.id);
    telemetry.count('animal_killed');
  }

  /** The animal nearest a point, within a click's reach. */
  animalAt(x: number, y: number): Animal | null {
    return this.animalHash.findNearest(x, y, 1.2, a => a.alive);
  }

  /** The standing tree nearest a point, within a click's reach. */
  treeAt(x: number, y: number): Tree | null {
    return this.treeHash.findNearest(x, y, 1.6, t => t.standing);
  }

  private hasWaterNear(x: number, y: number, radius: number): boolean {
    for (let dy = -radius; dy <= radius; dy += 2) {
      for (let dx = -radius; dx <= radius; dx += 2) {
        if (this.world.isWater(x + dx, y + dy)) return true;
      }
    }
    return false;
  }

  /**
   * Issues an order. This is the single entry point the radial menu uses, so
   * every verb the UI offers is one the simulation already understands.
   * Returns false if the order turned out to be impossible.
   */
  order(
    person: Person,
    action: string,
    target: {
      x?: number; y?: number;
      nodeId?: number; personId?: number; buildingId?: number; treeId?: number;
      animalId?: number;
      /** Which entry of `RECIPES` a `craft` is for. */
      recipeId?: string;
      /** Which record a `read` or a half-finished `inscribe` is aimed at. */
      inscriptionId?: number;
      /** Which heap of dropped goods a `pickup` is aimed at. */
      pileId?: number;
      /** Which body a `dismember` or a `drag` is aimed at, M11 phase 16b. */
      corpseId?: number;
      /**
       * Which technology a `ponder` or a `discuss` is about.
       *
       * Optional, and omitted by every AI caller: `Brain.setup` names no
       * technology and the action falls back to `workableIdea` exactly as it
       * always did. Only a player choosing from the menu sets this.
       */
      techId?: string;
      /**
       * Which rung of `Conversation.ts` a `talk` is.
       *
       * Optional, and omitted by every AI caller: `Brain.setup` names no rung
       * and `doTalk` reads one off the relationship exactly as it does for
       * everybody. Only a player choosing from the menu sets this, and
       * `doTalk` refuses a rung the relationship does not warrant rather than
       * quietly holding a cheaper conversation than the one that was asked
       * for.
       */
      mode?: string;
      /**
       * Which item and how much a `take` should withdraw.
       *
       * Optional: a `take` with no `itemId` lets `doTake` fall back to its own
       * sensible default, which is what every AI-planned trip to the larder
       * still does. Only the player's own explicit choice — made in the
       * quantity picker `main.ts` opens when the store's contents are already
       * known to them — sets this.
       */
      itemId?: string;
      count?: number;
    } = {}
  ): boolean {
    if (!person.alive) return false;

    // A new order supersedes whatever was set aside. Doing this here rather
    // than at every call site means the player changing their mind cannot leave
    // a stale job to spring back later.
    person.resume = null;
    person.clearTarget();
    person.action = action;
    person.order = action;
    // Set before the target branches below, every one of which returns: a craft
    // carries no place and would otherwise fall out of the bottom having lost
    // the only thing that says what is being made. `itemId` is the same story
    // for `take`, which is always aimed at a `buildingId` and would otherwise
    // lose the chosen item to that branch's own return.
    if (target.itemId !== undefined) {
      person.targetItemId = target.itemId;
      person.targetItemCount = target.count ?? null;
    }
    // Set here for the same reason: a `discuss` is aimed at a person and would
    // otherwise lose the technology to that branch's own return.
    if (target.techId !== undefined) person.targetTech = target.techId;
    // And here for the same reason again: a `talk` is aimed at a person.
    if (target.mode !== undefined) person.talkMode = target.mode;

    if (target.recipeId !== undefined) {
      person.targetRecipe = target.recipeId;

      // M8.1, mechanism 4: the first of the two channels a missing station
      // reaches the player through. This one answers "why would he not start?"
      // — the player asked for meal with no quern in the world — and the other
      // is `onStopped`, for the quern that is demolished while he walks to it.
      // Refusing here rather than letting `doCraft` abandon on the first tick
      // is the difference between being told and watching somebody shrug.
      const stationId = RECIPES[target.recipeId]?.station;
      if (stationId !== undefined) {
        const named = target.buildingId === undefined
          ? null
          : this.buildingsById.get(target.buildingId);
        const label = BUILDINGS[stationId]?.label.toLowerCase() ?? stationId;
        if (!named || !named.complete || named.def.id !== stationId) {
          return this.cancelOrder(person, t('that has to be made at {station}', {
            station: aNoun(label),
          }));
        }
      }
    }

    if (target.inscriptionId !== undefined) {
      const record = this.inscriptionsById.get(target.inscriptionId);
      if (!record) return this.cancelOrder(person, t('that record is gone'));
      person.targetInscriptionId = record.id;
      person.targetX = record.x;
      person.targetY = record.y;
      return true;
    }

    if (target.corpseId !== undefined) {
      const corpse = this.corpsesById.get(target.corpseId);
      if (!corpse) return this.cancelOrder(person, t('the body is gone'));
      // M11 phase 16e: the player looking into a death themselves. The same
      // investigation an NPC opens on a finding, opened by asking for it.
      if (action === 'investigate' &&
        (person.investigation === null || person.investigation.deadId !== corpse.person.id)) {
        person.investigation = {
          deadId: corpse.person.id,
          x: corpse.x,
          y: corpse.y,
          diedTick: corpse.diedTick,
          untilTick: this.time.tick + INVESTIGATION_DAYS * this.config.time.ticksPerDay,
          asked: new Set(),
        };
      }
      person.targetCorpseId = corpse.id;
      person.targetX = corpse.x;
      person.targetY = corpse.y;
      return true;
    }

    if (target.pileId !== undefined) {
      const pile = this.pilesById.get(target.pileId);
      if (!pile || pile.empty) return this.cancelOrder(person, t('those goods are gone'));
      if (this.isBuried(pile.x, pile.y)) return this.cancelOrder(person, t('it is under the snow'));
      person.targetPileId = pile.id;
      person.targetX = pile.x;
      person.targetY = pile.y;
      return true;
    }

    if (target.personId !== undefined) {
      const other = this.peopleById.get(target.personId);
      if (!other || !other.alive) return this.cancelOrder(person, t('they are gone'));
      person.targetPersonId = other.id;
      person.targetX = other.x;
      person.targetY = other.y;
      return true;
    }
    if (target.animalId !== undefined) {
      const animal = this.animalsById.get(target.animalId);
      if (!animal || !animal.alive) return this.cancelOrder(person, t('it is gone'));
      person.targetAnimalId = animal.id;
      person.targetX = animal.x;
      person.targetY = animal.y;
      return true;
    }
    if (target.treeId !== undefined) {
      const tree = this.treesById.get(target.treeId);
      if (!tree || !tree.standing) return this.cancelOrder(person, t('that tree is gone'));
      person.targetTreeId = tree.id;
      person.targetX = tree.x;
      person.targetY = tree.y;
      return true;
    }
    if (target.buildingId !== undefined) {
      const building = this.buildingsById.get(target.buildingId);
      if (!building) return this.cancelOrder(person, t('that building is gone'));
      person.targetBuildingId = building.id;
      person.targetX = building.centerX;
      person.targetY = building.centerY;
      return true;
    }
    if (target.nodeId !== undefined) {
      const node = this.nodesById.get(target.nodeId);
      if (!node || node.depleted) return this.cancelOrder(person, t('there is nothing left there'));
      if (node.def.groundLevel && this.isBuried(node.x, node.y)) {
        return this.cancelOrder(person, t('it is under the snow'));
      }
      person.targetNodeId = node.id;
      person.targetX = node.x;
      person.targetY = node.y;
      return true;
    }
    if (target.x !== undefined && target.y !== undefined) {
      // Drinking is aimed at water, and water is not somewhere you can stand.
      // Right-clicking a lake used to offer Drink and then refuse it without a
      // word, because the order tried to walk onto the tile that was clicked.
      // Send them to the nearest bank instead.
      if (action === 'drink') {
        const bank = this.shoreHash.findNearest(target.x, target.y, 24,
          tile => this.world.sameRegion(person.x, person.y, tile.x, tile.y));
        if (!bank) return this.cancelOrder(person, t('no bank they can reach from here'));
        person.targetX = bank.x;
        person.targetY = bank.y;
        return true;
      }
      if (!this.world.isWalkable(target.x, target.y)) {
        return this.cancelOrder(person, t('they cannot walk there'));
      }
      if (!this.world.sameRegion(person.x, person.y, target.x, target.y)) {
        return this.cancelOrder(person, t('there is no way across'));
      }
      person.targetX = target.x;
      person.targetY = target.y;
      return true;
    }
    // Actions like 'rest' and 'eat' happen where you stand.
    return true;
  }

  /**
   * Refuses an order and records why.
   *
   * The reason is the point. A refusal used to be a bare `false` and the UI
   * could only say "cannot do that", which is the least useful thing a game can
   * tell you — especially for drinking, where the real answer was that the
   * water itself is not somewhere you can stand.
   */
  private cancelOrder(person: Person, reason = t('that cannot be done')): boolean {
    person.clearTarget();
    person.forgetPlans();
    person.action = 'idle';
    this.lastRefusal = reason;
    return false;
  }

  // -------------------------------------------------------------------------
  // Records
  // -------------------------------------------------------------------------

  /**
   * Cuts a new record at a point, and returns it.
   *
   * No placement test beyond the tile being walkable. A carved stone is not a
   * structure: two of them can sit on the same ground, and a record under a
   * building is a record in a library, which is exactly what a library is for.
   */
  placeInscription(
    form: InscriptionForm,
    x: number,
    y: number,
    author: Person
  ): Inscription | null {
    const def = INSCRIPTIONS[form];
    if (!def) return null;
    const tx = Math.round(x);
    const ty = Math.round(y);
    if (!this.world.isWalkable(tx, ty)) return null;

    const made = new Inscription(def, tx, ty, author, this.time.tick);
    this.inscriptions.push(made);
    this.inscriptionsById.set(made.id, made);
    this.inscriptionHash.rebuild(this.inscriptions);
    telemetry.count('inscribed_' + form);
    return made;
  }

  /**
   * Whether a point is inside a finished library.
   *
   * A linear scan over the buildings, like `buildingAt` and
   * `NeedsSystem.shelterAt` beside it, and correct while a camp holds a handful
   * of structures. It is called once per `ponder`, which is a hundred and fifty
   * ticks apart, so it is nowhere near the hot path — `optimizations.md`
   * records the general case if settlements ever grow into towns.
   */
  inLibrary(x: number, y: number): boolean {
    for (const building of this.buildings) {
      if (!building.complete || building.def.id !== 'library') continue;
      if (building.contains(x, y, 1.5)) return true;
    }
    return false;
  }

  /**
   * The nearest record within reach of a point, or null.
   *
   * `filter` is not decoration: records stack, because a carving is a place
   * rather than a structure and a library is a heap of them on one floor. A
   * carver standing over a finished stone and a half-cut one needs the half-cut
   * one, and asking for "the nearest" got them whichever the index returned
   * first — which stranded every second carving for ever.
   */
  inscriptionAt(
    x: number,
    y: number,
    radius = 1.6,
    filter?: (record: Inscription) => boolean
  ): Inscription | null {
    return this.inscriptionHash.findNearest(x, y, radius, filter);
  }

  private removeInscription(record: Inscription): void {
    this.inscriptionsById.delete(record.id);
    this.inscriptions = this.inscriptions.filter(i => i.id !== record.id);
    this.inscriptionHash.rebuild(this.inscriptions);
    telemetry.count('record_lost');
  }

  /**
   * Records crumble, and what is still legible is recounted.
   *
   * Once a day rather than per tick, like every other slow process here. The
   * recount is derived rather than maintained for the same reason `knownTech`
   * is: a record that is lost takes what it held out of the world with nothing
   * anywhere having to remember to do it.
   */
  private refreshRecords(): void {
    for (const record of [...this.inscriptions]) {
      if (record.def.decayPerDay <= 0) continue;
      if (this.recordRng.chance(record.def.decayPerDay)) this.removeInscription(record);
    }

    this.recordedTech.clear();
    this.rememberedTech.clear();
    this.recordsInHand.clear();
    for (const record of this.inscriptions) {
      const legible = record.def.fidelity === 'instruction' ? this.recordedTech : this.rememberedTech;
      for (const tech of record.techs) {
        legible.add(tech);
        this.recordsInHand.add(tech);
      }
      if (record.pending !== null) this.recordsInHand.add(record.pending);
    }
  }

  /**
   * Pushes the config values that live on entities back onto every entity.
   *
   * Called by the settings screen after it edits `config` in place. Everything
   * else in `SimConfig` is read through an object reference the systems already
   * hold — `NeedsSystem` and `TimeManager` were handed theirs in the
   * constructor, and the per-tick contexts are rebuilt from `this.config` every
   * step — so a live edit reaches them for free. `skillGain` is the exception:
   * it is stamped on a `Person` at birth, and a multiplier stamped at birth is
   * a promise the settings screen cannot otherwise keep to anyone already alive.
   */
  applyLearning(): void {
    for (const person of this.people) person.skillGain = this.config.learning.skillGain;
  }

  // -------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------

  /** Designs currently placeable, given what the world knows how to do. */
  availableDesigns(): BuildingDef[] {
    return Object.values(BUILDINGS).filter(
      def => def.requiresTech === null || this.knownTech.has(def.requiresTech)
    );
  }

  /**
   * Designs that exist but are out of reach for want of knowledge. Shown in the
   * build menu greyed out, so the progression is visible from the first hut
   * rather than appearing from nowhere in a later age.
   */
  lockedDesigns(): BuildingDef[] {
    return Object.values(BUILDINGS).filter(
      def => def.requiresTech !== null && !this.knownTech.has(def.requiresTech)
    );
  }

  /**
   * Recipes this person can make right now, and the ones they cannot yet.
   *
   * Deliberately **per person**, where `availableDesigns` is per society. That
   * is not an inconsistency: a building is raised by a band and gated on
   * `knownTech`, which is what any adult alive knows; an axe is made by one pair
   * of hands out of one head's worth of knowledge. Asking `techPower` rather
   * than `knownTech.has` also means a design still on the bench counts, which is
   * the whole point of the prototype stage — you can make the thing while you
   * are still finding out whether it works.
   *
   * There was no craft menu at all before this. `RECIPES` was reachable only by
   * right-clicking bare ground, and an entry the actor could not make was left
   * out rather than greyed, so proving hafting changed nothing anywhere the
   * player could see.
   */
  availableRecipes(person: Person): RecipeDef[] {
    return Object.values(RECIPES).filter(recipe => techPower(person, recipe.tech) > 0);
  }

  /** Recipes that exist but are out of this person's reach, for the greyed line. */
  lockedRecipes(person: Person): RecipeDef[] {
    return Object.values(RECIPES).filter(recipe => techPower(person, recipe.tech) <= 0);
  }

  /**
   * True if `def` can stand with its top-left corner at (x, y): every tile
   * walkable, and nothing already there.
   */
  canPlace(def: BuildingDef, x: number, y: number): boolean {
    return this.placementRefusal(def, x, y) === null;
  }

  /**
   * Why this design cannot stand here, in words, or null if it can.
   *
   * `canPlace` used to be the whole answer and the build cursor could only say
   * "cannot build there", which is the same defect the project owner has already
   * had to report once: if the simulation refuses something, the player is owed
   * the reason. "The ground is not clear" and "a fish trap has to sit in the
   * water's edge" are different problems with different fixes, and a fish trap
   * is the first design in the game that can be refused for somewhere a hut
   * would have been perfectly happy.
   */
  placementRefusal(def: BuildingDef, x: number, y: number): string | null {
    for (let dy = 0; dy < def.height; dy++) {
      for (let dx = 0; dx < def.width; dx++) {
        if (!this.world.isWalkable(x + dx, y + dy)) {
          return t('the ground there will not take it');
        }
      }
    }
    for (const existing of this.buildings) {
      const overlapsX = x < existing.x + existing.def.width && x + def.width > existing.x;
      const overlapsY = y < existing.y + existing.def.height && y + def.height > existing.y;
      if (overlapsX && overlapsY) {
        return t('{thing} is already there', { thing: theNoun(existing.def.label.toLowerCase()) });
      }
    }
    if (def.placement === 'shore' && !this.touchesShore(def, x, y)) {
      return t('{thing} has to sit at the water\u2019s edge', { thing: aNoun(def.label.toLowerCase()) });
    }
    // M8.2. A field is the second design with somewhere it has to be, and the
    // first whose requirement is about the ground rather than the map: open
    // ground, and ground with something left in it. The two refusals are
    // separate sentences because they are separate problems — one is answered by
    // walking to the meadow, the other by walking to a different meadow — and
    // "cannot build there" for both is the defect `placementRefusal` exists to
    // fix. The threshold is `SPENT_BELOW`, the same one `doSow` refuses on, so a
    // band cannot site a plot on ground its own sowing would then refuse.
    if (def.placement === 'arable') {
      const barren = this.arableRefusal(def, x, y);
      if (barren) return barren;
    }
    return null;
  }

  /**
   * Why a plot cannot be broken here, or null.
   *
   * Averaged over the whole footprint rather than tested tile by tile: a field
   * with one poor corner is a real field, and demanding sixteen good tiles is
   * how a design becomes unplaceable everywhere on the island without anybody
   * being able to say why.
   */
  private arableRefusal(def: BuildingDef, x: number, y: number): string | null {
    let total = 0;
    let tiles = 0;
    for (let dy = 0; dy < def.height; dy++) {
      for (let dx = 0; dx < def.width; dx++) {
        const biome = this.world.biomeAt(x + dx, y + dy);
        if (biome !== 'grass' && biome !== 'forest' && biome !== 'beach') {
          return t('{thing} wants open ground', { thing: aNoun(def.label.toLowerCase()) });
        }
        total += this.world.effectiveFertilityAt(x + dx, y + dy);
        tiles++;
      }
    }
    // The absolute floor only. Ground nobody has broken is at its own resting
    // state, so the relative half of `isGroundSpent` can never fire here — and
    // a plot *is* allowed to be sited on ground that a previous field wore out,
    // because that is a decision a player is entitled to make badly.
    if (tiles === 0 || total / tiles < SPENT_BELOW) {
      return t('the ground there is too poor to break');
    }
    return null;
  }

  /** True if any tile of the footprint has water for a neighbour. */
  private touchesShore(def: BuildingDef, x: number, y: number): boolean {
    for (let dy = 0; dy < def.height; dy++) {
      for (let dx = 0; dx < def.width; dx++) {
        if (this.world.isShore(x + dx, y + dy)) return true;
      }
    }
    return false;
  }

  /**
   * The state of the ground under one plot, in one place.
   *
   * One implementation, three readers: the panel that tells a player their
   * field is tired, the health report that checks the ground is actually being
   * drawn down, and the insight a farmer gets when a plot crosses into
   * exhaustion. The plan for this pass names that explicitly, and for the usual
   * reason — a panel computing its own version of "how tired is this ground"
   * is a panel that will eventually disagree with the simulation refusing to
   * sow.
   *
   * `resting` is what the same ground would carry untouched, and it is what
   * makes the rest of the numbers mean anything: thin ground and exhausted
   * ground read identically without it.
   */
  soilReport(field: Building): {
    effective: number; resting: number; organic: number; nutrient: number;
    texture: number; spent: boolean;
  } {
    let effective = 0;
    let resting = 0;
    let organic = 0;
    let nutrient = 0;
    let texture = 0;
    let tiles = 0;
    for (let dy = 0; dy < field.def.height; dy++) {
      for (let dx = 0; dx < field.def.width; dx++) {
        const i = this.world.index(field.x + dx, field.y + dy);
        effective += this.world.soil.effectiveFertility(i);
        resting += this.world.soil.restingFertility(i);
        organic += this.world.soil.organic[i]!;
        nutrient += this.world.soil.nutrient[i]!;
        texture += this.world.soil.texture[i]!;
        tiles++;
      }
    }
    const mean = (total: number): number => (tiles === 0 ? 0 : total / tiles);
    return {
      effective: mean(effective), resting: mean(resting), organic: mean(organic),
      nutrient: mean(nutrient), texture: mean(texture),
      spent: isGroundSpent(mean(effective), mean(resting)),
    };
  }

  /** Places a site. Returns the new building, or null if it will not fit. */
  place(defId: string, x: number, y: number, bandId: number): Building | null {
    const def = BUILDINGS[defId];
    if (!def) return null;
    if (def.requiresTech !== null && !this.knownTech.has(def.requiresTech)) return null;
    if (!this.canPlace(def, x, y)) return null;

    const building = new Building(def, x, y, bandId);
    this.buildings.push(building);
    this.buildingsById.set(building.id, building);
    telemetry.count('site_placed');
    return building;
  }

  /**
   * Cancels a player-owned site and returns its delivered materials to the
   * ground. A site is not a completed building, so demolishing it would be a
   * different action and would incorrectly make this a property shortcut.
   */
  cancelConstruction(person: Person, building: Building): boolean {
    if (building.ownerBandId !== person.bandId) {
      this.lastRefusal = t('that construction belongs to another band');
      return false;
    }
    if (building.complete) {
      this.lastRefusal = t('that building is already finished');
      return false;
    }
    if (!this.buildingsById.has(building.id)) {
      this.lastRefusal = t('that construction is gone');
      return false;
    }
    this.removeBuilding(building);
    telemetry.count('construction_cancelled');
    return true;
  }

  /**
   * A day of rot, everywhere food is kept. M8.1, mechanism 1.
   *
   * **It ships switched off, and that was a decision taken on measurements
   * rather than a job left half done.** `needs.spoilRate` is 0 in the default
   * config, so the machinery runs, counts what *would* go off, and removes
   * nothing. The `fishers` scenario turns it on, which is what keeps this code
   * exercised and gated rather than quietly rotting.
   *
   * The measurements, twenty seeds each on `traps`, spoilage off against on:
   * mean survival **92.2% → 88.8%** at rate 0.4 and 88.4% at rate 1, infant
   * starvation 4 → 10 either way, and one world in twenty collapsing where none
   * had. Four rates were tried between 0.35 and 1 and they are indistinguishable
   * from each other at twenty seeds — 0.6 measured *worse* than 1.0 — so the
   * cost is not something a coefficient tunes away.
   *
   * The plan's own condition for holding was whether `preserving` brings the
   * loss back, and it does not: on `fishers`, the scenario built for it, the
   * band that knows how to preserve survived at **91.5%** against **94.1%** for
   * the band that does not. That is noise in the wrong direction rather than a
   * mechanism. Giving stores nearly perfect keeping (a pit at 4, a granary at 8)
   * was tried as well and changed nothing — 87.1% — which locates the harm in
   * *packs*: people carry a great deal of food and all of it rots.
   *
   * So `preserving` and the drying rack are **not shipped**. A technology whose
   * effect is a multiplier on zero is exactly the declared-and-inert content
   * this project has a rule against, and half of one is worse than neither.
   * Both are three lines away in `m8_plan_the_ages.md` when the food economy
   * has the headroom for a supply cut — the honest reading is that it does not
   * yet, and that the supply half of M8.1 should be allowed to bed in first.
   
   *
   * Placed immediately after `refreshRecords` because it is the same kind of
   * thing pointed at a different target: the two processes in this world that
   * take something away while nobody is looking.
   *
   * **Once a day, not once a tick.** About a hundred and forty inventories of
   * four stacks is six hundred map entries, one lookup and one float add each —
   * roughly two and a half map operations per step amortised, three to four
   * orders of magnitude under the noise floor at four thousand steps a second.
   * A per-tick sweep would be six hundred operations per step, comparable to
   * the whole of `NeedsSystem.update`, and is the version to refuse.
   *
   * **It draws no `RNG`.** Loss is proportional and the remainder is carried on
   * the inventory, so this needed no new stream and no change to the fork
   * order — the same property `workTraps` has, and it is a design advantage
   * rather than an accident.
   *
   * Three collections. A fourth, `household.store`, existed until M11 phase
   * 6a and was a black hole — written by `LifeSystem` when somebody died and
   * read by nothing anywhere. A household's goods now live in a real
   * building (`Household.homeBuildingId`), so they are already swept by the
   * building loop below and need no collection of their own.
   */
  private spoilFood(): void {
    const rate = this.config.needs.spoilRate;
    const ticks = this.config.time.ticksPerDay;
    // Everything still runs at rate 0, and that is the point of the staging:
    // the dry run accrues and counts without removing anything, so the size of
    // the change could be read off a run before it was paid for.
    const dry = rate <= 0;
    const elapsed = dry ? ticks : ticks * rate;
    const prefix = dry ? 'would_spoil_' : 'spoiled_';

    const sweep = (inventory: Inventory, keeps: number): void => {
      // What would have gone off with no answer to spoilage at all, measured
      // first and not applied. It is the only honest way to ask whether
      // `preserving` is doing anything: survival across twenty seeds cannot
      // resolve a change this size, and "food still rots" says nothing about
      // whether keeping it well helped. Counted rather than asserted from the
      // multiplier, because a multiplier that is read in the wrong place is
      // exactly the kind of bug this project keeps finding.
      if (keeps > 1) {
        let bare = 0;
        for (const [, count] of inventory.spoil(elapsed, () => 1, false)) bare += count;
        let kept = 0;
        for (const [, count] of inventory.spoil(elapsed, () => keeps, false)) kept += count;
        if (bare > kept) telemetry.count('spoilage_prevented', Math.round(bare - kept));
      }
      const lost = inventory.spoil(elapsed, () => keeps, !dry);
      for (const [itemId, count] of lost) {
        if (count > 0) telemetry.count(prefix + itemId, Math.round(count));
      }
    };

    // A pack keeps food no better than the open air, and there is nothing
    // anybody can carry that changes that — see the note on this method for why
    // `preserving` is not in `TECHS`. When it ships, this is the one line that
    // changes: `sweep(person.inventory, spoilFactor(person))`.
    for (const person of this.people) {
      if (!person.alive) continue;
      sweep(person.inventory, 1);
    }
    for (const building of this.buildings) {
      const keeps = building.def.preserves ?? 1;
      sweep(building.store, keeps);
      // Materials on a site rot too, and a site is exactly where food should
      // not be: nothing delivers berries to a hut, so this is almost always a
      // no-op and is here so that the one day something does, it behaves.
      sweep(building.delivered, keeps);
    }
    // Dropped goods keep no better than a pack.
    for (const pile of this.piles) sweep(pile.contents, 1);
  }

  /**
   * A day's catch in every trap in the world. M8.1, mechanism 3.
   *
   * Three things about this are deliberate.
   *
   * **It draws no `RNG` at all.** A trap's rate is data and the remainder is
   * banked on the building, so nothing here touches the seed contract — which is
   * why traps could be added without appending a stream, and worth stating
   * because the same will be true of spoilage.
   *
   * **The rate is scaled by what the owning band still knows.** Knowledge in
   * this game is held by people, not by a civilisation, and a trap is the first
   * structure whose *output* depends on that: a snare line outlives the person
   * who set it, but not their knowledge. A band with nobody left who understands
   * snares owns a loop of rotting cord, and the character panel says so rather
   * than leaving the player to wonder why the trap stopped.
   *
   * **A full trap stops catching.** That is the pressure that makes emptying it
   * a decision somebody has to take, and it is the difference between a trap and
   * a food faucet.
   */
  /**
   * A day of weather on every standing crop, and a day of recovery in the
   * ground under them.
   *
   * Two sweeps rather than one, because they are over different things and only
   * one of them is small: crops are a handful of plots, and the soil sweep walks
   * only the tiles somebody has actually disturbed. A world where nobody farms
   * pays for one `length` check and one `size` check a day, which is the same
   * bargain `workTraps` and `spoilFood` already strike.
   *
   * No `RNG` anywhere in either. Growth is arithmetic over the season, the
   * harvest is arithmetic over the ground, and the recovery set is walked in
   * insertion order.
   */
  private growCrops(): void {
    const growth = this.time.growth;
    for (const building of this.buildings) {
      const crop = building.crop;
      if (!crop || !building.complete) continue;
      if (crop.advance(this.time.day, growth)) {
        // A harvest nobody came for. Loud on purpose: it is the clearest way
        // the game can say that a field is a commitment rather than a store,
        // and a band that keeps losing them is a band that has planted more
        // than it can reap.
        telemetry.count('harvest_lost');
      }
    }

    const looked = this.world.soil.recover(1);
    if (looked > 0) telemetry.count('soil_tiles_recovering', looked);
  }

  /**
   * A day of rotting down, in every heap somebody still knows how to keep.
   *
   * Deliberately the same shape as `workTraps`, including the part that matters
   * most: the rate is scaled by the band's best grasp of the technology, so a
   * heap whose keeper died is a pile of wet straw rather than a supply. It also
   * uses the same `accrueUnits` carry, so a heap that makes nine tenths of a
   * load a day makes a load every day and a bit rather than nothing at all.
   *
   * Not folded into `workTraps` despite the resemblance. A trap takes something
   * out of the world and a heap turns something already in it into something
   * else; `isTrap` is read by four systems that would all be wrong about a
   * heap, and the comment on `BuildingDef.matures` says which.
   */
  private workHeaps(): void {
    let best = 0;
    const grasp = new Map<number, number>();
    for (const person of this.people) {
      if (!person.alive) continue;
      const power = techPower(person, 'composting');
      if (power > (grasp.get(person.bandId) ?? 0)) grasp.set(person.bandId, power);
      if (power > best) best = power;
    }
    if (best <= 0) return;

    for (const building of this.buildings) {
      const matures = building.def.matures;
      if (!matures || !building.complete) continue;
      const power = grasp.get(building.ownerBandId) ?? 0;
      if (power <= 0) {
        // Nobody left who knows how to turn it. The half-rotted load goes with
        // them, for the reason a trap forgets its part-caught hare.
        building.yieldCarry = 0;
        telemetry.count('heap_unworked');
        continue;
      }
      if (building.storageFree <= 0) {
        telemetry.count('heap_full');
        continue;
      }
      const step = accrueUnits(building.yieldCarry, matures.perDay * power);
      building.yieldCarry = step.carry;
      const made = Math.min(step.units, building.storageFree);
      if (made > 0) {
        building.store.add(matures.item, made);
        telemetry.count('compost_matured', made);
      }
    }
  }

  private workTraps(): void {
    // Best grasp of each trap technology, per band. Computed once rather than
    // per trap: `techPower` is cheap but this is a daily sweep over every
    // building, and a band of ten with four traps would otherwise walk the
    // membership four times.
    const grasp = new Map<string, number>();
    for (const person of this.people) {
      if (!person.alive) continue;
      for (const def of Object.values(BUILDINGS)) {
        if (!isTrap(def) || def.requiresTech === null) continue;
        const key = person.bandId + ':' + def.id;
        const power = techPower(person, def.requiresTech as Tech);
        if (power > (grasp.get(key) ?? 0)) grasp.set(key, power);
      }
    }

    for (const building of this.buildings) {
      const yielded = building.def.yields;
      if (!yielded || !building.complete) continue;

      const power = grasp.get(building.ownerBandId + ':' + building.def.id) ?? 0;
      if (power <= 0) {
        // Nobody left who can work it. Forget the part-caught hare as well: a
        // band that relearns snares a generation later should start the catch
        // from nothing rather than collect twenty years of arithmetic.
        building.yieldCarry = 0;
        telemetry.count('trap_unworked_' + building.def.id);
        continue;
      }
      if (building.storageFree <= 0) {
        telemetry.count('trap_full_' + building.def.id);
        continue;
      }

      const accrued = accrueUnits(building.yieldCarry, yielded.perDay * power);
      building.yieldCarry = accrued.carry;
      if (accrued.units <= 0) continue;

      const caught = Math.min(accrued.units, building.storageFree);
      building.store.add(yielded.item, caught);
      telemetry.count('trap_caught_' + yielded.item, caught);
    }
  }

  /**
   * A day of grazing, in every pen somebody still knows how to keep — M11
   * phase 10. The same shape as `workTraps`, deliberately, with one real
   * difference: growth is proportional to what a pen already holds rather
   * than a flat rate, which is what makes this breeding rather than a slower
   * trap. A pen culled down to nothing grows nothing the next day either,
   * because `stock * rate` is zero at zero — over-culling a herd to
   * extinction is a real, permanent failure state here, the same honesty
   * `workTraps` already applies to a snare line whose setter died.
   */
  private workHerds(): void {
    const grasp = new Map<string, number>();
    // `dairying` and `wool` are read the same way, per band rather than per
    // building — a byproduct's tech names itself rather than a `pen`, so this
    // loop asks every technology any herd building declares a byproduct for,
    // not only `requiresTech`.
    const byproductGrasp = new Map<string, number>();
    for (const person of this.people) {
      if (!person.alive) continue;
      for (const def of Object.values(BUILDINGS)) {
        if (!isHerd(def)) continue;
        if (def.requiresTech !== null) {
          const key = person.bandId + ':' + def.id;
          const power = techPower(person, def.requiresTech as Tech);
          if (power > (grasp.get(key) ?? 0)) grasp.set(key, power);
        }
        for (const byproduct of def.herd?.byproducts ?? []) {
          const key = person.bandId + ':' + byproduct.tech;
          const power = techPower(person, byproduct.tech);
          if (power > (byproductGrasp.get(key) ?? 0)) byproductGrasp.set(key, power);
        }
      }
    }

    for (const building of this.buildings) {
      const herd = building.def.herd;
      if (!herd || !building.complete) continue;

      const power = grasp.get(building.ownerBandId + ':' + building.def.id) ?? 0;
      if (power <= 0) {
        // Nobody left who knows how to keep it. Unlike a trap's part-caught
        // hare, nothing here is lost by forgetting the carry — the herd
        // itself is still in the pen, and simply stops growing.
        telemetry.count('herd_unworked');
      } else if (building.storageFree <= 0) {
        telemetry.count('herd_at_capacity');
      } else {
        const stock = building.store.count(herd.item);
        const accrued = accrueUnits(building.yieldCarry, stock * herd.growthPerDay * power);
        building.yieldCarry = accrued.carry;
        if (accrued.units > 0) {
          const grown = Math.min(accrued.units, building.storageFree);
          building.store.add(herd.item, grown);
          telemetry.count('herd_bred', grown);
        }
      }

      // Byproducts read the *main* item's stock — milk comes from the herd
      // that is there, not from itself — and, unlike breeding, are not
      // gated on `herding` at all: a band that has forgotten how to keep a
      // pen but still knows how to milk one can go on doing so.
      const liveStock = building.store.count(herd.item);
      for (const byproduct of herd.byproducts ?? []) {
        const byproductPower = byproductGrasp.get(building.ownerBandId + ':' + byproduct.tech) ?? 0;
        if (byproductPower <= 0 || building.storageFree <= 0) continue;
        const carry = building.byproductCarry.get(byproduct.item) ?? 0;
        const accrued = accrueUnits(carry, liveStock * byproduct.perDay * byproductPower);
        building.byproductCarry.set(byproduct.item, accrued.carry);
        if (accrued.units <= 0) continue;
        const grown = Math.min(accrued.units, building.storageFree);
        building.store.add(byproduct.item, grown);
        telemetry.count(byproduct.item + '_bred', grown);
      }
    }
  }

  /**
   * What one trap catches a day as things stand, and why, for the HUD.
   *
   * The panel could compute this itself, but then the number the player reads
   * and the number the simulation applies would be two implementations of one
   * rule, and the first divergence would be invisible — the trap would simply
   * fill more slowly than the panel promised.
   */
  trapYield(building: Building): { perDay: number; reason: string } | null {
    const yielded = building.def.yields;
    if (!yielded) return null;
    if (!building.complete) return { perDay: 0, reason: t('not finished yet') };

    let power = 0;
    for (const person of this.people) {
      if (!person.alive || person.bandId !== building.ownerBandId) continue;
      if (building.def.requiresTech === null) continue;
      power = Math.max(power, techPower(person, building.def.requiresTech as Tech));
    }
    if (power <= 0) {
      return { perDay: 0, reason: t('nobody here remembers how to work it') };
    }
    if (building.storageFree <= 0) {
      return { perDay: 0, reason: t('full, and catching nothing until it is emptied') };
    }
    return {
      perDay: yielded.perDay * power,
      reason: t('catching on its own, and nobody has to stand here'),
    };
  }

  /**
   * Takes a site out of the world.
   *
   * Anything already delivered to it is dropped where it stood rather than
   * vanishing: the band spent the walk fetching it, and a band that can lose
   * timber by changing its mind will lose a winter's work to a planner tweak.
   */
  private removeBuilding(building: Building): void {
    for (const [itemId, count] of building.delivered.entries()) {
      const taken = building.delivered.remove(itemId, count);
      if (taken <= 0) continue;
      const pile = new ItemPile(
        Math.round(building.centerX), Math.round(building.centerY), null, this.time.tick
      );
      pile.contents.add(itemId, taken);
      this.piles.push(pile);
      this.pilesById.set(pile.id, pile);
    }
    this.pileHash.rebuild(this.piles);

    this.buildingsById.delete(building.id);
    this.buildings = this.buildings.filter(b => b.id !== building.id);
  }

  /** The building covering a point, if any. */
  buildingAt(x: number, y: number): Building | null {
    for (const building of this.buildings) {
      if (building.contains(x, y)) return building;
    }
    return null;
  }

  /**
   * Whether deep snow currently hides a point on the ground. `config.world.
   * snowBuries` is the one-line switch the M9.5 phase 2b plan asked for: off,
   * `snowDepth` still accumulates and the ground still looks wintry, but
   * nothing is ever hidden by it.
   */
  isBuried(x: number, y: number): boolean {
    return this.config.world.snowBuries && isBuried(x, y, this.snowDepth, this.treeHash);
  }

  /** Orders the player's character to walk to a tile. */
  orderPlayerTo(x: number, y: number): void {
    if (!this.player) return;
    this.order(this.player, 'goto', { x, y });
  }

  /**
   * Hands the player a body.
   *
   * The one path into a character, used by character creation, by the "play as"
   * verb and by the headless fallback alike — a second copy of this is how the
   * previous player ends up still flagged `isPlayer` and being steered by the
   * brain from inside the grave.
   */
  possess(person: Person): Person {
    if (this.player && this.player.id !== person.id) this.player.isPlayer = false;
    person.isPlayer = true;
    this.player = person;
    return person;
  }

  /** The fallback when nobody has chosen: whoever is first in the list. */
  possessFirst(): Person | null {
    const living = this.livingPeople();
    if (living.length === 0) return null;
    return this.possess(living[0]!);
  }

  // -------------------------------------------------------------------------
  // The step
  // -------------------------------------------------------------------------

  step(): void {
    this.time.advance();
    this.rebuildHashes();

    // Regrowth is coarse-grained: once every 20 steps at 20x the rate costs a
    // twentieth as much and is indistinguishable at the timescales that matter.
    if (this.time.tick % 20 === 0) {
      const growth = this.time.growth;
      const regrowth = this.config.world.regrowthRate;
      for (const node of this.nodes) node.regrow(20, growth, regrowth);
    }

    // Work done side by side, and the talk that goes with it. On a cadence
    // rather than every tick for the reason the regrowth pass above is: the
    // answer changes over hours, and the spatial query is the expensive part.
    // After `rebuildHashes`, because it is one of its readers.
    if (this.time.tick % ALONGSIDE_EVERY === 0) {
      this.social.workingAlongside(this.people, this.peopleHash, this.time.tick);
    }

    // M11 phase 14a: who is on whose ground, seen by whom. After
    // `rebuildHashes` for the same reason as the pass above.
    if (this.time.tick % SIGHTING_EVERY === 0) this.lookForIntruders();

    this.wildlifeSystem.update(this.animals, {
      world: this.world,
      rng: this.wildlifeRng,
      tick: this.time.tick,
      peopleHash: this.peopleHash,
      peopleById: this.peopleById,
    });

    this.needsSystem.update(this.people, this.time, this.buildings);

    // Memories and relationships age once a day, not every tick. Decaying
    // sixty people's worth of both every step would be the most expensive
    // thing in the loop, and nothing in the design could tell the difference.
    if (this.time.tick % this.config.time.ticksPerDay === 0) {
      this.snowDepth = advanceSnowDepth(this.snowDepth, this.time.temperature);
      this.social.dailyUpkeep(this.people);
      this.shareTheHearth();
      // Renown decays far more slowly than an ordinary opinion's `deeds`
      // component (0.997 against 0.985): it is the family's memory of itself
      // and has to compose across generations, not fade with one person's
      // recollection. Kept here rather than folded into `dailyUpkeep`,
      // because `SocialSystem` knows people and feelings, not households.
      for (const household of this.households) household.renown *= RENOWN_DECAY_PER_DAY;
      // M12 phase 2a: a debt to the dead, or one nobody has come for in a
      // year, is not owed any more.
      for (const person of this.people) {
        if (person.alive) pruneDebts(person, this.time.tick, this.config.time.ticksPerDay,
          id => this.peopleById.get(id)?.alive ?? false);
      }
      this.keepDockets();
      // A grudge or an alliance between two peoples outlives the individuals
      // who were there when it started, so it decays slower still than
      // renown — see `BandRelations`'s own header.
      this.bandRelations.decay();
      this.settleCaptives();
      for (const person of this.people) {
        if (person.alive) {
          decayMood(person);
          decayMacroBalance(person);
          decayMacroTarget(person);
        }
      }
      const forest = this.forestSystem.daily(this.trees, {
        world: this.world,
        rng: this.forestRng,
        season: this.time.season,
        // The day's growth, not midnight's — the daily block runs at midnight
        // and `dailyGrowth`'s header explains what that was doing to the wood.
        growth: this.time.dailyGrowth,
        treeHash: this.treeHash,
      });
      if (forest.died.length > 0 || forest.born.length > 0) {
        for (const dead of forest.died) this.treesById.delete(dead.id);
        for (const sapling of forest.born) {
          this.trees.push(sapling);
          this.treesById.set(sapling.id, sapling);
        }
        this.trees = this.trees.filter(t => t.standing);
        this.treeHash.rebuild(this.trees);
      }

      this.bandSystem.daily(this.bands, this.people, {
        relationships: this.relationships,
        rng: this.forestRng,
        day: this.time.day,
        tick: this.time.tick,
        buildings: this.buildings,
        place: (defId, x, y, bandId) => this.place(defId, x, y, bandId),
        onExile: (person, band, factionSize) => this.exile(person, band, factionSize),
        onAdopt: (person, band) => this.adopt(person, band),
        peopleHash: this.peopleHash,
        bandRelations: this.bandRelations,
        sameRegion: (ax, ay, bx, by) => this.world.sameRegion(ax, ay, bx, by),
        territoryOwnerAt: (x, y) => this.territoryOwnerAt(x, y),
        abandonSite: site => this.removeBuilding(site),
        command: (leader, subordinate, action, target) =>
          this.command(leader, subordinate, action, target),
        assignJob: (leader, subordinate, job) => this.assignJob(leader, subordinate, job),
        leaveBand: person => this.removeBandMembership(person),
        onInsight: (person, text, kind) => this.noteInsight(person, text, kind),
        householdsById: this.householdsById,
        sightings: this.sightings,
        bandMaps: this.bandMaps,
        nodeHash: this.nodeHash,
      });

      this.knowledgeSystem.daily(this.people, {
        rng: this.knowledgeRng,
        tick: this.time.tick,
        peopleHash: this.peopleHash,
        // Both new to M6b phase 2, and both were confirmed absent before it.
        // `World.biomeAt` has existed since M0 and nothing in `Brain` or
        // `ActionSystem` had ever called it — the only biome the player could
        // read was the one under a *selected* node, never the one under the
        // person doing the noticing.
        world: this.world,
        season: this.time.season,
        ticksPerDay: this.config.time.ticksPerDay,
        knowledge: this.config.knowledge,
        learning: this.config.learning,
        onInsight: (person, text, kind) => this.noteInsight(person, text, kind),
      });
      this.refreshRecords();
      this.spoilFood();
      // How much injury there is in this world, in person-days. Counted here
      // rather than derived from the health column because that column is an
      // *average* and one badly hurt person in a band of twenty barely moves
      // it — so a run in which nobody was ever hurt and a run in which somebody
      // nearly died look the same from outside. `the-hurt-are-tended` needs to
      // be able to skip honestly when there was nothing to tend.
      for (const person of this.people) {
        if (person.alive && person.health < 80) telemetry.count('hurt_person_days');
      }
      this.refreshEra();

      this.workTraps();
      this.growCrops();
      this.workHeaps();
      this.workHerds();
      // See `sabotageCandidatesByBand`'s own comment for why this is cached
      // at all and why once a day is the right cadence for it.
      this.sabotageCache = this.sabotageCandidatesByBand();
      this.findBodies();
      // M11 phase 16b: bones long enough on the ground are scattered, and the
      // body leaves the world. See `GONE_AFTER`.
      const gone = this.corpses.filter(c =>
        this.time.tick - c.diedTick > GONE_AFTER * this.config.time.ticksPerDay);
      for (const corpse of gone) this.removeCorpse(corpse);

      this.lifeSystem.daily(this.people, {
        rng: this.lifeRng,
        population: this.config.population,
        tick: this.time.tick,
        day: this.time.day,
        peopleById: this.peopleById,
        householdsById: this.householdsById,
        onBirth: (child, mother, father) => this.registerBirth(child, mother, father),
        onDeath: (person, cause) => person.die(cause),
      });
    }

    const brainCtx = {
      world: this.world,
      time: this.time,
      rng: this.aiRng,
      choiceRng: this.choiceRng,
      choiceSpread: this.config.ai.choiceSpread,
      nodeHash: this.nodeHash,
      peopleHash: this.peopleHash,
      shoreHash: this.shoreHash,
      corpseHash: this.corpseHash,
      relationships: this.relationships,
      buildings: this.buildings,
      treeHash: this.treeHash,
      animalHash: this.animalHash,
      inscriptionHash: this.inscriptionHash,
      recorded: this.recordsInHand,
      sightRadius: this.config.sightRadius,
      needs: this.config.needs,
      chiefByBand: this.bandSystem.chiefByBand,
      snowDepth: this.snowDepth,
      // The one number the scorer needs about the ground, from the one
      // implementation that computes it. A `spread` aimed at a plot the panel
      // calls healthy would be the simulation and the interface disagreeing in
      // front of the player.
      soilWear: (field: Building) => {
        const soil = this.soilReport(field);
        return soil.effective / Math.max(0.001, soil.resting);
      },
      snowBuries: this.config.world.snowBuries,
      householdsById: this.householdsById,
      bandRelations: this.bandRelations,
      sabotageCandidatesByBand: this.sabotageCache,
      homes: this.bandHomes(),
    };
    const actionCtx = {
      world: this.world,
      movement: this.movementSystem,
      nodesById: this.nodesById,
      buildingsById: this.buildingsById,
      treesById: this.treesById,
      animalsById: this.animalsById,
      onAnimalKilled: (animal: Animal) => this.removeAnimal(animal),
      knowledge: this.knowledgeSystem,
      relationships: this.relationships,
      onTreeFelled: (tree: Tree) => this.removeTree(tree),
      peopleById: this.peopleById,
      peopleHash: this.peopleHash,
      bandRelations: this.bandRelations,
      social: this.social,
      rng: this.actionRng,
      tick: this.time.tick,
      sightRadius: this.config.sightRadius,
      isNight: this.time.isNight,
      day: this.time.day,
      seasonGrowth: this.time.growth,
      needs: this.config.needs,
      dropAt: (x: number, y: number, itemId: string, count: number) =>
        this.dropAt(x, y, itemId, count),
      pilesById: this.pilesById,
      // The same method the inventory panel and the radial menu call, rather
      // than a second transfer written out inside `doPickup`: how much fits,
      // what the telemetry says, and when an emptied heap leaves the world are
      // one definition here, and were about to become two.
      takeFromPile: (person: Person, pile: ItemPile, itemId?: string, count?: number) =>
        this.takeFromPile(person, pile, itemId, count),
      recorded: this.recordsInHand,
      inscriptionsById: this.inscriptionsById,
      inscriptionAt: (x: number, y: number) => this.inscriptionAt(x, y),
      unfinishedAt: (x: number, y: number) =>
        this.inscriptionAt(x, y, 1.6, record => record.unfinished),
      claimRecord: (tech: string) => this.recordsInHand.add(tech),
      inLibrary: (x: number, y: number) => this.inLibrary(x, y),
      territoryOwnerAt: (x: number, y: number) => this.territoryOwnerAt(x, y),
      onTerritoryUse: (person: Person, ownerBandId: number) => {
        if (person.territoryUseNoted === ownerBandId ||
          this.hasTerritoryPermission(person, ownerBandId)) return;
        this.social.emit('trespass', person, null, 0.5, this.time.tick,
          this.peopleHash, this.config.sightRadius, true, ownerBandId);
        person.territoryUseNoted = ownerBandId;
        telemetry.count('territory_trespass');
      },
      requestTerritoryPermission: (person: Person, owner: Person) =>
        this.requestTerritoryPermission(person, owner),
      inscribe: (form: InscriptionForm, x: number, y: number, author: Person) =>
        this.placeInscription(form, x, y, author),
      onStopped: (person: Person, action: string, reason: string) =>
        this.noteStop(person, action, reason),
      chiefByBand: this.bandSystem.chiefByBand,
      onComplaint: (teller: Person, chief: Person, told: Case) => this.hearComplaint(teller, chief, told),
      onParley: (chief: Person, envoy: Person, told: Case) => this.putToEnvoy(chief, envoy, told),
      onWatched: (person: Person, use: PropertyUse) => this.noteWatched(person, use),
      onBound: (person: Person, binder: Person) => this.takeCaptive(person, binder),
      corpsesById: this.corpsesById,
      onCorpseMoved: () => this.corpseHash.rebuild(this.corpses),
      removeCorpse: (corpse: Corpse) => this.removeCorpse(corpse),
      nearestShore: (x: number, y: number) => this.shoreHash.findNearest(x, y, 60,
        tile => this.world.sameRegion(x, y, tile.x, tile.y)),
      onEscape: (person: Person) => this.escape(person),
      homeOf: (bandId: number) => {
        const band = this.bands.find(b => b.id === bandId);
        return band && !band.outcast ? { x: band.homeX, y: band.homeY } : undefined;
      },
      onCalledForHelp: (person: Person) => {
        this.helpCalls.push({ callerId: person.id, x: person.x, y: person.y });
        if (this.helpCalls.length > this.interruptionCap) this.helpCalls.shift();
      },
      onInsight: (person: Person, text: string, kind: 'idea' | 'gain' | 'setback') =>
        this.noteInsight(person, text, kind),
    };

    const interval = this.config.thinkInterval;
    for (const person of this.people) {
      if (!person.alive) continue;

      // Staggered thinking: each person re-plans on their own phase of the
      // cycle. Two exclusions matter:
      //
      //  - The player's action comes from input; a brain that overwrote it
      //    every few ticks would fight the user.
      //  - Anyone mid-job (actionTimer > 0) is left alone. Re-planning calls
      //    setup(), which clears the target and with it the work timer, so
      //    without this guard no harvest longer than the think interval could
      //    ever finish — people walked to a bush, started picking, and reset
      //    themselves forever.
      // M11 phase 15b: somebody being held down neither thinks nor acts —
      // not even the player, whose keys this skips too. The holder renews
      // the hold every tick they keep it up, so it lapses by itself.
      if (isHeld(person, this.time.tick)) continue;

      // The player's held keys override whatever they were doing.
      if (person.isPlayer && this.playerIntent) {
        person.action = 'walk';
        person.clearTarget();
        this.movementSystem.nudge(person, this.playerIntent.dx, this.playerIntent.dy);
        continue;
      }

      // Anything set aside for a drink is picked back up once they are
      // comfortable again, before the brain gets a chance to plan something else.
      this.resumeOrders(person);

      // A player order holds until the action system completes or abandons it.
      const committed = person.actionTimer > 0 || person.order !== null;
      const needsThink =
        !committed &&
        ((this.time.tick + person.thinkOffset) % interval === 0 || person.action === 'idle');
      if (needsThink) {
        if (person.isPlayer) this.steerPlayer(person, brainCtx);
        else this.brain.think(person, brainCtx);
      } else if (person.isPlayer && (this.time.tick + person.thinkOffset) % interval === 0) {
        // Scored even while under orders, so the HUD can always show what their
        // character feels like doing. Never *steered* here whatever `autonomy`
        // says: an order the player gave outranks every state of it, and this
        // branch is the one that runs while an order is live.
        this.brain.score(person, brainCtx);
      }

      this.actionSystem.execute(person, actionCtx);
    }

    this.cleanupDead();
  }

  /**
   * What the player's character does when the player is not saying.
   *
   * **The original decision, which still holds for `manual`.** From M6a: the
   * player's character is scored but never steered. The HUD shows what they
   * feel like doing and the human decides whether to listen, because this game
   * is one person's life rather than a colony to be supervised, and a brain
   * that acted on its own score would be quietly playing the game for you.
   *
   * **Why that is no longer the only state.** The owner's note 4 in
   * `m9_plan_words_and_hands.md`: the character does not drink, eat or sleep on
   * its own. Needs climb whether or not anybody is steering, so the cost of the
   * rule above was that reading the tech web for two minutes could kill you —
   * and a death nobody chose is not the same thing as a death you walked into.
   * `autonomy` names which of the three answers is in force; the middle one
   * exists because both ends of the range are wrong for most of the game.
   *
   * Two invariants hold in every state, and both are enforced by where this is
   * called from rather than by anything in it:
   *
   *  - **An order always wins.** This runs only when `committed` is false, so a
   *    live order is never interrupted, and `order()` overwrites whatever was
   *    chosen here the moment the player asks for something.
   *  - **Held keys always win.** The `playerIntent` branch above returns before
   *    reaching this.
   */
  private steerPlayer(person: Person, ctx: BrainContext): void {
    if (this.autonomy === 'auto') {
      this.autonomyStall = null;
      this.brain.think(person, ctx);
      return;
    }

    if (this.autonomy === 'manual') {
      this.autonomyStall = null;
      this.brain.score(person, ctx);
      return;
    }

    const urgent = urgentNeeds(person, this.config.needs);
    if (urgent.length === 0) {
      this.autonomyStall = null;
      this.brain.score(person, ctx);
      return;
    }

    // Scoring happens inside `think` either way, so the HUD's table is filled
    // on this path as well as the other two.
    const chosen = this.brain.think(person, ctx, survivalActions(urgent));
    // Nothing that answers the need scored: there is no water in sight, or
    // nothing to eat. The mode is on, the need is dangerous, and the character
    // is standing still — which is precisely the kind of silent refusal the
    // standing rule in `AGENTS.md` exists to stop. The person is left exactly
    // as `think` found them; only the explanation is new, and it names the
    // worst of the needs rather than all of them because a floater is one line.
    this.autonomyStall = chosen === null ? stallReason(urgent[0]!) : null;
  }

  private rebuildHashes(): void {
    this.peopleHash.clear();
    for (const person of this.people) {
      if (person.alive) this.peopleHash.insert(person);
    }
    this.nodeHash.rebuild(this.nodes);

    // Animals move every step, so their index is rebuilt every step — unlike
    // trees and piles, which only change when something happens to them.
    this.animalHash.clear();
    for (const animal of this.animals) {
      if (animal.alive) this.animalHash.insert(animal);
    }
  }

  /**
   * Bodies leave the live arrays, but their ids stay valid in the relationship
   * and memory graphs that arrive in M1 — the dead must remain nameable,
   * because grudges outlive people.
   */
  private cleanupDead(): void {
    let anyDead = false;
    let anyBody = false;
    for (const person of this.people) {
      if (person.alive) continue;
      anyDead = true;
      if (!person.affairsSettled) {
        this.settleAffairs(person);
        // M11 phase 16a: every death leaves a body where it happened — the
        // old man in his hut as much as the man in the clearing.
        const wounded = (person.causeOfDeath ?? '').startsWith('killed') ||
          this.time.tick - person.lastHarmedTick < WOUNDS_SHOW_FOR;
        const corpse = new Corpse(person, this.time.tick, wounded);
        this.corpses.push(corpse);
        this.corpsesById.set(corpse.id, corpse);
        anyBody = true;
        telemetry.count('corpse_left');
      }
    }
    if (anyBody) this.corpseHash.rebuild(this.corpses);
    // The player's body stays in the array so the UI can show what happened
    // until the succession is taken up.
    if (anyDead) this.people = this.people.filter(p => p.alive || p.isPlayer);
  }

  /**
   * Continues the dynasty as the nominated heir.
   *
   * Called by the UI once the player has seen who they are becoming. Returns
   * the person they now inhabit, or null if the line has ended.
   */
  takeUpSuccession(): Person | null {
    const pending = this.succession;
    this.succession = null;
    if (!pending) return null;

    pending.died.isPlayer = false;
    this.people = this.people.filter(p => p.alive);

    const heir = pending.heir && pending.heir.alive ? pending.heir : this.fallbackHeir(pending.died);
    if (!heir) {
      this.player = null;
      return null;
    }
    heir.isPlayer = true;
    this.player = heir;
    telemetry.count('succession_taken');
    return heir;
  }

  /** No children and no spouse: the nearest survivor of the same band. */
  private fallbackHeir(died: Person): Person | null {
    const candidates = this.livingPeople().filter(p => p.bandId === died.bandId);
    if (candidates.length === 0) return this.livingPeople()[0] ?? null;
    return candidates.sort((a, b) => a.distanceTo(died) - b.distanceTo(died))[0]!;
  }

  // -------------------------------------------------------------------------
  // Read-only views
  // -------------------------------------------------------------------------

  livingPeople(): Person[] {
    return this.people.filter(p => p.alive);
  }

  stats() {
    const living = this.livingPeople();
    const mean = (values: number[]) =>
      values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
    return {
      tick: this.time.tick,
      day: this.time.day,
      season: this.time.season,
      population: living.length,
      avgHunger: mean(living.map(p => p.needs.hunger)),
      avgThirst: mean(living.map(p => p.needs.thirst)),
      avgFatigue: mean(living.map(p => p.needs.fatigue)),
      avgCold: mean(living.map(p => p.needs.cold)),
      avgCompany: mean(living.map(p => p.needs.company)),
      avgHealth: mean(living.map(p => p.health)),
      resources: this.nodes.reduce((sum, n) => sum + n.amount, 0),
      // Data-driven rather than `n.kind === 'berries'`: two copies of "what
      // counts as food" is exactly the drift the house style rule exists to
      // prevent, and fish are food too. See `isFoodKind` and
      // m8_plan_the_ages.md, mechanism 2.
      foodInWorld: this.nodes.reduce(
        (sum, n) => sum + (isFoodKind(n) ? n.amount : 0), 0
      ),
      depletedNodes: this.nodes.filter(n => n.depleted).length,
      households: this.households.filter(h => !h.extinct).length,
      chiefs: this.bandSystem.chiefByBand.size,
      era: this.era.label,
      techKnown: this.knownTech.size,
      fireKeepers: this.techHolders.get('firemaking') ?? 0,
      outcasts: this.livingPeople().filter(p => {
        const band = this.bands.find(b => b.id === p.bandId);
        return band?.outcast === true;
      }).length,
      married: living.filter(p => p.spouseId !== null).length,
      children: living.filter(p => p.isChild).length,
      elders: living.filter(p => p.isElder).length,
      avgAge: mean(living.map(p => p.years)),
      animals: this.animals.length,
      trees: this.trees.length,
      matureTrees: this.trees.filter(t => t.isMature).length,
      seedlings: this.trees.filter(t => t.isSeedling).length,
      // Edible fruit only, and that qualifier is M8.1's. The oak bears acorns
      // now, and an acorn is `nutrition: 0` until somebody grinds it — counting
      // them here would have quadrupled this column overnight in every world in
      // the game, including every world that cannot grind, and `AGENTS.md`
      // tells the next reader to watch this column against `cold` and `store`
      // to find the winter die-offs. A number that stops meaning what its
      // reader thinks it means is worse than no number.
      fruitOnTrees: Math.round(this.trees.reduce(
        (sum, t) => sum + ((ITEMS[t.def.fruitItem ?? '']?.nutrition ?? 0) > 0 ? t.fruit : 0), 0)),
      // M9.6 phase 1c's two instruments. Every kind of fruit counts in both,
      // acorns included: unlike the column above, these are not about how much
      // food is standing about but about whether the calendar is being obeyed,
      // and an oak in February is exactly as wrong as an apple tree.
      fruitOutOfSeason: Math.round(this.trees.reduce(
        (sum, t) => sum + (t.def.fruitSeasons.includes(this.time.season) ? 0 : t.fruit), 0)),
      windfall: Math.round(this.trees.reduce((sum, t) => sum + t.windfall, 0)),
      buildings: this.buildings.length,
      buildingsComplete: this.buildings.filter(b => b.complete).length,
      stored: this.buildings.reduce((sum, b) => sum + b.store.total, 0),
    };
  }

  actionCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const person of this.livingPeople()) {
      counts[person.action] = (counts[person.action] ?? 0) + 1;
    }
    return counts;
  }
}

export { telemetry };
