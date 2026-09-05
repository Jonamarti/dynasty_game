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
import { SpatialHash } from './SpatialHash.ts';
import { telemetry } from './Telemetry.ts';
import { makeConfig, type SimConfig, type DeepPartial } from './Config.ts';
import { Person, resetPersonIds } from '../entities/Person.ts';
import { ITEMS } from '../entities/Item.ts';
import { ResourceNode, resetResourceIds, type ResourceKind } from '../entities/ResourceNode.ts';
import { NeedsSystem } from '../systems/NeedsSystem.ts';
import { MovementSystem, resetMovementState } from '../systems/MovementSystem.ts';
import { ActionSystem } from '../systems/ActionSystem.ts';
import { Brain } from '../ai/Brain.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { SocialSystem, resetEventIds } from '../social/SocialSystem.ts';
import { DEFAULT_NORMS, VARIABLE_NORMS, type Norms } from '../social/Events.ts';
import { Building, BUILDINGS, resetBuildingIds, type BuildingDef } from '../entities/Building.ts';
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
import { eraFor, TECHS, type EraDef, type Tech } from '../knowledge/Tech.ts';
import { standingOver, type AuthorityContext } from '../social/Authority.ts';
import { NAME_ONSETS, NAME_CODAS } from '../../data/names.ts';

/** Era ids in order, so a change can be reported as a gain or a loss. */
const ERA_ORDER = ['stone', 'fire', 'hearth', 'tools', 'craft', 'sowing'];

/** One ended action, waiting to be reported. See `Simulation.interruptions`. */
export interface StopNotice {
  personId: number;
  /** What they were doing, captured before the action reset to `idle`. */
  action: string;
  /** The raw reason id; `stopReasonLabel` turns it into something readable. */
  reason: string;
}

/**
 * Stops worth coming back to.
 *
 * A need, not a fact about the world: "he went for a drink" is an interruption,
 * "the tree is gone" is the end of the matter.
 */
