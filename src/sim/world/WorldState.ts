import { knownRaidDestination, orderArrivingRaid, resolveCaravanInterception } from './WorldRaids.ts';
import { techPower, TECHS } from '../knowledge/Tech.ts';
import { WorldTrafficCoordinator, type WorldTrafficRecord } from './WorldTrafficCoordinator.ts';
import { fromHouseholdRecord,fromPersonRecord,toPersonRecord } from '../persistence/EntityRecords.ts';
import { findHeir } from '../systems/LifeSystem.ts';
import { knowledgeOfWorld } from '../social/Knowledge.ts';
import { ComarcaOffmapRuntime } from './ComarcaOffmapRuntime.ts';
import { PlaceMemory } from '../social/PlaceMemory.ts';
import { Person } from '../entities/Person.ts';
import { Household } from '../entities/Household.ts';
import { RNG } from '../core/RNG.ts';
import { NAME_ONSETS, NAME_CODAS } from '../../data/names.ts';
import { WorldKnowledge } from '../social/WorldKnowledge.ts';
import { materialize } from './PeopleMaterialize.ts';
import { populationOf } from './PeopleSim.ts';
import { comarcaResourceProfile } from './ResourceProfile.ts';
import { chooseLocalMigrationReason } from './ComarcaMigration.ts';
import { Simulation, worldFrameOf, type GeographicStart } from '../core/Simulation.ts';
import { IdSpace } from '../core/IdSpace.ts';
import type { DeepPartial, SimConfig } from '../core/Config.ts';
import { isWell } from '../entities/Building.ts';
import { t } from '../../i18n/i18n.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import type { WorldGeography } from './WorldGeography.ts';
import { legacyIslandGeography } from './WorldGeography.ts';
import { PeopleWorld, gridFromGeography, regionOfStart, type PeopleWorldRecord } from './PeopleWorld.ts';
import { TileLedger, comarcaIdentityAt, type ComarcaIdentity } from '../persistence/TileLedger.ts';
import { ComarcaFrontier, type ComarcaFrontierRecord } from './ComarcaFrontier.ts';
import { neighbourComarca, type ComarcaEdge } from './ComarcaNeighbour.ts';
import type { ComarcaTravelRequest } from './ComarcaTravel.ts';
import { approveMigration, canFollowMigration, knownMigrationDestinations, type ComarcaMigrationContext, type ComarcaMigrationProposal } from './ComarcaMigration.ts';
import { approachComarcaEdge } from './ComarcaTravel.ts';
import { fissionMigratingParty } from './ComarcaBandFission.ts';
import { comarcaRoute, journeyTransport, type JourneyPoint } from './Transport.ts';
import { transportOf, transportSpeedFactorOf } from '../core/TransportAnimals.ts';
import { capacityFor } from '../core/Carry.ts';
import { ITEMS } from '../entities/Item.ts';

export interface WorldStateGeographicStart {
  geography: WorldGeography;
  start: { x: number; y: number };
  comarcasWide?: number;
  comarcasHigh?: number;
  /**
   * Seed the rest of the map with peoples (phase 33a). On by default for a start with a map; off for a test that only
   * wants the detailed comarca and should not pay for a thousand peoples it never reads.
   */
  peoples?: boolean;
}

function retainStart(geography: WorldGeography, input: WorldStateGeographicStart | null) {
  if (!input) return null;
  return Object.freeze({
    geography,
    start: Object.freeze({ x: input.start.x, y: input.start.y }),
    comarcasWide: input.comarcasWide ?? 1,
    comarcasHigh: input.comarcasHigh ?? 1,
  });
}

/**
 * The browser's world root. The optional macro-map start builds a terrain and
 * resource world with explicit local water provenance. The default remains
 * the classic island; geographic selection in the browser comes later.
 */
export class WorldState {
  readonly geography: WorldGeography;
  readonly ids = new IdSpace();
  private _current!: Simulation;
  get current(): Simulation { return this._current; }
  set current(value: Simulation) {
    if (value.ids !== this.ids) throw new RangeError('A world root must keep its global IdSpace');
    this._current = value;
  }
  /** Detached comarca revisions survive root saves; this book activates no off-map motor. */
  readonly tileLedger = new TileLedger();
  readonly frontier: ComarcaFrontier;
  readonly traffic = new WorldTrafficCoordinator();
  private pendingWorldRaids: {leaderId:number;partyIds:number[];victimBandId:number;destination:JourneyPoint;plunder:boolean}[] = [];
  /** Original placement, kept by the root even though Simulation consumes it only during construction. */
  initialGeographicStart: (WorldStateGeographicStart & { comarcasWide: number; comarcasHigh: number }) | null;
  /**
   * The abstract peoples of every other habitable region (phase 33a), or null on the classic island, which has no map.
   * It owns nothing the detailed comarca owns: its streams are derived from the seed, not forked from `Simulation`.
   */
  readonly peoples: PeopleWorld | null;

  constructor(config: DeepPartial<SimConfig> = {}, geographicStart?: WorldStateGeographicStart) {
    this.geography = geographicStart?.geography ?? legacyIslandGeography();
    this.initialGeographicStart = retainStart(this.geography, geographicStart ?? null);
    this.frontier = new ComarcaFrontier(frontierIdentityAt(this.geography, geographicStart));
    // Optional geography is generation input only. No global RNG stream or
    // allocator is advanced until Simulation validates the requested start.
    const simulationStart: GeographicStart | undefined = geographicStart ? {
      geography: geographicStart.geography,
      ...geographicStart.start,
      comarcasWide: geographicStart.comarcasWide,
      comarcasHigh: geographicStart.comarcasHigh,
    } : undefined;
    this.current = new Simulation(config, this.ids, simulationStart);
    this.peoples = geographicStart && geographicStart.peoples !== false
      ? seedPeoples(this.geography, geographicStart.start, this.current)
      : null;
    this.bindCurrentPolicies();
  }

  /**
   * Run the world of peoples up to the detailed clock. Called once a game day by whoever steps `current` (the browser loop,
   * a harness): a seasonal update is due only a few times a year, and the schedule is a function of the steps alone, so
   * calling this every tick, every day or once a year yields the same world (tested).
   */
  installCurrent(current: Simulation, geographicStart: WorldStateGeographicStart | null): void {
    if (current.ids !== this.ids) throw new RangeError('A world root must keep its global IdSpace');
    if ((this.geography.kind === 'legacyIsland') !== (geographicStart === null)) throw new RangeError('Current placement must match world geography');
    this.current = current;
    if(geographicStart) current.worldFrame=worldFrameOf({geography:this.geography,...geographicStart.start,comarcasWide:geographicStart.comarcasWide??1,comarcasHigh:geographicStart.comarcasHigh??1});
    else current.worldFrame=null;
    this.initialGeographicStart = retainStart(this.geography, geographicStart);
    this.frontier.setActive(frontierIdentityAt(this.geography, geographicStart));
    this.bindCurrentPolicies();
  }

  /** Rebind executable callbacks after construction, restoration, or a comarca handoff. */
  private bindCurrentPolicies(): void {
    const simulation = this.current;
    const origin = this.frontier.active;
    simulation.social.worldOrigin = origin ? { cx: origin.cx, cy: origin.cy } : null;
    simulation.social.worldPersonById = id => this.findArchivedParent(id) ?? undefined;
    simulation.comarcaParent = id => this.findArchivedParent(id);
    simulation.comarcaTravel = {
      refusal: (person, direction, scout) => this.travelRefusal(simulation, person, direction, scout),
      arrive: request => this.arriveAcrossComarca(simulation, request),
      propose: (person, direction) => this.proposeMigration(simulation, person, direction),
    };
    simulation.comarcaMigration = () => this.migrationContextFor(simulation);
    simulation.worldRaidDestination = (actor,victim) => origin && this.geography.kind!=='legacyIsland' ? knownRaidDestination(actor,victim,origin,this.geography.map.width,(cx,cy)=>this.destinationIsLand(cx,cy)) : null;
    simulation.queueWorldRaid = request => { if(this.pendingWorldRaids.some(raid=>raid.partyIds.some(id=>request.partyIds.includes(id)))) return false; this.pendingWorldRaids.push({...request,partyIds:[...request.partyIds]}); return true; };
  }

