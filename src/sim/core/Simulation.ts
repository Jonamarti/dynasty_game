import { boatTileFor, canUseBoat, canUseLogboat, canUseRaft, sameBoatRouteFor } from './Raft.ts';
import { transferTransportAnimal } from './TransportAnimals.ts';
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
import { trustEachOther } from '../social/Factions.ts';
import { advanceGrass, grassBuried, CUT_ABOVE } from './Grass.ts';
import { canDigBankMud, DIG_TO, PILE_TO, digTool, digToolFailure, earthworkWorkRefusal } from './Earth.ts';
import { animalBlow } from '../entities/AnimalAttack.ts';
import { RNG } from './RNG.ts';
import { World } from './World.ts';
import { TimeManager } from './TimeManager.ts';
import { advanceSnowDepth, isBuried } from './Snow.ts';
import { SPENT_BELOW, isGroundSpent } from './Soil.ts';
import { SpatialHash } from './SpatialHash.ts';
import { telemetry } from './Telemetry.ts';
import { BODY_PARTS, partWord, poisonDaily, wound, woundsDaily } from '../entities/Body.ts';
import { makeConfig, type SimConfig, type DeepPartial } from './Config.ts';
import { ADULT_YEARS, Person } from '../entities/Person.ts';
import { IdSpace, type IdSpaceSnapshot } from './IdSpace.ts';
import { ITEMS, Inventory } from '../entities/Item.ts';
import { equipContainer, itemCapacityFor, reconcileCarry } from './Carry.ts';
import {
  manualEquipReasonText, manualEquipRefusal, manualEquipSlot,
  manualGarmentReasonText, manualGarmentRefusal,
} from './ToolEquipment.ts';
import {
  BUSH_SPECIES, BUSHES, WILD_PLANTS, RESOURCE_KINDS, ORE_COUNTS, bushPhase, ResourceNode, isFoodKind, isPlantFood, seasonLoreKind,
  type BushSpecies, type ResourceKind,
} from '../entities/ResourceNode.ts';
import { canWork } from '../knowledge/Ore.ts';
import { NeedsSystem } from '../systems/NeedsSystem.ts';
import { MovementSystem } from '../systems/MovementSystem.ts';
import { Pathfinder } from './Pathfinder.ts';
import { ActionSystem } from '../systems/ActionSystem.ts';
import { thinkIntervalOf, wakesNow } from '../ai/ThinkCadence.ts';
import { Brain, type BrainContext } from '../ai/Brain.ts';
import { carerOf, childRadius } from '../ai/Anchor.ts';
import { drivePressures, DRIVES } from '../ai/Drives.ts';
import { carriesEdibleFood, commitmentGoal, shouldBreakCommitment } from '../ai/Commitment.ts';
import { babyToCarry, infantNeedingNursing, infantOutsideHome, mayNurse, nurslingHungerFactor } from '../ai/Nursing.ts';
import { starvingInCare } from '../ai/Feeding.ts';
import { canCrawl, canWalk, isBabyInArms, isLactating, isNursling } from '../entities/LifeStage.ts';
import { fightsBack, handfulsOnly, midwifeQuality, tooHeavyForHer, type MiscarriageCause } from '../entities/Pregnancy.ts';
import {
  stallReason, survivalActions, urgentNeeds, type Autonomy,
} from '../ai/Autonomy.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { BandRelations } from '../social/BandRelations.ts';
import { WorldKnowledge } from '../social/WorldKnowledge.ts';
import { SocialSystem } from '../social/SocialSystem.ts';
import { DEFAULT_NORMS, VARIABLE_NORMS, DEED_WEIGHT, type Norms, type EventType } from '../social/Events.ts';
import { STRANGER_REGARD_MEAN, STRANGER_REGARD_SPREAD } from '../social/Restraint.ts';
import { pruneDebts, debtTo, offerFor, OFFER_AT_LEAST, DEBT_DAYS } from '../social/Amends.ts';
import {
  judgeOwn, answerDemand, DISMISSED_GRUDGE, SHAME_RENOWN, REFUSED_STANDING, type Case, judgesByLaw, verdictGrudge,
} from '../social/Justice.ts';
import {
  Building, BUILDINGS, isTrap, isHerd, isStructure, type BuildingDef,
} from '../entities/Building.ts';
import { earthworkTiles, slopeAcross } from '../entities/Earthwork.ts';
import { accrueUnits } from './Progress.ts';
import { decayMood } from './Mood.ts';
import { appealOf, bestFoodFor, consumeFood, decayMacroBalance, decayMacroTarget, hydrationOf } from './Macros.ts';
import { assailantOf, isHeld } from '../social/Defence.ts';
import { wouldInvestigate, noticeBloodied, INVESTIGATION_DAYS } from '../social/Investigation.ts';
import { knowledgeOfPerson, corpseIdentity } from '../social/Knowledge.ts';
import { averageRenownByBand, Household } from '../entities/Household.ts';
import { Tree, type TreeSpecies } from '../entities/Tree.ts';
import { plantable, plantingRefusal, plantRefusalText } from '../entities/Orchard.ts';
import { findDraftPen, hasBusyDraftPen, claimDraftTeam, availableDraftHeads, reservedDraftHeads, hasSeedContainer } from '../systems/Draft.ts';
import { SOW_SEED } from '../entities/Field.ts';
import { giftWorth } from '../social/Events.ts';
import { ItemPile } from '../entities/ItemPile.ts';
import { Corpse, stageOf, WOUNDS_SHOW_FOR, GONE_AFTER } from '../entities/Corpse.ts';
import {
  Animal, PREY_SPECIES, SPECIES_DEFS, TRANSPORT_SPECIES, type Species,
} from '../entities/Animal.ts';
import { WildlifeSystem, DOG_HEARING, DOG_SIGHT } from '../systems/WildlifeSystem.ts';
import { ForestSystem, seedInitialForest } from '../systems/ForestSystem.ts';
import {
  LifeSystem, findHeir, roofOverSleeper, settleEstate,
} from '../systems/LifeSystem.ts';
import { linkFamily } from '../social/SocialSystem.ts';
import { BandSystem, TERRITORY_RADIUS } from '../systems/BandSystem.ts';
import { foundBand, type FoundingContext } from '../systems/Founding.ts';
import { KnowledgeSystem, countHolders } from '../systems/KnowledgeSystem.ts';
import { ORDER_REFUSED, type Notice } from '../knowledge/Synthesis.ts';
import {
  eraFor, techPower, ERA_ORDER, ERAS, TECHS, type EraDef, type Tech,
} from '../knowledge/Tech.ts';
import { RECIPES, recipeTechPower, type RecipeDef } from '../entities/Recipe.ts';
import { standingOver, type AuthorityContext } from '../social/Authority.ts';
import { mayUse, type PropertyUse } from '../social/Property.ts';
import {
  bandHasShape, bandOf, rankIn, type BandRank, type RankContext,
} from '../social/Rank.ts';
import { JOBS, type JobId } from '../entities/Job.ts';
import {
  Inscription, INSCRIPTIONS, type InscriptionForm,
} from '../entities/Inscription.ts';
import { NAME_ONSETS, NAME_CODAS } from '../../data/names.ts';
import { t, aNoun, theNoun, language } from '../../i18n/i18n.ts';
import { handsEmptyForSwimming, swimRefusal, swimRouteRefusal, swimRefusalText } from './Swimming.ts';
import { claimTransportAnimal, refreshTransportLease, transportOf, releaseTransportAnimal } from './TransportAnimals.ts';
import { sightIntruders, SIGHTING_EVERY, type Sightings, type Territory } from '../social/Fear.ts';
import { MAP_CELL } from '../social/BandMaps.ts';
import { feastVenue, isLarder } from '../social/Feast.ts';
import {
  SERF_REVOLT_QUORUM, serfRefuses,
  PEACE_BROKEN_REGARD, PEACE_BROKEN_STANDING, TAX_RATES, acceptsPeace, civilisationLacks, governs, keepsAccounts,
  templeOf,
} from '../social/Polity.ts';
import { CAPTIVE_ADOPTION_DAYS, CAPTIVE_DAILY_MOOD_LOSS, isCaptive } from '../social/Captivity.ts';
import { fromCheckpointRecord as hydrateCheckpointRecord, toCheckpointRecord, type CheckpointState } from '../persistence/CheckpointRecords.ts';
import type { ExecutionStreamPath } from '../persistence/ExecutionRecords.ts';
import { ParkedSimulation, assertExecutionOwner, parkExecutionOwner, registerExecutionOwner,
  resumeParkedSimulation, SimulationAuthorityError, transferSimulationAuthority } from '../runtime/authority.ts';
import { createLocalGeography, type LocalGeographySource } from '../world/LocalGeography.ts';
import type { WorldGeography } from '../world/WorldGeography.ts';
import { geographicResourceAvailable } from '../world/GeographicResources.ts';
import { stepMark } from './StepProbe.ts';
import { approachComarcaEdge, type ComarcaTravel } from '../world/ComarcaTravel.ts';
import { applyHouseWalls, houseInteriorContains, houseInteriorTiles } from '../world/HouseInterior.ts';
import { lightAt as measuredLightAt, lightFactor, torchLight, hearthNear } from './Light.ts';
import { saltSourceNear } from './Preservation.ts';
import { advanceTorchBurn, torchIgnitionRefusal, torchRefusalText, transferableUnits, burningTorchRefusalText } from './Torch.ts';
import { edgeOfTile, type ComarcaEdge } from '../world/ComarcaNeighbour.ts';
import type { ComarcaMigrationContext } from '../world/ComarcaMigration.ts';
import { comarcaResourceProfile, PROFILE_SPAN, type ComarcaResourceProfile } from '../world/ResourceProfile.ts';
import {
  berryHabitat, flintHabitat, grainHabitat, hillOreHabitat, goldHabitat, herdHabitat, predatorHabitat,
} from '../world/Habitat.ts';

const RESTORE_CONSTRUCTION = Symbol('Simulation restore construction');
interface RestoreConstruction {
  readonly token: typeof RESTORE_CONSTRUCTION;
  readonly state: CheckpointState;
}

/**
 * The resource profile of the comarca a map is, when it is exactly one (M15 step 1b): a one-by-one window whose origin is a
 * whole comarca of the world map. Anything else (the classic island, a four-comarca inspection window, a window that straddles
 * four comarcas) has no single comarca to read and keeps the fixed quotas.
 */
export function profileOfStart(start: GeographicStart): ComarcaResourceProfile | null {
  if (start.geography.kind === 'legacyIsland') return null;
  if ((start.comarcasWide ?? 1) !== PROFILE_SPAN || (start.comarcasHigh ?? 1) !== PROFILE_SPAN) return null;
  const cx = start.x - PROFILE_SPAN / 2, cy = start.y - PROFILE_SPAN / 2;
  if (!Number.isInteger(cx) || !Number.isInteger(cy)) return null;
  return comarcaResourceProfile(start.geography, cx, cy);
}

export function worldFrameOf(start: GeographicStart): WorldFrame {
  const wide = start.comarcasWide ?? 1;
  const high = start.comarcasHigh ?? 1;
  const map = start.geography.kind === 'legacyIsland' ? null : start.geography.map;
  return {
    originX: start.x - wide / 2, originY: start.y - high / 2,
    comarcasWide: wide, comarcasHigh: high,
    mapWidth: map?.width ?? 0, mapHeight: map?.height ?? 0,
  };
}

/** Optional macro-map placement for inspection worlds. Populated starts wait
 * for phase 30's freshwater semantics; this is intentionally not a game start. */
export interface GeographicStart {
  geography: WorldGeography;
  /** Global comarca coordinates; longitude wraps only after this is validated. */
  x: number;
  y: number;
  /** Local map span in comarcas. Defaults to one by one. */
  comarcasWide?: number;
  comarcasHigh?: number;
}

/**
 * Where this simulation's local map sits on the globe, in comarca units. Four
 * numbers and the size of the globe: just enough to say which comarca a tile is
 * in. The geography itself stays with `WorldState`, as it always has; this is
 * the one fact the motor needs to write `WorldKnowledge` (M15 phase 31). Null
 * in a classic world, which has no globe and therefore records nothing.
 */
export interface WorldFrame {
  originX: number;
  originY: number;
  comarcasWide: number;
  comarcasHigh: number;
  mapWidth: number;
  mapHeight: number;
}

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
  /** Set only when an autonomous route was released by the M15 need policy. */
  autonomousCommitment?: boolean;
}

/**
 * Stops worth coming back to.
 *
 * A need, not a fact about the world: "he went for a drink" is an interruption,
 * "the tree is gone" is the end of the matter. A baby's cry is the same kind
 * of break (owner, 2026-10-01): she feeds it and goes back to what she was
 * told to do.
 */
const RESUMABLE_STOPS = new Set(['thirsty', 'hungry', 'cold', 'baby_crying']);
const NO_HOME_ANCHORS = new Map<number, { x: number; y: number }>();

/**
 * Ticks between passes over who is working beside whom.
 *
 * Forty, so six of them fall in a working day. Often enough that an afternoon
 * spent on the same bush reads as an afternoon spent together, and rare enough
 * that the spatial query it costs does not show up beside the rest of the step.
 */
const ALONGSIDE_EVERY = 40;
/** How far from every founder a hunter may begin. */
const PREDATOR_START_DISTANCE = 30;

/** Edge traffic, M15 phase 23h: see `edgeTraffic`. */
const EDGE_REFILL = 0.1;
const EDGE_CROWDED = 1.25;
const EDGE_EXIT_CHANCE = 0.05;


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
 * How often a baby still crying breaks off its mother's work again, in ticks:
 * two hours of game time. Long enough that what she chose instead of the baby
 * (a drink, at thirst 80) gets finished; short enough that a baby left
 * crying is never ignored for long.
 */
const CRY_NAG_TICKS = 20;
/** Each wild plant (21d) is planted as this fraction of the island's berry bushes. */
const WILD_PLANT_SHARE = 0.12;

/** How far a bush looks for a neighbour to share a species with, in tiles. */
const FLORA_PATCH_RADIUS = 6;
/** How often a bush with a planted neighbour is the same shrub. */
const FLORA_PATCH_SHARE = 0.6;

/**
 * How an order from somebody else is put to the player — M11 phase 13f. Only
 * the verbs a chief or a household head actually hands out; anything else
 * falls back to its id.
 */
export const ORDER_WORDS: Record<string, string> = {
  nurse: 'nurse the baby',
  carry_baby: 'pick up the baby',
  romp: 'play with the other children',
  sabotage: 'wreck a rival building',
  take: 'take from a rival store',
  build: 'work on a building',
  haul: 'carry materials to a site',
};

/**
 * The outcast band's preferred legacy ID base, clear of founding bands in a
 * single simulation. It no longer classifies colour; `Band.outcast` does.
 * Named (M11 phase 12c) because the renderer has to tell outcasts apart to
 * give them their own neutral colour instead of the palette slot their ID
 * happens to land on.
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
  /**
   * The share of every household's store owed to the temple at each levy —
   * M15 phase 38b, `taxation`. Set by the government: an NPC chief from their
   * own greed (`Polity.npcTaxRate`), the player's chief by the player
   * (`Simulation.setTaxRate`). Read only while the chief knows taxation and the
   * band has a temple. Absent means none.
   */
  taxRate?: number;
}

export class Simulation {
  /** Only this world's factory may supply temporary people before roster insertion. */
  private readonly pendingFounders = new WeakSet<Person>();
  readonly ids: IdSpace;
  readonly config: SimConfig;
  /** Present only during deterministic generation; checkpoints bake terrain/nodes. */
  private geographicStart: GeographicStart | null;
  /**
   * What the resource profile (`world/ResourceProfile.ts`) promises for the comarca this map IS (M15 step 1b, 2026-10-08).
   * Set only during generation and only for a map that is exactly one comarca of a world map; null everywhere else (the
   * classic island, and the inspection windows of other sizes, which keep the fixed quotas they always had).
   */
  private comarcaProfile: ComarcaResourceProfile | null = null;
  /** See `WorldFrame`. Set by construction, or by `WorldState.fromRestored`. */
  worldFrame: WorldFrame | null = null;
  /** Bound by WorldState; checkpoints retain requests, not callbacks. */
  comarcaParent?: (id: number) => Person | null;
  comarcaTravel: ComarcaTravel | null = null;
  /** World-root callbacks; destinations are per-person known and dispatch is deferred until after step(). */
  worldRaidDestination?: (actor: Person, victimBandId: number) => { cx: number; cy: number } | null;
  queueWorldRaid?: (request: { leaderId: number; partyIds: number[]; victimBandId: number; destination: { cx: number; cy: number }; plunder: boolean }) => boolean;
  /** Dynamic policy supplied by WorldState; callbacks are reconstructed after restore. */
  comarcaMigration: (() => ComarcaMigrationContext | null) | null = null;
  private localGeography: LocalGeographySource | null;
  readonly rng!: RNG;
  readonly world!: World;
  readonly time!: TimeManager;

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
  /** Social events already folded into household feuds. */
  private readonly feudEvents = new Set<number>();
  /** Cases waiting for the player-chief to choose a local verdict. */
  readonly pendingVerdicts: Case[] = [];
  /**
   * Each band's temple store, by band id — M15 phase 38b. Recomputed daily
   * from the chief's own head (`Polity.templeOf`), so a temple lapses the day
   * its chief is replaced by somebody who never learned redistribution.
   */
  readonly templeByBand = new Map<number, number>();

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
  readonly buildingHash = new SpatialHash<Building>(8);
  /** The person the player currently inhabits. Null in headless runs. */
  player: Person | null = null;
  /**
   * Direction the player is holding this step, or null. Set by the input layer
   * and consumed inside `step()`, so player movement happens on the simulation
   * clock like everyone else's rather than on the frame clock.
   */
  playerIntent: { dx: number; dy: number } | null = null;
  /** Suppresses a refusal floater repeating every tick while a key is held. */
  private playerMovementRefusal: string | null = null;

  readonly peopleHash = new SpatialHash<Person>(8);
  readonly nodeHash = new SpatialHash<ResourceNode>(8);
  /** All-water bank index for swimming, concealment and other non-drinking uses. */
  readonly shoreHash = new SpatialHash<{ x: number; y: number }>(8);
  /** Fresh banks are the only natural water targets for thirst. */
  readonly freshShoreHash = new SpatialHash<{ x: number; y: number }>(8);
  /** Geographic salt banks are indexed separately so explicit player orders can find them. */
  readonly saltShoreHash = new SpatialHash<{ x: number; y: number }>(8);
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
  /** Reused vision-query buffers; each thinker sees the same kinds in sequence. */
  private readonly placeNodeCandidates: ResourceNode[] = [];
  private readonly placeTreeCandidates: Tree[] = [];
  private readonly placeShoreCandidates: { x: number; y: number }[] = [];
  private readonly placeAnimalCandidates: Animal[] = [];
  private readonly placePeopleCandidates: Person[] = [];
  private readonly placePileCandidates: ItemPile[] = [];
  private readonly placeBuildingCandidates: Building[] = [];

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
   * Whose band thinks at full pace when nobody is the player (M15 step 0, C).
   * The game always has a player, whose band is the focus
   * (`thinkFocusBand`); the headless harness never takes a body, and without
   * this its runs would never exercise the slower cadence of the other bands
   * that the game plays with. Null (the default) slows nobody.
   */
  headlessFocusBand: number | null = null;

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
  readonly social!: SocialSystem;
  private readonly normsByBand = new Map<number, Norms>();
  /** Each band's `strangerRegard`, for `SocialSystem` — the same arrangement as `normsByBand`. */
  private readonly strangerRegardByBand = new Map<number, number>();

  private readonly needsSystem!: NeedsSystem;
  /**
   * The one A* instance this world uses, for `MovementSystem`, the health
   * checks and later `Brain` alike — two definitions of "can they get there"
   * is one too many, and the checks should measure the same instance the
   * simulation actually walks people with.
   */
  readonly pathfinder!: Pathfinder;
  private readonly movementSystem!: MovementSystem;
  private readonly actionSystem = new ActionSystem();
  private readonly brain = new Brain();
  private readonly lifeSystem = new LifeSystem();
  private readonly forestSystem = new ForestSystem();
  readonly bandSystem = new BandSystem();
  private readonly knowledgeSystem = new KnowledgeSystem();
  private readonly wildlifeSystem = new WildlifeSystem();
  private readonly knowledgeRng!: RNG;
  private readonly wildlifeRng!: RNG;
  private readonly recordRng!: RNG;
  /** Recomputed daily from who is alive. An era can be lost as well as gained. */
  // The first rung itself, not a hand-written copy of it. The copy that used
  // to sit here was a second list nothing kept in step with `ERAS` — the same
  // defect `ERA_ORDER` was derived to fix — and it went stale the moment the
  // ladder was renamed to the real archaeological periods.
  era: EraDef = ERAS[0]!;
  /** Living holders per tech, for the UI and the health report. */
  readonly techHolders = new Map<Tech, number>();
  private readonly lifeRng!: RNG;
  private readonly forestRng!: RNG;

  /** Separate RNG streams so adding a draw in one system does not shift others. */
  private readonly aiRng!: RNG;
  private readonly actionRng!: RNG;
  private readonly commandRng!: RNG;
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
  private readonly choiceRng!: RNG;
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
  private readonly hearthRng!: RNG;
  /** M15 phase 21a, fork 19: which part of the body a blow lands on. */
  private readonly healthRng!: RNG;
  /** Hunters' placement, kills and bites — M15 phase 23e. */
  private readonly ecologyRng!: RNG;
  private readonly edgeRng!: RNG;
  /** Preferred edge-herd sequence; IdSpace resolves collisions on shared maps. */
  private nextEdgeHerd = 5000;
  /**
   * The fauna beyond the edge, M15 phase 23h: animals of each prey species that
   * could still come in. Spent as herds enter, refilled slowly and by the herds
   * that leave. Fractional, because the refill is.
   */
  readonly edgeReserve: Record<string, number> = {};
  /** How many of each species the land held when it began: what "thinner than it was" means. */
  readonly foundingFauna: Record<string, number> = {};