const RESUMABLE_STOPS = new Set(['thirsty', 'hungry', 'cold']);

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
   * Knowledge the world has. Empty to begin with: the advanced designs in
   * `BUILDINGS` are declared but unreachable until M4 makes discovery real.
   */
  readonly knownTech = new Set<string>();
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

  /** Set when the player's character dies, so the UI can offer the succession. */
  succession: { died: Person; heir: Person | null } | null = null;

  readonly relationships = new RelationshipGraph();
  readonly social: SocialSystem;
  private readonly normsByBand = new Map<number, Norms>();

  private readonly needsSystem: NeedsSystem;
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
  /** Recomputed daily from who is alive. An era can be lost as well as gained. */
  era: EraDef = { id: 'stone', label: 'Stone Age', needs: [], heldBy: 0, description: '' };
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
    this.movementSystem = new MovementSystem(this.world, moveRng);
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

    resetPersonIds();
    resetResourceIds();
    resetMovementState();
    resetEventIds();
    resetBuildingIds();
    resetHouseholdIds();
    resetTreeIds();
    resetPileIds();
    resetAnimalIds();

    // Births need to construct people, but LifeSystem cannot import the Person
    // constructor without a cycle (Person -> Memory -> Events, and Simulation
    // owns them all), so the factory is injected here.
    setChildFactory((mother, childRng) => {
      const name = childRng.pick(NAME_ONSETS) + childRng.pick(NAME_CODAS);
      return new Person(name, mother.x, mother.y, mother.bandId, childRng);
    });

    this.shoreHash.rebuild(this.world.shoreTiles);

    // The wood is planted before anything else looks for it: a band founded in
    // a clearing and a band founded under oaks have very different prospects.
    this.trees = seedInitialForest(this.world, this.rng.fork(), this.config.world.treeDensity);
    for (const tree of this.trees) this.treesById.set(tree.id, tree);
    this.treeHash.rebuild(this.trees);

    this.spawnResources(spawnRng);
    this.spawnHerds(spawnRng);
    this.spawnPeople(spawnRng);
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
      makePerson: (name, x, y, bandId, personRng) =>
        new Person(name, x, y, bandId, personRng),
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
    };
  }

  /** What `leader` could make `subordinate` do, and how likely they are to. */
  standing(leader: Person, subordinate: Person, action: string) {
    return standingOver(leader, subordinate, action, this.authorityContext());
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
    const outcasts = this.outcastBand();
    person.bandId = outcasts.id;
    person.clearTarget();
    person.forgetPlans();
    person.action = 'idle';
    void averageOpinion;
    void band;
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
    const holders = countHolders(living);
    this.techHolders.clear();
    for (const [tech, count] of holders) this.techHolders.set(tech, count);

    this.knownTech.clear();
    for (const tech of TECHS) {
      if ((holders.get(tech) ?? 0) > 0) this.knownTech.add(tech);
    }

    const adults = living.filter(p => !p.isChild).length;
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

  /** Picks a pile back up, as far as the carrier has room for. */
  takeFromPile(person: Person, pile: ItemPile): number {
    let moved = 0;
    for (const [itemId, count] of pile.contents.entries()) {
      const room = person.carryCapacity - person.carrying - moved;
      if (room <= 0) break;
      const taken = pile.contents.remove(itemId, Math.min(count, room));
      person.inventory.add(itemId, taken);
      moved += taken;
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

    const cooked = person.knownTech.has('cooking') ? 1.35 : 1;
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
   */
  handOver(giver: Person, receiver: Person, itemId: string): number {
    const room = receiver.carryCapacity - receiver.carrying;
    if (room <= 0) {
      this.lastRefusal = receiver.name + ' cannot carry any more';
      return 0;
    }
    const moved = giver.inventory.remove(itemId, Math.min(room, giver.inventory.count(itemId)));
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

  /** Puts a stack into a store. Returns how much fitted. */
  storeItem(person: Person, store: Building, itemId: string): number {
    const room = store.storageFree;
    if (room <= 0) return 0;
    const moved = person.inventory.remove(itemId, Math.min(room, person.inventory.count(itemId)));
    if (moved === 0) return 0;
    store.store.add(itemId, moved);
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
  private noteStop(person: Person, action: string, reason: string): void {
    if (person.order === null) return;
    this.interruptions.push({ personId: person.id, action, reason });
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
      x: pending.nodeId === null && pending.treeId === null &&
        pending.buildingId === null && pending.personId === null &&
        pending.animalId === null ? pending.x ?? undefined : undefined,
      y: pending.nodeId === null && pending.treeId === null &&
        pending.buildingId === null && pending.personId === null &&
        pending.animalId === null ? pending.y ?? undefined : undefined,
    });
    // A refusal here is ordinary — the bush was stripped while they drank — and
    // must not surface as a refusal message the player never asked for.
    this.lastRefusal = null;
    telemetry.count(ok ? 'order_resumed' : 'resume_impossible');
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
   * True if `def` can stand with its top-left corner at (x, y): every tile
   * walkable, and nothing already there.
   */
  canPlace(def: BuildingDef, x: number, y: number): boolean {
    for (let dy = 0; dy < def.height; dy++) {
      for (let dx = 0; dx < def.width; dx++) {
        if (!this.world.isWalkable(x + dx, y + dy)) return false;
      }
    }
    for (const existing of this.buildings) {
      const overlapsX = x < existing.x + existing.def.width && x + def.width > existing.x;
      const overlapsY = y < existing.y + existing.def.height && y + def.height > existing.y;
      if (overlapsX && overlapsY) return false;
    }
    return true;
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
      for (const node of this.nodes) node.regrow(20, growth);
    }

    this.wildlifeSystem.update(this.animals, {
      world: this.world,
      rng: this.wildlifeRng,
      tick: this.time.tick,
      peopleHash: this.peopleHash,
    });

    this.needsSystem.update(this.people, this.time, this.buildings);

    // Memories and relationships age once a day, not every tick. Decaying
    // sixty people's worth of both every step would be the most expensive
    // thing in the loop, and nothing in the design could tell the difference.
    if (this.time.tick % this.config.time.ticksPerDay === 0) {
      this.social.dailyUpkeep(this.people);
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
      });

      this.knowledgeSystem.daily(this.people, {
        rng: this.knowledgeRng,
        tick: this.time.tick,
        peopleHash: this.peopleHash,
      });
      this.refreshEra();

      this.lifeSystem.daily(this.people, {
        rng: this.lifeRng,
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
      sightRadius: this.config.sightRadius,
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
      onStopped: (person: Person, action: string, reason: string) =>
        this.noteStop(person, action, reason),
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
        // The player's character is scored but never steered: the HUD shows
        // what they feel like doing, and the human decides whether to listen.
        if (person.isPlayer) this.brain.score(person, brainCtx);
        else this.brain.think(person, brainCtx);
      } else if (person.isPlayer && (this.time.tick + person.thinkOffset) % interval === 0) {
        // The player is scored even while under orders, so the HUD can always
        // show what their character feels like doing. They are never steered.
        this.brain.score(person, brainCtx);
      }

      this.actionSystem.execute(person, actionCtx);
    }

    this.cleanupDead();
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
      foodInWorld: this.nodes.reduce(
        (sum, n) => sum + (n.kind === 'berries' ? n.amount : 0), 0
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
      fruitOnTrees: Math.round(this.trees.reduce((sum, t) => sum + t.fruit, 0)),
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