  /** A player can commission a nearby merchant, using that merchant's real goods and route knowledge. */
  dispatchCaravanForPlayer(destination: JourneyPoint): string | null {
    const sim=this.current,player=sim.player;
    if(!player || !knowledgeOfWorld(player).at(destination.cx,destination.cy)) return t('Choose a known destination for the caravan');
    const merchant=sim.peopleHash.findNearest(player.x,player.y,sim.config.sightRadius,p=>p.alive&&!p.isPlayer&&p.bandId===player.bandId&&techPower(p,'trade')>0&&!!knowledgeOfWorld(p).at(destination.cx,destination.cy)&&[...p.inventory.entries()].some(([item,count])=>count>0&&ITEMS[item]?.nutrition===0));
    if(!merchant) return t('No nearby merchant knows that route and owns trade goods');
    const lore=knowledgeOfWorld(merchant).at(destination.cx,destination.cy);
    const bandId=lore?.peoples[0]?.bandId;
    if(bandId===undefined) return t('The merchant does not know a trading people there');
    const cargoOffer=[...merchant.inventory.entries()].filter(([item,count])=>count>0&&ITEMS[item]?.nutrition===0).map(([itemId,count])=>({itemId,count}));
    try { this.traffic.dispatchCaravan(this,{merchantId:merchant.id,destination,destinationBandId:bandId,cargoOffer}); return null; }
    catch { return t('That caravan could not be prepared safely'); }
  }

  private currentIdentity(simulation: Simulation): ComarcaIdentity | null {
    const start = this.initialGeographicStart;
    if (simulation !== this.current || !start) return null;
    return frontierIdentityAt(this.geography, start);
  }

  private destinationIdentity(source: ComarcaIdentity, direction: ComarcaEdge): ComarcaIdentity | null {
    if (this.geography.kind === 'legacyIsland') return null;
    const next = neighbourComarca({ mapWidth: this.geography.map.width, mapHeight: this.geography.map.height }, source.cx, source.cy, direction);
    return next ? comarcaIdentityAt(this.geography, next.cx, next.cy) : null;
  }

  private destinationIsLand(cx: number, cy: number): boolean {
    const profile = this.geography.profileAt(cx, cy);
    return profile.kind === 'earth' ? profile.land : profile.kind === 'random' && profile.biome !== 'ocean';
  }

  private travelRefusal(simulation: Simulation, person: import('../entities/Person.ts').Person, direction: ComarcaEdge, _scout: boolean): string | null {
    if (simulation !== this.current || simulation.peopleById.get(person.id) !== person || !person.alive) return t('That traveller is no longer here');
    const source = this.currentIdentity(simulation);
    if (!source || !simulation.worldFrame || simulation.worldFrame.comarcasWide !== 1 || simulation.worldFrame.comarcasHigh !== 1) {
      return t('This island has no neighbouring comarca');
    }
    const destination = this.destinationIdentity(source, direction);
    if (!destination) return t('There is no comarca in that direction');
    if (!this.destinationIsLand(destination.cx, destination.cy)) return t('The neighbouring comarca is under the sea');
    const parked = this.frontier.parkedAt(destination);
    void parked; // Its dated compact authority is brought forward transactionally at arrival.
    if (!approachComarcaEdge(simulation.world, person, direction)) return t('There is no walkable route to that edge');
    return null;
  }

  private arriveAcrossComarca(simulation: Simulation, request: ComarcaTravelRequest): string | null {
    const reason = this.travelRefusal(simulation, request.person, request.direction, request.scout);
    if (reason) return reason;
    const source = this.currentIdentity(simulation)!;
    const destination = this.destinationIdentity(source, request.direction)!;
    const party = new Set([request.person.id, ...(request.travellerIds ?? [])]);
    let grew = true;
    while (grew) { grew = false; for (const person of simulation.people) if (person.alive && person.carriedBy !== null && party.has(person.carriedBy) && !party.has(person.id)) { party.add(person.id); grew = true; } }
    const travellerIds = [...party].sort((a,b) => a-b);
    if (travellerIds.some(id => !simulation.peopleById.get(id)?.alive)) return t('A member of the travelling party is no longer here');
    try {
      this.frontier.queueCross({ actorId: request.person.id, direction: request.direction, source, destination,
        requestedAtTick: simulation.time.tick, travellerIds, scout: request.scout, migration: request.migration ?? false });
    } catch {
      return t('That crossing cannot be prepared right now');
    }
    return null;
  }

  private proposeMigration(simulation: Simulation, actor: import('../entities/Person.ts').Person, direction: ComarcaEdge): string | null {
    const origin = this.currentIdentity(simulation);
    const frame = simulation.worldFrame;
    if (!origin || !frame || simulation.peopleById.get(actor.id) !== actor || !actor.alive) return t('The person you were following is no longer here');
    const known = knownMigrationDestinations(actor, origin, { mapWidth: frame.mapWidth, mapHeight: frame.mapHeight },
      (cx, cy) => this.destinationIsLand(cx, cy));
    if (!known.some(destination => destination.direction === direction)) return t('The request was refused');
    const members = simulation.people.filter(person => person.alive && person.bandId === actor.bandId);
    const context = this.migrationContextFor(simulation)!;
    const reason = chooseLocalMigrationReason({ noFreshWater: !context.hasFreshWater,
      sustainedHunger: members.some(p=>(p.chronic.hunger ?? 0) >= .22),
      hostileStrongerNeighbour: context.hostileStrongerNeighbour({ id: actor.bandId }),
      overpopulation: members.length > (context.capacityRationsPerDay ?? Infinity),
      exile: simulation.bands.find(b=>b.id===actor.bandId)?.outcast ?? false }) ?? 'exile';
    const approval = approveMigration(actor, members, reason, simulation.relationships);
    if (!approval.approved) return t('The request was refused');
    const accepted: import('../entities/Person.ts').Person[] = [];
    for (const id of approval.supporterIds) {
      if (id === actor.id) continue;
      const follower = simulation.peopleById.get(id);
      if (!follower?.alive || !canFollowMigration(actor, follower, simulation.relationships, reason)) continue;
      if (simulation.command(actor, follower, 'follow_me', { personId: actor.id })) accepted.push(follower);
    }
    const voters = approval.voterIds.length;
    if ((accepted.length + 1) * 2 <= voters) {
      for (const follower of accepted) simulation.order(follower, 'idle');
      return t('The request was refused');
    }
    if (!simulation.order(actor, 'leave_comarca', { recipeId: 'migration', edge: direction })) {
      for (const follower of accepted) simulation.order(follower, 'idle');
      return simulation.lastRefusal ?? t('The request was refused');
    }
    return null;
  }

  private migrationContextFor(simulation: Simulation): ComarcaMigrationContext | null {
    const origin = this.currentIdentity(simulation);
    const frame = simulation.worldFrame;
    if (!origin || !frame || frame.comarcasWide !== 1 || frame.comarcasHigh !== 1) return null;
    return {
      origin: { cx: origin.cx, cy: origin.cy }, frame: { mapWidth: frame.mapWidth, mapHeight: frame.mapHeight },
      // A conservative, explicit harvest share; annual economic calibration remains step 4.
      capacityRationsPerDay: comarcaResourceProfile(this.geography, origin.cx, origin.cy).capacity * .25,
      hasFreshWater: simulation.world.freshShore.length > 0 || simulation.buildings.some(building => building.complete && !building.ruined && isWell(building.def)),
      hostileStrongerNeighbour: band => {
        const members = simulation.people.filter(p=>p.alive&&p.bandId===band.id);
        const known = new Set<number>();
        for (const member of members) knowledgeOfWorld(member).each((cx,cy,lore) => {
          if (Math.abs(cy-origin.cy)+Math.min(Math.abs(cx-origin.cx),frame.mapWidth-Math.abs(cx-origin.cx)) !== 1) return;
          for (const met of lore.peoples) known.add(met.bandId);
        });
        for (const id of known) {
          if (id === band.id || simulation.bandRelations.standing(band.id,id) > -25) continue;
          const detailed = simulation.people.filter(p=>p.alive&&p.bandId===id).length;
          const macro = this.peoples?.sim.peoples.get(id-1000000);
          const power = detailed || (macro ? populationOf(macro)/macro.comarcas : 0);
          if (power > members.length) return true;
        }
        return false;
      },
      canEnter: (cx, cy) => this.destinationIsLand(cx, cy),
      onProposal: (proposal: ComarcaMigrationProposal) => {
        const actor = simulation.peopleById.get(proposal.actorId);
        if (!actor?.alive) return;
        simulation.order(actor, 'propose', { recipeId: 'migration', edge: proposal.direction });
      },
      onScoutNeeded: (actorId: number, direction?: ComarcaEdge) => {
        const actor = simulation.peopleById.get(actorId);
        if (actor?.alive && direction) simulation.order(actor, 'scout', { edge: direction });
      },
    };
  }