  constructor(overrides?: DeepPartial<SimConfig>, ids?: IdSpace);
  constructor(overrides: DeepPartial<SimConfig>, ids: IdSpace, geographicStart?: GeographicStart);
  constructor(overrides: DeepPartial<SimConfig> = {}, ids: IdSpace = new IdSpace(),
    geographicStart?: GeographicStart, restore?: RestoreConstruction) {
    registerExecutionOwner(this);
    // Field initializers above create only empty containers and stateless helpers.
    // A checkpoint must never pass through the seed/world/spawn path below: even
    // constructing then replacing those objects would consume IDs and RNG draws.
    if (restore?.token === RESTORE_CONSTRUCTION) {
      this.geographicStart = null;
      this.localGeography = null;
      this.ids = restore.state.ids;
      this.config = restore.state.config;
      this.initializeRestoredState(restore.state);
      return;
    }
    this.ids = ids;
    this.config = makeConfig(overrides);
    this.geographicStart = geographicStart ?? null;
    const localGeography = geographicStart ? this.makeLocalGeography(geographicStart) : undefined;
    this.localGeography = localGeography ?? null;
    if (geographicStart) this.worldFrame = worldFrameOf(geographicStart);
    this.comarcaProfile = geographicStart ? profileOfStart(geographicStart) : null;
    this.rng = new RNG(this.config.seed);

    // Fork order is part of the seed contract; do not reorder these.
    const worldRng = this.rng.fork();
    const spawnRng = this.rng.fork();
    this.aiRng = this.rng.fork();
    const moveRng = this.rng.fork();

    this.world = new World(this.config.world, worldRng, localGeography);
    this.time = new TimeManager(this.config.time);

    this.needsSystem = new NeedsSystem(this.config.needs, this.world);
    this.pathfinder = new Pathfinder(this.world);
    this.movementSystem = new MovementSystem(this.world, moveRng, this.pathfinder,
      this.config.motivation.infantsStill, this.config.carry.sledgeSpeed, this.config.childhood);
    this.social = new SocialSystem(
      this.relationships, this.normsByBand, this.bandRelations, this.strangerRegardByBand, this.ids);
    this.bindSocialCallbacks(this.social);
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

    this.shoreHash.rebuild(this.world.shoreTiles);
    this.freshShoreHash.rebuild(this.world.freshShore);
    this.saltShoreHash.rebuild(this.world.saltShore);

    // The wood is planted before anything else looks for it: a band founded in
    // a clearing and a band founded under oaks have very different prospects.
    this.trees = seedInitialForest(
      this.world, this.rng.fork(), this.config.world.treeDensity, this.time.daysPerYear, this.ids
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
    // M15 phase 20 (owner, 2026-10-01), appended after `cultureRng` for the
    // reason every stream below the named block gives: which species each
    // berry bush is. Drawn in its own pass after the bushes exist, so every
    // bush stands where it stood before and only its season is new.
    const floraRng = this.rng.fork();

    // M15 phase 21a, appended after `floraRng` (row 19 of `AGENTS.md`'s table):
    // which part of the body a blow lands on. Nothing draws from it until a
    // blow lands, so every world is exactly as it was.
    this.healthRng = this.rng.fork();
    // M15 phase 21d, appended after `healthRng` (row 20 of `AGENTS.md`'s
    // table): where the baneberries and the yarrow stand. A stream of its own
    // and a pass of its own after everything else, because adding them to the
    // `plan` of `spawnResources` would move every herd and person.
    const herbRng = this.rng.fork();
    // M15 phase 23e, appended after `herbRng` (row 21 of `AGENTS.md`'s table):
    // where the wolves, the bear and the lynx begin, and the dice of every kill
    // and every bite. A stream of its own and a pass of its own after
    // everything else, because adding hunters to `spawnHerds` would move every
    // herd and person in every world.
    this.ecologyRng = this.rng.fork();
    // M15 phase 23h, appended after `ecologyRng` (row 22 of `AGENTS.md`'s
    // table): the dice of the edge — which herd comes in, where, how big, and
    // which one leaves. Drawn from once a day and by nothing else.
    this.edgeRng = this.rng.fork();
    // M15 phase 37, appended after `edgeRng` (row 23 of `AGENTS.md`'s table):
    // where the ore lies on a classic island. A stream of its own and a pass of
    // its own after everything else, for the reason every stream below the
    // named block gives; on a world with a map each kind draws from its own
    // seed-derived stream instead (`geographicResourceRng`) and this one is
    // never touched.
    const oreRng = this.rng.fork();
    // M15 phase 40a, appended after oreRng (row 24): iron has a pass of its
    // own so adding wet-ground candidates cannot shift the M15-37 metals.
    const ironRng = this.rng.fork();

    if (geographicStart) this.spawnGeographicResources();
    else this.spawnResources(spawnRng);
    // A map that is one comarca draws its herds from a stream of its own: the number of herds now follows the profile, and on
    // the shared `spawnRng` that would move every person. The classic island and the fixed-quota windows keep the shared one.
    this.spawnHerds(this.comarcaProfile ? this.geographicResourceRng('herds') : spawnRng);
    this.spawnPeople(spawnRng);
    this.spawnFish(fishRng);
    this.spawnWildGrain(grainRng);
    this.spawnCulture(cultureRng);
    this.spawnFlora(floraRng);
    this.spawnWildPlants(herbRng);
    this.spawnPredators(this.ecologyRng);
    this.spawnOres(oreRng);
    this.spawnIronOre(ironRng);
    // A seed-derived pass after all existing spawns keeps both spawnRng and IDs of old fauna stable.
    this.spawnTransportAnimals(new RNG(`${this.config.seed}:transport-fauna`));
    // Geography is construction input, not live simulation state. The root may
    // retain the selected map; the motor keeps only its generated tile arrays.
    this.geographicStart = null;
    this.localGeography = null;
    this.comarcaProfile = null;
    this.rebuildHashes();
    for (const species of PREY_SPECIES) {
      this.foundingFauna[species] = this.animals.filter(a => a.species === species).length;
      this.edgeReserve[species] = this.config.world.edgeReserve;
    }
  }

  /** Validate geographic construction before any RNG fork, allocation or spawn. */
  private makeLocalGeography(start: GeographicStart): LocalGeographySource {
    const { geography } = start;
    const width = geography.kind === 'random' ? geography.map.width :
      geography.kind === 'earth' ? geography.map.width : NaN;
    const height = geography.kind === 'random' ? geography.map.height :
      geography.kind === 'earth' ? geography.map.height : NaN;
    if (!Number.isFinite(start.x) || !Number.isFinite(start.y) ||
        !Number.isFinite(width) || !Number.isFinite(height) ||
        start.x < 0 || start.x >= width || start.y < 0 || start.y >= height) {
      throw new RangeError('Geographic start must be finite and inside a random or Earth map');
    }
    const comarcasWide = start.comarcasWide ?? 1;
    const comarcasHigh = start.comarcasHigh ?? 1;
    if (!Number.isFinite(comarcasWide) || comarcasWide <= 0 ||
        !Number.isFinite(comarcasHigh) || comarcasHigh <= 0) {
      throw new RangeError('Geographic local extent must be positive and finite');
    }
    const originX = start.x - comarcasWide / 2;
    const originY = start.y - comarcasHigh / 2;
    if (originY < 0 || originY + comarcasHigh > height) {
      throw new RangeError('Geographic local extent crosses a map pole');
    }
    const source = createLocalGeography(geography, { originX, originY, comarcasWide, comarcasHigh }, {
      width: this.config.world.width,
      height: this.config.world.height,
      waterLevel: this.config.world.waterLevel,
      wadeDepth: this.config.world.wadeDepth,
      swimDepth: this.config.world.swimDepth,
      metresPerUnit: this.config.world.metresPerUnit,
    });
    return source;
  }

  /** Validate a detached JSON checkpoint, then bind its one state graph to a live owner. */
  static fromCheckpointRecord(input: unknown): Simulation {
    return Simulation.fromCheckpointRecordWithIds(input);
  }

  /** Resume a parked live world. A successful reconstruction consumes the handle. */
  static resumeTransfer(handle: ParkedSimulation): Simulation {
    return resumeParkedSimulation(handle, (record, ids) => Simulation.fromCheckpointRecordWithIds(record, ids));
  }

  static fromCheckpointRecordWithSharedIds(input: unknown, sharedIds: IdSpace): Simulation {
    return Simulation.fromCheckpointRecordWithIds(input, sharedIds);
  }

  private static fromCheckpointRecordWithIds(input: unknown, sharedIds?: IdSpace): Simulation {
    const state = hydrateCheckpointRecord(input);
    // Live transfers retain the world's allocator object. That matters when a
    // world-level owner has reserved IDs while this comarca was parked.
    if (sharedIds) {
      sharedIds.restore(state.ids.snapshot());
      (state as { ids: IdSpace }).ids = sharedIds;
    }
    // Keep the restoration-only constructor argument out of the public TypeScript
    // signature. The token is module-private and the regular constructor remains
    // the only way callers can request generated worlds.
    return Reflect.construct(Simulation, [{}, state.ids, undefined, { token: RESTORE_CONSTRUCTION, state }]) as Simulation;
  }

  /** Park this execution owner as an opaque, single-use in-memory checkpoint. */
  parkForTransfer(): ParkedSimulation {
    assertExecutionOwner(this);
    const checkpoint = toCheckpointRecord(this);
    return parkExecutionOwner(this, checkpoint, this.ids);
  }

  /**
   * Move an explicit, living party into another comarca owner at a boundary.
   * The caller has already staged geography and place-specific memories. Shared
   * identity allocation is mandatory so a later birth cannot reuse either side's IDs.
   */
  transferTravellersTo(destination: Simulation, travellerIds: readonly number[], entry: ComarcaEdge): Person[] {
    return this.transferPeopleTo(destination, travellerIds, entry, true);
  }

  /** Preserve canonical corpse ownership when a travelling person dies in transit. */
  transferDeadTravellersTo(destination: Simulation, travellerIds: readonly number[], entry: ComarcaEdge): Person[] {
    return this.transferPeopleTo(destination, travellerIds, entry, false);
  }

  private transferPeopleTo(destination: Simulation, travellerIds: readonly number[], entry: ComarcaEdge, living: boolean): Person[] {
    if (destination === this || destination.ids !== this.ids) throw new RangeError('Comarca transfer must share one world IdSpace');
    if (destination.time.tick !== this.time.tick) throw new RangeError('Comarca transfer clocks must meet at the boundary');
    if (!['n','e','s','w'].includes(entry)) throw new RangeError('Invalid destination edge');
    const ids = [...travellerIds];
    if (ids.length === 0 || new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1)) {
      throw new RangeError('A travel party needs unique canonical person IDs');
    }
    const travellers = ids.map(id => {
      const person = this.peopleById.get(id);
      if (!person || person.alive !== living || !this.people.includes(person)) throw new RangeError(`Traveller ${id} is not ${living ? 'alive' : 'dead'} and active in the source`);
      if (destination.peopleById.has(id)) throw new RangeError(`Traveller ${id} already belongs to the destination`);
      return person;
    }).sort((a,b) => a.id - b.id);
    if (travellers.some(person => destination.peopleById.has(person.id))) throw new RangeError('A traveller already belongs to the destination');
    if (destination.player && travellers.some(person => person.isPlayer)) throw new RangeError('Destination already has a player character');

    const travellerSet = new Set(travellers.map(person => person.id));
    for (const person of travellers) {
      const lease = transportOf(person, this.animalsById);
      if (lease && destination.animalsById.has(lease.animal.id)) {
        throw new RangeError(`Transport animal ${lease.animal.id} already belongs to the destination`);
      }
    }
    const householdMoves: { source: Household; destination: Household; members: Person[]; removeSource: boolean; merge: boolean }[] = [];
    const householdIds = new Set<number>();
    for (const person of travellers) if (person.householdId !== null) householdIds.add(person.householdId);
    for (const householdId of [...householdIds].sort((a,b) => a-b)) {
      const household = this.householdsById.get(householdId);
      if (!household) throw new RangeError(`Traveller household ${householdId} is not canonical`);
      const members = travellers.filter(person => person.householdId === householdId);
      const existing = destination.householdsById.get(householdId);
      const movedHousehold = existing ?? copyHouseholdForTravel(household, members.map(member => member.id));
      // Keep an empty origin record as the archive of this dynasty and its old
      // home. A returning family can merge into it instead of forgetting where
      // it lived when the first crossing removed the whole roster.
      householdMoves.push({ source: household, destination: movedHousehold, members, removeSource: false, merge: existing !== undefined });
    }
    // Parse and validate every transfer prerequisite before changing either roster.
    const missingBands = [...new Set(travellers.map(person => person.bandId))]
      .filter(id => !destination.bands.some(band => band.id === id)).sort((a,b) => a-b);
    const sourceBands = new Map(this.bands.filter(band => missingBands.includes(band.id)).map(band => [band.id, band]));
    if (missingBands.some(id => !sourceBands.has(id))) throw new RangeError('Traveller band is not retained');
    const copiedBands = new Map(missingBands.map(id => [id, structuredClone(sourceBands.get(id)!)]));
    const arrivalSlots = comarcaEntrySlots(destination.world, entry, travellers.length);
    if (!arrivalSlots) throw new RangeError('No walkable arrival slots at the destination edge');
    for (const bandId of missingBands) {
      const band = copiedBands.get(bandId)!;
      destination.bands.push(band);
      (destination as unknown as { normsByBand: Map<number, unknown> }).normsByBand.set(bandId, band.norms);
      (destination as unknown as { strangerRegardByBand: Map<number, number> }).strangerRegardByBand.set(bandId, band.strangerRegard);
      copyBandLedgers(this, destination, bandId);
    }
    for (const move of householdMoves) {
      if (!move.merge) {
        if (move.removeSource) {
          this.households = this.households.filter(household => household !== move.source);
          this.householdsById.delete(move.source.id);
        } else {
          for (const member of move.members) move.source.remove(member.id);
          if (!move.source.memberIds.includes(move.source.headId)) move.source.headId = move.source.memberIds[0] ?? move.source.headId;
        }
        move.destination.homeBuildingId = null;
        destination.households.push(move.destination);
        destination.householdsById.set(move.destination.id, move.destination);
      } else {
        // The same family can have met new rivals while away. The returning
        // fragment carries that memory; dropping it here made a feud vanish
        // exactly when the family came home. Merge only this household's ledger
        // into its existing destination record, leaving the origin archive and
        // every other household untouched.
        mergeHouseholdFeudHistory(move.destination, move.source);
        for (const member of move.members) {
          if (!move.destination.memberIds.includes(member.id)) move.destination.add(member.id);
          move.source.remove(member.id);
        }
        if (move.members.some(member => member.id === move.source.headId)) move.destination.headId = move.source.headId;
        if (!move.source.memberIds.includes(move.source.headId)) move.source.headId = move.source.memberIds[0] ?? move.source.headId;
      }
      for (const member of move.members) member.householdId = move.destination.id;
    }
    for (let index = 0; index < travellers.length; index++) {
      const person = travellers[index]!;
      const animal = transferTransportAnimal(person, this.animals, this.animalsById, destination.animals, destination.animalsById);
      if (animal) { this.animalHash.remove(animal); animal.x = arrivalSlots[index]!.x; animal.y = arrivalSlots[index]!.y; if (animal.alive) destination.animalHash.insert(animal); }
      this.peopleHash.remove(person);
      person.clearTarget();
      person.order = null;
      person.action = 'idle';
      person.x = arrivalSlots[index]!.x;
      person.y = arrivalSlots[index]!.y;

      this.peopleById.delete(person.id);
      destination.peopleById.set(person.id, person);
      destination.people.push(person);
      if (person.alive) destination.peopleHash.insert(person);
    }
    this.people = this.people.filter(person => !travellerSet.has(person.id));
    // A camp cannot retain a chief whose body now belongs to another comarca.
    for(const band of this.bands) if(band.chiefId!==null && travellerSet.has(band.chiefId)) {
      band.chiefId=null; band.chiefSince=null; this.bandSystem.chiefByBand.delete(band.id);
    }
    for (const bandId of missingBands) {
      const movedBand = destination.bands.find(band => band.id === bandId)!;
      const members = travellers.filter(person => person.bandId === bandId);
      movedBand.homeX = members.reduce((sum, person) => sum + person.x, 0) / members.length;
      movedBand.homeY = members.reduce((sum, person) => sum + person.y, 0) / members.length;
      movedBand.claimedCells = new Set();
      movedBand.chiefId = null; movedBand.chiefSince = null;
      destination.bandSystem.chiefByBand.delete(bandId);
      destination.templeByBand.delete(bandId);
    }
    // Empty source household records remain as local history: their homeBuildingId
    // is meaningful when the same family returns from another comarca.
    mergeSocialState(this, destination);
    movePersonLedgers(this, destination, travellerSet);
    return travellers;
  }

  /** Atomically replace this owner with a reconstructed executable copy. */
  transferAuthority(): Simulation {
    return transferSimulationAuthority(this, () => {
      const checkpoint = toCheckpointRecord(this);
      return Simulation.fromCheckpointRecordWithIds(checkpoint, this.ids);
    });
  }

  private assertExecutionAuthority(): void { assertExecutionOwner(this); }

  private assertCanonical<T extends { id: number }>(entities: ReadonlyMap<number, T>, entity: T, kind: string): void {
    if (entities.get(entity.id) !== entity) throw new SimulationAuthorityError(`Stale ${kind} handle does not belong to this Simulation`);
  }

  private assertCanonicalSocialPeople(people: readonly Person[]): void {
    for (const person of people) {
      if (this.peopleById.get(person.id) !== person && !this.pendingFounders.has(person)) {
        throw new SimulationAuthorityError('Stale person handle does not belong to this Simulation');
      }
    }
  }

  private initializeRestoredState(state: CheckpointState): void {
    const { roster, execution, world, objects, ledgers } = state;
    const stream = (path: ExecutionStreamPath): RNG => {
      const value = execution.streamsByPath.get(path);
      if (!value) throw new TypeError(`Invalid checkpoint state: missing RNG stream ${path}`);
      return value;
    };
    const pathfinder = new Pathfinder(world);
    const movementRng = stream('simulation.movementSystem.rng');
    const movementSystem = new MovementSystem(world, movementRng, pathfinder,
      state.config.motivation.infantsStill, state.config.carry.sledgeSpeed, state.config.childhood);
    const normsByBand = ledgers.normsByBand;
    const strangerRegardByBand = ledgers.strangerRegardByBand;
    const social = new SocialSystem(roster.relationships, normsByBand, roster.bandRelations,
      strangerRegardByBand, state.ids);

    Object.assign(this, {
      ids: state.ids, config: state.config, rng: stream('simulation.rng'), world, time: execution.time,
      people: roster.activePeople, nodes: objects.nodes, buildings: objects.buildings, trees: objects.trees,
      piles: objects.piles, corpses: objects.corpses, animals: objects.animals,
      households: roster.households, bands: roster.bands, inscriptions: objects.inscriptions,
      inscriptionsById: objects.inscriptionsById,
      nodesById: objects.nodesById, peopleById: roster.peopleById,
      buildingsById: objects.buildingsById, householdsById: roster.householdsById,
      treesById: objects.treesById, pilesById: objects.pilesById,
      corpsesById: objects.corpsesById, animalsById: objects.animalsById,
      relationships: roster.relationships, bandRelations: roster.bandRelations,
      normsByBand, strangerRegardByBand, social,
      needsSystem: new NeedsSystem(state.config.needs, world), pathfinder, movementSystem,
      aiRng: stream('simulation.aiRng'), actionRng: stream('simulation.actionRng'),
      commandRng: stream('simulation.commandRng'), choiceRng: stream('simulation.choiceRng'),
      hearthRng: stream('simulation.hearthRng'), lifeRng: stream('simulation.lifeRng'),
      forestRng: stream('simulation.forestRng'), knowledgeRng: stream('simulation.knowledgeRng'),
      wildlifeRng: stream('simulation.wildlifeRng'), recordRng: stream('simulation.recordRng'),
      healthRng: stream('simulation.healthRng'), ecologyRng: stream('simulation.ecologyRng'),
      edgeRng: stream('simulation.edgeRng'),
      player: ledgers.player, autonomy: ledgers.autonomy, autonomyStall: ledgers.autonomyStall,
      lastRefusal: ledgers.lastRefusal, snowDepth: ledgers.snowDepth, succession: ledgers.succession,
      interruptions: ledgers.interruptions, watchedUses: ledgers.watchedUses,
      helpCalls: ledgers.helpCalls, insights: ledgers.insights,
      territoryPermissions: ledgers.territoryPermissions, feudEvents: ledgers.feudEvents,
      pendingVerdicts: ledgers.pendingVerdicts, sightings: ledgers.sightings,
      edgeReserve: ledgers.edgeReserve, foundingFauna: ledgers.foundingFauna,
      sabotageCache: ledgers.sabotageCache,
      nextEdgeHerd: ledgers.nextEdgeHerd, knownTech: ledgers.knownTech,
      recordedTech: ledgers.recordedTech, rememberedTech: ledgers.rememberedTech,
      recordsInHand: ledgers.recordsInHand, techHolders: ledgers.techHolders,
      era: ledgers.era, templeByBand: ledgers.templeByBand,
    });

    this.bindSocialCallbacks(social);
    social.recent.push(...ledgers.socialRecent);

    // These maps are private implementation state of BandSystem and
    // WildlifeSystem. Their stable keys are part of LedgerRecord, while the
    // per-day member/name/home maps are scratch rebuilt by the next daily pass.
    const bandSystem = this.bandSystem as unknown as Record<string, unknown>;
    for (const key of ['chiefByBand', 'siteProgress', 'raidConsidered', 'foodFailureSince', 'coupConsidered', 'tributePaid']) {
      const entries = key === 'chiefByBand' ? ledgers.bandSystem.chiefByBand :
        ledgers.bandSystem[key as keyof typeof ledgers.bandSystem];
      bandSystem[key] = new Map(entries as [number, unknown][]);
    }
    const wildlifeSystem = this.wildlifeSystem as unknown as Record<string, unknown>;
    wildlifeSystem.owed = new Map(ledgers.wildlifeOwed);

    this.shoreHash.rebuild(world.shoreTiles);
    this.freshShoreHash.rebuild(world.freshShore);
    this.saltShoreHash.rebuild(world.saltShore);
    this.rebuildHashes();
    for (const building of this.buildings) {
      if (!building.def.interior || !building.complete || building.ruined) continue;
      const owner = this.bands.find(band => band.id === building.ownerBandId);
      applyHouseWalls(this.world, building, owner ?? {
        homeX: building.centerX, homeY: building.centerY,
      }, this.peopleHash, true);
    }
    this.reconcileTransportLeases();
    this.treeHash.rebuild(this.trees);
    this.pileHash.rebuild(this.piles);
    this.corpseHash.rebuild(this.corpses);
    this.buildingHash.rebuild(this.buildings);
    this.inscriptionHash.rebuild(this.inscriptions);
  }

  private bindSocialCallbacks(social: SocialSystem): void {
    social.observerSight = person => this.sightOf(person);
    social.setMutationGuard(people => {
      this.assertExecutionAuthority();
      this.assertCanonicalSocialPeople(people);
    });
    social.onMarriage = (a, b) => {
      this.assertExecutionAuthority();
      this.assertCanonicalSocialPeople([a, b]);
      this.mergeHouseholdsImpl(a, b);
    };
    social.onDeed = (actor, type, magnitude) => {
      this.assertExecutionAuthority();
      this.assertCanonicalSocialPeople([actor]);
      this.accrueRenown(actor, type, magnitude);
    };
    social.onPeaceBroken = (actor, victimBandId, witnesses) => {
      this.assertExecutionAuthority();
      this.assertCanonicalSocialPeople([actor, ...witnesses]);
      this.breakPeace(actor, victimBandId, witnesses);
    };
  }

  /** Versioned, JSON-safe identity continuation state (entity records stay inert). */
  idSnapshot(): IdSpaceSnapshot { return this.ids.snapshot(); }

  /** Advance this allocator to at least the saved point without reissuing IDs. */
  restoreIdSnapshot(snapshot: unknown): void { this.assertExecutionAuthority(); this.ids.restore(snapshot); }

  /**
   * Gives every berry bush a species (`BUSHES`), in patches: a bush near one
   * already planted is usually the same shrub, as brambles, sloes and wild
   * strawberries are in a real hedge or clearing. The patches are what make
   * "the sloes by the stream" a place worth remembering in winter.
   *
   * The stream is forked whatever `bushSeasons` says, so `false` is the same
   * island with the old generic bushes on it.
   */
  private spawnFlora(rng: RNG): void {
    const bushes = this.nodes.filter(node => node.kind === 'berries');
    const planted = new SpatialHash<ResourceNode>(8);
    const total = BUSH_SPECIES.reduce((sum, species) => sum + BUSHES[species].weight, 0);
    const startSeason = this.time.season;
    for (const bush of bushes) {
      const neighbour = planted.findNearest(bush.x, bush.y, FLORA_PATCH_RADIUS);
      const roll = rng.next();
      let species: BushSpecies;
      if (neighbour?.species && roll < FLORA_PATCH_SHARE) {
        species = neighbour.species;
      } else {
        let pick = rng.next() * total;
        species = BUSH_SPECIES[BUSH_SPECIES.length - 1]!;
        for (const candidate of BUSH_SPECIES) {
          pick -= BUSHES[candidate].weight;
          if (pick <= 0) { species = candidate; break; }
        }
      }
      if (!this.config.world.bushSeasons) continue;
      bush.species = species;
      planted.insert(bush);
      // The island opens in some season; a bush that bears nothing in it
      // starts bare rather than in the fruit it would have dropped.
      if (bushPhase(species, startSeason) === 'bare') bush.amount = 0;
    }
  }

