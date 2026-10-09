import { fromPersonRecord,toPersonRecord } from '../persistence/EntityRecords.ts';
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
    this.initialGeographicStart = retainStart(this.geography, geographicStart);
    this.frontier.setActive(frontierIdentityAt(this.geography, geographicStart));
    this.bindCurrentPolicies();
  }

  /** Rebind executable callbacks after construction, restoration, or a comarca handoff. */
  private bindCurrentPolicies(): void {
    const simulation = this.current;
    simulation.comarcaParent = id => this.findArchivedParent(id);
    simulation.comarcaTravel = {
      refusal: (person, direction, scout) => this.travelRefusal(simulation, person, direction, scout),
      arrive: request => this.arriveAcrossComarca(simulation, request),
      propose: (person, direction) => this.proposeMigration(simulation, person, direction),
    };
    simulation.comarcaMigration = () => this.migrationContextFor(simulation);
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
      for (const id of request.travellerIds) {
        const traveller = stagedDestination.peopleById.get(id)!;
        traveller.placeMemory = this.frontier.memoryAt(id,request.destination) ?? new PlaceMemory(stagedDestination.world.width,stagedDestination.world.height,48);
        if (!request.scout) (traveller.worldKnowledge ??= new WorldKnowledge()).see(request.destination.cx,request.destination.cy,stagedDestination.time.day);
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
      if (request.scout || (worldPlayer !== undefined && !request.travellerIds.includes(worldPlayer))) {
        const destinationTile = new TileLedger().capture({ geography: this.geography,
          current: stagedDestination, initialGeographicStart: destinationStart } as WorldState);
        const scoutRuntime = ComarcaOffmapRuntime.rebase(destinationRecord,destinationTile,destinationRuntime,this.frontier.compactState()).toRecord();
        this.storeTile(destinationTile);
        this.frontier.park(request.destination,destinationRecord,scoutRuntime);
        if (request.scout) this.frontier.addScout({ personId: request.actorId, source: request.source, destination: request.destination,
          departureTick: source.time.tick, returnTick: source.time.tick+2*source.config.time.ticksPerDay });
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

  advancePeoples(): void {
    const tick = this.current.time.tick;
    if (this.peoples && tick % this.current.config.time.ticksPerDay === 0) this.peoples.advanceTo(tick);
    if (tick % this.current.config.time.ticksPerDay === 0) this.advanceParkedTo(tick);
    this.returnScouts(tick);
    this.commitPendingCross();
    if (tick % this.current.config.time.ticksPerDay === 0) { this.reconcileFamilyLinks(); this.reconcileMacroResidents(); }
  }

  private findArchivedParent(id:number): Person|null {
    const here=this.current.peopleById.get(id); if(here) return here;
    for(const parked of this.frontier.toRecord().parked) for(const raw of parked.checkpoint.roster.people) {
      const person=fromPersonRecord(raw); if(person.id===id) return person;
    }
    return null;
  }
  /** IDs are global kin links. Foreign parents retain their child list without acquiring a second body owner. */
  private reconcileFamilyLinks(): void {
    const parked=this.frontier.toRecord().parked;
    const archive=new Map(this.current.peopleById);
    const locals=parked.map(slot=>({slot,people:slot.checkpoint.roster.people.map(fromPersonRecord)}));
    for(const local of locals) for(const person of local.people) archive.set(person.id,person);
    const changed=new Set<number>();
    for(const child of archive.values()) for(const id of [child.motherId,child.fatherId]) {
      const parent=id===null?null:archive.get(id); if(parent && !parent.childIds.includes(child.id)) {parent.childIds.push(child.id); changed.add(parent.id);}
    }
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
    const people=[...this.current.peopleById.values(),...this.frontier.toRecord().parked.flatMap(s=>s.checkpoint.roster.people.map(fromPersonRecord))];
    // A named newborn is another head held outside its mother's original cohort.
    for(const child of people) if(!origins.has(child.id) && child.motherId!==null && origins.has(child.motherId)) {
      const origin=origins.get(child.motherId)!; origins.set(child.id,origin); this.frontier.noteMaterialized(child.id,origin);
    }
    const held=new Map<number,number>(); for(const person of people) { const origin=origins.get(person.id); if(person.alive&&origin!==undefined) held.set(origin,(held.get(origin)??0)+1); }
    for(const origin of new Set(origins.values())) { const society=this.peoples.sim.peoples.get(origin); if(society) society.away=held.get(origin)??0; }
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
    tileLedger = new TileLedger(), frontierRecord?: ComarcaFrontierRecord): WorldState {
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
    const state = Object.create(WorldState.prototype) as WorldState;
    Object.defineProperties(state, {
      geography: { value: geography, enumerable: true },
      ids: { value: current.ids, enumerable: true },
      _current: { value: current, writable: true, enumerable: false },
      tileLedger: { value: tileLedger, enumerable: true },
      frontier: { value: frontier, enumerable: true },
      initialGeographicStart: { value: retainStart(geography, geographicStart), writable: true, enumerable: true },
      peoples: { value: restorePeoples(geography, geographicStart, peoplesRecord), writable: true, enumerable: true },
    });
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