  /** End-of-tick transactional owner swap. No live object changes until both staged checkpoints validate. */
  commitPendingCross(): boolean {
    const request = this.frontier.pendingCross;
    if (!request) return false;
    const source = this.current;
    const worldPlayer = source.player?.id ?? this.frontier.toRecord().parked.flatMap(s=>s.checkpoint.roster.people.map(fromPersonRecord)).find(p=>p.isPlayer)?.id;
    if (request.requestedAtTick !== source.time.tick || JSON.stringify(this.currentIdentity(source)) !== JSON.stringify(request.source)) {
      this.frontier.takePendingCross();
      source.lastRefusal = t('That crossing expired before it could be completed');
      return false;
    }
    const destinationStart: WorldStateGeographicStart = {
      geography: this.geography, start: { x: request.destination.cx + 0.5, y: request.destination.cy + 0.5 },
      comarcasWide: 1, comarcasHigh: 1, peoples: false,
    };
    let parkedDestination = this.frontier.parkedAt(request.destination);
    try {
      const stagedIds = IdSpace.fromSnapshot(this.ids.snapshot());
      const stagedPeoples = this.peoples ? restorePeoples(this.geography,this.initialGeographicStart,this.peoples.toRecord()) : null;
      const stagedSource = Simulation.fromCheckpointRecordWithSharedIds(toCheckpointRecord(source), stagedIds);
      let destinationRuntime = this.frontier.runtimeAt(request.destination);
      if (parkedDestination && parkedDestination.lastAdvancedTick < source.time.tick) {
        const savedTile = this.tileLedger.at(request.destination)!;
        const runtime = destinationRuntime ? ComarcaOffmapRuntime.fromRecord(destinationRuntime) : ComarcaOffmapRuntime.start(parkedDestination,savedTile);
        destinationRuntime = runtime.advanceTo(source.time.tick,this.geography,stagedIds,id=>this.findArchivedParent(id));
        parkedDestination = runtime.materialize();
      }
      let stagedDestination: Simulation;
      const newOrigins: [number,number][] = [];
      if (parkedDestination) stagedDestination = Simulation.fromCheckpointRecordWithSharedIds(parkedDestination, stagedIds);
      else {
        stagedDestination = new Simulation({ ...source.config, population: { ...source.config.population, bands: 0 } }, stagedIds,
          { geography: this.geography, ...destinationStart.start, comarcasWide: 1, comarcasHigh: 1 });
        stagedDestination.time.tick = source.time.tick;
        this.materializeResidents(stagedDestination,request.destination,stagedPeoples,newOrigins);
      }
      const enteringEdge: ComarcaEdge = request.direction === 'n' ? 's' : request.direction === 's' ? 'n' : request.direction === 'e' ? 'w' : 'e';
      const departureMemories = request.travellerIds.map(id=>({ id, memory: stagedSource.peopleById.get(id)!.placeMemory }));
      stagedSource.transferTravellersTo(stagedDestination, request.travellerIds, enteringEdge);
      // A `scout` order is written for an NPC sent ahead while the player stays
      // home (M15 phase 34): the party is parked at the destination, dated
      // knowledge is withheld until the dated return, and `source` keeps
      // running as the live comarca. But `WorldMapOverlay`'s travel buttons
      // always order `sim.player` (main.ts), so clicking "Scout" sends the
      // live controlled character, not a subordinate. For that traveller the
      // whole premise is backwards: there is no "home" left for them to pilot,
      // and the owner found their character gone for two in-game days with no
      // explanation, selection cleared and the globe reporting no knowledge at
      // all (`knowledgeOfWorld(null)`), because `commitPendingCross` parked
      // them exactly like an absent NPC. `playerTravelled` below is true only
      // for that case, and routes the controlled traveller through the normal
      // "install the destination" path a few lines down, same as `leave_comarca` —
      // they arrive controllable at once, see the place as themselves standing
      // in it, and no round-trip ticket is created, since nothing autonomous is
      // meant to walk them home again. A genuine NPC scout (never the player)
      // keeps the original delayed-knowledge, parked-destination, timed-return
      // behaviour untouched.
      const playerTravelled = worldPlayer !== undefined && request.travellerIds.includes(worldPlayer);
      for (const id of request.travellerIds) {
        const traveller = stagedDestination.peopleById.get(id)!;
        traveller.placeMemory = this.frontier.memoryAt(id,request.destination) ?? new PlaceMemory(stagedDestination.world.width,stagedDestination.world.height,48);
        if (!request.scout || playerTravelled) (traveller.worldKnowledge ??= new WorldKnowledge()).see(request.destination.cx,request.destination.cy,stagedDestination.time.day);
      }
      if (request.migration && !request.scout) fissionMigratingParty(stagedSource, stagedDestination, request.travellerIds);
      const sourceRecord = toCheckpointRecord(stagedSource);
      const destinationRecord = toCheckpointRecord(stagedDestination);
      // Capturing the tile and publishing the shared allocator are the final operations before swapping the owner.
      const sourceTile = this.tileLedger.capture(this);
      const sourceRuntime = ComarcaOffmapRuntime.start(sourceRecord,sourceTile,this.frontier.compactState(),this.frontier.ecologyState(request.source)).toRecord();
      for (const memory of departureMemories) this.frontier.remember(memory.id,request.source,memory.memory);
      if (destinationRuntime) { this.storeTile(destinationRuntime.ecology.entry); this.frontier.rememberCompact(destinationRuntime.compact); this.frontier.rememberEcology(destinationRuntime.ecology); }
      this.ids.restore(stagedIds.snapshot());
      if (stagedPeoples) Object.defineProperty(this,'peoples',{value:stagedPeoples});
      for(const [id,peopleId] of newOrigins) this.frontier.noteMaterialized(id,peopleId);
      const destination = Simulation.fromCheckpointRecordWithSharedIds(destinationRecord, this.ids);
      destination.worldFrame = worldFrameOf({ geography: this.geography, ...destinationStart.start, comarcasWide: 1, comarcasHigh: 1 });
      this.frontier.takePendingCross();
      // Unchanged for everyone except the controlled traveller (see above):
      // stay home and park the destination whenever either a genuine NPC
      // scout went out, or some known player exists elsewhere and did not
      // travel with this party.
      if (!playerTravelled && (request.scout || worldPlayer !== undefined)) {
        const destinationTile = new TileLedger().capture({ geography: this.geography,
          current: stagedDestination, initialGeographicStart: destinationStart } as WorldState);
        const scoutRuntime = ComarcaOffmapRuntime.rebase(destinationRecord,destinationTile,destinationRuntime,this.frontier.compactState()).toRecord();
        this.storeTile(destinationTile);
        this.frontier.park(request.destination,destinationRecord,scoutRuntime);
        if (request.scout) this.frontier.addScout({ personId: request.actorId, source: request.source, destination: request.destination,
          departureTick: source.time.tick, returnTick: source.time.tick+Math.max(1,Math.ceil(2*source.config.time.ticksPerDay/transportSpeedFactorOf(source.peopleById.get(request.actorId)!,source.animalsById))) });
        const home = Simulation.fromCheckpointRecordWithSharedIds(sourceRecord,this.ids);
        source.parkForTransfer();
        this.installCurrent(home,this.initialGeographicStart);
        return true;
      }
      this.frontier.unpark(request.destination);
      this.frontier.park(request.source, sourceRecord,sourceRuntime);
      this.frontier.setActive(request.destination);
      source.parkForTransfer();
      this.installCurrent(destination, destinationStart);
      return true;
    } catch {
      this.frontier.takePendingCross();
      source.lastRefusal = t('That crossing could not be completed safely');
      source.insights.push({ personId: request.actorId, text: source.lastRefusal, kind: 'setback' });
      return false;
    }
  }

