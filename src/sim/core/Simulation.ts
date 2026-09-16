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
import { SocialSystem, resetEventIds } from '../social/SocialSystem.ts';
import { DEFAULT_NORMS, VARIABLE_NORMS, type Norms } from '../social/Events.ts';
import {
  Building, BUILDINGS, isTrap, resetBuildingIds, type BuildingDef,
} from '../entities/Building.ts';
import { accrueUnits } from './Progress.ts';
import { Household, resetHouseholdIds } from '../entities/Household.ts';
import { Tree, resetTreeIds } from '../entities/Tree.ts';
import { ItemPile, resetPileIds } from '../entities/ItemPile.ts';
import {
  Animal, resetAnimalIds, SPECIES, SPECIES_DEFS, type Species,
} from '../entities/Animal.ts';
import { WildlifeSystem } from '../systems/WildlifeSystem.ts';
import { ForestSystem, seedInitialForest } from '../systems/ForestSystem.ts';
import {
  LifeSystem, setChildFactory, findHeir, settleEstate,
} from '../systems/LifeSystem.ts';
import { linkFamily } from '../social/SocialSystem.ts';
import { BandSystem } from '../systems/BandSystem.ts';
import { foundBand, type FoundingContext } from '../systems/Founding.ts';
import { KnowledgeSystem, countHolders } from '../systems/KnowledgeSystem.ts';
import { ORDER_REFUSED, type Notice } from '../knowledge/Synthesis.ts';
import {
  eraFor, nutritionFactor, techPower, ERA_ORDER, ERAS, TECHS, type EraDef, type Tech,
} from '../knowledge/Tech.ts';
import { RECIPES, type RecipeDef } from '../entities/Recipe.ts';
import { standingOver, type AuthorityContext } from '../social/Authority.ts';
import {
  bandHasShape, bandOf, rankIn, type BandRank, type RankContext,
} from '../social/Rank.ts';
import { JOBS, type JobId } from '../entities/Job.ts';
import {
  Inscription, INSCRIPTIONS, resetInscriptionIds, type InscriptionForm,
} from '../entities/Inscription.ts';
import { NAME_ONSETS, NAME_CODAS } from '../../data/names.ts';

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

export interface Band {
  id: number;
  name: string;
  /** Camp centre; people spawn around it and, later, claim territory from it. */
  homeX: number;
  homeY: number;
  /**
   * What this culture makes of each kind of deed. Bands differ, which is what
   * lets an outlaw find somewhere their reputation does not follow them.
   */
  norms: Norms;
  /** Whoever the band currently holds in the highest regard. Null if empty. */
  chiefId: number | null;
  /** Absolute day the present chief took office. Null while there is none. */
  chiefSince: number | null;
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
  animals: Animal[] = [];
  households: Household[] = [];
  bands: Band[] = [];

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
   */
  readonly recordedTech = new Set<string>();

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

  /** Ideas, breakthroughs and failed prototypes, waiting to be told about. */
  readonly insights: InsightNotice[] = [];

  /** Set when the player's character dies, so the UI can offer the succession. */
  succession: { died: Person; heir: Person | null } | null = null;

  readonly relationships = new RelationshipGraph();
  readonly social: SocialSystem;
  private readonly normsByBand = new Map<number, Norms>();

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
    this.social = new SocialSystem(this.relationships, this.normsByBand);
    this.social.onMarriage = (a, b) => this.mergeHouseholds(a, b);
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

    resetPersonIds();
    resetResourceIds();
    resetEventIds();
    resetBuildingIds();
    resetHouseholdIds();
    resetTreeIds();
    resetPileIds();
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

    this.spawnResources(spawnRng);
    this.spawnHerds(spawnRng);
    this.spawnPeople(spawnRng);
    this.spawnFish(fishRng);
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

    for (const [kind, count] of plan) {
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
    const count = this.config.world.fishingSpots;
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
   * Scatters herds across the grass and the woods.
   *
   * Herds rather than individuals: a herd is the unit that gets spooked and the
   * unit worth walking across the island for, and scattering forty lone deer
   * produces neither.
   */
  private spawnHerds(rng: RNG): void {
    for (let h = 0; h < this.config.world.gameHerds; h++) {
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
        name: rng.pick(NAME_ONSETS) + rng.pick(NAME_CODAS) + ' band',
        homeX: home.x,
        homeY: home.y,
        norms,
        chiefId: null,
        chiefSince: null,
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
        if (!person.isChild) {
          for (const tech of this.config.population.startingTech) {
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

    const text = mother.name + ' bore ' + child.name;
    mother.chronicle.push({
      tick: this.time.tick, ageDays: mother.age, text, kind: 'milestone',
    });
    child.chronicle.push({
      tick: this.time.tick, ageDays: 0, text: 'was born', kind: 'milestone',
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

    settleEstate(person, heir, household);

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
            text: 'became head of the ' + household.name + ' household',
            kind: 'milestone',
          });
          telemetry.count('succession');
        } else {
          household.endedTick = this.time.tick;
          telemetry.count('household_extinct');
        }
      }
    }

    if (person.spouseId !== null) {
      const widow = this.peopleById.get(person.spouseId);
      if (widow) widow.spouseId = null;
    }

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
      for (const [itemId, count] of source.store.entries()) {
        target.store.add(itemId, source.store.remove(itemId, count));
      }
      source.endedTick = this.time.tick;
    }
    younger.surname = target.name;
  }