  /**
   * Plants the baneberry and the yarrow (`WILD_PLANTS`) on top of the ordinary
   * bushes, which stand exactly where they stood. They are extra nodes of kind
   * `berries` with their own species, so every system that already knows what a
   * bush is — the fog, the seasons, the memory of places — handles them; what
   * differs is `ResourceNode.itemId`. About one in eight bushes' worth of each.
   *
   * Nothing is planted in a world with `bushSeasons` off, which has no species
   * at all and so no place to put one.
   */
  private spawnWildPlants(rng: RNG): void {
    if (!this.config.world.bushSeasons) return;
    const startSeason = this.time.season;
    for (const species of WILD_PLANTS) {
      const count = Math.round(this.scaledCount(this.config.world.berryBushes) * WILD_PLANT_SHARE);
      let placed = 0;
      let attempts = 0;
      while (placed < count && attempts < count * 60) {
        attempts++;
        const spot = this.world.randomWalkable(rng, 1);
        if (!spot) continue;
        if (!this.suitsBiome('berries', spot.x, spot.y)) continue;
        const node = new ResourceNode('berries', spot.x, spot.y, rng, this.ids);
        node.species = species;
        if (bushPhase(species, startSeason) === 'bare') node.amount = 0;
        this.nodes.push(node);
        this.nodesById.set(node.id, node);
        placed++;
      }
    }
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
      this.spawnResourceKind(kind, quoted, rng, false);
    }
  }

  /**
   * Places fishing spots in walkable shallow water, on their own RNG stream
   * and in their own pass after everything else has been placed — see the
   * comment above the `fishRng` fork in the constructor.
   */
  private spawnFish(rng: RNG): void {
    if (this.geographicStart) rng = this.geographicResourceRng('fish');
    const count = this.scaledCount(this.comarcaProfile ? this.comarcaProfile.nodes.shoals : this.config.world.fishingSpots);
    // Sampling random land tiles and rejecting almost all of them made the
    // number of fish collapse when wade-depth water became a narrow contour.
    // Sample that contour directly so raising resolution or changing the sea
    // level cannot silently erase most of the configured fishing spots.
    const shallows = this.world.shoreTiles.filter(tile => this.world.isShallow(tile.x, tile.y));
    if (shallows.length === 0) return;
    // A continental coastline can have thousands of salt shallows for every
    // narrow river ford. Sampling only the combined list made the configured
    // fish count look healthy while a whole freshwater network had no shoal.
    // Reserve one spot in each available water class on geographic starts;
    // the classic island keeps the historical draw loop below byte-for-byte.
    const habitats = this.geographicStart
      ? [
          shallows.filter(tile => this.world.isFreshWater(tile.x, tile.y)),
          shallows.filter(tile => this.world.isSaltWater(tile.x, tile.y)),
        ].filter(tiles => tiles.length > 0)
      : [];
    let placed = 0;
    if (count >= habitats.length) {
      for (const habitat of habitats) {
        const spot = rng.pick(habitat);
        const node = new ResourceNode('fish', spot.x, spot.y, rng, this.ids);
        this.nodes.push(node);
        this.nodesById.set(node.id, node);
        placed++;
      }
    }
    for (; placed < count; placed++) {
      const spot = rng.pick(shallows);
      const node = new ResourceNode('fish', spot.x, spot.y, rng, this.ids);
      this.nodes.push(node);
      this.nodesById.set(node.id, node);
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
    if (this.geographicStart) rng = this.geographicResourceRng('wild_grain');
    const count = this.scaledCount(this.comarcaProfile ? this.comarcaProfile.nodes.wildGrainStands : this.config.world.wildGrainPatches);
    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 60 + (this.comarcaProfile ? this.world.width * this.world.height : 0);
    while (placed < count && attempts < maxAttempts) {
      attempts++;
      const spot = this.world.randomWalkable(rng, 1);
      if (!spot) continue;
      if (!this.suitsBiome('wild_grain', spot.x, spot.y)) continue;
      if (!this.geographicResourceAvailableAt('wild_grain', spot.x, spot.y)) continue;
      const node = new ResourceNode('wild_grain', spot.x, spot.y, rng, this.ids);
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
    const wanted = this.comarcaProfile ? this.comarcaProfile.nodes.herds : this.config.world.gameHerds;
    for (let h = 0, herds = this.scaledCount(wanted); h < herds; h++) {
      const species: Species = rng.pick(PREY_SPECIES as unknown as Species[]);
      const def = SPECIES_DEFS[species];

      let home: { x: number; y: number } | null = null;
      for (let attempt = 0; attempt < 40 && !home; attempt++) {
        const spot = this.world.randomWalkable(rng, 1);
        if (!spot) continue;
        const biome = this.world.biomeAt(spot.x, spot.y);
        if (herdHabitat(biome)) home = spot;
      }
      if (!home) continue;
      const herdId = this.ids.claimGroupId('herd', h);

      const size = Math.max(1, Math.round(def.herdSize * rng.range(0.6, 1.4)));
      for (let i = 0; i < size; i++) {
        const spot = this.world.findWalkableNear(
          Math.round(home.x + rng.range(-3, 3)),
          Math.round(home.y + rng.range(-3, 3))
        ) ?? home;
        const animal = new Animal(species, spot.x, spot.y, herdId, rng, this.ids);
        this.animals.push(animal);
        this.animalsById.set(animal.id, animal);
      }
    }
  }

  /**
   * Places the metals, M15 phase 37: native copper now, the ores as `mining`
   * brings them. One kind at a time, in `RESOURCE_KINDS` order, so appending a
   * kind never moves the ones before it. On a world with a map each kind draws
   * from its own stream and is placed only where the region's profile has it.
   */
  /**
   * Wild equids and asses are seeded after every established pass so they cannot
   * move fish, resources, people, or predators in existing seeds.
   */
  private spawnTransportAnimals(rng: RNG): void {
    const founders = this.people.filter(person => person.alive);
    const founderHash = new SpatialHash<Person>(8);
    for (const founder of founders) founderHash.insert(founder);
    const count = this.scaledCount(2);
    if (count <= 0) return;
    for (let index = 0; index < TRANSPORT_SPECIES.length; index++) {
      const species = TRANSPORT_SPECIES[index]!;
      let home: { x: number; y: number } | null = null;
      for (let attempt = 0; attempt < 100 && !home; attempt++) {
        const spot = this.world.randomWalkable(rng, 1);
        if (!spot || !herdHabitat(this.world.biomeAt(spot.x, spot.y))) continue;
        if (founderHash.queryRadius(spot.x, spot.y, 16).length > 0) continue;
        home = spot;
      }
      if (!home) continue;
      const herdId = this.ids.claimGroupId('herd', 1_000_000 + index);
      for (let n = 0; n < count; n++) {
        const spot = this.world.findWalkableNear(
          Math.round(home.x + rng.range(-3, 3)),
          Math.round(home.y + rng.range(-3, 3)),
        ) ?? home;
        const animal = new Animal(species, spot.x, spot.y, herdId, rng, this.ids);
        this.animals.push(animal);
        this.animalsById.set(animal.id, animal);
      }
    }
  }
  private spawnOres(rng: RNG): void {
    const geographic = this.geographicStart !== null;
    for (const kind of RESOURCE_KINDS) {
      const quoted = ORE_COUNTS[kind];
      if (quoted === undefined || kind === 'iron_ore') continue;
      this.spawnResourceKind(kind, quoted, geographic ? this.geographicResourceRng(kind) : rng, geographic);
    }
  }

  /**
   * Bog iron gets a later pass so its deposits cannot move the M15-37 ores.
   * Atlas data has no explicit wetland layer yet: high local moisture near a
   * fresh-water bank is the reproducible map proxy. The classic island uses
   * beach tiles indexed by shoreHash, as M8.4 specifies.
   */
  private spawnIronOre(rng: RNG): void {
    const geographic = this.geographicStart !== null;
    this.spawnResourceKind('iron_ore', ORE_COUNTS.iron_ore!,
      geographic ? this.geographicResourceRng('iron_ore') : rng, geographic);
  }

  /**
   * Places the hunters, M15 phase 23e: a pack of three wolves, a bear and a
   * lynx on the woods and hills, away from where people begin so that nobody
   * wakes beside one. Their own pass on their own stream, after everything
   * else (see the fork's comment), so every herd, bush and person is where it
   * was before they existed.
   */
  private spawnPredators(rng: RNG): void {
    const plan: { species: Species; count: number; preferredHerdId: number }[] = [];
    for (let g = 0; g < this.config.world.predators; g++) {
      plan.push(
        { species: 'wolf', count: 3, preferredHerdId: 1000 + g * 10 + 1 },
        { species: 'bear', count: 1, preferredHerdId: 1000 + g * 10 + 3 },
        { species: 'lynx', count: 1, preferredHerdId: 1000 + g * 10 + 4 },
      );
    }
    const founders = this.people.filter(p => p.alive);
    for (const { species, count, preferredHerdId } of plan) {
      let home: { x: number; y: number } | null = null;
      for (let attempt = 0; attempt < 80 && !home; attempt++) {
        const spot = this.world.randomWalkable(rng, 1);
        if (!spot) continue;
        const biome = this.world.biomeAt(spot.x, spot.y);
        if (!predatorHabitat(biome)) continue;
        if (founders.some(p => Math.hypot(p.x - spot.x, p.y - spot.y) < PREDATOR_START_DISTANCE)) continue;
        home = spot;
      }
      if (!home) continue;
      const herdId = this.ids.claimGroupId('herd', preferredHerdId);
      for (let i = 0; i < count; i++) {
        const spot = this.world.findWalkableNear(
          Math.round(home.x + rng.range(-2, 2)), Math.round(home.y + rng.range(-2, 2))) ?? home;
        const animal = new Animal(species, spot.x, spot.y, herdId, rng, this.ids);
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
      case 'berries': return berryHabitat(biome, this.world.fertilityAt(x, y));
      // Fallen branches collect where there are branches to fall: a stick pile
      // far from any tree is just litter the map put there.
      case 'sticks':
        return (biome === 'forest' || biome === 'grass' || biome === 'hills') &&
          this.treeHash.findNearest(x, y, 6, t => t.standing) !== null;
      case 'flint': return flintHabitat(biome);
      // Reeds and clay both belong at the water's edge, which quietly makes
      // shoreline the most valuable ground to camp on.
      case 'reeds':
        if (this.geographicStart) {
          return (biome === 'beach' || biome === 'grass' || biome === 'forest' || biome === 'hills' || biome === 'river') && this.world.isShore(x, y);
        }
        return biome === 'beach' && this.world.isShore(x, y);
      case 'clay':
        // Continental rivers cut through forest too. Requiring a classic beach
        // or meadow erased all clay from wooded river starts with real banks.
        return (biome === 'beach' || biome === 'grass' ||
          (this.geographicStart !== null && (biome === 'forest' || biome === 'hills' || biome === 'river'))) && this.world.isShore(x, y);
      // M15 phase 27c: the fish are in the water, on walkable shallows. Keep
      // them on fishRng's dedicated stream and in this post-people pass; putting
      // them into spawnResources would move every herd and person after them.
      case 'fish': return this.world.isShallow(x, y);
      // Open ground only. Wild cereal is a grass and it wants sun, so a stand
      // under the canopy would be a stand nobody would ever find — and the
      // fertility floor is higher than the berry bush's because thin ground
      // carries scrub, not a crop worth gathering.
      case 'wild_grain':
        return grainHabitat(biome, this.world.fertilityAt(x, y));
      // M15 phase 37. Float copper weathers out of the hills; the one place a
      // person is likely to walk past a nugget and not know what it is.
      case 'native_copper': return hillOreHabitat(biome);
      // The seams are in the hills too, which is where a band that has learned to
      // dig will go looking.
      case 'copper_ore': return hillOreHabitat(biome);
      case 'tin_ore': return hillOreHabitat(biome);
      // Placer gold lies where water has sorted the gravel: the stream-mouth
      // beaches and the foot of the hills.
      case 'gold': return goldHabitat(biome);
      case 'iron_ore': {
        if (!this.geographicStart) {
          return biome === 'beach' && this.shoreHash.findNearest(x + 0.5, y + 0.5, 0.75,
            shore => shore.x === x && shore.y === y) !== null;
        }
        if (this.geographicStart) {
          const wet = this.world.moisture[this.world.index(x, y)]! >= 0.65;
          const freshBank = this.shoreHash.findNearest(x + 0.5, y + 0.5, 2,
            shore => this.world.isFreshShore(shore.x, shore.y)) !== null;
          return wet && freshBank && (biome === 'grass' || biome === 'forest' || biome === 'beach');
        }
        return false;
      }
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
      // Camps want fresh water within reach; a band placed in the middle of a rock
      // field would simply die, which makes for a poor test scenario.
      // Big enough to forage across, and with potable water in reach. A camp on a
      // pinched headland is a death sentence: greedy movement cannot route
      // around the shoreline, so the band starves in sight of food.
      const minLand = Math.max(400, this.world.width * this.world.height * 0.05);
      // On a map the water is a river or a lake and not the shore of an island, and 20 tiles is past what a person can see:
      // measured on generated worlds, a band camped 17-20 tiles from the only river lost five adults to thirst in twenty days
      // (the classic island, whose water is everywhere, lost none). So a start with a map asks for water within sight. The
      // classic island keeps 20: changing it would move every saved seed's camp.
      const waterRadius = this.geographicStart ? 10 : 20;
      let home = this.world.randomWalkableInLargeRegion(rng, minLand);
      for (let attempt = 0; attempt < 60 && home; attempt++) {
        if (this.hasWaterNear(home.x, home.y, waterRadius)) break;
        home = this.world.randomWalkableInLargeRegion(rng, minLand);
      }
      // On a map the river may fill a corner of the window, so sixty random camps can all miss it, and the old fallback (any
      // walkable tile) put the second and third tribes a hundred tiles from the only water: nine children dead of thirst in
      // twenty days, on a start that had a river. The fallback there is a bank of the fresh water itself.
      if (this.geographicStart && (!home || !this.hasWaterNear(home.x, home.y, waterRadius)) && this.world.freshShore.length > 0) {
        for (let tries = 0; tries < 40; tries++) {
          const bank = rng.pick(this.world.freshShore);
          if (this.world.isWalkable(bank.x, bank.y)) { home = { x: bank.x, y: bank.y }; break; }
        }
      }
      home = home ?? this.world.randomWalkable(rng, 200);
      if (!home) continue;

      const norms: Norms = { ...DEFAULT_NORMS };
      for (const variable of VARIABLE_NORMS) {
        norms[variable.type] = rng.range(variable.min, variable.max);
      }

      const band: Band = {
        id: this.ids.claimGroupId('band', b),
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
      let adultFounderIndex = 0;
      for (const person of founded.people) {
        person.placeMemory.configure(this.world.width, this.world.height, this.config.knowledge.placeMemoryPerKind);
        person.placeMemory.observe(band.homeX, band.homeY, this.config.knowledge.foundersKnowRadius, this.time.day);
        this.observeWorld(person, band.homeX, band.homeY, this.config.knowledge.foundersKnowRadius);
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
          for (const entry of this.config.population.startingTechFew ?? []) {
            if (adultFounderIndex < entry.perBand) person.knownTech.add(entry.tech as Tech);
          }
          if (person.knownTech.has('cooking')) {
            // Scenario founders represent people who have already tested a
            // roast; without this evidence the scorer correctly has no reason
            // to make one yet.
            person.beliefs.learn('eat:roast_meat', 40, 0.3, 'own', 0);
            person.beliefs.learn('eat:roast_fish', 26, 0.3, 'own', 0);
          }
          adultFounderIndex++;
        }
        this.people.push(person);
        this.peopleById.set(person.id, person);
      }
      for (const household of founded.households) {
        this.households.push(household);
        this.householdsById.set(household.id, household);
      }
      // The first camp sites predate their people, so give them a proponent as
      // soon as the founding families exist. Waiting for the first planning
      // day left a fresh band with nobody eligible to continue its starter hut.
      const adults = founded.people.filter(person => !person.isChild && person.alive);
      for (const site of this.buildings) {
        if (site.ownerBandId !== band.id || site.complete || site.sponsorId !== null) continue;
        const score = (person: Person): number => site.def.shelter > 0
          ? person.needs.cold + Math.max(0, -person.mood.security)
          : Math.max(0, 1 - person.inventory.total / 20) * 100;
        const sponsor = adults.reduce<Person | null>((best, person) =>
          !best || score(person) > score(best) ||
            (score(person) === score(best) && person.id < best.id) ? person : best, null);
        site.sponsorId = sponsor?.id ?? null;
      }
    }
  }

  /**
   * The handles `Founding` needs. Exposed as a method so character creation can
   * build a tribe through exactly the same path world generation does.
   */
  foundingContext(rng: RNG): FoundingContext {
    this.assertExecutionAuthority();
    return {
      world: this.world,
      rng,
      relationships: this.relationships,
      social: this.social,
      ids: this.ids,
      makePerson: (name, x, y, bandId, personRng) => {
        this.assertExecutionAuthority();
        const person = new Person(name, x, y, bandId, personRng, this.time.daysPerYear, this.ids);
        person.skillGain = this.config.learning.skillGain;
        person.placeMemory.configure(this.world.width, this.world.height, this.config.knowledge.placeMemoryPerKind);
        this.pendingFounders.add(person);
        return person;
      },
      placeNear: (x, y) => {
        this.assertExecutionAuthority();
        return this.world.findWalkableNear(x, y) ?? { x, y };
      },
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
    // A child grows up hearing where their people have been: both parents'
    // maps, as hearsay (M15 phase 31). Nothing is drawn, and nothing is made in
    // a world without a globe.
    if (mother.worldKnowledge || father?.worldKnowledge) {
      const heard = child.worldKnowledge ??= new WorldKnowledge();
      mother.worldKnowledge?.tellAllTo(heard);
      father?.worldKnowledge?.tellAllTo(heard);
    }

    const household = child.householdId === null
      ? null
      : this.householdsById.get(child.householdId);
    if (household) household.add(child.id);
    if (household) child.feudTargetId = household.feudSuspects.values().next().value ?? null;

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
   * The best person within sight to see a woman through a birth: an adult of
   * her own band who knows `herbalism`, the better for practice at `heal`
   * (`Pregnancy.midwifeQuality`). Ties go to the lower id, so asking twice, or
   * from a replay, can never give two answers. No RNG: who is there is a fact.
   */
  private midwifeFor(mother: Person): Person | null {
    let best: Person | null = null;
    let bestQuality = 0;
    for (const helper of this.peopleHash.queryRadius(mother.x, mother.y, this.config.sightRadius)) {
      if (helper.id === mother.id || helper.bandId !== mother.bandId) continue;
      const quality = midwifeQuality(helper);
      if (quality > bestQuality || (quality === bestQuality && quality > 0 && best !== null && helper.id < best.id)) {
        best = helper;
        bestQuality = quality;
      }
    }
    return best;
  }

  /**
   * M15 phase 19d: a pregnancy lost. The reason goes in her chronicle, in his,
   * and on the screen for a player who lost the child — the standing rule that
   * the interface says why, applied to something that happens to a person
   * rather than something refused to one.
   */
  private registerMiscarriage(mother: Person, father: Person | null, cause: MiscarriageCause): void {
    telemetry.count('miscarriage');
    telemetry.count('miscarriage_' + cause);
    const why = cause === 'hunger' ? t('lost the child she was carrying: hunger had worn her down')
      : cause === 'fever' ? t('lost the child she was carrying: the fever was too much')
      : t('lost the child she was carrying: the blow to her body was too much');
    mother.chronicle.push({ tick: this.time.tick, ageDays: mother.age, kind: 'suffered', text: why });
    if (father?.alive) {
      father.chronicle.push({
        tick: this.time.tick, ageDays: father.age, kind: 'suffered',
        text: t('{name} lost the child she was carrying', { name: mother.name }),
      });
    }
    if (mother.isPlayer || father?.isPlayer) this.noteInsight(mother, why, 'setback');
  }

  /**
   * M15 phase 19d: a birth that went badly. She bleeds (a torso wound, which
   * the tending that already exists dresses and the festering that already
   * exists can turn to fever) and loses health; a midwife at hand dresses it
   * at once and halves the cost. Called after `registerBirth`, so her
   * chronicle reads "bore" and then "went hard".
   */
  private registerComplicatedBirth(mother: Person, midwife: Person | null): void {
    telemetry.count('complicated_birth');
    wound(mother.body, 'torso', 0.35);
    mother.health = Math.max(1, mother.health - (midwife ? 10 : 25));
    if (midwife) {
      telemetry.count('complicated_birth_attended');
      mother.body.torso.wound = 'tended';
      midwife.practice('heal', 3);
      midwife.chronicle.push({
        tick: this.time.tick, ageDays: midwife.age, kind: 'did',
        text: t('saw {name} through a hard birth', { name: mother.name }),
      });
    }
    const text = midwife
      ? t('the birth went hard, and {name} saw her through', { name: midwife.name })
      : t('the birth went hard, and there was nobody to help her');
    mother.chronicle.push({ tick: this.time.tick, ageDays: mother.age, kind: 'suffered', text });
    if (mother.isPlayer) this.noteInsight(mother, text, 'setback');
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
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, a, 'person');
    this.assertCanonical(this.peopleById, b, 'person');
    this.mergeHouseholdsImpl(a, b);
  }

  /** Geographic resources use seed-derived per-kind streams so gates cannot
   * shift another resource, herd, or founder when a profile changes. */
  private spawnGeographicResources(): void {
    const cfg = this.config.world;
    const plan: [ResourceKind, number][] = [
      ['berries', this.comarcaProfile ? this.comarcaProfile.nodes.bushes : cfg.berryBushes], ['flint', cfg.flintOutcrops],
      ['sticks', cfg.deadwood], ['reeds', cfg.reedBeds], ['clay', cfg.clayBanks],
    ];
    for (const [kind, quoted] of plan) {
      this.spawnResourceKind(kind, quoted, this.geographicResourceRng(kind), true);
    }
  }

  private geographicResourceRng(kind: ResourceKind | 'herds'): RNG {
    const start = this.geographicStart!;
    const width = start.comarcasWide ?? 1;
    const height = start.comarcasHigh ?? 1;
    const sourceId = start.geography.kind === 'earth' ? start.geography.entry.id : start.geography.kind;
    return new RNG(`${this.config.seed}:geographic-resource:${sourceId}:${start.x}:${start.y}:${width}:${height}:${kind}`);
  }

  /** One resource pass. The legacy caller keeps its old shared stream/order. */
  private spawnResourceKind(kind: ResourceKind, quoted: number, rng: RNG, geographic: boolean): void {
    const count = this.scaledCount(quoted);
    if (geographic && (kind === 'clay' || kind === 'reeds')) {
      // A thin river bank may occupy far less than one in sixty land tiles.
      // Rejection sampling could miss it entirely or silently underfill the
      // quota. Sample the existing shore index, retaining the habitat gate;
      // no bank means no resource. Only these per-kind map streams change.
      // isShore also treats the clipped map boundary as water. In-bounds water
      // checks exclude those phantom banks on a dry continental window.
      const banks = this.world.shoreTiles.filter(spot =>
        ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) =>
          this.world.inBounds(spot.x + dx, spot.y + dy) && this.world.isWater(spot.x + dx, spot.y + dy)) &&
        this.suitsBiome(kind, spot.x, spot.y) &&
        this.geographicResourceAvailableAt(kind, spot.x, spot.y));
      if (banks.length === 0) return;
      for (let placed = 0; placed < count; placed++) {
        const spot = rng.pick(banks);
        const node = new ResourceNode(kind, spot.x, spot.y, rng, this.ids);
        this.nodes.push(node);
        this.nodesById.set(node.id, node);
      }
      return;
    }
    let placed = 0;
    let attempts = 0;
    // A profile-driven count is proportional to the habitat, so a map with a sliver of it asks for few nodes and rejection
    // sampling needs a number of tries that follows the map, not the count: a bush wanted on 0.5% ground takes 200 tries.
    const maxAttempts = count * 60 + (this.comarcaProfile && geographic && kind === 'berries' ? this.world.width * this.world.height : 0);
    while (placed < count && attempts < maxAttempts) {
      attempts++;
      const spot = this.world.randomWalkable(rng, 1);
      if (!spot || !this.suitsBiome(kind, spot.x, spot.y)) continue;
      if (geographic && !this.geographicResourceAvailableAt(kind, spot.x, spot.y)) continue;
      const node = new ResourceNode(kind, spot.x, spot.y, rng, this.ids);
      this.nodes.push(node);
      this.nodesById.set(node.id, node);
      placed++;
    }
  }

  private geographicResourceAvailableAt(kind: ResourceKind, x: number, y: number): boolean {
    if (!this.geographicStart || !this.localGeography) return true;
    const profile = this.localGeography.profileAtLocal(x + 0.5, y + 0.5);
    return geographicResourceAvailable(this.geographicStart.geography, profile.x, profile.y, kind);
  }

  private mergeHouseholdsImpl(a: Person, b: Person): void {
    const elder = a.age >= b.age ? a : b;
    const younger = elder === a ? b : a;
    const target = elder.householdId === null
      ? null
      : this.householdsById.get(elder.householdId);
    if (!target) return;

    const source = younger.householdId === null
      ? null
      : this.householdsById.get(younger.householdId);
    if (source && source.id !== target.id) this.closeFeud(source, target);
    if (source && source.id !== target.id) target.wealth += source.wealth;
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
      overlordOf: bandId => this.bandRelations.overlordOf(bandId),
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
  /** A starving sighting young enough to act on: half a day. */
  freshStarvingSeen(person: Person): Person['starvingSeen'] {
    const seen = person.starvingSeen;
    return seen && this.time.tick - seen.tick <= this.config.time.ticksPerDay / 2 ? seen : null;
  }

  /**
   * Whether a baby's cry should break off what this woman is doing now: one
   * she would nurse is crying (`Nursing.infantNeedingNursing`), and the last
   * cry to interrupt her was more than `CRY_NAG_TICKS` ago. The pause is what
   * lets her weigh the cry rather than obey it — having chosen a drink first,
   * she drinks, and the baby, still crying, reaches her again a little later.
   */
  cryReaches(person: Person): boolean {
    return this.cryingBabyReaches(person) !== null;
  }

  /** Returns the same baby as the cry check, so a care route can prove its target once. */
  private cryingBabyReaches(person: Person): Person | null {
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, person, 'person');
    if (!this.config.motivation.urgentNursing || person.captiveOf !== null ||
      this.time.tick - person.cryHeardTick < CRY_NAG_TICKS) return null;
    // An order to pick a baby up or put one down is finished before any feed
    // (M15 phase 20): a feed that interrupted it dropped the order, and the
    // player's "pick him up" silently did not happen. Both are short.
    if ((person.action === 'carry_baby' || person.action === 'put_down_baby') && person.order !== null) {
      return null;
    }
    const baby = infantNeedingNursing(person, this.peopleById, this.world, this.config.childhood,
      this.peopleHash, this.config.sightRadius);
    if (!baby) return null;
    person.cryHeardTick = this.time.tick;
    telemetry.count('cry_interrupted');
    return baby;
  }

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
  /** Claim a live tamed donkey or horse through the same lease rules as the simulation. */
  claimTransportAnimalFor(personId: number, animalId: number, mode: 'pack' | 'riding'): boolean {
    this.assertExecutionAuthority();
    const person = this.peopleById.get(personId);
    const animal = this.animalsById.get(animalId);
    if (!person?.alive || !animal || !this.animals.includes(animal)) {
      this.lastRefusal = t('That transport animal is no longer available');
      return false;
    }
    if (Math.hypot(person.x - animal.x, person.y - animal.y) > 2.2) {
      this.lastRefusal = t('Come closer to the transport animal');
      return false;
    }
    if (!claimTransportAnimal(person, animal, mode, this.animalsById)) {
      this.lastRefusal = t('You need the right training and a living tamed animal');
      return false;
    }
    person.carryReconciledVersion = -1;
    this.lastRefusal = null;
    return true;
  }

  /** Release a transport lease without harming or untaming its animal. */
  releaseTransportAnimalFor(personId: number): boolean {
    this.assertExecutionAuthority();
    const person = this.peopleById.get(personId);
    if (!person?.alive || !transportOf(person, this.animalsById)) {
      this.lastRefusal = t('You have no active transport animal');
      return false;
    }
    releaseTransportAnimal(person, this.animalsById);
    person.transportAutoClaim = false;
    person.carryReconciledVersion = -1;
    this.lastRefusal = null;
    return true;
  }
  command(
    leader: Person,
    subordinate: Person,
    action: string,
    target: Parameters<Simulation['order']>[2] = {},
    options: { consentOnly?: boolean } = {},
  ): boolean {
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, leader, 'person');
    this.assertCanonical(this.peopleById, subordinate, 'person');
    if (!leader.alive || !subordinate.alive) return false;
    if (leader.id === subordinate.id) return this.order(leader, action, target);

    // M12 phase 4c: a captive has no standing to refuse a direct order from
    // the people holding them. Keeping this exception here, at the same seam
    // as every other order, means the player and the AI get the same forced
    // labour rule instead of one of them quietly bypassing it.
    // M15 phase 39b: a serf with a temper and a deep enough grudge refuses
    // even the people who own them, to their face. Not rolled: decided by the
    // serf's own nature and what they think of the one giving the order.
    if (isCaptive(subordinate) && subordinate.captiveOf === leader.bandId && leader.captiveOf === null &&
      serfRefuses(subordinate, this.relationships.opinion(subordinate.id, leader.id))) {
      telemetry.count('serf_refused');
      this.lastRefusal = t('{name} will not be ordered by you', { name: subordinate.name });
      return false;
    }
    if (isCaptive(subordinate) && subordinate.captiveOf === leader.bandId &&
      leader.captiveOf === null) {
      telemetry.count('captive_order_obeyed');
      subordinate.mood.add('purpose', -2, 'forced labour', this.time.tick);
      return options.consentOnly ? true : this.order(subordinate, action, target);
    }

    const standing = this.standing(leader, subordinate, action,
      this.ordersForeignProperty(subordinate, target.buildingId));
    if (this.commandRng.next() >= standing.chance) {
      telemetry.count('order_refused');
      telemetry.count('order_' + action + '_refused');
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
    telemetry.count('order_' + action + '_obeyed');
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
    return options.consentOnly ? true : this.order(subordinate, action, target);
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

    const household = new Household(person.surname, person.id, band.id, this.time.tick, this.ids);
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
        if (Math.hypot(finder.x - corpse.x, finder.y - corpse.y) > this.sightOf(finder)) continue;
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
          } else if (player.distanceTo(finder) <= this.sightOf(player)) {
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
    // M15 phase 39b: among a people with a law or a crown, an adult captive
    // is not merely held but owned — the serf of the household of whoever
    // tied them, or of the chief's if the binder has none.
    const captorChief = captors.chiefId === null ? null : this.peopleById.get(captors.chiefId) ?? null;
    if (!person.isChild && governs(captorChief)) {
      person.serfOf = binder.householdId ?? captorChief?.householdId ?? null;
      if (person.serfOf !== null) {
        telemetry.count('serf_taken');
        const master = this.householdsById.get(person.serfOf);
        person.chronicle.push({
          tick: this.time.tick, ageDays: person.age,
          text: t('was made a serf of the {household}', { household: master?.name ?? '' }), kind: 'suffered',
        });
      }
    }
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
    if (person.serfOf !== null) telemetry.count('serf_escaped');
    person.serfOf = null;
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
   * Turns a cross-band wrong into a family memory. The event is processed once
   * per daily pass: personal memories still handle the immediate reaction, but
   * the feud survives the death of both witnesses because its value belongs to
   * the two households rather than to either person.
   */
  private settleFeuds(): void {
    for (const event of this.social.recent) {
      if (this.feudEvents.has(event.id) || event.targetId === null) continue;
      const actor = this.peopleById.get(event.actorId);
      const target = this.peopleById.get(event.targetId);
      if (!actor || !target || actor.bandId === target.bandId ||
        actor.householdId === null || target.householdId === null) continue;
      const aggressor = this.householdsById.get(actor.householdId);
      const victim = this.householdsById.get(target.householdId);
      if (!aggressor || !victim || aggressor.id === victim.id) continue;
      if ((event.type === 'gift' || event.type === 'amends' || event.type === 'trade') &&
        event.magnitude >= 0.5) {
        this.closeFeud(aggressor, victim);
        this.feudEvents.add(event.id);
        continue;
      }
      if (DEED_WEIGHT[event.type] >= 0) continue;
      const weight = Math.min(100, Math.abs(DEED_WEIGHT[event.type]) *
        (0.5 + event.magnitude * 0.5));
      aggressor.feud.set(victim.id, Math.min(100, (aggressor.feud.get(victim.id) ?? 0) + weight));
      victim.feud.set(aggressor.id, Math.min(100, (victim.feud.get(aggressor.id) ?? 0) + weight));
      victim.feudSuspects.set(aggressor.id, actor.id);
      for (const memberId of victim.memberIds) {
        const member = this.peopleById.get(memberId);
        if (member) member.feudTargetId = actor.id;
      }
      for (const memberId of aggressor.memberIds) {
        for (const victimId of victim.memberIds) {
          this.relationships.addDeed(memberId, victimId, -Math.min(18, weight * 0.25), this.time.tick);
          this.relationships.addDeed(victimId, memberId, -Math.min(18, weight * 0.25), this.time.tick);
        }
      }
      telemetry.count('household_feud_started');
      this.feudEvents.add(event.id);
    }
  }

  /** A marriage, accepted amends or a substantial gift closes both ledgers. */
  private closeFeud(a: Household, b: Household): void {
    if (!a.feud.has(b.id) && !b.feud.has(a.id)) return;
    a.feud.delete(b.id);
    b.feud.delete(a.id);
    a.feudSuspects.delete(b.id);
    b.feudSuspects.delete(a.id);
    // Brain reads the person's target, not the household ledger. Leaving that
    // cached culprit behind kept the revenge gate open after peace was made.
    // Preserve a target from another open feud, or fall back to its culprit.
    for (const household of [a, b]) {
      const suspects = [...household.feudSuspects.entries()]
        .filter(([id]) => household.feud.has(id)).map(([, id]) => id);
      for (const memberId of household.memberIds) {
        const member = this.peopleById.get(memberId);
        if (member && (member.feudTargetId === null || !suspects.includes(member.feudTargetId))) {
          member.feudTargetId = suspects[0] ?? null;
        }
      }
    }
    for (const aId of a.memberIds) {
      for (const bId of b.memberIds) {
        this.relationships.addDeed(aId, bId, 12, this.time.tick);
        this.relationships.addDeed(bId, aId, 12, this.time.tick);
      }
    }
    telemetry.count('household_feud_closed');
  }

  /**
   * Pays a captor to release somebody. The payer must belong to the captive's
   * old band and stand at the captor's camp; goods go to the captor directly,
   * so this is a real exchange rather than a menu-only pardon.
   */
  ransomCaptive(payer: Person, captive: Person, itemId: string, count: number): boolean {
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, payer, 'person');
    this.assertCanonical(this.peopleById, captive, 'person');
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
    captive.serfOf = null;
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

  /**
   * Daily, M15 phase 39b. Serfdom is heritable: a serf whose household has
   * died out passes to the household of the captors' chief, as goods do to
   * the crown. And serfs rise: when at least `SERF_REVOLT_QUORUM` serfs of
   * one band trust one another (`trustEachOther`, the plot's own test), they
   * all slip away together, whoever is watching. Deterministic.
   */
  private settleSerfs(): void {
    const byBand = new Map<number, Person[]>();
    for (const serf of this.people) {
      if (!serf.alive || serf.serfOf === null || !isCaptive(serf)) continue;
      telemetry.count('serf_days');
      const master = this.householdsById.get(serf.serfOf);
      if (!master || master.extinct) {
        const band = this.bands.find(b => b.id === serf.captiveOf);
        const chief = band?.chiefId == null ? null : this.peopleById.get(band.chiefId) ?? null;
        serf.serfOf = chief?.householdId ?? null;
        if (serf.serfOf !== null) telemetry.count('serf_inherited');
      }
      const list = byBand.get(serf.bandId) ?? [];
      list.push(serf);
      byBand.set(serf.bandId, list);
    }
    for (const serfs of byBand.values()) {
      if (serfs.length < SERF_REVOLT_QUORUM) continue;
      const rising = serfs.filter(a => serfs.filter(b => b !== a && trustEachOther(a.id, b.id, this.relationships)).length >=
        SERF_REVOLT_QUORUM - 1);
      if (rising.length < SERF_REVOLT_QUORUM) continue;
      telemetry.count('serf_revolt');
      for (const serf of rising) {
        serf.chronicle.push({
          tick: this.time.tick, ageDays: serf.age,
          text: t('rose with the other serfs and broke free'), kind: 'milestone',
        });
        this.escape(serf);
      }
    }
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
      captive.serfOf = null;
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
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, leader, 'person');
    this.assertCanonical(this.peopleById, subordinate, 'person');
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

    // M15 phase 38b: a soldier is a mouth the temple feeds, and only somebody
    // who has had the idea of a standing army thinks of keeping one.
    if (job === 'soldier') {
      if (techPower(leader, 'standing_army') <= 0) {
        this.lastRefusal = t('{name} has never had the idea of keeping men whose work is fighting', { name: leader.name });
        return false;
      }
      if (!this.templeOf(leader.bandId)) {
        this.lastRefusal = t('there is no temple to feed a soldier from');
        return false;
      }
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
  /** People who saw outsiders on their home ground. */
  private readonly sightingScratch: Person[] = [];

  /** Every founding band's camp, for the brain's readers of fear. */
  private bandHomes(): Map<number, { x: number; y: number }> {
    const homes = new Map<number, { x: number; y: number }>();
    for (const band of this.bands) {
      if (!band.outcast) homes.set(band.id, { x: band.homeX, y: band.homeY });
    }
    return homes;
  }

  /**
   * M15 phase 23g, `dog`: how far each person sees, when somebody with the
   * technology has a tamed wolf at their heel. `undefined` when nobody does,
   * which is every world before the idea is worked out and keeps them
   * bit-identical.
   */
  private dogSight(): (looker: Person) => number {
    let dogs: Map<number, Animal> | undefined;
    for (const animal of this.animals) {
      if (animal.alive && animal.tamedBy !== null && animal.species === 'wolf') {
        (dogs ??= new Map()).set(animal.tamedBy, animal);
      }
    }
    return looker => {
      const base = this.sightOf(looker);
      const dog = dogs?.get(looker.id);
      if (!dog || looker.distanceTo(dog) > DOG_HEARING) return base;
      const power = techPower(looker, 'dog');
      if (power > 0) telemetry.count('dog_sight');
      return base * (1 + DOG_SIGHT * power);
    };
  }

  /**
   * How far this person sees, M15 phase 25c: the base radius and what the
   * ground they stand on adds (`World.sightBonusAt`). The one place that says
   * so, read by the scorer (`brainCtx.sightRadius`, set per person each step),
   * by the watch for strangers (`sightIntruders`, through `dogSight`) and so by
   * the dog's hearing too, which multiplies this and not the bare radius.
   */
  sightOf(person: Person): number {
    const base = this.config.sightRadius + this.world.sightBonusAt(person.x, person.y);
    return this.config.light.enabled
      ? base * Math.max(this.config.light.nightFloor, this.lightAt(person.x, person.y))
      : base;
  }

  /** Local light instrument, shared by later sight/work readers and presentation. */
  lightAt(x: number, y: number): number {
    return measuredLightAt(x, y, this.time.daylight, this.buildingHash, this.peopleHash);
  }

  /** Torch lighting needs a maintained, completed hearth, not just daylight. */
  hearthNear(x: number, y: number, radius: number): boolean {
    return hearthNear(this.buildingHash, x, y, radius);
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
      this.time.tick, this.sightings, outcast, this.sightingScratch, this.dogSight());
    // M11 phase 16d: the same looking-around sees who has blood on them.
    noticeBloodied(this.people, this.peopleHash, this.config.sightRadius, this.time.tick, person => this.sightOf(person));
  }

  /** The band of no band. Created the first time anyone is cast out. */
  private outcastBand(): Band {
    const existing = this.bands.find(b => b.outcast);
    if (existing) return existing;

    const band: Band = {
      id: this.ids.claimGroupId('band', this.bands.length + OUTCAST_BAND_ID_BASE),
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
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, person, 'person');
    const available = transferableUnits(person, itemId);
    if (available < 1 && person.inventory.count(itemId) >= 1) {
      this.lastRefusal = burningTorchRefusalText(); return null;
    }
    const taken = person.inventory.remove(itemId, Math.min(count, available));
    if (taken === 0) return null;

    let pile = this.pileHash.findNearest(person.x, person.y, 1.2);
    if (!pile) {
      pile = new ItemPile(Math.round(person.x), Math.round(person.y), person.id, this.time.tick, this.ids);
      this.piles.push(pile);
      this.pilesById.set(pile.id, pile);
      this.pileHash.rebuild(this.piles);
    }
    pile.contents.add(itemId, taken);
    // Dropping the final copy of a fitted container ends its capacity too.
    // Reconcile through the same carry rule as transfers so no slot points at
    // a container the person no longer owns and any overflow becomes a pile.
    reconcileCarry(person, this.config.carry, (x, y, droppedId, amount) =>
      this.dropAt(x, y, droppedId, amount));
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
    this.assertExecutionAuthority();
    if (count <= 0) return;
    let pile = this.pileHash.findNearest(x, y, 1.2);
    if (!pile) {
      pile = new ItemPile(Math.round(x), Math.round(y), null, this.time.tick, this.ids);
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
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, person, 'person');
    this.assertCanonical(this.pilesById, pile, 'pile');
    let moved = 0;
    if (itemId !== undefined) {
      const room = Math.min(person.carryCapacity - person.carrying,
        itemCapacityFor(person, this.config.carry, itemId) - person.inventory.count(itemId));
      const want = Math.min(count ?? pile.contents.count(itemId), pile.contents.count(itemId), room);
      if (want > 0) {
        moved = pile.contents.remove(itemId, want);
        person.inventory.add(itemId, moved);
        // A carried container counts only after it is fitted into its named
        // slot; the pile is also how the player can reclaim one dropped later.
        equipContainer(person, itemId);
      }
    } else {
      for (const [id, stackCount] of pile.contents.entries()) {
        const room = Math.min(person.carryCapacity - person.carrying - moved,
          itemCapacityFor(person, this.config.carry, id) - person.inventory.count(id));
        if (room <= 0) break;
        const taken = pile.contents.remove(id, Math.min(stackCount, room));
        person.inventory.add(id, taken);
        equipContainer(person, id);
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
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, person, 'person');
    return consumeFood(person, itemId, this.time.tick, this.config.motivation.cravings, this.healthRng,
      this.world.waterKind !== undefined);
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
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, giver, 'person');
    this.assertCanonical(this.peopleById, receiver, 'person');
    const available = transferableUnits(giver, itemId);
    if (available < 1 && giver.inventory.count(itemId) >= 1) {
      this.lastRefusal = burningTorchRefusalText(); return 0;
    }
    const room = receiver.carryCapacity - receiver.carrying;
    if (room <= 0) {
      this.lastRefusal = t('{name} cannot carry any more', { name: receiver.name });
      return 0;
    }
    const moved = giver.inventory.remove(itemId, Math.min(room, count, available));
    if (moved === 0) return 0;
    receiver.inventory.add(itemId, moved);
    // Worn layers are ownership references too. Handing over the last copy
    // must clear the visible layer and any capacity it supplied immediately.
    reconcileCarry(giver, this.config.carry, (x, y, id, amount) => this.dropAt(x, y, id, amount));

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
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, person, 'person');
    this.assertCanonical(this.buildingsById, store, 'building');
    const available = transferableUnits(person, itemId);
    if (available < 1 && person.inventory.count(itemId) >= 1) {
      this.lastRefusal = burningTorchRefusalText(); return 0;
    }
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
    const moved = store.accept(person.inventory, itemId, Math.min(count, available));
    if (moved === 0) return 0;
    reconcileCarry(person, this.config.carry, (x, y, id, amount) => this.dropAt(x, y, id, amount));
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
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, visitor, 'person');
    this.assertCanonical(this.peopleById, owner, 'person');
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
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, person, 'person');
    this.assertCanonical(this.buildingsById, store, 'building');
    const access = this.mayUseBuilding(person, store);
    if (!access.ours) {
      this.lastRefusal = t('this store is not yours');
      return 0;
    }
    if (!store.complete || store.def.storage <= 0 || store.ruined) {
      this.lastRefusal = t('this is not a working store');
      return 0;
    }
    const room = Math.max(0, Math.min(person.carryCapacity - person.carrying,
      itemCapacityFor(person, this.config.carry, itemId) - person.inventory.count(itemId)));
    const available = isHerd(store.def) && itemId === 'meat'
      ? availableDraftHeads(store, this.peopleById, this.buildingsById)
      : store.store.count(itemId);
    if (available <= 0 && isHerd(store.def) && itemId === 'meat' &&
        reservedDraftHeads(store, this.peopleById, this.buildingsById) > 0) {
      this.lastRefusal = t('the nearby draft team is already working');
      return 0;
    }
    const moved = store.store.remove(itemId, Math.min(room, count, available));
    if (moved <= 0) {
      this.lastRefusal = room <= 0 ? t('{name} cannot carry any more', { name: person.name }) : t('there was nothing to take');
      return 0;
    }
    person.inventory.add(itemId, moved);
    equipContainer(person, itemId);
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

  /**
   * Where `person` could hold a feast right now, or null — M15 phase 38a.
   * The menu's question, answered by the rule `Brain` and `doFeast` use.
   */
  feastVenueFor(person: Person): Building | null {
    const household = person.householdId === null ? null : this.householdsById.get(person.householdId) ?? null;
    return feastVenue(person, household, this.bandSystem.chiefByBand.get(person.bandId) === person.id,
      this.buildings, this.buildingsById, this.time.day, this.templeOf(person.bandId));
  }

  /** A band's temple store, if it has one today — M15 phase 38b. */
  templeOf(bandId: number): Building | null {
    const id = this.templeByBand.get(bandId);
    const temple = id === undefined ? null : this.buildingsById.get(id) ?? null;
    return temple && temple.complete && !temple.ruined ? temple : null;
  }

  /**
   * The player's government sets the levy — M15 phase 38b. Refused, with the
   * reason in `lastRefusal`, unless `chief` leads their band and knows how to
   * tax; and only to one of `TAX_RATES`.
   */
  setTaxRate(chief: Person, rate: number): boolean {
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, chief, 'person');
    const band = this.bands.find(b => b.id === chief.bandId);
    if (!band || this.bandSystem.chiefByBand.get(band.id) !== chief.id) {
      this.lastRefusal = t('only the chief can set the levy');
      return false;
    }
    if (techPower(chief, 'taxation') <= 0) {
      this.lastRefusal = t('nobody here knows how to levy a tax');
      return false;
    }
    if (!(TAX_RATES as readonly number[]).includes(rate)) return false;
    band.taxRate = rate;
    return true;
  }

  /**
   * What a band still lacks to be a civilisation — M15 phase 38c, derived
   * fresh on every call (`Polity.civilisationLacks`). Empty when it is one.
   * Every adult of the band counts, captives included: what the people
   * holding a captive can make use of is what the captive knows.
   */
  civilisationLacks(bandId: number): string[] {
    // "Or several under a king" (M14 20c): a king's tributaries' knowledge
    // counts toward his civilisation — M15 phase 39d.
    const under = new Set([bandId, ...this.bandRelations.tributariesOf(bandId)]);
    const adults = this.people.filter(p => p.alive && !p.isChild && under.has(p.bandId));
    const chiefId = this.bandSystem.chiefByBand.get(bandId);
    return civilisationLacks(adults, chiefId === undefined ? null : this.peopleById.get(chiefId));
  }

  /** Whether a band is a civilisation today. See `civilisationLacks`. */
  isCivilisation(bandId: number): boolean {
    const band = this.bands.find(b => b.id === bandId);
    return !!band && !band.outcast && this.civilisationLacks(bandId).length === 0;
  }

  /**
   * A government declares a war or a peace — M15 phase 39a. The player's
   * chief through the Government section; NPC governments through
   * `BandSystem.considerStance`, which calls this too, so both are refused for
   * the same reasons. Refused, with the reason in `lastRefusal`, unless
   * `chief` leads their band and governs (`Polity.governs`). Peace with a
   * people that is itself a government needs its chief to accept; a people
   * with no government takes a peace offered, having no way to refuse it in
   * form. Declaring the stance two bands already have is a no-op.
   */
  declare(chief: Person, otherBandId: number, kind: 'war' | 'peace'): boolean {
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, chief, 'person');
    const band = this.bands.find(b => b.id === chief.bandId);
    const other = this.bands.find(b => b.id === otherBandId);
    if (!band || this.bandSystem.chiefByBand.get(band.id) !== chief.id) {
      this.lastRefusal = t('only the chief can speak for the band');
      return false;
    }
    if (!governs(chief)) {
      this.lastRefusal = t('nobody here has a law or a crown that could bind the band to a war or a peace');
      return false;
    }
    if (!other || other.outcast || other.id === band.id) return false;
    const current = this.bandRelations.stance(band.id, other.id);
    if (current === kind) return true;
    if (kind === 'peace') {
      const theirChiefId = this.bandSystem.chiefByBand.get(other.id);
      const theirChief = theirChiefId === undefined ? null : this.peopleById.get(theirChiefId) ?? null;
      if (theirChief && governs(theirChief) && !acceptsPeace(theirChief,
        this.bandRelations.standing(band.id, other.id))) {
        this.lastRefusal = t('the {band} will not hear of peace', { band: other.name });
        telemetry.count('peace_refused');
        return false;
      }
    }
    this.bandRelations.setStance(band.id, other.id, kind, this.time.day);
    telemetry.count(kind === 'war' ? 'war_declared' : 'peace_made');
    const text = kind === 'war'
      ? t('declared war on the {band}', { band: other.name })
      : t('made peace with the {band}', { band: other.name });
    chief.chronicle.push({ tick: this.time.tick, ageDays: chief.age, text, kind: 'milestone' });
    this.noteInsight(chief, text, kind === 'war' ? 'setback' : 'gain');
    return true;
  }

  /**
   * A chief submits their band to an enemy as its tributary — M15 phase 39d.
   * Any chief may, government or none: being beaten needs no law. Only to a
   * band this one is at war with, and only to a government, which is what
   * can hold a tributary. The player's chief through the Government section.
   */
  submit(chief: Person, overlordBandId: number): boolean {
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, chief, 'person');
    const band = this.bands.find(b => b.id === chief.bandId);
    const overlord = this.bands.find(b => b.id === overlordBandId);
    if (!band || this.bandSystem.chiefByBand.get(band.id) !== chief.id) {
      this.lastRefusal = t('only the chief can speak for the band');
      return false;
    }
    if (!overlord || overlord.outcast || this.bandRelations.stance(band.id, overlord.id) !== 'war') {
      this.lastRefusal = t('tribute is offered to a people you are at war with');
      return false;
    }
    const theirChiefId = this.bandSystem.chiefByBand.get(overlord.id);
    if (!governs(theirChiefId === undefined ? null : this.peopleById.get(theirChiefId))) {
      this.lastRefusal = t('the {band} have no government to take a tribute', { band: overlord.name });
      return false;
    }
    this.bandRelations.setStance(band.id, overlord.id, 'tributary', this.time.day, overlord.id);
    telemetry.count('tribute_submitted');
    const text = t('submitted to the {band}, and will pay them tribute', { band: overlord.name });
    chief.chronicle.push({ tick: this.time.tick, ageDays: chief.age, text, kind: 'milestone' });
    this.noteInsight(chief, text, 'setback');
    return true;
  }

  /**
   * Where tribute to `bandId` is carried: its temple, or else its largest
   * larder, ties by id. Null if it has nowhere to keep anything.
   */
  tributeStoreOf(bandId: number): Building | null {
    const temple = this.templeOf(bandId);
    if (temple) return temple;
    let best: Building | null = null;
    for (const building of this.buildings) {
      if (building.ownerBandId !== bandId || !isLarder(building)) continue;
      if (!best || building.def.storage > best.def.storage ||
        (building.def.storage === best.def.storage && building.id < best.id)) best = building;
    }
    return best;
  }

  /**
   * A sworn peace broken by `actor`'s deed against `victimBandId` — M15 phase
   * 39a. The peace ends; the two peoples' standing pays once; and everybody
   * who saw it thinks the less of the breaker's chief, who swore it. Nobody
   * else learns of it except by being told.
   */
  private breakPeace(actor: Person, victimBandId: number, witnesses: Person[]): void {
    this.bandRelations.clearStance(actor.bandId, victimBandId);
    this.bandRelations.add(actor.bandId, victimBandId, -PEACE_BROKEN_STANDING);
    telemetry.count('peace_broken');
    const chiefId = this.bandSystem.chiefByBand.get(actor.bandId);
    if (chiefId !== undefined) {
      for (const witness of witnesses) {
        if (witness.id === chiefId) continue;
        this.relationships.addDeed(witness.id, chiefId, -PEACE_BROKEN_REGARD, this.time.tick);
      }
    }
    const victims = this.bands.find(b => b.id === victimBandId)?.name ?? '';
    actor.chronicle.push({
      tick: this.time.tick, ageDays: actor.age,
      text: t('broke the peace with the {band}', { band: victims }), kind: 'did',
    });
  }

  /** Daily: which granary is each band's temple, from its chief's own head. */
  private refreshTemples(): void {
    this.templeByBand.clear();
    for (const band of this.bands) {
      if (band.outcast || band.chiefId === null) continue;
      const temple = templeOf(this.peopleById.get(band.chiefId), band.id, this.buildings);
      if (temple) {
        this.templeByBand.set(band.id, temple.id);
        telemetry.count('temple_days');
      }
    }
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
      wantAt: this.config.motivation.wantAt,
      tick: this.time.tick,
      ticksPerDay: this.config.time.ticksPerDay,
      carry: this.config.carry,
      pileHash: this.pileHash,
      buildingHash: this.buildingHash,
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
    // M15 phase 38b: a chief who keeps accounts writes the wrong down, and a
    // written debt does not lapse with the year (`pruneDebts`).
    if (keepsAccounts(chief)) {
      const owed = debtTo(accused, plaintiff.id);
      const grievance = plaintiff.grievances.find(g => g.againstId === accused.id);
      if (owed && !owed.recorded) telemetry.count('debt_recorded');
      if (owed) owed.recorded = true;
      if (grievance) grievance.recorded = true;
    }

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

    // The player's chief is the one judge the simulation must not replace.
    // Keep the case after the testimony has reached the chief; the UI can now
    // offer the four legal outcomes instead of silently choosing for the player.
    if (chief.isPlayer) {
      if (!this.pendingVerdicts.some(existing => existing.accusedId === told.accusedId &&
        existing.plaintiffId === told.plaintiffId)) this.pendingVerdicts.push(told);
      this.noteInsight(chief, t('A case awaits your verdict'), 'setback');
      telemetry.count('verdict_waiting_for_player');
      return 'verdict_waiting_for_player';
    }

    const verdict = judgeOwn(chief, plaintiff, accused, this.relationships, canPay);
    telemetry.count('verdict_' + verdict);
    if (judgesByLaw(chief)) telemetry.count('verdict_by_law');
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
    this.relationships.addDeed(accused.id, chief.id, -verdictGrudge(chief), this.time.tick);
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
    if (story) this.social.tellStory(teller, listener, story, this.peopleById, this.time.tick);
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
      // M15 phase 38b: a chief who keeps accounts keeps the docket too.
      const written = keepsAccounts(person) && this.bandSystem.chiefByBand.get(person.bandId) === person.id;
      if (person.docket.length > 0 && !written) {
        person.docket = person.docket.filter(c => this.time.tick - c.tick <= stale);
      }
      if (person.carriedDemand && this.time.tick - person.carriedDemand.tick > stale) person.carriedDemand = null;
    }
  }

  private noteStop(person: Person, action: string, reason: string): void {
    // Being held down is news to the player whatever they were doing — even
    // standing idle, when there was no order to stop — because from then on
    // their keys do nothing, and a character that will not move needs a
    // reason on screen.
    if (person.order === null && person.commitment === null &&
      !(person.isPlayer && (reason === 'restrained' || reason === 'bound' || reason === 'taken_captive'))) return;
    const autonomousCommitment = person.order === null && !person.isPlayer && person.commitment !== null;
    this.interruptions.push({
      personId: person.id, action, reason, recipe: person.targetRecipe,
      ...(autonomousCommitment ? { autonomousCommitment: true } : {}),
    });
    if (this.interruptions.length > this.interruptionCap) this.interruptions.shift();
    // An autonomous route has no player order to resume; retaining one here
    // would resurrect an errand the need policy just abandoned.
    if (autonomousCommitment) return;

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
      ...(person.saltDrinkTarget === true ? { saltDrinkTarget: true } : {}),
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
    if (ok && pending.saltDrinkTarget) person.saltDrinkTarget = true;
    // A refusal here is ordinary — the bush was stripped while they drank — and
    // must not surface as a refusal message the player never asked for.
    this.lastRefusal = null;
    telemetry.count(ok ? 'order_resumed' : 'resume_impossible');
  }

  /**
   * M15 phase 21c: a day passes over everybody's wounds. Whether a fresh one
   * festers is a roll on `healthRng`; the telemetry counts person-days of
   * wound and of festering by whether anybody had dressed it, which is what
   * `wounds-fester-untended` compares.
   */
  private woundsOfTheDay(): void {
    for (const person of this.people) {
      if (!person.alive) continue;
      if (person.conditions.length > 0 && poisonDaily(person.conditions)) {
        telemetry.count('poisoning_passed');
        person.chronicle.push({
          tick: this.time.tick, ageDays: person.age, kind: 'did', text: t('the sickness passed'),
        });
      }
      let hurt = false;
      for (const part of BODY_PARTS) {
        const w = person.body[part];
        if (w.wound === 'fresh' || w.wound === 'tended' || w.wound === 'infected') hurt = true;
        if (w.damage >= 0.1 && w.wound === 'fresh') telemetry.count('wound_days_untended');
        else if (w.damage >= 0.1 && w.wound === 'tended') telemetry.count('wound_days_tended');
      }
      if (!hurt) continue;
      const before = BODY_PARTS.map(p => person.body[p].wound);
      const events = woundsDaily(person.body, person.conditions, this.healthRng);
      for (const event of events) {
        const was = before[BODY_PARTS.indexOf(event.part)];
        if (event.kind === 'festered') {
          telemetry.count(was === 'tended' ? 'wound_festered_tended' : 'wound_festered_untended');
          person.chronicle.push({
            tick: this.time.tick, ageDays: person.age, kind: 'suffered',
            text: t('the wound of the {part} festered', { part: partWord(event.part) }),
          });
        } else {
          telemetry.count('infection_turned');
          person.chronicle.push({
            tick: this.time.tick, ageDays: person.age, kind: 'did',
            text: t('the fever from the {part} broke', { part: partWord(event.part) }),
          });
        }
      }
    }
  }

  /**
   * Person id to the building they slept under at the last midnight sample.
   * Transient: `shareTheHearth` clears and refills it on the same tick that
   * `LifeSystem.daily` reads it, so no checkpoint ever sees it half-built.
   */
  private readonly roofTonight = new Map<number, number>();

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
    // A midnight sample makes local illumination measurable without changing
    // decisions, consuming RNG, or querying lights once per person per tick.
    if (telemetry.isEnabled()) for (const person of this.people) {
      if (!person.alive) continue;
      telemetry.count('night_light_sum', this.lightAt(person.x, person.y));
      telemetry.count('night_light_samples');
    }
    // M15 phase 18: rebuilt from nothing every midnight, so a person who is
    // not asleep tonight is simply absent rather than carrying last night's roof.
    this.roofTonight.clear();
    for (const person of this.people) {
      if (!person.alive || person.action !== 'sleep') continue;
      const roof = roofOverSleeper(person, this.buildingsById);
      const sheltered = roof !== null;
      const household = person.householdId === null ? null : this.householdsById.get(person.householdId);
      if (sheltered && household?.homeBuildingId === roof!.id) {
        person.mood.add('belonging', 3, 'slept at home', this.time.tick);
      } else {
        const home = this.bands.find(band => band.id === person.bandId && !band.outcast);
        const distance = home ? Math.hypot(person.x - home.homeX, person.y - home.homeY) : 0;
        if (distance > this.config.motivation.nightRadius) {
          person.mood.add('belonging', -2, 'slept away from camp', this.time.tick);
        }
      }
      if (!sheltered) continue;
      this.roofTonight.set(person.id, roof.id);
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

  /**
   * Whether a fire burns within `r` of a point. Wildlife is more wary of a
   * torch carried nearby than of a fixed hearth: its avoidance radius doubles.
   */
  litNear(x: number, y: number, r: number): boolean {
    if (this.buildingHash.queryRadius(x, y, r + 2).some(b =>
      b.complete && !b.ruined && b.def.id === 'hearth' &&
      Math.hypot(b.centerX - x, b.centerY - y) <= r)) return true;
    return this.peopleHash.queryRadius(x, y, r * 2 + 1).some(person =>
      !!torchLight(person) && Math.hypot(person.x - x, person.y - y) <= r * 2);
  }

  /** A beast's bite landing on a person: the wound, the fear, and the telling. */
  private animalBites(animal: Animal, person: Person): void {
    const hit = animalBlow(animal, person, this.time.tick, this.healthRng, this.ecologyRng);
    if (hit.killed) telemetry.count('person_killed_by_' + animal.species);
    else if (person.alive) {
      // Run for the nearest fire, or failing that straight away from it. A
      // bitten person who stood and carried on would simply be bitten again.
      const fire = this.buildingHash.findNearest(person.x, person.y, 40,
        b => b.complete && !b.ruined && (b.def.id === 'hearth' || b.def.shelter > 0));
      const dx = person.x - animal.x;
      const dy = person.y - animal.y;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      const away = this.world.findWalkableNear(
        Math.round(person.x + dx / length * 14), Math.round(person.y + dy / length * 14), 6);
      const to = fire ? { x: fire.centerX, y: fire.centerY } : away;
      if (to) {
        person.action = 'flee';
        person.targetX = to.x;
        person.targetY = to.y;
        telemetry.count('fled_from_animal');
      }
    }
    // Everybody who saw it is shaken: a wolf at the edge of camp is news.
    for (const witness of this.peopleHash.queryRadius(person.x, person.y, 8)) {
      if (witness.id === person.id || !witness.alive) continue;
      witness.mood.add('security', -1.5, 'animal_attack', this.time.tick);
    }
  }

  /**
   * Herds crossing the edge of the land, M15 phase 23h (owner's note 8: animals
   * come and go "so that it shows when everything has been hunted"). Once a day,
   * per prey species:
   *
   * - **In**: while the land holds fewer of the species than it began with, a
   *   herd may arrive from beyond the edge, with a small daily chance, out of
   *   `edgeReserve`. A land at its founding count takes nobody.
   * - **Out**: while it holds far more (`EDGE_CROWDED` × its founding count),
   *   a herd may move off, and the reserve takes it back.
   * - The reserve itself creeps up (`EDGE_REFILL`), the neighbour's own births.
   *
   * Slow on purpose. A land hunted to nothing comes back at a few animals a
   * year, which is the difference between *noticing* one has hunted everything
   * and not noticing. Tamed and penned animals never leave.
   */
  private edgeTraffic(): void {
    const cap = this.config.world.edgeReserve;
    for (const species of PREY_SPECIES) {
      const roll = this.edgeRng.next();
      const herds = new Map<number, Animal[]>();
      let live = 0;
      for (const a of this.animals) {
        if (a.species !== species || !a.alive) continue;
        live++;
        const list = herds.get(a.herdId);
        if (list) list.push(a); else herds.set(a.herdId, [a]);
      }
      const founding = this.foundingFauna[species] ?? 0;
      this.edgeReserve[species] = Math.min(cap, (this.edgeReserve[species] ?? 0) + EDGE_REFILL);

      if (live > founding * EDGE_CROWDED) {
        if (roll >= EDGE_EXIT_CHANCE) continue;
        const leaving = [...herds.values()].filter(h => h.every(a => a.tamedBy === null));
        if (leaving.length === 0) continue;
        const herd = leaving[Math.floor(this.edgeRng.next() * leaving.length)]!;
        for (const a of herd) this.removeAnimal(a, 'animal_left_by_edge');
        this.edgeReserve[species] = Math.min(cap, (this.edgeReserve[species] ?? 0) + herd.length);
        telemetry.count('herd_left_by_edge');
        continue;
      }

      if (live >= founding || roll >= this.config.world.edgeEntryChance) continue;
      const def = SPECIES_DEFS[species];
      const reserve = Math.floor(this.edgeReserve[species] ?? 0);
      const size = Math.min(reserve, Math.max(1, Math.round(def.herdSize * this.edgeRng.range(0.6, 1.4))));
      if (size < 1) continue;
      const entry = this.edgeEntry();
      if (!entry) continue;
      const herdId = this.ids.claimGroupAtOrAfter('herd', this.nextEdgeHerd);
      this.nextEdgeHerd = herdId + 1;
      for (let i = 0; i < size; i++) {
        const spot = this.world.findWalkableNear(
          Math.round(entry.x + this.edgeRng.range(-2, 2)),
          Math.round(entry.y + this.edgeRng.range(-2, 2)), 4) ?? entry;
        const animal = new Animal(species, spot.x, spot.y, herdId, this.edgeRng, this.ids);
        this.animals.push(animal);
        this.animalsById.set(animal.id, animal);
      }
      this.edgeReserve[species] = (this.edgeReserve[species] ?? 0) - size;
      telemetry.count('herd_entered_by_edge');
      telemetry.count('animal_entered_by_edge', size);
    }
  }

  /** A walkable tile near the rim of the map, on a side picked by the edge dice. */
  private edgeEntry(): { x: number; y: number } | null {
    for (let attempt = 0; attempt < 12; attempt++) {
      const side = this.edgeRng.int(0, 3);
      const along = this.edgeRng.next();
      const x = side < 2 ? along * (this.world.width - 1) : side === 2 ? 1 : this.world.width - 2;
      const y = side < 2 ? (side === 0 ? 1 : this.world.height - 2) : along * (this.world.height - 1);
      const spot = this.world.findWalkableNear(Math.round(x), Math.round(y), 10);
      if (!spot) continue;
      const biome = this.world.biomeAt(spot.x, spot.y);
      if (biome === 'grass' || biome === 'forest') return spot;
    }
    return null;
  }

  /** Takes a killed animal out of the world and its index. */
  private removeAnimal(animal: Animal, counter = 'animal_killed'): void {
    this.animalsById.delete(animal.id);
    this.animals = this.animals.filter(a => a.id !== animal.id);
    telemetry.count(counter);
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
        // `index()` wraps a negative x into the row above, so a camp at the west edge "saw" the river at the east edge of the
        // row before it: a band was placed 117 tiles from water, convinced it had a drink beside it. Looking outside the map is
        // refused on a map start only; on the classic island it would move camps of seeds already saved (docs/bugs.md).
        if (this.geographicStart && !this.world.inBounds(x + dx, y + dy)) continue;
        if (this.world.isFreshWater(x + dx, y + dy)) return true;
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
      edge?: ComarcaEdge;
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
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, person, 'person');
    if (!person.alive) {
      if (action.startsWith('equip_')) this.lastRefusal = t('That owner is no longer alive');
      return false;
    }
    if (!canWalk(person, this.config.childhood)) {
      this.lastRefusal = t('babies cannot act on their own');
      return false;
    }
    const equipmentSlot = manualEquipSlot(action);
    if (action.startsWith('equip_')) {
      const refusal = !equipmentSlot
        ? null
        : manualEquipRefusal(person, target.itemId ?? '', equipmentSlot);
      if (!equipmentSlot) {
        this.lastRefusal = t('That is not an equipment slot');
        return false;
      }
      if (refusal) {
        this.lastRefusal = manualEquipReasonText(refusal);
        return false;
      }
    }
    if (action === 'wear_garment' || action === 'take_off_garment') {
      const refusal = manualGarmentRefusal(person, target.itemId ?? '', action);
      if (refusal) {
        this.lastRefusal = manualGarmentReasonText(refusal);
        return false;
      }
    }
    if (action === 'light_torch') {
      const refusal = torchIgnitionRefusal(person, target.itemId ?? '', this.hearthNear(person.x, person.y, 2));
      if (refusal) { this.lastRefusal = torchRefusalText(refusal); return false; }
    }
    if (action === 'place_furniture') {
      const host = target.buildingId === undefined ? null : this.buildingsById.get(target.buildingId) ?? null;
      const refusal = this.furniturePlacementRefusal(person, host, target.itemId ?? '');
      if (refusal) { this.lastRefusal = refusal; return false; }
    }
    // M15 phase 19b: the heavy work is refused her in the last third of a
    // pregnancy, with the reason. Before any state is touched, so a refused
    // order leaves her at whatever she was doing — the same seam every other
    // order shares, which is why a chief's command, the player's menu and a
    // resumed job are all held to it by this one check. `ActionSystem.execute`
    // holds what she was already doing when the third begins.
    // Striking back at whoever is attacking her is self-defence, not the
    // heavy work (owner, 2026-10-07), and is let through at half the blow.
    if (tooHeavyForHer(person, action,
      fightsBack(person, target.personId ?? null, id => this.peopleById.get(id), this.time.tick))) {
      telemetry.count('order_too_heavy_with_child');
      this.lastRefusal = t('she is too heavy with child for that');
      return false;
    }

    // An edge order names a direction, not a point in another Simulation. All
    // preflight runs before clearTarget so a refused trip preserves the old job.
    if (action === 'leave_comarca' || action === 'scout' || (action === 'propose' && target.recipeId === 'migration')) {
      const edge = target.edge ?? (target.x !== undefined && target.y !== undefined
        ? edgeOfTile(this.world, Math.floor(target.x), Math.floor(target.y)) : null);
      if (!edge || !this.comarcaTravel) { this.lastRefusal = t('This island has no neighbouring comarca'); return false; }
      const reason = this.comarcaTravel.refusal(person, edge, action === 'scout');
      if (reason) { this.lastRefusal = reason; return false; }
      const point = approachComarcaEdge(this.world, person, edge);
      if (!point) { this.lastRefusal = t('There is no walkable route to that edge'); return false; }
      target = { ...target, ...point, edge };
    }
    if (action === 'follow_me') {
      const leader = target.personId === undefined ? null : this.peopleById.get(target.personId);
      if (!leader?.alive || leader.id === person.id || leader.bandId !== person.bandId) {
        this.lastRefusal = t('You can only follow a living member of your band'); return false;
      }
    }

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
        if (RECIPES[target.recipeId]?.requiresFire && !this.hearthNear(named.centerX, named.centerY, 3)) {
          return this.cancelOrder(person, t('You need a lit hearth nearby'));
        }
        if (RECIPES[target.recipeId]?.requiresSaltWater && !saltSourceNear(this.world, named.x, named.y, named.def.width, named.def.height)) {
          return this.cancelOrder(person, t('You need salt water nearby'));
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

    // M15 phase 20 (owner, 2026-09-30): the baby in their arms, laid down on
    // the ground or in a shelter the player clicked. Before the person branch,
    // which would otherwise take the baby for the target and walk to it.
    if (action === 'put_down_baby') {
      const baby = target.personId === undefined ? undefined : this.peopleById.get(target.personId);
      if (!baby?.alive || baby.carriedBy !== person.id) {
        return this.cancelOrder(person, t('they are not holding that baby'));
      }
      const building = target.buildingId === undefined ? undefined : this.buildingsById.get(target.buildingId);
      const spot = building ? { x: building.centerX, y: building.centerY }
        : target.x !== undefined && target.y !== undefined ? { x: target.x, y: target.y }
        : { x: person.x, y: person.y };
      if (!this.world.isWalkable(Math.round(spot.x), Math.round(spot.y))) {
        return this.cancelOrder(person, t('they cannot walk there'));
      }
      if (!this.world.sameRegion(person.x, person.y, spot.x, spot.y)) {
        return this.cancelOrder(person, t('there is no way across'));
      }
      person.targetPersonId = baby.id;
      if (building) person.targetBuildingId = building.id;
      person.targetX = spot.x;
      person.targetY = spot.y;
      return true;
    }

    if (target.personId !== undefined) {
      const other = this.peopleById.get(target.personId);
      if (!other || !other.alive) return this.cancelOrder(person, t('they are gone'));
      if (action === 'carry_baby' && canWalk(other, this.config.childhood)) {
        return this.cancelOrder(person, t('they walk by themselves now'));
      }
      if (action === 'carry_baby' && person.armsTaken >= 2) {
        return this.cancelOrder(person, t('their arms are already full'));
      }
      if (action === 'nurse' && !mayNurse(person, other, this.peopleById, this.config.childhood)) {
        return this.cancelOrder(person, t('she has no milk for this baby'));
      }
      person.targetPersonId = other.id;
      person.targetX = other.x;
      person.targetY = other.y;
      // A proposal is the one social action aimed at both a person and a
      // project. The ordinary person branch returns here, so carry the site
      // through before it can be lost.
      if (action === 'propose' && target.buildingId !== undefined) {
        const site = this.buildingsById.get(target.buildingId);
        if (!site || site.complete || site.ownerBandId !== person.bandId || site.sponsorId !== person.id) {
          return this.cancelOrder(person, t('that project is no longer available'));
        }
        person.targetBuildingId = site.id;
      }
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
      if (this.time.tick - building.plannedTick < 200 &&
          ['build', 'haul', 'chop', 'gather_for_site', 'dig', 'pile'].includes(action)) {
        building.first200Ordered.add(person.id);
      }
      // M15 phase 26c: an earthwork is worked with the earth verbs, and each
      // refusal is a sentence rather than a walk that ends in nothing.
      if (action === 'dig' || action === 'pile') {
        const why = this.earthworkOrderRefusal(person, building);
        if (why) return this.cancelOrder(person, why);
      } else if (building.def.earthwork && (action === 'build' || action === 'haul')) {
        return this.cancelOrder(person, t('that is dug, not built'));
      }
      person.targetBuildingId = building.id;
      person.targetX = building.centerX;
      person.targetY = building.centerY;
      if (action === 'sow' && target.itemId === 'iron_plough') {
        const refusal = this.ploughOrderRefusal(person, building);
        if (refusal) return this.cancelOrder(person, refusal);
        const pen = findDraftPen(person, this.buildingHash, this.peopleById, this.buildingsById);
        if (!pen || !claimDraftTeam(person, pen, this.peopleById, this.buildingsById))
          return this.cancelOrder(person, t('the nearby draft team is already working'));
      }
      return true;
    }
    if (target.nodeId !== undefined) {
      const node = this.nodesById.get(target.nodeId);
      // Empty is refused only where they can see it is (M15 phase 20): out
      // of sight they go and find out, as `ActionSystem.doHarvest` does.
      if (!node || (node.depleted &&
          Math.hypot(node.x - person.x, node.y - person.y) <= this.config.sightRadius)) {
        return this.cancelOrder(person, t('there is nothing left there'));
      }
      if (node.def.groundLevel && this.isBuried(node.x, node.y)) {
        return this.cancelOrder(person, t('it is under the snow'));
      }
      // M15 phase 37: ore is taken out of a hill only by somebody who knows how.
      // Refused here, with the reason, rather than walked to and abandoned.
      if (!canWork(person, node.kind)) {
        return this.cancelOrder(person, t('they do not know how to mine'));
      }
      person.targetNodeId = node.id;
      person.targetX = node.x;
      person.targetY = node.y;
      return true;
    }
    if (target.x !== undefined && target.y !== undefined) {
      if (action === 'boat') {
        if (!canUseBoat(person)) return this.cancelOrder(person, person.inventory.has('logboat')
          ? t('you need logboat knowledge to use it') : person.inventory.has('raft')
            ? t('you need cordage knowledge to use the reed raft') : t('a reed raft or logboat is needed'));
        if (!sameBoatRouteFor(person, this.world, person.x, person.y, target.x, target.y))
          return this.cancelOrder(person, t('the boat cannot reach that place'));
        person.targetX = target.x; person.targetY = target.y; return true;
      }
      if (action === 'swim') {
        const reason = swimRefusal(person, this.world, target.x, target.y, this.config.world.drownAt);
        if (reason) return this.cancelOrder(person, swimRefusalText(reason));
        person.targetX = target.x;
        person.targetY = target.y;
        return true;
      }
      // M15 phase 23b: refused where they can see it is pointless, with the
      // reason, rather than walked to and abandoned.
      if (action === 'cut_grass') {
        if (grassBuried(this.snowDepth)) return this.cancelOrder(person, t('it is under the snow'));
        if (this.world.grassAt(target.x, target.y) < CUT_ABOVE) {
          return this.cancelOrder(person, t('the grass is too short to cut'));
        }
      }
      // M15 phase 24: planting is refused where the tree could not stand, with
      // the reason, rather than walked to and abandoned.
      if (action === 'plant') {
        const why = this.plantOrderRefusal(person, target.x, target.y);
        if (why) return this.cancelOrder(person, why);
      }
      // M15 phase 26: moving earth is refused where it is pointless, with the
      // reason, rather than walked to and abandoned.
      if (action === 'dig' || action === 'dig_mud' || action === 'pile') {
        if (action === 'dig_mud' && !canDigBankMud(this.world, target.x, target.y))
          return this.cancelOrder(person, t('mud can only be dug on a freshwater bank'));
        const biome = this.world.biomeAt(target.x, target.y);
        if (biome === 'water' || biome === 'rock') {
          return this.cancelOrder(person, action !== 'pile'
            ? t('the ground there is too hard to dig')
            : t('there is nowhere to put earth there'));
        }
        // Ground under a building is not the digger's to move: it would
        // undermine the walls, and a flooded tile would strand the roof.
        if (this.buildingAt(target.x, target.y)) {
          return this.cancelOrder(person, t('there is a building on that ground'));
        }
        if (action !== 'pile') {
          if (!digTool(person)) return this.cancelOrder(person,
            digToolFailure(person) === 'dont_know_digging_tool'
              ? t('they do not know how to use their digging tools') : t('they have nothing to dig with'));
          if (this.world.depthDug(target.x, target.y) >= DIG_TO - 1e-9) {
            return this.cancelOrder(person, t('the hole is already as deep as a person can climb out of'));
          }
        } else {
          if (person.inventory.count('earth') <= 0) return this.cancelOrder(person, t('they are carrying no earth'));
          if (-this.world.depthDug(target.x, target.y) >= PILE_TO - 1e-9) {
            return this.cancelOrder(person, t('the heap there is as high as it will stand'));
          }
        }
      }
      // Drinking is aimed at water, and water is not somewhere you can stand.
      // Right-clicking a lake used to offer Drink and then refuse it without a
      // word, because the order tried to walk onto the tile that was clicked.
      // Send them to the nearest bank instead.
      if (action === 'drink') {
        // AI only sees `freshShoreHash`. A deliberately clicked salt
        // tile takes the separate path so the player can learn that the sea is
        // harmful by trying it; it is never a candidate in Brain.findWater.
        const saltTarget = this.world.isSaltWater(target.x, target.y) ||
          (!this.world.isFreshWater(target.x, target.y) && this.world.isSaltShore(target.x, target.y) &&
            !this.world.isFreshShore(target.x, target.y));
        if (saltTarget) person.saltDrinkTarget = true;
        const banks = saltTarget ? this.saltShoreHash : this.freshShoreHash;
        const bank = banks.findNearest(target.x, target.y, 24,
          tile => this.world.sameRegion(person.x, person.y, tile.x, tile.y));
        if (!bank) return this.cancelOrder(person, t('no bank they can reach from here'));
        person.targetX = bank.x;
        person.targetY = bank.y;
        return true;
      }
      if (!this.world.isWalkable(target.x, target.y)) {
        return this.cancelOrder(person, t('they cannot walk there'));
      }
      if (!this.world.sameRegion(person.x, person.y, target.x, target.y) &&
          !(canUseBoat(person) && sameBoatRouteFor(person, this.world, person.x, person.y, target.x, target.y))) {
        if (!this.world.sameSwimRegion(person.x, person.y, target.x, target.y)) {
          return this.cancelOrder(person, t('there is no way across'));
        }
        const reason = swimRouteRefusal(person, this.config.world.drownAt);
        if (reason) return this.cancelOrder(person, swimRefusalText(reason));
      }
      person.targetX = target.x;
      person.targetY = target.y;
      return true;
    }
    // Actions like 'rest' and 'eat' happen where you stand.
    return true;
  }

  /** The radial menu and explicit sow order use the same physical-team gate. */
  ploughOrderRefusal(person: Person, field: Building): string | null {
    if (!field.def.field || !field.crop || !field.complete || field.ruined) return t('that is not a working field');
    if (techPower(person, 'farming') <= 0 || techPower(person, 'ploughshare') <= 0)
      return t('you do not know how to use an iron plough');
    if (!person.inventory.has('iron_plough')) return t('an iron plough is required');
    if (!hasSeedContainer(person)) return t('a basket or another food container is needed for seed');
    if (person.inventory.count('grain') < SOW_SEED || itemCapacityFor(person, this.config.carry, 'grain') < SOW_SEED)
      return t('a pair of draft animals and room for seed are needed');
    if (!field.crop.isFallow) return t('something is growing here already');
    if (findDraftPen(person, this.buildingHash, this.peopleById, this.buildingsById, field)) return null;
    return hasBusyDraftPen(person, this.buildingHash, this.peopleById, this.buildingsById, field)
      ? t('the nearby draft team is already working')
      : t('there is no available pair of draft animals nearby');
  }
  /**
   * Why this person cannot set a tree at this tile, or null. The wording lives
   * here once, so the menu (`ActionCatalog`) and the order say the same thing.
   */
  plantOrderRefusal(person: Person, x: number, y: number): string | null {
    if (techPower(person, 'arboriculture') <= 0) return t('they do not know how to plant a tree');
    if (!plantable(person)) return t('they have no fruit to plant');
    if (this.time.growth <= 0) return t('nothing would take root in this season');
    const refusal = plantingRefusal({ world: this.world, treeHash: this.treeHash,
      built: (bx, by) => this.buildingAt(bx, by) !== null }, Math.floor(x), Math.floor(y));
    return refusal === null ? null : plantRefusalText(refusal);
  }

  /**
   * Why this person cannot be put to work on this earthwork, or null. Shared
   * by the player's order and `Brain`'s scorer through `earthworkWorkable`, so
   * the menu, the order and the AI refuse for the same reasons.
   */
  earthworkOrderRefusal(person: Person, site: Building): string | null {
    if (!site.earth) return t('that is not an earthwork');
    if (site.complete) return t('that earthwork is finished');
    if (!site.def.earthwork && site.earthDone) return t('it is already dug');
    if (!this.world.sameRegion(person.x, person.y, site.centerX, site.centerY) &&
      !site.earth.some(tile => this.world.sameRegion(person.x, person.y, tile.x, tile.y))) {
      return t('there is no way across');
    }
    const lacks = earthworkWorkRefusal(person, site);
    return lacks === 'dont_know_digging_tool' ? t('they do not know how to use their digging tools')
      : lacks === 'no_digging_tool' ? t('they have nothing to dig with')
      : null;
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
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, author, 'person');
    const def = INSCRIPTIONS[form];
    if (!def) return null;
    const tx = Math.round(x);
    const ty = Math.round(y);
    if (!this.world.isWalkable(tx, ty)) return null;

    const made = new Inscription(def, tx, ty, author, this.time.tick, this.ids);
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
    this.assertExecutionAuthority();
    for (const person of this.people) person.skillGain = this.config.learning.skillGain;
  }

  // -------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------

  /** Designs currently placeable, given what the world knows how to do. */
  availableDesigns(): BuildingDef[] {
    return Object.values(BUILDINGS).filter(
      def => !def.furniture && !def.earthwork?.turnOf &&
        (def.requiresTech === null || this.knownTech.has(def.requiresTech))
    );
  }

  /**
   * Designs that exist but are out of reach for want of knowledge. Shown in the
   * build menu greyed out, so the progression is visible from the first hut
   * rather than appearing from nowhere in a later age.
   */
  lockedDesigns(): BuildingDef[] {
    return Object.values(BUILDINGS).filter(
      def => !def.furniture && def.requiresTech !== null && !this.knownTech.has(def.requiresTech)
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
    return Object.values(RECIPES).filter(recipe => recipeTechPower(person, recipe) > 0);
  }

  /** Recipes that exist but are out of this person's reach, for the greyed line. */
  lockedRecipes(person: Person): RecipeDef[] {
    return Object.values(RECIPES).filter(recipe => recipeTechPower(person, recipe) <= 0);
  }

  /** Shared order/menu reason for placing carried furniture in a household home. */
  furniturePlacementRefusal(person: Person, host: Building | null, itemId: string): string | null {
    const furniture = BUILDINGS[itemId];
    const homeId = person.householdId === null
      ? null : this.householdsById.get(person.householdId)?.homeBuildingId ?? null;
    if (!host?.def.interior || !host.complete || host.ruined || homeId !== host.id) {
      return t('That is not your household’s home');
    }
    if (!houseInteriorContains(host, person.x, person.y)) {
      return t('You must be inside the house to place furniture');
    }
    if (!furniture?.furniture || !ITEMS[itemId]?.furniture) return t('That is not furniture');
    if (furniture.requiresTech && !person.knownTech.has(furniture.requiresTech)) {
      return t('Nobody here knows how to make that');
    }
    if (person.inventory.count(itemId) < 1) return t('You are not carrying that furniture');
    if (!this.furnitureSpot(host)) return t('There is no room inside the house');
    return null;
  }

  private furnitureSpot(host: Building): { x: number; y: number } | null {
    for (const tile of houseInteriorTiles(host)) {
      const x = Math.floor(tile.x), y = Math.floor(tile.y);
      // The hash indexes a building's integer origin, not its tile center.
      // A zero-radius center query misses every piece and stacks all beds.
      const occupied = this.buildingHash.queryRadius(x, y, 0)
        .some(building => building.hostId === host.id && building.x === x && building.y === y);
      if (this.world.isWalkable(x, y) && !occupied) return { x, y };
    }
    return null;
  }

  private placeFurniture(person: Person, host: Building, itemId: string): Building | null {
    if (this.furniturePlacementRefusal(person, host, itemId)) return null;
    const tile = this.furnitureSpot(host);
    const def = BUILDINGS[itemId];
    if (!tile || !def) return null;
    const furniture = new Building(def, tile.x, tile.y, host.ownerBandId, this.ids);
    furniture.hostId = host.id;
    furniture.sponsorId = person.id;
    furniture.plannedTick = this.time.tick;
    this.buildings.push(furniture);
    this.buildingsById.set(furniture.id, furniture);
    this.buildingHash.insert(furniture);
    telemetry.count('furniture_placed');
    return furniture;
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
        // A ford is traversable, but it cannot hold a hut or a dry earthwork.
        // Shore installations retain their existing water-edge placement rule.
        if (!this.world.isWalkable(x + dx, y + dy) ||
            (def.placement !== 'shore' && this.world.isWater(x + dx, y + dy))) {
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
    if (def.earthwork) {
      const why = this.earthworkRefusal(def, x, y);
      if (why) return why;
    }
    if (def.placement === 'shore' && !this.touchesShore(def, x, y)) {
      return t('{thing} has to sit at the water\u2019s edge', { thing: aNoun(def.label.toLowerCase()) });
    }
    if (def.placement === 'salt_shore' && !saltSourceNear(this.world, x, y, def.width, def.height)) {
      return t('You need salt water nearby');
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
   * Why an earthwork cannot be marked out here, or null — M15 phase 26c, the
   * refusals that are about the ground rather than about something standing on
   * it. Tiles that cannot take a spade (rock, water) are already refused by the
   * walkable test in `placementRefusal`, since every footprint tile has to be
   * land; what is left is the two designs that must start at water and the
   * terrace, which is for a slope and means nothing on the flat.
   */
  private earthworkRefusal(def: BuildingDef, x: number, y: number): string | null {
    const spec = def.earthwork!;
    if (spec.water) {
      const tiles = earthworkTiles(spec, x, y, def.width, def.height, this.world);
      const wet = spec.water === 'ring'
        ? tiles.some(tile => this.world.isShore(tile.x, tile.y))
        : this.world.isShore(tiles[0]!.x, tiles[0]!.y);
      if (!wet) {
        return spec.water === 'ring'
          ? t('{thing} has to touch the water somewhere', { thing: aNoun(def.label.toLowerCase()) })
          : t('{thing} has to start at the water’s edge', { thing: aNoun(def.label.toLowerCase()) });
      }
    }
    if (spec.slope !== undefined &&
      slopeAcross(spec, x, y, def.width, def.height, this.world) < spec.slope) {
      return t('the ground there is too level for {thing}', { thing: aNoun(def.label.toLowerCase()) });
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
  place(
    defId: string, x: number, y: number, bandId: number,
    sponsorId?: number | null, playerPlaced = false
  ): Building | null {
    this.assertExecutionAuthority();
    const def = BUILDINGS[defId];
    if (!def || def.furniture) return null;
    if (def.requiresTech !== null && !this.knownTech.has(def.requiresTech)) return null;
    if (!this.canPlace(def, x, y)) return null;

    const building = new Building(def, x, y, bandId, this.ids);
    const plan = def.earthwork ?? def.dig;
    if (plan) building.earth = earthworkTiles(plan, x, y, def.width, def.height, this.world);
    building.plannedTick = this.time.tick;
    building.playerPlaced = playerPlaced;
    building.sponsorId = sponsorId !== undefined
      ? sponsorId
      : this.player?.bandId === bandId ? this.player.id : null;
    this.buildings.push(building);
    this.buildingsById.set(building.id, building);
    this.buildingHash.insert(building);
    telemetry.count('site_placed');
    if (def.earthwork) telemetry.count('earthwork_placed');
    return building;
  }

  /** A queued local case can outlive either party or their membership. */
  private verdictCaseAvailable(told: Case): boolean {
    const accused = this.peopleById.get(told.accusedId);
    const plaintiff = this.peopleById.get(told.plaintiffId);
    return !!accused?.alive && !!plaintiff?.alive &&
      told.accusedBandId === told.plaintiffBandId &&
      accused.bandId === told.accusedBandId && plaintiff.bandId === told.plaintiffBandId;
  }

  /**
   * The overlay must not get stuck on a dead party, or offer powers to a
   * deposed chief. Validate here as well as on click: a case may change while
   * the player reads it. Other bands' cases stay available for their chief.
   */
  pendingVerdictFor(chief: Person): Case | null {
    if (!chief.isPlayer || !chief.alive ||
      this.bandSystem.chiefByBand.get(chief.bandId) !== chief.id) return null;
    for (let i = 0; i < this.pendingVerdicts.length;) {
      const told = this.pendingVerdicts[i]!;
      if (!this.verdictCaseAvailable(told)) {
        this.pendingVerdicts.splice(i, 1);
        if (told.plaintiffBandId === chief.bandId) {
          this.noteInsight(chief, t('The case was closed: a party died or left the band'), 'setback');
        }
      } else i++;
    }
    return this.pendingVerdicts.find(told => told.plaintiffBandId === chief.bandId) ?? null;
  }

  /** Resolves a local case explicitly chosen by the player-chief. */
  resolveVerdict(chief: Person, told: Case, verdict: 'order' | 'shame' | 'dismiss' | 'exile'): boolean {
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, chief, 'person');
    if (!chief.isPlayer || !chief.alive || this.bandSystem.chiefByBand.get(chief.bandId) !== chief.id ||
      told.plaintiffBandId !== chief.bandId || told.accusedBandId !== chief.bandId) {
      this.lastRefusal = t('Only the current chief can judge this case');
      return false;
    }
    const index = this.pendingVerdicts.findIndex(caseFile =>
      caseFile.accusedId === told.accusedId && caseFile.plaintiffId === told.plaintiffId &&
      caseFile.tick === told.tick && caseFile.kind === told.kind &&
      caseFile.plaintiffBandId === told.plaintiffBandId && caseFile.accusedBandId === told.accusedBandId);
    if (index < 0 || !this.verdictCaseAvailable(this.pendingVerdicts[index]!)) {
      this.lastRefusal = t('This case is no longer available for judgment');
      return false;
    }
    const accused = this.peopleById.get(told.accusedId);
    const plaintiff = this.peopleById.get(told.plaintiffId);
    if (!accused || !plaintiff || !accused.alive || !plaintiff.alive) return false;
    this.pendingVerdicts.splice(index, 1);
    if (verdict === 'order') this.orderAmends(chief, accused, plaintiff);
    else if (verdict === 'shame') this.shame(chief, accused, plaintiff);
    else if (verdict === 'exile') {
      const band = this.bands.find(candidate => candidate.id === chief.bandId);
      if (!band) return false;
      const size = this.people.filter(person => person.alive && person.bandId === band.id).length;
      this.exile(accused, band, size);
      telemetry.count('verdict_exile');
    } else {
      this.relationships.addDeed(plaintiff.id, chief.id, -DISMISSED_GRUDGE, this.time.tick);
      telemetry.count('verdict_dismiss');
    }
    telemetry.count('verdict_chosen_by_player');
    return true;
  }

  /**
   * Cancels a player-owned site and returns its delivered materials to the
   * ground. A site is not a completed building, so demolishing it would be a
   * different action and would incorrectly make this a property shortcut.
   */
  cancelConstruction(person: Person, building: Building): boolean {
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, person, 'person');
    this.assertCanonical(this.buildingsById, building, 'building');
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
   * Those measurements held preservation back in M8. M15 now ships physical
   * drying and smoking recipes whose products have their own spoilTicks;
   * knowing the technology never gives raw food a magical pack multiplier.
   * Default activation still awaits the owner's deferred cohort measurement.
   
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

    const sweep = (inventory: Inventory, keeps: number, source: 'carried' | 'store' | 'site' | 'pile',
      where: { x: number; y: number }, carrier?: Person, building?: Building): void => {
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
        if (count > 0) {
          telemetry.count(prefix + itemId, Math.round(count));
          // Preserve fractional dry-run estimates in the source ledger: daily
          // rounding can hide every loss in several small carried stacks.
          telemetry.count(prefix + source, count);
          telemetry.count(prefix + source + '_' + itemId, count);
          telemetry.count(prefix + source + '_nutrition', count * (ITEMS[itemId]?.nutrition ?? 0));
          if (!dry) {
            // A dry estimate is not an event anyone experienced. Nor may an
            // onlooker inspect packed food: only a visible hand or public pile
            // exposes the loss. Store members learn while actually present.
            const fraction = Math.min(1, count / Math.max(count, inventory.count(itemId) + count));
            carrier?.beliefs.learn('spoils:' + itemId, fraction, 0.3, 'own', this.time.tick);
            if (carrier) telemetry.count('spoilage_learned_own');
            for (const observer of this.peopleHash.queryRadius(where.x, where.y, this.config.sightRadius)) {
              if (!observer.alive || observer === carrier ||
                Math.hypot(observer.x - where.x, observer.y - where.y) > this.sightOf(observer)) continue;
              const household = observer.householdId === null ? null : this.householdsById.get(observer.householdId);
              const ownsStore = building && (household?.homeBuildingId === building.id ||
                building.sponsorId === observer.id);
              const visibleHand = carrier && (carrier.equipment.left?.item === itemId || carrier.equipment.right?.item === itemId);
              if (!ownsStore && source !== 'pile' && !visibleHand) continue;
              // A visible loss teaches that spoilage happens, without revealing
              // the private fraction of somebody else's packed stack.
              observer.beliefs.learn('spoils:' + itemId, ownsStore ? fraction : 1, ownsStore ? 0.3 : 0.15,
                ownsStore ? 'own' : 'seen', this.time.tick);
              telemetry.count(ownsStore ? 'spoilage_learned_own' : 'spoilage_learned_seen');
            }
          }
        }
      }
    };

    // A pack keeps raw food no better than the open air. Preservation changes
    // the actual food item, not a carrier-wide multiplier for knowing a design.
    for (const person of this.people) {
      if (!person.alive) continue;
      sweep(person.inventory, 1, 'carried', person, person);
    }
    for (const building of this.buildings) {
      const keeps = building.def.preserves ?? 1;
      sweep(building.store, keeps, 'store', { x: building.centerX, y: building.centerY }, undefined, building);
      // Materials on a site rot too, and a site is exactly where food should
      // not be: nothing delivers berries to a hut, so this is almost always a
      // no-op and is here so that the one day something does, it behaves.
      sweep(building.delivered, keeps, 'site', { x: building.centerX, y: building.centerY }, undefined, building);
    }
    // Dropped goods keep no better than a pack.
    for (const pile of this.piles) sweep(pile.contents, 1, 'pile', pile);
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
        Math.round(building.centerX), Math.round(building.centerY), null, this.time.tick, this.ids
      );
      pile.contents.add(itemId, taken);
      this.piles.push(pile);
      this.pilesById.set(pile.id, pile);
    }
    this.pileHash.rebuild(this.piles);

    this.buildingsById.delete(building.id);
    this.buildings = this.buildings.filter(b => b.id !== building.id);
    this.buildingHash.rebuild(this.buildings);
  }

  /**
   * M15 phase 24: a planted tree enters the world exactly as a seeded one does
   * (`ForestSystem.daily`'s births), through the same arrays and indexes, so
   * nothing downstream can tell the difference. Refused where the ground will
   * not take it - the same `plantingRefusal` the action checked, because two
   * people can reach one tile in the same tick.
   */
  plantTree(species: TreeSpecies, x: number, y: number): Tree | null {
    if (plantingRefusal({ world: this.world, treeHash: this.treeHash,
      built: (bx, by) => this.buildingAt(bx, by) !== null }, x, y)) return null;
    const tree = new Tree(species, x, y, 0, this.time.daysPerYear, this.ids);
    this.trees.push(tree);
    this.treesById.set(tree.id, tree);
    this.treeHash.insert(tree);
    return tree;
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
    this.assertExecutionAuthority();
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
    this.assertExecutionAuthority();
    this.assertCanonical(this.peopleById, person, 'person');
    if (this.player && this.player.id !== person.id) {
      this.player.isPlayer = false;
      // The character handed back to the brain stops being the one the screen
      // is drawn for, so what they wrote down about people (`observePlaces`)
      // would never be read again.
      this.player.placeMemory.forgetPeople();
    }
    person.isPlayer = true;
    this.player = person;
    return person;
  }

  /**
   * The band that thinks at full pace: the player's, which changes with a
   * succession or with playing as somebody else and is read afresh every tick,
   * so the next step after a change already uses the new answer.
   */
  thinkFocusBand(): number | null {
    return this.player ? this.player.bandId : this.headlessFocusBand;
  }

  /** The fallback when nobody has chosen: whoever is first in the list. */
  possessFirst(): Person | null {
    this.assertExecutionAuthority();
    const living = this.livingPeople();
    if (living.length === 0) return null;
    return this.possess(living[0]!);
  }

  /**
   * Advance only the named travellers through the ordinary needs clock. The
   * comarca motor is deliberately not stepped: that would run wildlife,
   * spawning and AI while the people are represented by an abstract route.
   * Running each tick here keeps saved/resumed journeys equivalent to one
   * uninterrupted trip, including real food consumption and daily spoilage.
   */
  advanceJourneyTick(travellerIds: readonly number[], tick: number): void {
    this.assertExecutionAuthority();
    if (!Number.isSafeInteger(tick) || tick !== this.time.tick + 1) throw new RangeError('Journey ticks must be contiguous');
    const travellers = travellerIds.map(id => this.peopleById.get(id)).filter((person): person is Person => !!person && person.alive);
    this.time.advance();
    this.advanceTorchFuels(travellers);
    for (const person of travellers) person.action = 'walk';
    const nurslingFactor = nurslingHungerFactor(this.config.childhood.feedsPerDay,
      this.config.time.ticksPerDay, this.config.needs.hungerRate);
    this.needsSystem.update(travellers, this.time, [], undefined, {
      hungerFactor: person => isLactating(person, this.peopleById, this.config.childhood)
        ? 1 + this.config.childhood.lactationHunger
        : isNursling(person, this.config.childhood) ? nurslingFactor : 1,
      babyInArms: person => isBabyInArms(person, this.config.childhood),
    });
    for (const person of travellers) {
      person.age += 1 / this.config.time.ticksPerDay;
      // Reuse the same meal path as ordinary orders and the inventory panel;
      // this preserves macros, hydration, illness, beliefs and physical stock.
      if (person.needs.hunger >= 45 || person.needs.thirst >= 55) {
        // Use perishable stock before preserved rations so a long route does not spoil food while eating the shelf-stable reserve first.
        // Thirst alone must never spend dry nuts as if they were drinking water.
        const hungry = person.needs.hunger >= 45;
        const entries = [...person.inventory.entries()].filter(([item]) =>
          hungry || hydrationOf(item, this.world.waterKind !== undefined) > 0);
        const perishable = entries.filter(([item]) => (ITEMS[item]?.nutrition ?? 0) > 0 && (ITEMS[item]?.spoilTicks ?? 0) > 0);
        const candidates = perishable.length ? perishable : entries;
        let food: string | null = null, best = 0;
        for (const [item] of candidates) { const appeal = appealOf(person, item, undefined, this.config.motivation.cravings, this.config.motivation.beliefChoice); if (appeal > best) { best = appeal; food = item; } }
        if (!food && hungry) food = bestFoodFor(person, undefined, this.config.motivation.cravings, this.config.motivation.beliefChoice);
        if (food) consumeFood(person, food, this.time.tick, this.config.motivation.cravings,
          this.healthRng, this.world.waterKind !== undefined);
      }
    }
    if (this.time.tick % this.config.time.ticksPerDay === 0) {
      for (const person of travellers) if (person.alive) { decayMacroBalance(person); decayMacroTarget(person); }
      // Phase 17d enables spoilage only for provisions in transit. The detailed
      // economy still keeps its configured zero rate until phase 15 is measured;
      // travelling must not make fresh food keep indefinitely by inheriting it.
      const journeySpoilRate = this.config.needs.spoilRate > 0 ? this.config.needs.spoilRate : 1;
      for (const person of travellers) if (person.alive)
        person.inventory.spoil(this.config.time.ticksPerDay * journeySpoilRate, () => 1);
    }
  }

  // -------------------------------------------------------------------------
  // The step
  // -------------------------------------------------------------------------

  step(): void {
    this.assertExecutionAuthority();
    stepMark?.('(start)');
    if (!this.playerIntent) this.playerMovementRefusal = null;
    this.time.advance();
    this.advanceTorchFuels(this.people);
    this.rebuildHashes();
    stepMark?.('advance+rebuildHashes');

    // Regrowth is coarse-grained: once every 20 steps at 20x the rate costs a
    // twentieth as much and is indistinguishable at the timescales that matter.
    if (this.time.tick % 20 === 0) {
      const growth = this.time.growth;
      const regrowth = this.config.world.regrowthRate;
      const season = this.time.season;
      for (const node of this.nodes) node.regrow(20, growth, regrowth, season);
    }
    stepMark?.('regrow');

    // Work done side by side, and the talk that goes with it. On a cadence
    // rather than every tick for the reason the regrowth pass above is: the
    // answer changes over hours, and the spatial query is the expensive part.
    // After `rebuildHashes`, because it is one of its readers.
    if (this.time.tick % ALONGSIDE_EVERY === 0) {
      this.social.workingAlongside(this.people, this.peopleHash, this.time.tick);
    }

    // M11 phase 14a: who is on whose ground, seen by whom. After
    // `rebuildHashes` for the same reason as the pass above.
    stepMark?.('workingAlongside');
    if (this.time.tick % SIGHTING_EVERY === 0) {
      this.lookForIntruders();
      if (this.config.light.enabled) this.findBodies();
    }
    stepMark?.('lookForIntruders');

    this.wildlifeSystem.update(this.animals, {
      ids: this.ids,
      world: this.world,
      rng: this.wildlifeRng,
      tick: this.time.tick,
      peopleHash: this.peopleHash,
      peopleById: this.peopleById,
      dailyGrowth: this.time.dailyGrowth,
      onStarved: (animal: Animal) => this.removeAnimal(animal, 'animal_starved_out'),
      animalHash: this.animalHash,
      ecologyRng: this.ecologyRng,
      isNight: this.time.isNight,
      litNear: (x: number, y: number, r: number) => this.litNear(x, y, r),
      onPredated: (prey: Animal) => this.removeAnimal(prey, 'animal_predated'),
      onBite: (animal: Animal, person: Person) => this.animalBites(animal, person),
    });
    stepMark?.('wildlife.update');
    this.reconcileTransportLeases();

    const nurslingFactor = nurslingHungerFactor(this.config.childhood.feedsPerDay,
      this.config.time.ticksPerDay, this.config.needs.hungerRate);
    this.needsSystem.update(this.people, this.time, this.buildings, this.buildingHash, {
      // M15 phase 20 (owner, 2026-09-30): milk makes a woman half as hungry
      // again for as long as she has it, and a baby in arms never tires.
      //
      // And a nursling gets hungry fast enough to cry `feedsPerDay` times a
      // day (owner, 2026-10-01), which is what replaced the feeding clock.
      hungerFactor: (person: Person) => isLactating(person, this.peopleById, this.config.childhood)
        ? 1 + this.config.childhood.lactationHunger
        : isNursling(person, this.config.childhood) ? nurslingFactor : 1,
      babyInArms: (person: Person) => isBabyInArms(person, this.config.childhood),
    });
    stepMark?.('needs.update');

    // M15 phase 27d: fatigue and cold can overwhelm somebody swimming. This
    // runs after needs rise and before anyone acts, so crossing the threshold
    // has one deterministic outcome and cannot be undone by iteration order.
    for (const person of this.people) {
      if (!person.alive || boatTileFor(person, this.world, person.x, person.y) ||
          !this.world.isWater(person.x, person.y) || this.world.isWadeTile(person.x, person.y) ||
          (person.needs.cold <= this.config.world.drownAt && person.needs.fatigue <= this.config.world.drownAt)) continue;
      person.die('drowned');
      telemetry.count('death_drowned');
      if (this.world.isShallow(person.x, person.y)) telemetry.count('drowned_shallows');
    }

    stepMark?.('drowning');
    // Memories and relationships age once a day, not every tick. Decaying
    // sixty people's worth of both every step would be the most expensive
    // thing in the loop, and nothing in the design could tell the difference.
    if (this.time.tick % this.config.time.ticksPerDay === 0) {
      this.snowDepth = advanceSnowDepth(this.snowDepth, this.time.temperature);
      // M15 phase 23a: the sward, a pure function of the ground and the day.
      advanceGrass(this.world, this.time.dailyGrowth, this.snowDepth);
      // M15 phase 23d: spring's young, proportional to how well fed the herd
      // is and capped by the grass round it.
      for (const calf of this.wildlifeSystem.daily(this.animals, {
        ids: this.ids,
        world: this.world, rng: this.wildlifeRng, tick: this.time.tick,
        peopleHash: this.peopleHash, season: this.time.season,
      })) {
        this.animals.push(calf);
        this.animalsById.set(calf.id, calf);
      }
      this.edgeTraffic();
      // M15 phase 20 (owner, 2026-10-01): a bush out of its season is bare —
      // its crop has fallen and rotted. Every day rather than on the first of
      // the season, so nothing a regrowth pass set on the boundary survives.
      const season = this.time.season;
      for (const node of this.nodes) {
        if (node.species !== null && node.amount > 0 && bushPhase(node.species, season) === 'bare') node.amount = 0;
      }
      this.social.dailyUpkeep(this.people);
      this.woundsOfTheDay();
      this.shareTheHearth();
      // Renown decays far more slowly than an ordinary opinion's `deeds`
      // component (0.997 against 0.985): it is the family's memory of itself
      // and has to compose across generations, not fade with one person's
      // recollection. Kept here rather than folded into `dailyUpkeep`,
      // because `SocialSystem` knows people and feelings, not households.
      for (const household of this.households) household.renown *= RENOWN_DECAY_PER_DAY;
      for (const household of this.households) {
        if (household.homeBuildingId === null) continue;
        const home = this.buildingsById.get(household.homeBuildingId);
        if (home) household.wealth = Math.max(household.wealth, home.store.total);
      }
      // M12 phase 2a: a debt to the dead, or one nobody has come for in a
      // year, is not owed any more.
      for (const person of this.people) {
        if (!person.alive) continue;
        // What the ledger saved today, for the health report: a recorded
        // debt older than the year that an unwritten one would have lost.
        const stale = this.time.tick - DEBT_DAYS * this.config.time.ticksPerDay;
        for (const debt of person.debts) if (debt.recorded && debt.tick < stale) telemetry.count('recorded_debt_days');
        pruneDebts(person, this.time.tick, this.config.time.ticksPerDay,
          id => this.peopleById.get(id)?.alive ?? false);
      }
      this.keepDockets();
      // A grudge or an alliance between two peoples outlives the individuals
      // who were there when it started, so it decays slower still than
      // renown — see `BandRelations`'s own header.
      this.bandRelations.decay();
      this.settleFeuds();
      this.settleCaptives();
      this.settleSerfs();
      for (const person of this.people) {
        if (person.alive) {
          person.curiosityDays = Math.min(60, person.curiosityDays + 1);
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
        ids: this.ids,
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
        authority: (leader, listener, action) => this.standing(leader, listener, action).chance,
        rng: this.forestRng,
        day: this.time.day,
        tick: this.time.tick,
        motivation: this.config.motivation,
        buildings: this.buildings,
        place: (defId, x, y, bandId, sponsorId) => this.place(defId, x, y, bandId, sponsorId),
        onExile: (person, band, factionSize) => this.exile(person, band, factionSize),
        onAdopt: (person, band) => this.adopt(person, band),
        peopleHash: this.peopleHash,
        bandRelations: this.bandRelations,
        sameRegion: (ax, ay, bx, by) => this.world.sameRegion(ax, ay, bx, by),
        territoryOwnerAt: (x, y) => this.territoryOwnerAt(x, y),
        abandonSite: site => this.removeBuilding(site),
        command: (leader, subordinate, action, target, options) =>
          this.command(leader, subordinate, action, target, options),
        knownRaidDestination: this.worldRaidDestination,
        queueRemoteRaid: this.queueWorldRaid,
        templeOf: bandId => this.templeOf(bandId),
        personById: id => this.peopleById.get(id),
        declare: (chief, otherBandId, kind) => this.declare(chief, otherBandId, kind),
        submit: (chief, overlordBandId) => this.submit(chief, overlordBandId),
        tributeStoreOf: bandId => this.tributeStoreOf(bandId),
        assignJob: (leader, subordinate, job) => this.assignJob(leader, subordinate, job),
        leaveBand: person => this.removeBandMembership(person),
        onInsight: (person, text, kind) => this.noteInsight(person, text, kind),
        householdsById: this.householdsById,
        sightings: this.sightings,
        nodeHash: this.nodeHash,
        migration: this.comarcaMigration?.() ?? undefined,
      });

      this.refreshTemples();

      this.knowledgeSystem.daily(this.people, {
        observerSight: person => this.sightOf(person),
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
        wantAt: this.config.motivation.wantAt,
        learning: this.config.learning,
        pileHash: this.pileHash,
        buildingHash: this.buildingHash,
        carry: this.config.carry,
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
        // M15 phase 38b: how many soldiers a world keeps, for `soldiers-are-kept`.
        if (person.alive && person.job === 'soldier') telemetry.count('job_soldier_days');
      }
      this.refreshEra();

      this.workTraps();
      this.growCrops();
      this.workHeaps();
      this.workHerds();
      // See `sabotageCandidatesByBand`'s own comment for why this is cached
      // at all and why once a day is the right cadence for it.
      this.sabotageCache = this.sabotageCandidatesByBand();
      if (!this.config.light.enabled) this.findBodies();
      // M11 phase 16b: bones long enough on the ground are scattered, and the
      // body leaves the world. See `GONE_AFTER`.
      const gone = this.corpses.filter(c =>
        this.time.tick - c.diedTick > GONE_AFTER * this.config.time.ticksPerDay);
      for (const corpse of gone) this.removeCorpse(corpse);

      this.lifeSystem.daily(this.people, {
        parentArchive: this.comarcaParent,
        rng: this.lifeRng,
        population: this.config.population,
        tick: this.time.tick,
        day: this.time.day,
        peopleById: this.peopleById,
        householdsById: this.householdsById,
        roofTonight: this.roofTonight,
        makeChild: (mother, childRng) => {
          // A process-wide hook let the most recently constructed world choose
          // another world's newborn IDs, calendar and learning rate.
          const name = childRng.pick(NAME_ONSETS) + childRng.pick(NAME_CODAS);
          const child = new Person(name, mother.x, mother.y, mother.bandId,
            childRng, this.time.daysPerYear, this.ids);
          child.skillGain = this.config.learning.skillGain;
          return child;
        },
        onBirth: (child, mother, father) => this.registerBirth(child, mother, father),
        onDeath: (person, cause) => person.die(cause),
        pregnancyCare: {
          rng: this.healthRng,
          midwifeFor: mother => this.midwifeFor(mother),
          onMiscarriage: (mother, father, cause) => this.registerMiscarriage(mother, father, cause),
          onComplicatedBirth: (mother, midwife) => this.registerComplicatedBirth(mother, midwife),
        },
      });
    }
    stepMark?.('daily (all blocks)');

    const brainCtx = {
      observerSight: (person: Person) => this.sightOf(person),
      world: this.world,
      drownAt: this.config.world.drownAt,
      time: this.time,
      rng: this.aiRng,
      choiceRng: this.choiceRng,
      choiceSpread: this.config.ai.choiceSpread,
      commitmentEntryPressure: this.config.ai.commitmentEntryPressure,
      commitmentBreakMargin: this.config.ai.commitmentBreakMargin,
      commitmentTieMargin: this.config.ai.commitmentTieMargin,
      nodeHash: this.nodeHash,
      peopleHash: this.peopleHash,
      shoreHash: this.shoreHash,
      freshShoreHash: this.freshShoreHash,
      corpseHash: this.corpseHash,
      relationships: this.relationships,
      buildings: this.buildings,
      buildingHash: this.buildingHash,
      treeHash: this.treeHash,
      animalHash: this.animalHash,
      pileHash: this.pileHash,
      pilesById: this.pilesById,
      inscriptionHash: this.inscriptionHash,
      recorded: this.recordsInHand,
      sightRadius: this.config.sightRadius,
      needs: this.config.needs,
      weeklyFoodNeedPerPerson: this.config.needs.hungerRate * this.config.time.ticksPerDay * 7,
      eatAtSourceAt: this.config.carry.eatAtSourceAt,
      carry: this.config.carry,
      chiefByBand: this.bandSystem.chiefByBand,
      templeByBand: this.templeByBand,
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
      averageRenownByBand: averageRenownByBand(this.householdsById),
      buildingsById: this.buildingsById,
      peopleById: this.peopleById,
      childhood: this.config.childhood,
      // The hungriest weaned child this parent feeds, for the forage drive.
      // No longer compared with the parent's own hunger: parents feed their
      // child first (owner, M15 phase 20), so a hungry parent still forages
      // for a hungry child.
      //
      // And whoever they last saw starving (M15 phase 20), at the hunger they
      // saw, for as long as the sighting is fresh and only while they carry
      // nothing to give: that is what sends them to fetch food. With some in
      // hand, `bring_food` takes it back; left on, this kept them picking
      // until the sighting went stale and nobody ever arrived (`lean`: 31 of
      // 46 walks back given up for `forage`, none finished).
      dependentHunger: (person: Person) => person.childIds.reduce((highest, id) => {
        const child = this.peopleById.get(id);
        if (!child?.alive || !child.isChild || isNursling(child, this.config.childhood)) return highest;
        return Math.max(highest, child.needs.hunger);
      }, person.inventory.bestFood() === null ? this.freshStarvingSeen(person)?.hunger ?? 0 : 0),
      starvingSeen: (person: Person) => this.freshStarvingSeen(person),
      motivation: this.config.motivation,
      persuasionAuthority: (sponsor: Person, listener: Person) =>
        this.standing(sponsor, listener, 'build').chance,
      bandRelations: this.bandRelations,
      sabotageCandidatesByBand: this.sabotageCache,
      homes: this.bandHomes(),
    };
    const actionCtx = {
      fineWorkPace: (person: Person) => this.config.light.enabled
        ? lightFactor(this.lightAt(person.x, person.y), this.config.light.fineWorkDark) : 1,
      huntLightFactor: (person: Person) => this.config.light.enabled
        ? lightFactor(this.lightAt(person.x, person.y), this.config.light.huntDark) : 1,
      hearthNear: (x: number, y: number, radius: number) => this.hearthNear(x, y, radius),
      world: this.world,
      movement: this.movementSystem,
      nodesById: this.nodesById,
      buildingsById: this.buildingsById,
      onBuildingStateChanged: (building: Building) => {
        const owner = this.bands.find(band => band.id === building.ownerBandId);
        applyHouseWalls(this.world, building, owner ?? {
          homeX: building.centerX, homeY: building.centerY,
        }, this.peopleHash, building.complete && !building.ruined);
      },
      placeFurniture: (person: Person, host: Building, itemId: string) =>
        this.placeFurniture(person, host, itemId),
      treesById: this.treesById,
      animalsById: this.animalsById,
      onAnimalKilled: (animal: Animal) => this.removeAnimal(animal),
      knowledge: this.knowledgeSystem,
      relationships: this.relationships,
      onTreeFelled: (tree: Tree) => this.removeTree(tree),
      peopleById: this.peopleById,
      childhood: this.config.childhood,
      babyCrying: (person: Person) => this.cryReaches(person),
      cryingBaby: (person: Person) => this.cryingBabyReaches(person),
      feedsCryingBaby: (person: Person, baby: Person) => {
        if (!baby) return false;
        const carriesEdible = (itemId: string) => person.inventory.count(itemId) > 0 &&
          (ITEMS[itemId]?.nutrition ?? 0) > 0;
        if (person.action === 'give') {
          // An explicit gift must itself be food; otherwise a stone gift to a
          // baby would accidentally exempt unrelated work from the cry check.
          const itemId = person.targetItemId;
          const carriesFood = itemId === null
            ? carriesEdibleFood(person)
            : carriesEdible(itemId);
          return carriesFood && person.targetPersonId === baby.id;
        }
        const carriesFood = carriesEdibleFood(person);
        return person.action === 'bring_food' && carriesFood && person.starvingSeen?.id === baby.id &&
          person.targetX === person.starvingSeen.x && person.targetY === person.starvingSeen.y;
      },
      householdsById: this.householdsById,
      childAwayFromCarer: (person: Person) => {
        if (!person.isChild || person.action === 'go_home') return false;
        const carer = carerOf(person, { world: this.world, peopleById: this.peopleById,
          buildingsById: this.buildingsById, householdsById: this.householdsById,
          homes: NO_HOME_ANCHORS, motivation: this.config.motivation });
        return carer !== null && Math.hypot(person.x - carer.x, person.y - carer.y) >
          childRadius(person, this.config.motivation) + 3;
      },
      peopleHash: this.peopleHash,
      buildingHash: this.buildingHash,
      bandRelations: this.bandRelations,
      social: this.social,
      rng: this.actionRng,
      healthRng: this.healthRng,
      tick: this.time.tick,
      sightRadius: this.config.sightRadius,
      snowDepth: this.snowDepth,
      isNight: this.time.isNight,
      day: this.time.day,
      dayFraction: this.time.dayFraction,
      seasonGrowth: this.time.growth,
      needs: this.config.needs,
      drownAt: this.config.world.drownAt,
      carry: this.config.carry,
      light: this.config.light,
      motivation: this.config.motivation,
      persuasionAuthority: (sponsor: Person, listener: Person) =>
        this.standing(sponsor, listener, 'build').chance,
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
      plantTree: (species: TreeSpecies, x: number, y: number) => this.plantTree(species, x, y),
      buildingAt: (x: number, y: number) => this.buildingAt(x, y) !== null,
      treeHash: this.treeHash,
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
      comarcaTravel: this.comarcaTravel ?? undefined,
      onStopped: (person: Person, action: string, reason: string) =>
        this.noteStop(person, action, reason),
      chiefByBand: this.bandSystem.chiefByBand,
      templeByBand: this.templeByBand,
      onComplaint: (teller: Person, chief: Person, told: Case) => this.hearComplaint(teller, chief, told),
      onParley: (chief: Person, envoy: Person, told: Case) => this.putToEnvoy(chief, envoy, told),
      onWatched: (person: Person, use: PropertyUse) => this.noteWatched(person, use),
      onBound: (person: Person, binder: Person) => this.takeCaptive(person, binder),
      corpsesById: this.corpsesById,
      onCorpseMoved: () => this.corpseHash.rebuild(this.corpses),
      removeCorpse: (corpse: Corpse) => this.removeCorpse(corpse),
      nearestShore: (x: number, y: number) => this.shoreHash.findNearest(x, y, 60,
        tile => this.world.sameRegion(x, y, tile.x, tile.y)),
      nearestBoatShore: (person: Person, x: number, y: number) => this.shoreHash.findNearest(x, y,
        Math.hypot(this.world.width, this.world.height), tile => !this.world.isWater(tile.x, tile.y) &&
          (canUseLogboat(person) ? this.world.sameLogboatRegion(x, y, tile.x, tile.y)
            : canUseRaft(person) && this.world.sameBoatRegion(x, y, tile.x, tile.y))),
      nearestSwimShore: (x: number, y: number) => this.shoreHash.findNearest(x, y,
        Math.hypot(this.world.width, this.world.height),
        tile => this.world.isWalkable(tile.x, tile.y) && !this.world.isWater(tile.x, tile.y) &&
          this.world.sameSwimRegion(x, y, tile.x, tile.y)),
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

    stepMark?.('build contexts');
    const interval = this.config.thinkInterval;
    const focusBand = this.thinkFocusBand();
    for (const person of this.people) {
      if (!person.alive) continue;

      if ((this.time.tick + person.thinkOffset) % interval === 0) {
        const pressure = drivePressures(person, {
          world: this.world, time: this.time, peopleById: this.peopleById,
          buildingsById: this.buildingsById, householdsById: this.householdsById,
          homes: brainCtx.homes, motivation: this.config.motivation,
        });
        for (const drive of Object.keys(DRIVES) as (keyof typeof DRIVES)[]) {
          const before = person.chronic[drive] ?? 0;
          person.chronic[drive] = before + (pressure[drive] - before) * this.config.motivation.chronicRate;
        }
      }
      stepMark?.('loop: chronic drives');

      // The first year is before walking: the baby rests where born until a
      // carrier system exists. Letting its own needs choose `forage` or `drink`
      // made newborns roam and feed themselves like small adults.
      // M15 phase 20: until crawling, and whenever somebody is carrying them.
      if (this.config.motivation.infantsStill &&
          (!canCrawl(person, this.config.childhood) || person.carriedBy !== null)) {
        person.forgetPlans();
        person.action = 'idle';
        continue;
      }

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
      // M15 phase 21b: out cold from a blow to the head. Same rule as being held.
      if (person.knockedOutUntil >= this.time.tick) continue;

      const underAttack = assailantOf(person, id => this.peopleById.get(id), this.time.tick) !== null;
      // A crying baby no longer seizes the woman here (owner, 2026-10-01): its
      // cry interrupts her work through `cryReaches`, and the brain weighs it
      // against her own needs. A feed she has begun is carried to the end.
      const activeNursing = this.config.motivation.urgentNursing && person.action === 'nurse';
      // Carrying the baby supersedes leaving it in the house: with it on, the
      // mother goes to pick it up rather than to take it home.
      const carrying = this.config.childhood.carryBaby;
      const homeAction = carrying ? 'carry_baby' : 'carry_baby_home';
      const activeCarry = (carrying || this.config.motivation.babyToHouse) && person.action === homeAction;
      const currentBaby = activeNursing && person.targetPersonId !== null
        ? this.peopleById.get(person.targetPersonId) : null;
      const homeBaby = underAttack ? null
        : carrying ? babyToCarry(person, this.peopleById, this.world, this.config.childhood, this.time.tick)
        : !this.config.motivation.babyToHouse ? null
        : infantOutsideHome(person, this.peopleById, this.householdsById, this.buildingsById);
      if (!this.config.motivation.urgentNursing && person.action === 'nurse') {
        person.forgetPlans();
        person.action = 'idle';
      }
      if (!this.config.motivation.babyToHouse && person.action === 'carry_baby_home') {
        person.forgetPlans();
        person.action = 'idle';
      }
      const currentCarryBaby = activeCarry && person.targetPersonId !== null
        ? this.peopleById.get(person.targetPersonId) : null;
      if (!underAttack && (activeNursing || homeBaby || activeCarry)) {
        const baby = activeNursing ? currentBaby : homeBaby ?? currentCarryBaby;
        const action = activeNursing ? 'nurse' : homeAction;
        if (baby && (person.action !== action || person.targetPersonId !== baby.id)) {
          // A baby of hers lying out of her arms interrupts any job or order,
          // including the player's current intent: she goes and picks it up.
          person.forgetPlans();
          person.clearTarget();
          person.action = action;
          person.order = action;
          person.targetPersonId = baby.id;
          person.workedTicks = 0;
        }
        if (baby && person.action === 'nurse' && baby.carriedBy !== person.id) {
          person.targetX = baby.x;
          person.targetY = baby.y;
        }
      }

      // The player's held keys override whatever they were doing.
      if ((underAttack || (!activeNursing && !homeBaby && !activeCarry)) && person.isPlayer && this.playerIntent) {
        person.action = 'walk';
        person.clearTarget();
        const movementRefusal = this.movementSystem.nudge(person, this.playerIntent.dx, this.playerIntent.dy);
        if (person.aboardRaft) person.action = 'boat';
        if (movementRefusal) {
          this.lastRefusal = swimRefusalText(movementRefusal);
          if (this.playerMovementRefusal !== movementRefusal) {
            this.interruptions.push({ personId: person.id, action: 'swim', reason: movementRefusal, recipe: null });
            if (this.interruptions.length > this.interruptionCap) this.interruptions.shift();
          }
          this.playerMovementRefusal = movementRefusal;
        } else {
          this.playerMovementRefusal = null;
        }
        continue;
      }

      stepMark?.('loop: nursing/carry prep');
      // Anything set aside for a drink is picked back up once they are
      // comfortable again, before the brain gets a chance to plan something else.
      this.resumeOrders(person);
      stepMark?.('loop: resumeOrders');

      // M15 phase 25c: what this person sees from where they stand. Mutated
      // on the shared context rather than rebuilt: it is the one field of it
      // that depends on who is asking.
      brainCtx.sightRadius = this.sightOf(person);

      // M15 step 0 (C): retain the existing slow cadence, but wake a route
      // before its early return for danger, lethal needs, or a family emergency.
      const ownInterval = thinkIntervalOf(person, focusBand, this.config);
      let scheduledThink = (this.time.tick + person.thinkOffset) % ownInterval === 0;
      const recentHarm = this.time.tick - person.lastHarmedTick <= 1;
      const criticalHunger = person.needs.hunger >= this.config.needs.criticalThreshold;
      const criticalThirst = person.needs.thirst >= this.config.needs.criticalThreshold;
      const criticalDrives = [criticalHunger ? 'hunger' : null, criticalThirst ? 'thirst' : null]
        .filter((drive): drive is 'hunger' | 'thirst' => drive !== null);
      const bothCritical = criticalDrives.length === 2;
      // Timed work owns interruption checks in ActionSystem; do not consume a
      // stateful baby cry here before its executor gets the same tick.
      if (person.actionTimer > 0) person.commitment = null;
      const commitment = person.actionTimer === 0 ? person.commitment : null;
      const cryingBaby = commitment !== null && person.action !== 'nurse' ? actionCtx.cryingBaby(person) : null;
      const cryingEmergency = commitment !== null && person.action !== 'nurse' && cryingBaby !== null &&
        !actionCtx.feedsCryingBaby(person, cryingBaby);
      const childEmergency = commitment !== null && commitment.drive !== 'hunger' && commitment.drive !== 'thirst' &&
        actionCtx.childAwayFromCarer(person);
      const commitmentEmergency = commitment !== null && (underAttack || recentHarm || cryingEmergency || childEmergency);
      const competingCriticalNeed = commitment !== null && criticalDrives.length > 0 &&
        (commitment.drive !== 'hunger' && commitment.drive !== 'thirst' ||
          criticalDrives.some(drive => drive !== commitment.drive &&
            ((drive === 'hunger' ? person.needs.hunger : person.needs.thirst) / 100) ** 2 -
            ((commitment.drive === 'hunger' ? person.needs.hunger : person.needs.thirst) / 100) ** 2 >=
              this.config.ai.commitmentBreakMargin));
      if (!scheduledThink && commitment &&
          (wakesNow(person, this.time.tick, underAttack) || competingCriticalNeed || commitmentEmergency)) {
        scheduledThink = true;
        telemetry.count('think_woken_early');
      } else if (ownInterval !== interval && !scheduledThink && wakesNow(person, this.time.tick, underAttack)) {
        scheduledThink = true;
        telemetry.count('think_woken_early');
      }

      let commitmentHeld = false;
      const activeCommitment = person.actionTimer === 0 ? person.commitment : null;
      if (activeCommitment) {
        const commitment = activeCommitment;
        const valid = person.order === null && !person.isPlayer && person.action === commitment.action &&
          commitment.goal === commitmentGoal(person.action, person);
        if (!valid) {
          person.commitment = null;
          scheduledThink = true;
        } else {
          const crying = cryingEmergency;
          const awayFromCarer = childEmergency;
          const dangerEmergency = underAttack || recentHarm;
          const currentNeedIsCritical = commitment.drive !== null && criticalDrives.includes(commitment.drive as 'hunger' | 'thirst');
          let pressure: ReturnType<typeof drivePressures> | null = null;
          let abandonForNeed = dangerEmergency || crying || awayFromCarer;
          if (!abandonForNeed && criticalDrives.length > 0) {
            if (!currentNeedIsCritical) abandonForNeed = true;
            else if (bothCritical && scheduledThink) {
              const current = commitment.drive === 'hunger' ? person.needs.hunger : person.needs.thirst;
              const other = commitment.drive === 'hunger' ? person.needs.thirst : person.needs.hunger;
              abandonForNeed = (other / 100) ** 2 - (current / 100) ** 2 >= this.config.ai.commitmentBreakMargin;
            }
          }
          if (!abandonForNeed && scheduledThink && !currentNeedIsCritical) {
            pressure = drivePressures(person, brainCtx);
            abandonForNeed = shouldBreakCommitment(commitment, pressure,
              this.config.ai.commitmentEntryPressure, this.config.ai.commitmentBreakMargin);
          }
          if (abandonForNeed) {
            pressure ??= drivePressures(person, brainCtx);
            const competitors = Object.keys(DRIVES).filter(id => id !== 'variety' && id !== commitment.drive);
            let strongest = competitors[0] as keyof typeof pressure | undefined;
            for (const id of competitors as (keyof typeof pressure)[]) {
              if (strongest === undefined || pressure[id] > pressure[strongest]) strongest = id;
            }
            const reason = underAttack ? 'under_attack' : recentHarm ? 'injured'
              : crying ? 'baby_crying' : awayFromCarer ? 'away_from_family'
              : criticalHunger && criticalThirst ? (person.needs.hunger >= person.needs.thirst ? 'hungry' : 'thirsty')
              : criticalHunger ? 'hungry' : criticalThirst ? 'thirsty'
              : strongest === 'thirst' ? 'thirsty' : strongest === 'hunger' ? 'hungry'
              : strongest === 'warmth' ? 'cold' : 'abandoned_by_new_need';
            actionCtx.onStopped(person, person.action, reason);
            person.commitment = null;
            scheduledThink = true;
          } else {
            commitmentHeld = true;
          }
        }
      }
      // A player's explicit order remains the strongest form of commitment.
      const actionCommitted = person.actionTimer > 0 || person.order !== null;
      const committed = actionCommitted || commitmentHeld;
      // An NPC under a committed order cannot think and does not observe on
      // schedule. The player's score still runs with an order, so their view
      // advances alongside that HUD update.
      stepMark?.('loop: sightOf');
      if (scheduledThink && (!actionCommitted || person.isPlayer)) this.observePlaces(person);
      stepMark?.('loop: observePlaces');
      const needsThink = !committed && (scheduledThink || person.action === 'idle');
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
      stepMark?.('loop: brain');

      this.actionSystem.execute(person, actionCtx);
      stepMark?.('loop: execute');
      const site = person.targetBuildingId === null
        ? undefined : this.buildingsById.get(person.targetBuildingId);
      if (site && this.time.tick - site.plannedTick < 200 &&
          ['build', 'haul', 'chop', 'gather_for_site'].includes(person.action)) {
        site.first200Workers.add(person.id);
      }
    }
    stepMark?.('loop: (skipped iterations + tail)');

    // Children are iterated like everyone else but take no turn. Sync after all
    // adult actions so iteration order cannot leave a carried infant behind.
    //
    // M15 phase 20: also where a carrier's arms are counted, and where a baby
    // who has learned to walk is put down. A held baby is as warm as the one
    // holding it: skin to skin is how a mother on the move keeps a newborn
    // alive in winter, and it is why carrying does not bring back the exposure
    // deaths that leaving babies outside the house caused in M13.
    const carryBaby = this.config.childhood.carryBaby;
    for (const person of this.people) person.armsTaken = 0;
    for (const baby of this.people) {
      if (!baby.alive || baby.carriedBy === null) continue;
      const carrier = this.peopleById.get(baby.carriedBy);
      if (carrier?.alive && carrier.captiveOf === null &&
          (!carryBaby || !canWalk(baby, this.config.childhood))) {
        baby.x = carrier.x;
        baby.y = carrier.y;
        if (carryBaby) {
          carrier.armsTaken++;
          baby.needs.cold = Math.min(baby.needs.cold, carrier.needs.cold);
        }
      } else {
        baby.carriedBy = null;
      }
    }
    stepMark?.('carry sync');
    for (const person of this.people) {
      // M15 phase 19: the last third of a pregnancy takes half an arm's worth
      // of room too (`Carry.freeArms`), and it begins on a day boundary with
      // nothing in the inventory changing, so it is counted here or the armful
      // she was carrying the night before would stay in her arms.
      const taken = person.armsTaken + (handfulsOnly(person) ? 0.5 : 0);
      if (taken !== person.armsTakenLastTick) {
        // Room in the hands changed without the inventory changing, so the
        // reconciliation below would not otherwise notice what no longer fits.
        person.armsTakenLastTick = taken;
        person.carryReconciledVersion = -1;
      }
    }

    // Social handovers and old one-off actions predate item-specific hands.
    // Keep their goods in the world, but never let a transfer leave somebody
    // carrying more than their hands and fitted containers can hold.
    for (const person of this.people) {
      if (person.alive && person.carryReconciledVersion !== person.inventory.version) {
        reconcileCarry(person, this.config.carry,
          (x, y, itemId, count) => this.dropAt(x, y, itemId, count));
        person.carryReconciledVersion = person.inventory.version;
      }
    }

    stepMark?.('reconcileCarry');
    this.cleanupDead();
    stepMark?.('cleanupDead');
  }

  /** Keep the carry cache and owned transport lease in step with living fauna. */
  private reconcileTransportLeases(): void {
    for (const person of this.people) {
      const before = person.transportCapacity;
      const active = refreshTransportLease(person, this.animalsById);
      if (!active && person.alive && person.transportAnimalId === null) {
        const canRide = techPower(person, 'horse_riding') > 0;
        const canPack = techPower(person, 'pack_animals') > 0;
        if ((!canRide && !canPack) || !person.transportAutoClaim) {
          if (before !== person.transportCapacity) person.carryReconciledVersion = -1;
          continue;
        }
        const radius = 2.2;
        const candidate = this.animalHash.queryRadius(person.x, person.y, radius)
          .filter(animal => animal.alive && animal.tamedBy === person.id && animal.transportedBy === null &&
            ((canRide && animal.species === 'horse') || (canPack && animal.species === 'donkey')))
          .sort((a, b) => Math.hypot(a.x - person.x, a.y - person.y) - Math.hypot(b.x - person.x, b.y - person.y) || a.id - b.id)[0];
        if (candidate) claimTransportAnimal(person, candidate,
          candidate.species === 'horse' ? 'riding' : 'pack', this.animalsById);
      }
      if (before !== person.transportCapacity) person.carryReconciledVersion = -1;
    }
  }

  /** Record only what is currently visible; phase 2f will be the first reader. */
  private observePlaces(person: Person): void {
    const memory = person.placeMemory;
    const day = this.time.day;
    const radius = this.config.sightRadius;
    const staticCell = Math.floor(person.y / 4) * Math.ceil(this.world.width / 4) + Math.floor(person.x / 4);
    const refreshStatic = person.placeMemoryStaticCell !== staticCell || person.placeMemoryStaticDay !== day;
    if (refreshStatic) {
      person.placeMemoryStaticCell = staticCell;
      person.placeMemoryStaticDay = day;
    }
    const near = (x: number, y: number): boolean =>
      (x - person.x) ** 2 + (y - person.y) ** 2 <= radius * radius;

    memory.observe(person.x, person.y, radius, day);
    if (this.worldFrame) this.observeWorld(person, person.x, person.y, radius);
    if (refreshStatic) {
      // M15 phase 20: with plant lore, what is in fruit and what is bare this
      // season is also something learned by looking (`SeasonLore`).
      const lore = techPower(person, 'plant_lore') > 0;
      const year = Math.floor(day / this.time.daysPerYear);
      for (const node of this.nodeHash.queryRadius(person.x, person.y, radius, this.placeNodeCandidates)) {
        if (!near(node.x, node.y)) continue;
        memory.remember(`resource:${node.kind}`, node.x, node.y, day,
          node.amount >= node.def.maxAmount * 0.66 ? 2 : node.amount > 0 ? 1 : 0, 'seen',
          node.species === null ? undefined : {
            type: 'bush', species: node.species,
            leafless: !BUSHES[node.species].evergreen && this.time.season === 'winter',
          });
        if (lore && isPlantFood(node.def)) {
          // Learned species by species once bushes have them: a sloe in
          // fruit in winter says nothing about a raspberry.
          person.seasonLore.observe(seasonLoreKind(node), this.time.season, year, node.amount >= 1);
        }
      }
      for (const tree of this.treeHash.queryRadius(person.x, person.y, radius, this.placeTreeCandidates)) {
        if (tree.standing && near(tree.x, tree.y)) {
          memory.remember(tree.def.fruitItem ? `fruit:${tree.def.fruitItem}` : 'tree', tree.x, tree.y, day,
            tree.fruit > 0 ? 2 : 1, 'seen', {
              type: 'tree', species: tree.def.species, maturity: tree.maturity,
              bare: tree.def.species !== 'pine' && this.time.season === 'winter',
              autumn: tree.def.species !== 'pine' && this.time.season === 'autumn', fruit: tree.fruit,
            });
        }
      }
      for (const shore of this.freshShoreHash.queryRadius(person.x, person.y, radius, this.placeShoreCandidates)) {
        if (near(shore.x, shore.y) && this.world.isFreshShore(shore.x, shore.y)) {
          memory.remember('water', shore.x, shore.y, day, 2);
        }
      }
      for (const building of this.buildingHash.queryRadius(person.x, person.y, radius + 4, this.placeBuildingCandidates)) {
        if (near(building.centerX, building.centerY)) {
          memory.remember(`building:${building.def.id}`, building.centerX, building.centerY, day,
            building.complete ? 2 : 1, 'seen', {
              type: 'building', id: building.def.id, complete: building.complete,
            });
        }
      }
    }
    for (const animal of this.animalHash.queryRadius(person.x, person.y, radius, this.placeAnimalCandidates)) {
      if (animal.alive && near(animal.x, animal.y)) memory.remember(`herd:${animal.species}`, animal.x, animal.y, day, 2);
    }
    for (const other of this.peopleHash.queryRadius(person.x, person.y, radius, this.placePeopleCandidates)) {
      if (other.id !== person.id && other.alive && near(other.x, other.y)) {
        // M15 step 0 (D, owner 2026-10-08): only the player's character writes
        // down where it last saw somebody. That record is read by the renderer
        // alone (the fog of war) and nothing in `ai/`, `social/` or `systems/`
        // asks for it, yet in a camp of three hundred it was 299 `remember`
        // calls a look, each evicting the 48-person cap to make room (41 % of
        // the step). What an NPC knows about people lives where it always did:
        // `Memory` (what they did to me) and `RelationshipGraph`. The two
        // things this loop does for everybody stay below.
        if (person.isPlayer) {
          const years = other.years;
          const age = other.isElder ? 'elder' : years < 3 ? 'infant' : years < 8 ? 'child' :
            years < ADULT_YEARS ? 'adolescent' : 'adult';
          memory.remember('person', other.x, other.y, day, 2, 'seen', {
            type: 'person', id: other.id, sex: other.sex, age, bandId: other.bandId,
          });
        }
        if (this.worldFrame && other.bandId !== person.bandId) this.meetOnGlobe(person, other);
        this.noticeStarving(person, other);
      }
    }
    // Back where they last saw them and nobody there: gone somewhere else,
    // and nothing tells them where.
    const seen = person.starvingSeen;
    if (seen && Math.hypot(seen.x - person.x, seen.y - person.y) <= 2) {
      const there = this.peopleById.get(seen.id);
      if (!there?.alive || !near(there.x, there.y)) person.starvingSeen = null;
    }
    for (const pile of this.pileHash.queryRadius(person.x, person.y, radius, this.placePileCandidates)) {
      if (!pile.empty && near(pile.x, pile.y)) {
        for (const [item, amount] of pile.contents.entries()) {
          memory.remember(`pile:${item}`, pile.x, pile.y, day, amount > 5 ? 2 : 1);
        }
      }
    }
    if (telemetry.isEnabled()) {
      telemetry.count(`place_exploration_fraction_band_${person.bandId}`, memory.exploredFraction());
      telemetry.count(`place_memory_age_sum_band_${person.bandId}`, memory.averageAge(day));
      telemetry.count(`place_memory_samples_band_${person.bandId}`);
    }
  }

  /**
   * The comarcas inside the circle `person` can see from `(x, y)`, written to
   * their `WorldKnowledge` as seen (M15 phase 31). The comarca under every
   * corner of the sight square, which at one comarca per map is the one, and at
   * thirty by twenty is at most four. Pure arithmetic: no draw, no allocation
   * but the first time a person is seen to have a globe.
   */
  private observeWorld(person: Person, x: number, y: number, radius: number): void {
    const frame = this.worldFrame;
    if (!frame) return;
    const knowledge = person.worldKnowledge ??= new WorldKnowledge();
    const day = this.time.day;
    const first = this.comarcaAtTile(x - radius, y - radius);
    const last = this.comarcaAtTile(x + radius, y + radius);
    if (!first || !last) return;
    // Longitude wraps, so walk the span from the first to the last across the
    // seam if the box straddles it.
    const across = ((last.cx - first.cx) % frame.mapWidth + frame.mapWidth) % frame.mapWidth;
    for (let dy = first.cy; dy <= last.cy; dy++) {
      for (let dx = 0; dx <= across; dx++) {
        knowledge.see((first.cx + dx) % frame.mapWidth, dy, day);
      }
    }
  }

  /** Which comarca of the globe a tile of the local map lies in; null in a classic world. */
  comarcaAtTile(x: number, y: number): { cx: number; cy: number } | null {
    const frame = this.worldFrame;
    if (!frame) return null;
    const tx = Math.min(Math.max(x, 0), this.world.width - 1e-6);
    const ty = Math.min(Math.max(y, 0), this.world.height - 1e-6);
    const gx = frame.originX + tx / this.world.width * frame.comarcasWide;
    const gy = frame.originY + ty / this.world.height * frame.comarcasHigh;
    const cx = ((Math.floor(gx) % frame.mapWidth) + frame.mapWidth) % frame.mapWidth;
    const cy = Math.min(frame.mapHeight - 1, Math.max(0, Math.floor(gy)));
    return { cx, cy };
  }

  /** `person` laid eyes on somebody of another band, in the comarca they stand in. */
  private meetOnGlobe(person: Person, other: Person): void {
    const cell = this.comarcaAtTile(other.x, other.y);
    if (cell) person.worldKnowledge?.meet(cell.cx, cell.cy, other.bandId, this.time.day);
  }

  /**
   * Somebody `person` cares for, seen now: remembered while starving, and
   * forgotten once seen fed (M15 phase 20, the owner's "if somebody sees she
   * is dying and gets on with her, they go and fetch her food").
   */
  private noticeStarving(person: Person, other: Person): void {
    if (starvingInCare(person, other, this.relationships, this.config.childhood)) {
      const seen = person.starvingSeen;
      if (!seen || seen.id === other.id || other.needs.hunger > seen.hunger) {
        person.starvingSeen = { id: other.id, x: other.x, y: other.y,
          hunger: other.needs.hunger, tick: this.time.tick };
      }
    } else if (person.starvingSeen?.id === other.id) {
      person.starvingSeen = null;
    }
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
   * An order always wins: this runs only when `committed` is false. Held keys
   * also win because the `playerIntent` branch returns before reaching this.
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

  /** `World.earthVersion` the shore hash was last built against (M15 phase 26d). */
  private shoreSeen = -1;

  /**
   * Whatever is standing where the ground no longer is — M15 phase 26c, the
   * open point of 26d. A hole that reaches the water fills it, a pit past
   * `pitDepth` is not walkable, and neither knows who was in it. Rather than a
   * queue of lost tiles (state that a checkpoint taken mid-step would have to
   * carry), this sweeps every kind of occupant whenever `earthVersion` has
   * moved and acts on those whose tile is no longer land:
   *
   *  - people are set on the nearest walkable tile and told why (their order
   *    ends with `ground_gave_way`), except swimmers who can safely swim,
   *  - heaps of goods and bodies are carried to dry land, even if the ford is
   *    shallow enough for a person to walk through,
   *  - trees and plants cannot move: any flood drowns them and they leave.
   *
   * No RNG, fixed array order, `findWalkableNear`'s fixed spiral: two builds
   * relocate the same things to the same tiles.
   */
  private clearLostGround(): void {
    const world = this.world;
    const lost = (x: number, y: number): boolean => world.inBounds(x, y) &&
      !world.isWalkable(x, y) && !world.isSwimTile(x, y);
    const flooded = (x: number, y: number): boolean => world.inBounds(x, y) && world.isWater(x, y);
    const lostPerson = (person: Person): boolean => {
      if (!world.inBounds(person.x, person.y) || world.isWalkable(person.x, person.y)) return false;
      if (boatTileFor(person, world, person.x, person.y)) return false;
      if (!world.isSwimTile(person.x, person.y)) return true;
      return !handsEmptyForSwimming(person) || person.needs.cold >= world.drownAt ||
        person.needs.fatigue >= world.drownAt;
    };
    const dryBank = (x: number, y: number): { x: number; y: number } | null =>
      this.shoreHash.findNearest(x, y, Math.hypot(world.width, world.height),
        tile => world.isWalkable(tile.x, tile.y) && !world.isWater(tile.x, tile.y)) ??
      world.findWalkableNear(Math.floor(x), Math.floor(y));
    for (const person of this.people) {
      if (!person.alive || !lostPerson(person)) continue;
      const bank = world.isWater(person.x, person.y)
        ? dryBank(person.x, person.y)
        : world.findWalkableNear(Math.floor(person.x), Math.floor(person.y));
      if (!bank) continue;
      const action = person.action;
      person.x = bank.x + 0.5;
      person.y = bank.y + 0.5;
      this.noteStop(person, action, 'ground_gave_way');
      person.clearTarget();
      person.forgetPlans();
      person.action = 'idle';
      telemetry.count('stranded_moved');
    }
    for (const pile of [...this.piles]) {
      if (!lost(pile.x, pile.y) && !flooded(pile.x, pile.y)) continue;
      const bank = flooded(pile.x, pile.y)
        ? dryBank(pile.x, pile.y)
        : world.findWalkableNear(Math.floor(pile.x), Math.floor(pile.y));
      if (!bank) continue;
      // Out of the index first: `dropAt` joins the nearest heap, and the
      // nearest one to the bank could be this very pile.
      const goods = [...pile.contents.entries()];
      this.removePile(pile);
      for (const [itemId, count] of goods) this.dropAt(bank.x, bank.y, itemId, count);
      telemetry.count('stranded_moved');
    }
    for (const corpse of this.corpses) {
      if (!lost(corpse.x, corpse.y) && !flooded(corpse.x, corpse.y)) continue;
      const bank = flooded(corpse.x, corpse.y)
        ? dryBank(corpse.x, corpse.y)
        : world.findWalkableNear(Math.floor(corpse.x), Math.floor(corpse.y));
      if (!bank) continue;
      corpse.x = bank.x + 0.5;
      corpse.y = bank.y + 0.5;
      this.corpseHash.rebuild(this.corpses);
      telemetry.count('stranded_moved');
    }
    const drownedTrees = this.trees.filter(tree => lost(tree.x, tree.y) || flooded(tree.x, tree.y));
    for (const tree of drownedTrees) this.removeTree(tree);
    // Fishing spots are deliberately placed in walkable shallows. The sweep
    // runs after any earth edit, not only edits touching a node, so treating
    // every water tile as a flood would erase every natural fishing spot on
    // the first unrelated dig. A spot only leaves when its own tile becomes
    // too deep to fish from.
    const drownedNodes = this.nodes.filter(node => lost(node.x, node.y) ||
      (flooded(node.x, node.y) && (node.kind !== 'fish' || !world.isShallow(node.x, node.y))));
    if (drownedNodes.length > 0) {
      for (const node of drownedNodes) {
        this.nodesById.delete(node.id);
        this.nodes.splice(this.nodes.indexOf(node), 1);
      }
    }
    if (drownedTrees.length + drownedNodes.length > 0) {
      telemetry.count('drowned_in_the_flood', drownedTrees.length + drownedNodes.length);
    }
  }

  private rebuildHashes(): void {
    // Dug ground that floods patches `world.shoreTiles` in place; the hash
    // follows whenever the earth has moved, which costs nothing in a world
    // where nobody digs.
    if (this.shoreSeen !== this.world.earthVersion) {
      this.shoreHash.rebuild(this.world.shoreTiles);
      this.freshShoreHash.rebuild(this.world.freshShore);
      this.saltShoreHash.rebuild(this.world.saltShore);
      this.shoreSeen = this.world.earthVersion;
      // Nothing has ever been dug while `earthVersion` is 0, so a world that
      // nobody digs never pays for (or is changed by) the sweep.
      if (this.world.earthVersion > 0) this.clearLostGround();
    }
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

  /** Fuel is advanced by simulation time only, so pause freezes carried light. */
  private advanceTorchFuels(people: readonly Person[]): void {
    for (const person of people) if (person.alive) advanceTorchBurn(person);
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
        const corpse = new Corpse(person, this.time.tick, wounded, this.ids);
        if (person.causeOfDeath === 'drowned') {
          // The body washes to a bank instead of remaining where it sank. This
          // query uses the same shore hash as drinking and dragging; no tile
          // array is scanned and equal-distance ties stay deterministic.
          const shore = this.shoreHash.findNearest(person.x, person.y,
            Math.hypot(this.world.width, this.world.height));
          if (shore) { corpse.x = shore.x + 0.5; corpse.y = shore.y + 0.5; }
        }
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
    this.assertExecutionAuthority();
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

/**
 * Reconcile the family memory carried home with its older comarca record.
 * Feud weights begin as copies at departure, so max keeps both sides' later
 * discoveries without double-counting the shared pre-split grievance.
 */
function mergeHouseholdFeudHistory(destination: Household, carried: Household): void {
  if (destination === carried) return;
  for (const [rivalId, carriedWeight] of carried.feud) {
    const previousWeight = destination.feud.get(rivalId);
    const carriedIsAtLeastAsStrong = previousWeight === undefined || carriedWeight >= previousWeight;
    if (previousWeight === undefined || carriedWeight > previousWeight) {
      destination.feud.set(rivalId, carriedWeight);
    }
    const carriedSuspect = carried.feudSuspects.get(rivalId);
    if (carriedSuspect !== undefined &&
        (carriedIsAtLeastAsStrong || !destination.feudSuspects.has(rivalId))) {
      destination.feudSuspects.set(rivalId, carriedSuspect);
    }
  }
}

function copyHouseholdForTravel(source: Household, memberIds: number[]): Household {
  const next = Object.assign(Object.create(Object.getPrototypeOf(source)), source) as Household;
  next.memberIds = [...memberIds].sort((a,b) => a-b);
  next.homeBuildingId = null;
  // These class maps were copied by reference, so mutating a split copy changed its source.
  (next as { feud: Map<number, number> }).feud = new Map(source.feud);
  (next as { feudSuspects: Map<number, number> }).feudSuspects = new Map(source.feudSuspects);
  return next;
}

function copyBandLedgers(source: Simulation, destination: Simulation, bandId: number): void {
  const from = source as unknown as Record<string, any>, to = destination as unknown as Record<string, any>;
  const regard = from.strangerRegardByBand.get(bandId);
  const destinationBand = destination.bands.find(band => band.id === bandId);
  if (destinationBand) to.normsByBand.set(bandId, destinationBand.norms);
  if (regard !== undefined) to.strangerRegardByBand.set(bandId, regard);
  for (const key of ['raidConsidered','foodFailureSince','coupConsidered','tributePaid'] as const) {
    const value = source.bandSystem[key].get(bandId);
    if (value !== undefined) destination.bandSystem[key].set(bandId, structuredClone(value));
  }
  // Temples and chiefs belong to the source comarca and are rebound there.
}

function mergeSocialState(source: Simulation, destination: Simulation): void {
  for (const [viewer, row] of source.relationships.snapshot()) for (const [subject, relationship] of row) {
    Object.assign(destination.relationships.edge(viewer, subject), relationship);
  }
  const existingRelations = destination.bandRelations.snapshot();
  const relationKeys = new Set(existingRelations.edges.map(([key]) => key));
  for (const [key, value] of source.bandRelations.snapshot().edges) {
    if (relationKeys.has(key)) continue;
    const [a,b] = key.split(':').map(Number);
    destination.bandRelations.add(a!, b!, value);
  }
  const stanceKeys = new Set(existingRelations.stances.map(([key]) => key));
  for (const [key, stance] of source.bandRelations.snapshot().stances) {
    if (stanceKeys.has(key)) continue;
    const [a,b] = key.split(':').map(Number);
    destination.bandRelations.setStance(a!, b!, stance.kind, stance.since, stance.overlord);
  }
  const recentIds = new Set(destination.social.recent.map(event => event.id));
  for (const event of source.social.recent) if (!recentIds.has(event.id)) destination.social.recent.push(structuredClone(event));
  if (destination.social.recent.length > 200) destination.social.recent.splice(0, destination.social.recent.length - 200);
  const sourcePrivate = source as unknown as Record<string, any>, destPrivate = destination as unknown as Record<string, any>;
  for (const eventId of sourcePrivate.feudEvents as Set<number>) destPrivate.feudEvents.add(eventId);
  for (const [key,value] of sourcePrivate.territoryPermissions as Map<string, number>) {
    if (!destPrivate.territoryPermissions.has(key)) destPrivate.territoryPermissions.set(key, value);
  }
  for (const kind of ['knownTech','recordedTech','rememberedTech','recordsInHand'] as const) {
    for (const item of source[kind]) destination[kind].add(item);
  }
}

function movePersonLedgers(source: Simulation, destination: Simulation, travellerIds: ReadonlySet<number>): void {
  if (source.player && travellerIds.has(source.player.id)) {
    if (destination.player) throw new RangeError('Destination already has a player');
    destination.player = source.player;
    source.player = null;
  }
  if (source.succession && (travellerIds.has(source.succession.died.id) || (source.succession.heir && travellerIds.has(source.succession.heir.id)))) {
    destination.succession = source.succession;
    source.succession = null;
  }
  const take = <T>(from: T[], to: T[], predicate: (value: T) => boolean, limit = Infinity) => {
    const moved = from.filter(predicate);
    for (let i = from.length - 1; i >= 0; i--) if (predicate(from[i]!)) from.splice(i, 1);
    to.push(...moved);
    // Each motor caps these presentation queues while running. Combining two
    // full queues on arrival must preserve that cap or its own checkpoint
    // becomes unloadable (LedgerRecord rejects a 33rd interruption notice).
    if (to.length > limit) to.splice(0, to.length - limit);
  };
  take(source.interruptions, destination.interruptions, item => travellerIds.has(item.personId), 32);
  take(source.insights, destination.insights, item => travellerIds.has(item.personId), 32);
  take(source.helpCalls, destination.helpCalls, item => travellerIds.has(item.callerId), 32);
  take(source.watchedUses, destination.watchedUses, item => travellerIds.has(item.personId) || (!!item.use.seen && travellerIds.has(item.use.seen.id)), 32);
  take(source.pendingVerdicts, destination.pendingVerdicts, item => travellerIds.has(item.plaintiffId) || travellerIds.has(item.accusedId));
  for (const [tech, personId] of source.techHolders) if (travellerIds.has(personId)) destination.techHolders.set(tech, personId);
}

function comarcaEntrySlots(world: World, edge: ComarcaEdge, count: number): { x: number; y: number }[] | null {
  const slots: { x: number; y: number }[] = [];
  const horizontal = edge === 'n' || edge === 's';
  const span = horizontal ? world.width : world.height;
  const fixed = edge === 'n' ? 1 : edge === 's' ? world.height - 2 : edge === 'w' ? 1 : world.width - 2;
  for (let along = 1; along < span - 1 && slots.length < count; along++) {
    const x = horizontal ? along : fixed;
    const y = horizontal ? fixed : along;
    if (world.isWalkable(x, y)) slots.push({ x: x + 0.5, y: y + 0.5 });
  }
  return slots.length === count ? slots : null;
}