  /** Queue a player-selected, knowledge-backed trip through the world root. */
  startJourney(destination: JourneyPoint, options: { actor?: Person; travellerIds?: readonly number[]; requireKnowledge?: boolean; migration?: boolean } = {}): string | null {
    const sourceSim=this.current, actor=options.actor ?? sourceSim.player, source=this.currentIdentity(sourceSim), frame=sourceSim.worldFrame;
    if (!actor || !source || !frame || sourceSim.peopleById.get(actor.id)!==actor || !actor.alive) return t('You cannot begin a journey right now');
    if (this.frontier.pendingJourney || this.frontier.pendingCross) return t('A journey is already under way');
    if (!Number.isSafeInteger(destination.cx) || !Number.isSafeInteger(destination.cy) || destination.cx<0 || destination.cy<0 || destination.cx>=frame.mapWidth || destination.cy>=frame.mapHeight) return t('That destination is outside the known world');
    if (options.requireKnowledge !== false && !knowledgeOfWorld(actor).at(destination.cx,destination.cy)) return t('You can only travel to a place someone here knows');
    const target=comarcaIdentityAt(this.geography,destination.cx,destination.cy);
    if (JSON.stringify(source)===JSON.stringify(target)) return t('You are already in that comarca');
    const route=comarcaRoute({cx:source.cx,cy:source.cy},destination,frame.mapWidth);
    const seaCells=route.slice(1).filter(point=>{ const p=this.geography.profileAt(point.cx,point.cy); return p.kind==='earth' ? !p.land : p.kind==='random' ? p.elevation<=0 : false; }).length;
    const lease=transportOf(actor,sourceSim.animalsById);
    const plan=journeyTransport({person:actor,from:source,to:destination,mapWidth:frame.mapWidth,mapHeight:frame.mapHeight,seaCells,snow:sourceSim.snowDepth>0,animal:lease?{mode:lease.mode,capacity:lease.capacity,speed:lease.speed}:null});
    if (!plan) return t('You do not have the transport needed for that journey');
    if (!this.destinationIsLand(destination.cx,destination.cy)) return t('That comarca is under the sea');
    const party=new Set(options.travellerIds ?? [actor.id]); party.add(actor.id);
    for(const follower of sourceSim.peopleHash.queryRadius(actor.x,actor.y,sourceSim.config.sightRadius)) {
      if(follower.id!==actor.id&&follower.alive&&follower.bandId===actor.bandId&&follower.action==='follow_me'&&follower.targetPersonId===actor.id) party.add(follower.id);
    }
    let grew=true; while(grew){grew=false;for(const person of sourceSim.people)if(person.alive&&person.carriedBy!==null&&party.has(person.carriedBy)&&!party.has(person.id)){party.add(person.id);grew=true;}}
    const ids=[...party].sort((a,b)=>a-b);
    if (ids.some(id=>{const person=sourceSim.peopleById.get(id);return !person?.alive||person.inventory.total>capacityFor(person,sourceSim.config.carry);})) return t('The travelling party is carrying too much');
    const stagedIds=IdSpace.fromSnapshot(this.ids.snapshot());
    try {
      const stagedPeoples=this.peoples?restorePeoples(this.geography,this.initialGeographicStart,this.peoples.toRecord()):null;
      const newOrigins:[number,number][]=[];
      const stagedSource=Simulation.fromCheckpointRecordWithSharedIds(toCheckpointRecord(sourceSim),stagedIds);
      const destinationStart:WorldStateGeographicStart={geography:this.geography,start:{x:destination.cx+.5,y:destination.cy+.5},comarcasWide:1,comarcasHigh:1,peoples:false};
      // A parked destination changes ownership to this ticket; otherwise this
      // one generated simulation becomes the comarca itself and is installed
      // after arrival. That prevents a second resource/animal/ID allocation.
      const parkedTarget=this.frontier.parkedAt(target), parkedRuntime=this.frontier.runtimeAt(target);
      let transit:Simulation;
      if(parkedTarget){
        let checkpoint=parkedRuntime?.checkpoint??parkedTarget;
        if(checkpoint.lastAdvancedTick<sourceSim.time.tick){
          const tile=this.tileLedger.at(target); if(!tile) throw new RangeError('Journey destination has no tile ledger');
          const offmap=parkedRuntime?ComarcaOffmapRuntime.fromRecord(parkedRuntime):ComarcaOffmapRuntime.start(parkedTarget,tile);
          checkpoint=offmap.advanceTo(sourceSim.time.tick,this.geography,stagedIds,id=>this.findArchivedParent(id)).checkpoint;
        }
        transit=Simulation.fromCheckpointRecordWithSharedIds(checkpoint,stagedIds);
      } else {
        transit=new Simulation({...sourceSim.config,population:{...sourceSim.config.population,bands:0}},stagedIds,{geography:this.geography,...destinationStart.start,comarcasWide:1,comarcasHigh:1});
        transit.time.tick=sourceSim.time.tick;
        this.materializeResidents(transit,target,stagedPeoples,newOrigins);
      }
      // The transit checkpoint must start on the same global tick as its source;
      // otherwise transfer rejects the trip and saving mixes two calendars.
      transit.time.tick=sourceSim.time.tick;
      const routeBefore=route.at(-2)!;
      const enteringEdge:ComarcaEdge=destination.cy<routeBefore.cy?'s':destination.cy>routeBefore.cy?'n':
        (destination.cx-routeBefore.cx+frame.mapWidth)%frame.mapWidth===1?'w':'e';
      stagedSource.transferTravellersTo(transit,ids,enteringEdge);
      for(const id of ids){const traveller=transit.peopleById.get(id)!;traveller.placeMemory=this.frontier.memoryAt(id,target)??new PlaceMemory(transit.world.width,transit.world.height,48);}
      const tpd=sourceSim.config.time.ticksPerDay, duration=Math.max(1,Math.ceil(plan.days*tpd));
      const arrivalTick=sourceSim.time.tick+duration;
      const provisions=ids.reduce((sum,id)=>sum+[...(transit.peopleById.get(id)?.inventory.entries()??[])].reduce((n,[item,count])=>n+(ITEMS[item]?.nutrition>0?count:0),0),0);
      const preservedProvisions=ids.reduce((sum,id)=>sum+[...(transit.peopleById.get(id)?.inventory.entries()??[])].reduce((n,[item,count])=>n+(ITEMS[item]?.nutrition>0&&ITEMS[item]?.spoilTicks===0?count:0),0),0);
      const cargoUnits=ids.reduce((sum,id)=>sum+(transit.peopleById.get(id)?.inventory.total??0),0);
      const transitRecord=toCheckpointRecord(transit);
      const journey={recordType:'ComarcaJourneyRecord' as const,version:1 as const,actorId:actor.id,travellerIds:ids,source,destination:target,departureTick:sourceSim.time.tick,arrivalTick,lastAdvancedTick:sourceSim.time.tick,route,enteringEdge,provisions,preservedProvisions,cargoUnits,migration:options.migration??false,playerTravelling:ids.includes(sourceSim.player?.id??-1),transport:plan,transit:transitRecord,rng:new RNG(`journey:${sourceSim.config.seed}:${actor.id}:${source.cx},${source.cy}:${destination.cx},${destination.cy}:${sourceSim.time.tick}`).snapshot(),encounters:[]};
      const sourceRecord=toCheckpointRecord(stagedSource);
      this.ids.restore(stagedIds.snapshot());
      if(stagedPeoples) Object.defineProperty(this,'peoples',{value:stagedPeoples});
      for(const [id,peopleId] of newOrigins) this.frontier.noteMaterialized(id,peopleId);
      this.frontier.setJourney(journey);
      if(parkedTarget) this.frontier.unpark(target);
      sourceSim.parkForTransfer(); this.installCurrent(Simulation.fromCheckpointRecordWithSharedIds(sourceRecord,this.ids),this.initialGeographicStart);
      return null;
    } catch { return t('That journey could not be prepared safely'); }
  }

  /** During a journey, call after every current.step(): batching across arrival
   * currently leaves the parked source ahead of the installed destination clock.
   * The browser uses this per-tick contract; batch handoff is tracked for M16. */
  advancePeoples(): void {
    const tick = this.current.time.tick;
    this.advanceJourney(tick);
    this.traffic.processCamps(this,tick);
    for(const arrival of this.traffic.advance(this,tick)) {
      if(arrival.event.kind==='raid-opportunity') this.resolveTrafficInterception(arrival.caravanId,arrival.at,arrival.actorId);
      if(arrival.kind==='raid' && arrival.event.kind!=='raid-opportunity' && JSON.stringify(arrival.at)===JSON.stringify(this.frontier.active) && arrival.victimBandId!==null) orderArrivingRaid(this.current,arrival.partyIds,arrival.victimBandId);
      if(arrival.kind==='caravan') this.traffic.orderCampTrade(this,arrival.caravanId);
    }
    for(const raid of this.pendingWorldRaids.splice(0)) {
      try { this.traffic.dispatchParty(this,{kind:'raid',actorId:raid.leaderId,travellerIds:raid.partyIds,destination:comarcaIdentityAt(this.geography,raid.destination.cx,raid.destination.cy),destinationBandId:raid.victimBandId,victimBandId:raid.victimBandId}); }
      catch { this.current.lastRefusal=t('That raid could not be prepared safely'); }
    }
    if (this.peoples && tick % this.current.config.time.ticksPerDay === 0) this.peoples.advanceTo(tick);
    if (tick % this.current.config.time.ticksPerDay === 0) this.advanceParkedTo(tick);
    this.returnScouts(tick);
    this.commitPendingCross();
    if (tick % this.current.config.time.ticksPerDay === 0) { this.reconcileFamilyLinks(); this.reconcileMacroResidents(); this.reconcileReturnedKnowledge(); }
  }