  // -------------------------------------------------------------------------
  // Authority and exile
  // -------------------------------------------------------------------------

  private authorityContext(): AuthorityContext {
    return {
      relationships: this.relationships,
      householdsById: this.householdsById,
      chiefByBand: this.bandSystem.chiefByBand,
      bands: this.bands,
      day: this.time.day,
    };
  }

  /** What `leader` could make `subordinate` do, and how likely they are to. */
  standing(leader: Person, subordinate: Person, action: string) {
    return standingOver(leader, subordinate, action, this.authorityContext());
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

    const standing = this.standing(leader, subordinate, action);
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
        text: 'refused ' + leader.name + ' over ' + action,
        kind: 'did',
      });
      // Being refused stings, and it is the refuser who thinks less of you for
      // having asked something they were not willing to do.
      this.relationships.addDeed(subordinate.id, leader.id, -3, this.time.tick);
      return false;
    }

    telemetry.count('order_obeyed');
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
  private exile(person: Person, band: Band, averageOpinion: number): void {
    this.removeBandMembership(person);
    void averageOpinion;
    void band;
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
        leader.name + ' has never had the idea of setting one person to one task';
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
        text: 'refused to take up work for ' + leader.name,
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
        ? 'was put to work as a ' + JOBS[job].label.toLowerCase()
        : 'was released from their work',
      kind: 'milestone',
    });
    return true;
  }

  /** The band of no band. Created the first time anyone is cast out. */
  private outcastBand(): Band {
    const existing = this.bands.find(b => b.outcast);
    if (existing) return existing;

    const band: Band = {
      id: this.bands.length + 1000,
      name: 'the outcast',
      homeX: this.world.width / 2,
      homeY: this.world.height / 2,
      norms: { ...DEFAULT_NORMS },
      chiefId: null,
      chiefSince: null,
      outcast: true,
    };
    this.bands.push(band);
    this.normsByBand.set(band.id, band.norms);
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
   * Eats one unit from the pack. Returns whether anything was eaten.
   *
   * Shares the cooking bonus with the action system by going through the same
   * arithmetic — a player who eats from the inventory panel and one who eats by
   * order must get the same nourishment.
   */
  eatItem(person: Person, itemId: string): boolean {
    const def = ITEMS[itemId];
    if (!def || def.nutrition <= 0) return false;
    if (person.inventory.remove(itemId, 1) === 0) return false;

    const cooked = nutritionFactor(person);
    person.needs.hunger = Math.max(0, person.needs.hunger - def.nutrition * cooked);
    telemetry.count('eat');
    return true;
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
      this.lastRefusal = receiver.name + ' cannot carry any more';
      return 0;
    }
    const moved = giver.inventory.remove(itemId, Math.min(room, count, giver.inventory.count(itemId)));
    if (moved === 0) return 0;
    receiver.inventory.add(itemId, moved);

    const nutrition = (ITEMS[itemId]?.nutrition ?? 0) * moved;
    if (nutrition > 0) {
      this.social.emit('share_food', giver, receiver, Math.min(1, nutrition / 60),
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
    const moved = store.accept(person.inventory, itemId, count);
    if (moved === 0) return 0;
    telemetry.count('stored', moved);
    return moved;
  }

  /** A finished store belonging to this person's band, close enough to use. */
  storeWithinReach(person: Person) {
    return this.buildings.find(b =>
      b.complete && b.def.storage > 0 &&
      b.ownerBandId === person.bandId &&
      b.contains(person.x, person.y, 2)
    ) ?? null;
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

  private noteStop(person: Person, action: string, reason: string): void {
    if (person.order === null) return;
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
    }
    for (const under of byRoof.values()) this.social.hearth(under, this.time.tick);
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
          return this.cancelOrder(person, 'that has to be made at a ' + label);
        }
      }
    }

    if (target.inscriptionId !== undefined) {
      const record = this.inscriptionsById.get(target.inscriptionId);
      if (!record) return this.cancelOrder(person, 'that record is gone');
      person.targetInscriptionId = record.id;
      person.targetX = record.x;
      person.targetY = record.y;
      return true;
    }

    if (target.pileId !== undefined) {
      const pile = this.pilesById.get(target.pileId);
      if (!pile || pile.empty) return this.cancelOrder(person, 'those goods are gone');
      if (this.isBuried(pile.x, pile.y)) return this.cancelOrder(person, 'it is under the snow');
      person.targetPileId = pile.id;
      person.targetX = pile.x;
      person.targetY = pile.y;
      return true;
    }

    if (target.personId !== undefined) {
      const other = this.peopleById.get(target.personId);
      if (!other || !other.alive) return this.cancelOrder(person, 'they are gone');
      person.targetPersonId = other.id;
      person.targetX = other.x;
      person.targetY = other.y;
      return true;
    }
    if (target.animalId !== undefined) {
      const animal = this.animalsById.get(target.animalId);
      if (!animal || !animal.alive) return this.cancelOrder(person, 'it is gone');
      person.targetAnimalId = animal.id;
      person.targetX = animal.x;
      person.targetY = animal.y;
      return true;
    }
    if (target.treeId !== undefined) {
      const tree = this.treesById.get(target.treeId);
      if (!tree || !tree.standing) return this.cancelOrder(person, 'that tree is gone');
      person.targetTreeId = tree.id;
      person.targetX = tree.x;
      person.targetY = tree.y;
      return true;
    }
    if (target.buildingId !== undefined) {
      const building = this.buildingsById.get(target.buildingId);
      if (!building) return this.cancelOrder(person, 'that building is gone');
      person.targetBuildingId = building.id;
      person.targetX = building.centerX;
      person.targetY = building.centerY;
      return true;
    }
    if (target.nodeId !== undefined) {
      const node = this.nodesById.get(target.nodeId);
      if (!node || node.depleted) return this.cancelOrder(person, 'there is nothing left there');
      if (node.def.groundLevel && this.isBuried(node.x, node.y)) {
        return this.cancelOrder(person, 'it is under the snow');
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
        if (!bank) return this.cancelOrder(person, 'no bank they can reach from here');
        person.targetX = bank.x;
        person.targetY = bank.y;
        return true;
      }
      if (!this.world.isWalkable(target.x, target.y)) {
        return this.cancelOrder(person, 'they cannot walk there');
      }
      if (!this.world.sameRegion(person.x, person.y, target.x, target.y)) {
        return this.cancelOrder(person, 'there is no way across');
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
  private cancelOrder(person: Person, reason = 'that cannot be done'): boolean {
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
    this.recordsInHand.clear();
    for (const record of this.inscriptions) {
      for (const tech of record.techs) {
        this.recordedTech.add(tech);
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
          return 'the ground there will not take it';
        }
      }
    }
    for (const existing of this.buildings) {
      const overlapsX = x < existing.x + existing.def.width && x + def.width > existing.x;
      const overlapsY = y < existing.y + existing.def.height && y + def.height > existing.y;
      if (overlapsX && overlapsY) {
        return 'the ' + existing.def.label.toLowerCase() + ' is already there';
      }
    }
    if (def.placement === 'shore' && !this.touchesShore(def, x, y)) {
      return 'a ' + def.label.toLowerCase() + ' has to sit at the water\u2019s edge';
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
   * Four collections, and one of them is a black hole: `household.store` is
   * written by `LifeSystem` when somebody dies and **read by nothing anywhere**.
   * Spoiling it is correct and must not be counted as the feature working. See
   * `bugs.md`.
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
    // Dropped goods and a dead person's effects keep no better than a pack.
    for (const pile of this.piles) sweep(pile.contents, 1);
    for (const household of this.households.values()) sweep(household.store, 1);
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
    if (!building.complete) return { perDay: 0, reason: 'not finished yet' };

    let power = 0;
    for (const person of this.people) {
      if (!person.alive || person.bandId !== building.ownerBandId) continue;
      if (building.def.requiresTech === null) continue;
      power = Math.max(power, techPower(person, building.def.requiresTech as Tech));
    }
    if (power <= 0) {
      return { perDay: 0, reason: 'nobody here remembers how to work it' };
    }
    if (building.storageFree <= 0) {
      return { perDay: 0, reason: 'full, and catching nothing until it is emptied' };
    }
    return {
      perDay: yielded.perDay * power,
      reason: 'catching on its own, and nobody has to stand here',
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
      const forest = this.forestSystem.daily(this.trees, {
        world: this.world,
        rng: this.forestRng,
        season: this.time.season,
        growth: this.time.growth,
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
        onExile: (person, band, average) => this.exile(person, band, average),
        abandonSite: site => this.removeBuilding(site),
        command: (leader, subordinate, action, target) =>
          this.command(leader, subordinate, action, target),
        assignJob: (leader, subordinate, job) => this.assignJob(leader, subordinate, job),
        leaveBand: person => this.removeBandMembership(person),
        onInsight: (person, text, kind) => this.noteInsight(person, text, kind),
        householdsById: this.householdsById,
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
      nodeHash: this.nodeHash,
      peopleHash: this.peopleHash,
      shoreHash: this.shoreHash,
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
      snowBuries: this.config.world.snowBuries,
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
      social: this.social,
      rng: this.actionRng,
      tick: this.time.tick,
      sightRadius: this.config.sightRadius,
      isNight: this.time.isNight,
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
      inscribe: (form: InscriptionForm, x: number, y: number, author: Person) =>
        this.placeInscription(form, x, y, author),
      onStopped: (person: Person, action: string, reason: string) =>
        this.noteStop(person, action, reason),
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
    for (const person of this.people) {
      if (person.alive) continue;
      anyDead = true;
      if (!person.affairsSettled) this.settleAffairs(person);
    }
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