  private resolveTrafficInterception(caravanId:number,at:ComarcaIdentity,actorId:number):void {
    const active=JSON.stringify(at)===JSON.stringify(this.frontier.active);
    const parked=this.frontier.parkedAt(at);
    if(!active&&!parked){this.traffic.resolveRaid(this,caravanId,()=>{});return;}
    const stagedIds=IdSpace.fromSnapshot(this.ids.snapshot());
    let checkpoint=active?toCheckpointRecord(this.current):parked!;
    if(!active&&checkpoint.lastAdvancedTick<this.current.time.tick){
      const tile=this.tileLedger.at(at);
      if(!tile){this.traffic.resolveRaid(this,caravanId,()=>{});return;}
      const prior=this.frontier.runtimeAt(at);
      const runtime=prior?ComarcaOffmapRuntime.fromRecord(prior):ComarcaOffmapRuntime.start(checkpoint,tile);
      checkpoint=runtime.advanceTo(this.current.time.tick,this.geography,stagedIds,id=>this.findArchivedParent(id)).checkpoint;
    }
    const owner=Simulation.fromCheckpointRecordWithSharedIds(checkpoint,stagedIds);
    this.configureTrafficContacts(owner,at);
    const remaining: import('./WorldCaravans.ts').CaravanGoods[]=[];
    let record:ReturnType<typeof toCheckpointRecord>|null=null;
    let stagedTile:ReturnType<TileLedger['capture']>|null=null;
    let stagedRuntime:ReturnType<ComarcaOffmapRuntime['toRecord']>|null=null;
    // Capture both owners and their compact revision before acknowledging the
    // warning. A failed preparation must leave the cargo escrow authoritative.
    this.traffic.resolveRaid(this,caravanId,(convoy,event)=>{
      remaining.push(...resolveCaravanInterception(owner,convoy,event,actorId));
      convoy.ids.restore(stagedIds.snapshot());
      record=toCheckpointRecord(owner);
      if(!active){
        const placement:WorldStateGeographicStart={geography:this.geography,start:{x:at.cx+.5,y:at.cy+.5},comarcasWide:1,comarcasHigh:1};
        const tile=new TileLedger().capture({geography:this.geography,current:owner,initialGeographicStart:placement} as WorldState);
        const old=this.tileLedger.at(at);
        stagedTile={...tile,revision:Math.max(tile.revision,(old?.revision??0)+1)};
        stagedRuntime=ComarcaOffmapRuntime.rebase(record,stagedTile,this.frontier.runtimeAt(at),this.frontier.compactState()).toRecord();
      }
    },remaining);
    if(!record)return;
    this.ids.restore(stagedIds.snapshot());
    if(active){
      this.current.parkForTransfer();
      this.installCurrent(Simulation.fromCheckpointRecordWithSharedIds(record,this.ids),this.initialGeographicStart);
    }else{
      this.tileLedger.update(stagedTile!);
      this.frontier.park(at,record,stagedRuntime!);
    }
  }

  private advanceJourney(tick:number): void {
    const journey=this.frontier.pendingJourney; if(!journey) return;
    if(tick<=journey.lastAdvancedTick){if(journey.lastAdvancedTick>=journey.arrivalTick)this.arriveJourney(journey);return;}
    const stagedIds=IdSpace.fromSnapshot(this.ids.snapshot());
    const transit=Simulation.fromCheckpointRecordWithSharedIds(journey.transit,stagedIds);
    const tpd=transit.config.time.ticksPerDay, rng=RNG.fromSnapshot(journey.rng), encounters=[...journey.encounters];
    let arrivalTick=journey.arrivalTick, advanced=journey.lastAdvancedTick;
    // Do not collapse elapsed time into one needs update: food choice, spoilage,
    // death and daily effects must be identical across save/resume boundaries.
    while(advanced<tick && advanced<arrivalTick) {
      const next=advanced+1;
      transit.advanceJourneyTick(journey.travellerIds,next);
      advanced=next;
      if(next%tpd===0&&next<arrivalTick){
        const event=rng.next();
        if(event<0.04){encounters.push('storm');arrivalTick+=tpd;}
        else if(event<0.08){encounters.push('wildlife');const actor=transit.peopleById.get(journey.actorId);if(actor?.alive){actor.health-=5;if(actor.health<=0)actor.die('injury');}}
        else if(event<0.13) encounters.push('settlement');
      }
    }
    const provisions=journey.travellerIds.reduce((sum,id)=>sum+[...(transit.peopleById.get(id)?.inventory.entries()??[])].reduce((n,[item,count])=>n+(ITEMS[item]?.nutrition>0?count:0),0),0);
    const preservedProvisions=journey.travellerIds.reduce((sum,id)=>sum+[...(transit.peopleById.get(id)?.inventory.entries()??[])].reduce((n,[item,count])=>n+(ITEMS[item]?.nutrition>0&&ITEMS[item]?.spoilTicks===0?count:0),0),0);
    const cargoUnits=journey.travellerIds.reduce((sum,id)=>sum+(transit.peopleById.get(id)?.inventory.total??0),0);
    const updated={...journey,arrivalTick,lastAdvancedTick:advanced,provisions,preservedProvisions,cargoUnits,transit:toCheckpointRecord(transit),rng:rng.snapshot(),encounters};
    this.frontier.updateJourney(updated);
    if(advanced>=arrivalTick) this.arriveJourney(updated);
  }

  private arriveJourney(journey:import('./ComarcaFrontier.ts').ComarcaJourneyRecord): void {
    const source=this.current, destinationStart:WorldStateGeographicStart={geography:this.geography,start:{x:journey.destination.cx+.5,y:journey.destination.cy+.5},comarcasWide:1,comarcasHigh:1,peoples:false};
    const stagedIds=IdSpace.fromSnapshot(this.ids.snapshot());
    try {
      // Stage every owner and record first. The old ticket remains valid unless
      // all destination, source and UI-active checkpoint captures succeed.
      const transit=Simulation.fromCheckpointRecordWithSharedIds(journey.transit,stagedIds);
      transit.worldFrame=worldFrameOf({geography:this.geography,...destinationStart.start,comarcasWide:1,comarcasHigh:1});
      const dead=transit.people.filter(p=>journey.travellerIds.includes(p.id)&&!p.alive);
      const living=journey.travellerIds.filter(id=>transit.peopleById.get(id)?.alive);
      const stagedSource=journey.migration?Simulation.fromCheckpointRecordWithSharedIds(toCheckpointRecord(source),stagedIds):null;
      if(journey.migration&&living.length&&stagedSource) fissionMigratingParty(stagedSource,transit,living);
      for(const person of dead) if(person.isPlayer){transit.player=person;transit.succession={died:person,heir:findHeir(person,transit.peopleById)};}
      for(const id of living){const person=transit.peopleById.get(id)!;person.placeMemory=this.frontier.memoryAt(id,journey.destination)??new PlaceMemory(transit.world.width,transit.world.height,48);(person.worldKnowledge??=new WorldKnowledge()).see(journey.destination.cx,journey.destination.cy,transit.time.day);}
      transit.insights.push({personId:living[0]??journey.actorId,text:t('{name} completed a journey', {name:transit.peopleById.get(journey.actorId)?.name??t('a traveller')}),kind:'gain'});
      const destinationRecord=toCheckpointRecord(transit);
      const destinationTile=new TileLedger().capture({geography:this.geography,current:transit,initialGeographicStart:destinationStart} as WorldState);
      const destinationRuntime=ComarcaOffmapRuntime.rebase(destinationRecord,destinationTile,null,this.frontier.compactState()).toRecord();
      const committedSource=stagedSource??source;
      const sourceRecord=journey.playerTravelling?toCheckpointRecord(committedSource):null;
      const sourceTile=journey.playerTravelling?this.tileLedger.capture({geography:this.geography,current:committedSource,initialGeographicStart:this.initialGeographicStart} as WorldState):null;
      const sourceRuntime=sourceRecord&&sourceTile?ComarcaOffmapRuntime.start(sourceRecord,sourceTile,this.frontier.compactState(),this.frontier.ecologyState(journey.source)).toRecord():null;
      // Commit only after both sides and their persisted forms are ready.
      // Hydrate the UI owner with the root's canonical allocator, never the staging clone.
      this.ids.restore(stagedIds.snapshot());
      const executable=journey.playerTravelling?Simulation.fromCheckpointRecordWithSharedIds(destinationRecord,this.ids):null;
      if(executable) executable.worldFrame=worldFrameOf({geography:this.geography,...destinationStart.start,comarcasWide:1,comarcasHigh:1});
      this.storeTile(destinationTile);
      this.frontier.park(journey.destination,destinationRecord,destinationRuntime);
      if(journey.playerTravelling&&sourceRecord&&sourceTile&&sourceRuntime){
        this.storeTile(sourceTile); this.frontier.park(journey.source,sourceRecord,sourceRuntime);
        source.parkForTransfer(); this.frontier.unpark(journey.destination); this.frontier.setActive(journey.destination);
        this.installCurrent(executable!,destinationStart);
      }
      this.frontier.takeJourney();
    } catch {
      // Leave the serialized journey authoritative so a transient arrival error can retry.
      source.lastRefusal=t('Arrival could not be completed safely');
    }
  }

  private findArchivedParent(id:number): Person|null {
    const here=this.current.peopleById.get(id); if(here) return here;
    const record=this.frontier.toRecord();
    for(const parked of record.parked) for(const raw of parked.checkpoint.roster.people) {
      const person=fromPersonRecord(raw); if(person.id===id) return person;
    }
    if(record.journey) for(const raw of record.journey.transit.roster.people){const person=fromPersonRecord(raw);if(person.id===id)return person;}
    for(const ticket of this.traffic.partyRecords) if(ticket.party) for(const raw of ticket.party.roster.people){const person=fromPersonRecord(raw);if(person.id===id)return person;}
    return null;
  }
  /** Named archives are resolved across owners; callers still apply Knowledge. */
  worldPeople(): ReadonlyMap<number, Person> {
    const people = new Map<number, Person>();
    const root = this.frontier.toRecord();
    for (const parked of root.parked) for (const raw of parked.checkpoint.roster.people) { const person = fromPersonRecord(raw); people.set(person.id, person); }
    if (root.journey) for (const raw of root.journey.transit.roster.people) { const person = fromPersonRecord(raw); people.set(person.id, person); }
    for(const ticket of this.traffic.partyRecords) if(ticket.party) for(const raw of ticket.party.roster.people){const person=fromPersonRecord(raw);people.set(person.id,person);}
    for (const person of this.current.peopleById.values()) people.set(person.id, person);
    return people;
  }

  /** A split family has one identity and fragments of its roster in each owner. */
  worldHouseholds(): ReadonlyMap<number, Household> {
    const houses = new Map<number, Household>();
    const fragments = this.frontier.toRecord().parked.flatMap(slot => slot.checkpoint.roster.households.map(fromHouseholdRecord));
    const journey = this.frontier.pendingJourney;
    if (journey) fragments.push(...journey.transit.roster.households.map(fromHouseholdRecord));
    for(const ticket of this.traffic.partyRecords) if(ticket.party) fragments.push(...ticket.party.roster.households.map(fromHouseholdRecord));
    fragments.push(...this.current.households);
    for (const household of fragments) {
      const previous = houses.get(household.id);
      const copy = Object.assign(Object.create(Household.prototype), household) as Household;
      copy.memberIds = [...new Set([...(previous?.memberIds ?? []), ...household.memberIds])];
      houses.set(copy.id, copy);
    }
    return houses;
  }

  /** IDs are global kin links. Foreign parents retain their child list without acquiring a second body owner. */
  private reconcileFamilyLinks(): void {
    const parked=this.frontier.toRecord().parked;
    const archive=new Map(this.current.peopleById);
    const locals=parked.map(slot=>({slot,people:slot.checkpoint.roster.people.map(fromPersonRecord)}));
    const journey=this.frontier.pendingJourney;
    const travellers=journey?journey.transit.roster.people.map(fromPersonRecord):[];
    if(journey) for(const person of travellers) archive.set(person.id,person);
    for(const local of locals) for(const person of local.people) archive.set(person.id,person);
    const changed=new Set<number>();
    for(const child of archive.values()) for(const id of [child.motherId,child.fatherId]) {
      const parent=id===null?null:archive.get(id); if(parent && !parent.childIds.includes(child.id)) {parent.childIds.push(child.id); changed.add(parent.id);}
    }
    if(journey&&travellers.some(p=>changed.has(p.id))){const transit=Simulation.fromCheckpointRecordWithSharedIds(journey.transit,this.ids);for(const person of travellers){const live=transit.peopleById.get(person.id);if(live)live.childIds=[...person.childIds];}this.frontier.updateJourney({...journey,transit:toCheckpointRecord(transit)});}
    for(const {slot,people} of locals) {
      if(!people.some(p=>changed.has(p.id))) continue;
      const checkpoint={...slot.checkpoint,roster:{...slot.checkpoint.roster,people:people.map(p=>toPersonRecord(p,slot.checkpoint.lastAdvancedTick))}};
      const runtime=slot.runtime ? {...slot.runtime,checkpoint,compact:slot.runtime.compact.map(c=>({...c,person:toPersonRecord(archive.get(c.personId)!,c.lastAdvancedTick)}))} : undefined;
      this.frontier.park(slot.identity,checkpoint,runtime);
    }
  }
  private reconcileMacroResidents(): void {
    if(!this.peoples) return;
    const origins=new Map(this.frontier.materializedOrigins());
    const root=this.frontier.toRecord();
    const people=[...this.current.peopleById.values(),...root.parked.flatMap(s=>s.checkpoint.roster.people.map(fromPersonRecord)),...(root.journey?root.journey.transit.roster.people.map(fromPersonRecord):[]),...this.traffic.partyRecords.flatMap(ticket=>ticket.party?.roster.people.map(fromPersonRecord)??[])];
    // A named newborn is another head held outside its mother's original cohort.
    for(const child of people) if(!origins.has(child.id) && child.motherId!==null && origins.has(child.motherId)) {
      const origin=origins.get(child.motherId)!; origins.set(child.id,origin); this.frontier.noteMaterialized(child.id,origin);
    }
    const held=new Map<number,number>(); for(const person of people) { const origin=origins.get(person.id); if(person.alive&&origin!==undefined) held.set(origin,(held.get(origin)??0)+1); }
    for(const origin of new Set(origins.values())) { const society=this.peoples.sim.peoples.get(origin); if(society) society.away=held.get(origin)??0; }
  }
  /** Techniques reach a macro people only with a named carrier back in its home region. */
  private reconcileReturnedKnowledge():void {
    if(!this.peoples)return;
    const grid=gridFromGeography(this.geography);if(!grid)return;
    const origins=new Map(this.frontier.materializedOrigins());
    const owners=[...(this.frontier.active?[{at:this.frontier.active,people:this.current.people}]:[]),...this.frontier.toRecord().parked.map(slot=>({at:slot.identity,people:slot.checkpoint.roster.people.map(fromPersonRecord)}))];
    for(const owner of owners){
      const region=regionOfStart(grid,{x:owner.at.cx+.5,y:owner.at.cy+.5});
      for(const person of owner.people){
        const origin=origins.get(person.id);if(!person.alive||origin===undefined||this.peoples.regionOfPeople.get(origin)!==region)continue;
        const society=this.peoples.sim.peoples.get(origin);if(!society)continue;
        let changed=true;while(changed){changed=false;for(const tech of TECHS)if(person.knownTech.has(tech)&&!society.techs.has(tech)&&society.techs.prerequisitesHeld(tech)){society.techs.add(tech);changed=true;}}
      }
    }
  }

  private storeTile(entry: import('../persistence/TileLedger.ts').TileLedgerEntry): void {
    const old = this.tileLedger.at(entry.identity);
    this.tileLedger.update({ ...entry, revision: Math.max(entry.revision,(old?.revision ?? 0)+1) });
  }
  private advanceParkedTo(tick: number): void {
    for (const parked of this.frontier.toRecord().parked) {
      if (parked.checkpoint.lastAdvancedTick >= tick) continue;
      const tile = this.tileLedger.at(parked.identity);
      if (!tile) throw new RangeError('Parked comarca has no physical book');
      const runtime = parked.runtime ? ComarcaOffmapRuntime.fromRecord(parked.runtime) : ComarcaOffmapRuntime.start(parked.checkpoint,tile);
      const next = runtime.advanceTo(tick,this.geography,this.ids,id=>this.findArchivedParent(id));
      this.frontier.rememberCompact(next.compact); this.frontier.rememberEcology(next.ecology);
      this.frontier.park(parked.identity,next.checkpoint,next); this.storeTile(next.ecology.entry);
    }
  }
  private returnScouts(tick: number): void {
    for (const ticket of this.frontier.scouts.filter(s=>s.returnTick<=tick)) {
      this.advanceParkedTo(tick);
      const record = this.frontier.parkedAt(ticket.destination);
      if (!record) throw new RangeError('Scout destination has no owner');
      const ids = IdSpace.fromSnapshot(this.ids.snapshot());
      const away = Simulation.fromCheckpointRecordWithSharedIds(record,ids);
      const scout = away.peopleById.get(ticket.personId);
      const activeHome = JSON.stringify(this.frontier.active) === JSON.stringify(ticket.source);
      const homeRecord = activeHome ? toCheckpointRecord(this.current) : this.frontier.parkedAt(ticket.source);
      if (!homeRecord) throw new RangeError('Scout home has no owner');
      const home = Simulation.fromCheckpointRecordWithSharedIds(homeRecord,ids);
      if (scout?.alive) {
        const party = [scout.id,...away.people.filter(p=>p.alive&&p.carriedBy===scout.id).map(p=>p.id)];
        const source = ticket.source, destination = ticket.destination;
        const edge: ComarcaEdge = destination.cy<source.cy ? 'n' : destination.cy>source.cy ? 's'
          : (destination.cx-source.cx+(this.geography.kind === 'legacyIsland' ? 1 : this.geography.map.width))% (this.geography.kind === 'legacyIsland' ? 1 : this.geography.map.width)===1 ? 'e' : 'w';
        away.transferTravellersTo(home,party,edge);
        scout.placeMemory = this.frontier.memoryAt(scout.id,ticket.source) ?? new PlaceMemory(home.world.width,home.world.height,48);
        (scout.worldKnowledge ??= new WorldKnowledge()).see(ticket.destination.cx,ticket.destination.cy,home.time.day);
        for (const band of away.bands) if (away.people.some(p=>p.alive&&p.bandId===band.id)) scout.worldKnowledge.meet(ticket.destination.cx,ticket.destination.cy,band.id,home.time.day);
        home.insights.push({ personId: scout.id, text: t('{name} has returned from scouting', { name: scout.name }), kind: 'gain' });
      } else if (scout) {
        // A dead player returns as history, so the home can offer succession.
        // `commitPendingCross` no longer sends the live player down this
        // parked-scout path (2026-10-09 frontier-bug fix: `playerTravelled`
        // installs their destination at once instead), so a freshly created
        // ticket cannot name them here any more. This stays only to resolve a
        // ticket a save captured before that fix.
        if (scout.isPlayer) {
          away.people = away.people.filter(p=>p.id!==scout.id); away.peopleById.delete(scout.id); away.player=null;
          for(const household of away.households) { household.remove(scout.id); if(household.headId===scout.id) household.headId=household.memberIds[0]??scout.id; }
          home.people.push(scout); home.peopleById.set(scout.id,scout); home.player=scout;
          home.succession={died:scout,heir:findHeir(scout,home.peopleById)};
        }
        home.insights.push({ personId: home.player?.id ?? home.people[0]?.id ?? scout.id,
          text: t('{name} did not return from scouting', { name: scout.name }), kind: 'setback' });
      }
      this.ids.restore(ids.snapshot());
      const residual = toCheckpointRecord(away);
      const awayTile = this.tileLedger.at(ticket.destination)!;
      const awayRuntime = ComarcaOffmapRuntime.rebase(residual,awayTile,this.frontier.runtimeAt(ticket.destination),this.frontier.compactState()).toRecord();
      this.frontier.park(ticket.destination,residual,awayRuntime);
      if (activeHome) { this.current.parkForTransfer(); this.installCurrent(Simulation.fromCheckpointRecordWithSharedIds(toCheckpointRecord(home),this.ids),this.initialGeographicStart); }
      else {
        const homeCheckpoint = toCheckpointRecord(home), tile = this.tileLedger.at(ticket.source)!;
        this.frontier.park(ticket.source,homeCheckpoint,ComarcaOffmapRuntime.rebase(homeCheckpoint,tile,this.frontier.runtimeAt(ticket.source),this.frontier.compactState()).toRecord());
      }
      this.frontier.takeDueScouts(ticket.returnTick);
    }
  }
  /** Off-map contacts resolve a foreign storyteller's subject without changing its owner. */
  configureTrafficContacts(simulation:Simulation,at:ComarcaIdentity):void {
    simulation.social.worldOrigin={cx:at.cx,cy:at.cy};
    simulation.social.worldPersonById=id=>simulation.peopleById.get(id)??this.findArchivedParent(id)??undefined;
  }

  /** Stage named macro residents once; the caller commits this only after arrival records are valid. */
  prepareTrafficResidents(destination: Simulation, at: ComarcaIdentity): () => void {
    const staged=this.peoples?restorePeoples(this.geography,this.initialGeographicStart,this.peoples.toRecord()):null;
    const origins:[number,number][]=[];
    this.materializeResidents(destination,at,staged,origins);
    return () => { if(staged) Object.defineProperty(this,'peoples',{value:staged}); for(const [id,peopleId] of origins)this.frontier.noteMaterialized(id,peopleId); };
  }

  private materializeResidents(destination: Simulation, at: ComarcaIdentity, peoples: PeopleWorld | null, origins: [number,number][]): void {
    if (!peoples) return;
    const grid = gridFromGeography(this.geography)!;
    const region = regionOfStart(grid,{ x: at.cx+.5,y: at.cy+.5 });
    const ground: {x:number;y:number}[] = [];
    for(let y=1;y<destination.world.height-1;y++) for(let x=1;x<destination.world.width-1;x++) if(destination.world.isWalkable(x,y)) ground.push({x:x+.5,y:y+.5});
    if (!ground.length) return;
    for (const people of peoples.sim.peoples.values()) {
      if(peoples.regionOfPeople.get(people.id)!==region || populationOf(people)===0) continue;
      const rng = new RNG('frontier-residents|'+destination.config.seed+'|'+at.cx+'|'+at.cy+'|'+people.id);
      const count = Math.min(populationOf(people),destination.config.population.peoplePerBand,Math.ceil(populationOf(people)/people.comarcas));
      const drawn = materialize(people,count,rng);
      const bandId = 1000000+people.id;
      if(!destination.ids.snapshot().groups.band.occupied.includes(bandId)) destination.ids.claimGroupAtOrAfter('band',bandId);
      const point = ground[0]!;
      const band = { id: bandId, name: t('People {n}',{n:people.id}), homeX:point.x,homeY:point.y,
        norms: structuredClone(people.culture.norms), strangerRegard:people.culture.strangerRegard, chiefId:null,chiefSince:null,claimedCells:new Set<string>(),outcast:false };
      destination.bands.push(band);
      const privateState = destination as unknown as { normsByBand:Map<number,typeof band.norms>;strangerRegardByBand:Map<number,number> };
      privateState.normsByBand.set(bandId,band.norms); privateState.strangerRegardByBand.set(bandId,band.strangerRegard);
      for(const sample of drawn) {
        const spot = rng.pick(ground), name = rng.pick(NAME_ONSETS)+rng.pick(NAME_CODAS);
        const person = new Person(name,spot.x,spot.y,bandId,rng,destination.time.daysPerYear,destination.ids);
        origins.push([person.id,people.id]);
        person.sex=sample.sex; person.age=sample.ageYears*person.daysPerYear; for(const tech of sample.techs) person.knownTech.add(tech);
        const household = new Household(name,person.id,bandId,destination.time.tick,destination.ids); household.add(person.id);person.householdId=household.id;
        person.worldKnowledge=new WorldKnowledge();person.worldKnowledge.see(at.cx,at.cy,destination.time.day);
        destination.people.push(person);destination.peopleById.set(person.id,person);destination.peopleHash.insert(person);
        destination.households.push(household);destination.householdsById.set(household.id,household);
      }
    }
  }

  /** Join an independently restored Simulation checkpoint to its world root. */
  static fromRestored(current: Simulation, geography: WorldGeography,
    geographicStart: WorldStateGeographicStart | null, peoplesRecord: PeopleWorldRecord | null = null,
    tileLedger = new TileLedger(), frontierRecord?: ComarcaFrontierRecord, trafficRecord?: WorldTrafficRecord): WorldState {
    // The JSON reader is not the only caller of this public assembly path.
    // A classic checkpoint cannot acquire a salt coast merely by attaching
    // macro metadata. Geographic water provenance must come from its terrain.
    if (geography.kind !== 'legacyIsland' &&
        !current.world.waterKind &&
        (current.config.population.bands !== 0 || current.people.length > 0 || current.bands.length > 0)) {
      throw new RangeError('Geographic starts cannot restore a populated simulation before freshwater support');
    }
    if ((geography.kind === 'legacyIsland') !== (geographicStart === null) ||
        (geographicStart && geographicStart.geography !== geography)) {
      throw new RangeError('Restored geography must match its starting placement');
    }
    // The restored motor never saw its geography (construction input only), so
    // the root hands back the one fact it needs to keep writing `WorldKnowledge`.
    if (geographicStart) {
      current.worldFrame = worldFrameOf({ geography, ...geographicStart.start,
        comarcasWide: geographicStart.comarcasWide, comarcasHigh: geographicStart.comarcasHigh });
    }
    assertWorldTileLedger(tileLedger, geography, current);
    const frontier = frontierRecord ? ComarcaFrontier.fromRecord(frontierRecord) : new ComarcaFrontier(frontierIdentityAt(geography, geographicStart));
    const active = frontier.active;
    const expectedActive = frontierIdentityAt(geography, geographicStart);
    if (JSON.stringify(active) !== JSON.stringify(expectedActive)) throw new RangeError('Frontier active comarca does not match current placement');
    for (const parked of frontier.toRecord().parked) {
      if (geography.kind === 'legacyIsland' || JSON.stringify(parked.identity) !== JSON.stringify(comarcaIdentityAt(geography, parked.identity.cx, parked.identity.cy))) {
        throw new RangeError('Parked checkpoint geography does not match its world root');
      }
    }
    const journey = frontier.pendingJourney;
    if (journey) {
      if (geography.kind === 'legacyIsland' || JSON.stringify(journey.source) !== JSON.stringify(active) || JSON.stringify(journey.destination) !== JSON.stringify(comarcaIdentityAt(geography, journey.destination.cx, journey.destination.cy)) || journey.lastAdvancedTick !== current.time.tick || journey.arrivalTick < current.time.tick || frontier.parkedAt(journey.destination)) throw new RangeError('Journey ownership or date does not match its world root');
      const transitPeople = journey.transit.roster.people.map(record => fromPersonRecord(record));
      const transitIds = new Set(transitPeople.map(person => person.id));
      if (journey.travellerIds.some(id => !transitIds.has(id) || current.peopleById.has(id)) || (journey.playerTravelling ? current.player !== null || !transitPeople.some(person => person.isPlayer) : current.player !== null && journey.travellerIds.includes(current.player.id))) throw new RangeError('Journey party ownership does not match its world root');
      const ownedIds = new Set<number>(current.people.map(person => person.id));
      for (const parked of frontier.toRecord().parked) for (const record of parked.checkpoint.roster.people) { const person=fromPersonRecord(record); if (ownedIds.has(person.id)) throw new RangeError('Duplicate person owner in world root'); ownedIds.add(person.id); }
      for (const person of transitPeople) { if (ownedIds.has(person.id)) throw new RangeError('Duplicate person owner in world root'); ownedIds.add(person.id); }
      if (!transitIds.has(journey.actorId)) throw new RangeError('Journey actor is absent from its transit checkpoint');
    }
    const state = Object.create(WorldState.prototype) as WorldState;
    Object.defineProperties(state, {
      geography: { value: geography, enumerable: true },
      ids: { value: current.ids, enumerable: true },
      _current: { value: current, writable: true, enumerable: false },
      tileLedger: { value: tileLedger, enumerable: true },
      frontier: { value: frontier, enumerable: true },
      pendingWorldRaids: { value: [], writable: true },
      traffic: { value: trafficRecord ? WorldTrafficCoordinator.fromRecord(trafficRecord) : new WorldTrafficCoordinator(), enumerable: true },
      initialGeographicStart: { value: retainStart(geography, geographicStart), writable: true, enumerable: true },
      peoples: { value: restorePeoples(geography, geographicStart, peoplesRecord), writable: true, enumerable: true },
    });
    if(trafficRecord && trafficRecord.tick > current.time.tick) throw new RangeError('Traffic clock exceeds root clock');
    const schedules=state.traffic.caravans;
    for(const ticket of state.traffic.partyRecords) {
      const schedule=schedules.get(ticket.caravanId);
      if(geography.kind==='legacyIsland' || [ticket.source,ticket.destination].some(at=>JSON.stringify(at)!==JSON.stringify(comarcaIdentityAt(geography,at.cx,at.cy)))) throw new RangeError('Traffic geography does not match world root');
      if(!schedule || JSON.stringify(schedule.source)!==JSON.stringify(ticket.source) || JSON.stringify(schedule.destination)!==JSON.stringify(ticket.destination) || JSON.stringify(schedule.route)!==JSON.stringify(ticket.route) || !schedule.travellers.some(person=>person.personId===ticket.actorId)) throw new RangeError('Traffic schedule differs from party');
      if(ticket.lastAdvancedTick>current.time.tick) throw new RangeError('Traffic party exceeds root clock');
      if(ticket.party) {
        if(ticket.party.lastAdvancedTick!==ticket.lastAdvancedTick) throw new RangeError('Traffic party checkpoint clock differs');
        const detached=Simulation.fromCheckpointRecord(ticket.party),rootIds=current.ids.snapshot(),partyIds=detached.ids.snapshot();
        for(const kind of Object.keys(rootIds.next) as (keyof typeof rootIds.next)[]) if(rootIds.next[kind]<partyIds.next[kind]) throw new RangeError('Traffic allocator exceeds root allocator');
        for(const kind of ['band','herd'] as const) if(partyIds.groups[kind].occupied.some(id=>!rootIds.groups[kind].occupied.includes(id))) throw new RangeError('Traffic group allocator exceeds root allocator');
        if(!ticket.travellerIds.includes(ticket.actorId)) throw new RangeError('Traffic actor is absent from party');
      }
    }
    state.traffic.validateOwners(state);
    state.bindCurrentPolicies();
    return state;
  }
}

function peopleOptions(geography: WorldGeography, start: { x: number; y: number }) {
  const grid = gridFromGeography(geography)!;
  return { grid, options: { game: true, trackEvents: false, reserved: new Set([regionOfStart(grid, start)]) } };
}

/** The peoples of every other region, from the world's own seed. The detailed comarca holds the player's region. */
function seedPeoples(geography: WorldGeography, start: { x: number; y: number }, current: Simulation): PeopleWorld | null {
  if (!gridFromGeography(geography)) return null;
  const { grid, options } = peopleOptions(geography, start);
  return new PeopleWorld(grid, String(current.config.seed), options);
}

function restorePeoples(geography: WorldGeography, start: WorldStateGeographicStart | null, record: PeopleWorldRecord | null): PeopleWorld | null {
  if (!record) return null;
  if (!start || !gridFromGeography(geography)) throw new RangeError('A world of peoples needs a map to stand on');
  const { grid, options } = peopleOptions(geography, start.start);
  return PeopleWorld.fromRecord(grid, record, options);
}


/** A root must never attach another map's book or restore local history from its future. */
export function assertWorldTileLedger(ledger: TileLedger, geography: WorldGeography, current: Simulation): void {
  for (const entry of ledger.toRecord().entries) {
    if (geography.kind === 'legacyIsland' ||
        JSON.stringify(entry.identity) !== JSON.stringify(comarcaIdentityAt(geography, entry.identity.cx, entry.identity.cy))) {
      throw new RangeError('Tile ledger geography does not match its world root');
    }
    const expectedDay = current.config.time.startDay + Math.floor(entry.lastAdvancedTick / current.config.time.ticksPerDay);
    if (entry.lastAdvancedTick > current.time.tick || entry.lastAdvancedDay !== expectedDay) {
      throw new RangeError('Tile ledger date does not match its world clock');
    }
  }
}

/** Only a one-comarca local map aligned to global tile bounds has an address in the frontier. */
function frontierIdentityAt(geography: WorldGeography, start: WorldStateGeographicStart | null | undefined) {
  if (!start || geography.kind === 'legacyIsland' || (start.comarcasWide ?? 1) !== 1 || (start.comarcasHigh ?? 1) !== 1) return null;
  const cx = start.start.x - 0.5;
  const cy = start.start.y - 0.5;
  if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cy)) return null;
  return comarcaIdentityAt(geography, cx, cy);
}