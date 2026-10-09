/**
 * Phase 36 root traffic coordinator. Only this service owns persons while a
 * named caravan/raid party is away from every active or parked comarca.
 * Scheduler records carry route/cargo intent; checkpoints carry the actual
 * Person graph. Stock and identity moves are committed together by the root.
 */
import { Simulation, worldFrameOf } from '../core/Simulation.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { ITEMS } from '../entities/Item.ts';
import { toCheckpointRecord, type CheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { fromPersonRecord, toPersonRecord } from '../persistence/EntityRecords.ts';
import { TileLedger, comarcaIdentityAt, type ComarcaIdentity, type TileLedgerEntry } from '../persistence/TileLedger.ts';
import { knowledgeOfWorld } from '../social/Knowledge.ts';
import type { MemoryEntry } from '../social/Memory.ts';
import { techPower } from '../knowledge/Tech.ts';
import { ComarcaOffmapRuntime } from './ComarcaOffmapRuntime.ts';
import { comarcaRoute, journeyTransport, type JourneyPoint } from './Transport.ts';
import { transportOf } from '../core/TransportAnimals.ts';
import { capacityFor } from '../core/Carry.ts';
import { WorldCaravans, exchangeCaravanGoods, type CaravanEvent, type CaravanGoods, type WorldCaravansRecord } from './WorldCaravans.ts';
import type { WorldState } from './WorldState.ts';
import type { WorldStateGeographicStart } from './WorldState.ts';

export type TrafficKind = 'caravan' | 'raid';
export interface TrafficPartyRecord {
 readonly caravanId:number; readonly kind:TrafficKind; readonly actorId:number;
 readonly travellerIds:readonly number[]; readonly source:ComarcaIdentity; readonly destination:ComarcaIdentity;
 readonly victimBandId:number|null; readonly lastAdvancedTick:number; readonly arrivalTick:number; readonly route:readonly JourneyPoint[];
 readonly party:CheckpointRecord|null; readonly merchantId:number|null;
}
export interface WorldTrafficRecord {
 readonly recordType:'WorldTrafficRecord'; readonly version:1; readonly tick:number; readonly nextId:number;
 readonly caravans:WorldCaravansRecord; readonly parties:readonly TrafficPartyRecord[];
}
export type TrafficWorld=Pick<WorldState,'current'|'ids'|'geography'|'initialGeographicStart'|'frontier'|'tileLedger'|'peoples'|'installCurrent'|'prepareTrafficResidents'|'configureTrafficContacts'>;
export interface DispatchPartyInput {
 readonly kind:TrafficKind; readonly actorId:number; readonly travellerIds:readonly number[];
 readonly destination:ComarcaIdentity; readonly destinationBandId:number; readonly source?:ComarcaIdentity;
 readonly merchantId?:number; readonly cargo?:readonly CaravanGoods[]; readonly victimBandId?:number;
}
export interface DispatchCaravanInput { readonly merchantId:number; readonly destination:{readonly cx:number;readonly cy:number}; readonly destinationBandId:number; readonly cargoOffer?:readonly CaravanGoods[]; readonly escortIds?:readonly number[] }
export interface TrafficArrival { readonly kind:TrafficKind; readonly caravanId:number; readonly partyIds:readonly number[]; readonly actorId:number; readonly at:ComarcaIdentity; readonly victimBandId:number|null; readonly event:CaravanEvent }
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
function invalid(reason:string):never { throw new RangeError('WorldTraffic: '+reason); }
function pointOf(id:ComarcaIdentity):JourneyPoint { return {cx:id.cx,cy:id.cy}; }
function same(a:ComarcaIdentity|null,b:ComarcaIdentity):boolean { return !!a&&JSON.stringify(a)===JSON.stringify(b); }
function enteringEdge(route:readonly JourneyPoint[],mapWidth:number):'n'|'e'|'s'|'w' {
 const a=route.at(-2)!,b=route.at(-1)!; if(b.cy<a.cy)return 's';if(b.cy>a.cy)return 'n';return (b.cx-a.cx+mapWidth)%mapWidth===1?'w':'e';
}
function startsAt(state:TrafficWorld,identity:ComarcaIdentity):WorldStateGeographicStart {
 return {geography:state.geography,start:{x:identity.cx+.5,y:identity.cy+.5},comarcasWide:1,comarcasHigh:1,peoples:false};
}
function isLand(state:TrafficWorld,p:JourneyPoint):boolean { const profile=state.geography.profileAt(p.cx,p.cy); return profile.kind==='earth'?profile.land:profile.kind==='random'&&profile.biome!=='ocean'; }
function cargo(value:readonly CaravanGoods[]|undefined):CaravanGoods[] {
 const result=[...(value??[])].map(v=>({itemId:v.itemId,count:v.count})).sort((a,b)=>a.itemId.localeCompare(b.itemId));
 const seen=new Set<string>();for(const stack of result){if(!Object.hasOwn(ITEMS,stack.itemId)||!Number.isSafeInteger(stack.count)||stack.count<=0||seen.has(stack.itemId))invalid('invalid cargo offer');seen.add(stack.itemId);}return result;
}
function partyIds(sim:Simulation,actorId:number,requested:readonly number[]):number[] {
 const selected=new Set<number>([actorId,...requested]);
 if(selected.size!==requested.length+(!requested.includes(actorId)?1:0)) invalid('duplicate party IDs');
 let changed=true;while(changed){changed=false;for(const person of sim.people)if(person.alive&&person.carriedBy!==null&&selected.has(person.carriedBy)&&!selected.has(person.id)){selected.add(person.id);changed=true;}}
 const result=[...selected].sort((a,b)=>a-b);for(const id of result){const p=sim.peopleById.get(id);if(!p?.alive||!sim.people.includes(p))invalid('party member is not living and active');}
 return result;
}

/** Owns world caravan schedules and their one canonical transit checkpoint per party. */
export class WorldTrafficCoordinator {
 private scheduler=new WorldCaravans(); private parties=new Map<number,TrafficPartyRecord>(); private nextId=1; private clock=0;
 get caravans():WorldCaravans { return WorldCaravans.fromRecord(this.scheduler.toRecord()); }
 get partyRecords():TrafficPartyRecord[] { return [...this.parties.values()].sort((a,b)=>a.caravanId-b.caravanId).map(clone); }

 dispatchCaravan(state:TrafficWorld,input:DispatchCaravanInput):number {
  const sim=state.current, merchant=sim.peopleById.get(input.merchantId), source=state.frontier.active;
  if(!source||!merchant||!merchant.alive||merchant.isPlayer||!sim.people.includes(merchant))invalid('caravans require a living local NPC merchant');
  if(techPower(merchant,'trade')<=0)invalid('merchant has not learned trade');
  const dest=comarcaIdentityAt(state.geography,input.destination.cx,input.destination.cy);if(same(source,dest))invalid('destination is the current comarca');
  const route=comarcaRoute(pointOf(source),pointOf(dest),sim.worldFrame?.mapWidth??0);if(route.some(p=>!isLand(state,p)))invalid('caravans need a known all-land route');
  for(const p of route)if(!knowledgeOfWorld(merchant).at(p.cx,p.cy))invalid('merchant does not know the whole route');
  const animal=transportOf(merchant,sim.animalsById);
  const plan=journeyTransport({person:merchant,from:pointOf(source),to:pointOf(dest),mapWidth:sim.worldFrame?.mapWidth??0,mapHeight:sim.worldFrame?.mapHeight??0,seaCells:0,snow:sim.snowDepth>0,animal:animal?{mode:animal.mode,capacity:animal.capacity,speed:animal.speed}:null});
  if(!plan)invalid('merchant lacks a route-capable transport');
  const offer=cargo(input.cargoOffer);for(const stack of offer)if(merchant.inventory.count(stack.itemId)<stack.count)invalid('merchant does not own all offered cargo');
  if(merchant.inventory.total>capacityFor(merchant,sim.config.carry)+plan.cargoCapacity)invalid('caravan cargo exceeds its physical capacity');
  const ids=partyIds(sim,merchant.id,input.escortIds??[]);if(ids.some(id=>sim.peopleById.get(id)!.isPlayer))invalid('the player cannot leave through an autonomous caravan');
  const duration=Math.max(1,Math.ceil(plan.days*sim.config.time.ticksPerDay));
  return this.dispatchParty(state,{kind:'caravan',actorId:merchant.id,travellerIds:ids,destination:dest,destinationBandId:input.destinationBandId,merchantId:merchant.id,cargo:offer,durationTicks:duration});
 }

 /** Shared ownership transaction for outgoing caravans and incoming raid parties. */
 dispatchParty(state:TrafficWorld,input:DispatchPartyInput & {readonly durationTicks?:number}):number {
  const tick=state.current.time.tick;if(tick<this.clock)invalid('root clock moved backwards');
  const source=input.source??state.frontier.active;if(!source)invalid('no geographic source comarca');
  const sourceActive=same(state.frontier.active,source);let sourceSim:Simulation,sourceRuntime:ReturnType<ComarcaOffmapRuntime['toRecord']>|null=null;
  const ids=IdSpace.fromSnapshot(state.ids.snapshot());
  if(sourceActive)sourceSim=Simulation.fromCheckpointRecordWithSharedIds(toCheckpointRecord(state.current),ids);
  else {
   const parked=state.frontier.parkedAt(source);if(!parked)invalid('source comarca has no parked named owner');
   const runtimeRecord=state.frontier.runtimeAt(source);let record=runtimeRecord?.checkpoint??parked;
   if(record.lastAdvancedTick>tick)invalid('source owner is ahead of root clock');
   if(record.lastAdvancedTick<tick){const tile=state.tileLedger.at(source);if(!tile)invalid('parked source has no tile ledger');const runtime=runtimeRecord?ComarcaOffmapRuntime.fromRecord(runtimeRecord):ComarcaOffmapRuntime.start(parked,tile);sourceRuntime=runtime.advanceTo(tick,state.geography,ids);record=sourceRuntime.checkpoint;}
   sourceSim=Simulation.fromCheckpointRecordWithSharedIds(record,ids);sourceSim.worldFrame=worldFrameOf({geography:state.geography,x:source.cx+.5,y:source.cy+.5,comarcasWide:1,comarcasHigh:1});
  }
  const origin=source;const dest=input.destination;
  if(JSON.stringify(origin)===JSON.stringify(dest))invalid('source equals destination');
  const actor=sourceSim.peopleById.get(input.actorId);if(!actor?.alive)invalid('actor is not canonically owned by source');
  const idsInParty=partyIds(sourceSim,input.actorId,input.travellerIds);
  if(idsInParty.some(id=>sourceSim.peopleById.get(id)!.isPlayer))invalid('player cannot be a traffic party member');
  const mapWidth=state.geography.kind==='legacyIsland'?0:state.geography.map.width;const route=comarcaRoute(pointOf(origin),pointOf(dest),mapWidth);
  if(route.length<2||route.some(p=>!isLand(state,p)))invalid('traffic route crosses water or has no path');
  const duration=input.durationTicks??Math.max(1,route.length-1)*sourceSim.config.time.ticksPerDay;
  if(!Number.isSafeInteger(duration)||duration<1)invalid('bad travel duration');
  const arrivalTick=tick+duration;
  const offered=cargo(input.cargo);for(const stack of offered)if(actor.inventory.count(stack.itemId)<stack.count)invalid('actor does not own offered cargo');
  const destStart=startsAt(state,dest);
  const transit=new Simulation({...sourceSim.config,population:{...sourceSim.config.population,bands:0}},ids,{geography:state.geography,...destStart.start,comarcasWide:1,comarcasHigh:1});transit.time.tick=tick;
  const entry=enteringEdge(route,mapWidth);sourceSim.transferTravellersTo(transit,idsInParty,entry);
  const transitActor=transit.peopleById.get(input.actorId)!;
  for(const stack of offered){if(transitActor.inventory.remove(stack.itemId,stack.count)!==stack.count)invalid('cargo changed during staging');}
  const destinationBandId=input.destinationBandId;
  if(!Number.isSafeInteger(destinationBandId)||destinationBandId<0)invalid('destination band id');
  const travellers=idsInParty.filter(id=>id!==input.actorId&&!(input.kind==='caravan'&&id!==input.actorId&&input.travellerIds.includes(id))).map(personId=>({personId,name:transit.peopleById.get(personId)!.name}));
  const escorts=input.kind==='caravan'?input.travellerIds.filter(id=>id!==input.actorId):[];
  // The actor remains the named merchant/scout; escort IDs have their own event slot.
  const ticketId=this.nextId;
  const stageScheduler=WorldCaravans.fromRecord(this.scheduler.toRecord());
  const reverse=[...route].reverse();
  stageScheduler.schedule({id:ticketId,source:origin,destination:dest,sourcePeopleId:actor.bandId,destinationPeopleId:destinationBandId,
    travellers:[{personId:actor.id,name:actor.name},...travellers.filter(p=>!escorts.includes(p.personId))],escortIds:escorts,
    route,returnRoute:reverse,departureTick:tick,arrivalTick,cargo:offered});
  const departure=stageScheduler.advanceTo(tick,()=>({stance:null,standing:0}))[0];if(departure?.kind!=='depart')invalid('departure event could not be staged');stageScheduler.ack(departure.eventId);
  const party:TrafficPartyRecord={caravanId:ticketId,kind:input.kind,actorId:actor.id,travellerIds:idsInParty,source:origin,destination:dest,victimBandId:input.victimBandId??null,lastAdvancedTick:tick,arrivalTick,route,party:toCheckpointRecord(transit),merchantId:input.merchantId??null};
  const sourceRecord=toCheckpointRecord(sourceSim);
  let tile:TileLedgerEntry|null=null;let nextRuntime:ReturnType<ComarcaOffmapRuntime['toRecord']>|null=null;
  if(!sourceActive){
    const placement=startsAt(state,source);tile=new TileLedger().capture({geography:state.geography,current:sourceSim,initialGeographicStart:placement} as WorldState);
    const old=state.tileLedger.at(source);tile={...tile,revision:Math.max(tile.revision,(old?.revision??0)+1)};
    nextRuntime=ComarcaOffmapRuntime.rebase(sourceRecord,tile,sourceRuntime??state.frontier.runtimeAt(source),state.frontier.compactState()).toRecord();
  }
  // Every validation and allocation above used detached objects; these are the only publish steps.
  state.ids.restore(ids.snapshot());this.scheduler=stageScheduler;this.parties.set(ticketId,party);this.nextId++;this.clock=tick;
  if(sourceActive){state.current.parkForTransfer();state.installCurrent(Simulation.fromCheckpointRecordWithSharedIds(sourceRecord,state.ids),state.initialGeographicStart);}
  else {state.tileLedger.update(tile!);state.frontier.park(source,sourceRecord,nextRuntime!);}
  this.validateOwners(state);return ticketId;
 }

 /** Advance each ticket's people once per elapsed tick, then materialize due arrivals at their true edge. */
 advance(state:TrafficWorld,tick:number):TrafficArrival[] {
  if(!Number.isSafeInteger(tick)||tick<0||tick<this.clock||tick>state.current.time.tick)invalid('traffic clock');
  const arrivals:TrafficArrival[]=[];if(this.parties.size===0){this.clock=tick;return arrivals;}
  for(const [id,party] of [...this.parties].sort(([a],[b])=>a-b)){
   if(!party.party)continue;const stageIds=IdSpace.fromSnapshot(state.ids.snapshot());const transit=Simulation.fromCheckpointRecordWithSharedIds(party.party,stageIds);
   let advanced=party.lastAdvancedTick;while(advanced<tick&&advanced<party.arrivalTick){advanced++;transit.advanceJourneyTick(party.travellerIds,advanced);}
   const current={...party,lastAdvancedTick:advanced,party:toCheckpointRecord(transit)};this.parties.set(id,current);
   if(advanced<party.arrivalTick)continue;
   const event=this.scheduler.advanceTo(tick,(a,b)=>({stance:state.current.bandRelations.stance(a,b),standing:state.current.bandRelations.standing(a,b)})).find(e=>e.caravanId===id);
   if(!event)continue;
   if(event.kind==='raid-opportunity') {
    // An offensive raid party is the attacker, so it must reach the target's
    // edge before the root can stage its defender and resolve combat. The
    // opportunity event is for hostile strangers intercepting a trade party.
    if(party.kind==='raid'){
     this.scheduler.ack(event.eventId);
     const arrival=this.scheduler.advanceTo(tick,(a,b)=>({stance:state.current.bandRelations.stance(a,b),standing:state.current.bandRelations.standing(a,b)})).find(e=>e.caravanId===id);
     if(!arrival)continue;
     if(arrival.kind!=='arrive'&&arrival.kind!=='return-arrive')continue;
     this.materializeArrival(state,current,arrival,stageIds);
     this.scheduler.ack(arrival.eventId,{cargoAfter:[]});this.parties.set(id,{...current,party:null,lastAdvancedTick:tick});
     arrivals.push({kind:party.kind,caravanId:id,partyIds:party.travellerIds,actorId:party.actorId,at:arrival.at,victimBandId:party.victimBandId,event:arrival});
     state.ids.restore(stageIds.snapshot());continue;
    }
    arrivals.push({kind:'raid',caravanId:id,partyIds:party.travellerIds,actorId:party.actorId,at:party.destination,victimBandId:party.victimBandId,event});continue;
   }
   if(event.kind!=='arrive'&&event.kind!=='return-arrive')continue;
   const at=event.at;const result=this.materializeArrival(state,current,event,stageIds);
   this.scheduler.ack(event.eventId,{cargoAfter:[]});this.parties.set(id,{...current,party:null,lastAdvancedTick:tick});arrivals.push({kind:party.kind,caravanId:id,partyIds:party.travellerIds,actorId:party.actorId,at,victimBandId:party.victimBandId,event});
   state.ids.restore(stageIds.snapshot());void result;
  }
  this.clock=tick;return arrivals;
 }

 private materializeArrival(state:TrafficWorld,party:TrafficPartyRecord,event:Extract<CaravanEvent,{kind:'arrive'|'return-arrive'}>,ids:IdSpace):CheckpointRecord {
  const active=state.frontier.active;let target:Simulation, activeTarget=same(active,event.at),commitResidents=()=>{};const placement=startsAt(state,event.at);
  if(activeTarget){target=Simulation.fromCheckpointRecordWithSharedIds(toCheckpointRecord(state.current),ids);target.worldFrame=worldFrameOf({geography:state.geography,...placement.start,comarcasWide:1,comarcasHigh:1});}
  else {
   const parked=state.frontier.parkedAt(event.at),prior=state.frontier.runtimeAt(event.at);let cp=prior?.checkpoint??parked;
   if(cp){if(cp.lastAdvancedTick>event.tick)invalid('arrival target is ahead');if(cp.lastAdvancedTick<event.tick){const tile=state.tileLedger.at(event.at);if(!tile)invalid('arrival target lacks tile');const runtime=prior?ComarcaOffmapRuntime.fromRecord(prior):ComarcaOffmapRuntime.start(cp,tile);cp=runtime.advanceTo(event.tick,state.geography,ids).checkpoint;}target=Simulation.fromCheckpointRecordWithSharedIds(cp,ids);target.worldFrame=worldFrameOf({geography:state.geography,...placement.start,comarcasWide:1,comarcasHigh:1});}
   else {target=new Simulation({...state.current.config,population:{...state.current.config.population,bands:0}},ids,{geography:state.geography,...placement.start,comarcasWide:1,comarcasHigh:1});target.time.tick=event.tick;commitResidents=state.prepareTrafficResidents(target,event.at);}
  }
  if(!party.party)invalid('arriving party has no transit owner');const source=Simulation.fromCheckpointRecordWithSharedIds(party.party,ids);const from=event.leg==='return'?party.source:party.destination;source.worldFrame=worldFrameOf({geography:state.geography,x:from.cx+.5,y:from.cy+.5,comarcasWide:1,comarcasHigh:1});
  const actor=source.peopleById.get(party.actorId);if(!actor)invalid('ticket actor missing');
  for(const stack of event.cargo)actor.inventory.add(stack.itemId,stack.count);
  const edge=enteringEdgeForArrival(party,event,state.geography.kind==='legacyIsland'?0:state.geography.map.width);
  const living=party.travellerIds.filter(id=>source.peopleById.get(id)?.alive===true);
  const dead=party.travellerIds.filter(id=>source.peopleById.get(id)?.alive===false);
  if(living.length)source.transferTravellersTo(target,living,edge);
  if(dead.length)source.transferDeadTravellersTo(target,dead,edge);
  const record=toCheckpointRecord(target);
  state.ids.restore(ids.snapshot());if(activeTarget){state.current.parkForTransfer();state.installCurrent(Simulation.fromCheckpointRecordWithSharedIds(record,state.ids),placement);}
  else {
   const temp=new TileLedger(),entry=temp.capture({geography:state.geography,current:target,initialGeographicStart:placement} as WorldState),old=state.tileLedger.at(event.at);const updated={...entry,revision:Math.max(entry.revision,(old?.revision??0)+1)};
   const runtime=ComarcaOffmapRuntime.rebase(record,updated,state.frontier.runtimeAt(event.at),state.frontier.compactState()).toRecord();state.tileLedger.update(updated);state.frontier.park(event.at,record,runtime);
  }
  commitResidents();
  return record;
 }

 /** Complete one physical camp exchange, then return the named party after one day. */
 processCamps(state:TrafficWorld,tick:number):void {
  if(!Number.isSafeInteger(tick)||tick<this.clock||tick>state.current.time.tick)invalid('camp clock');
  if(this.parties.size===0)return;
  for(const ticket of this.parties.values()){
   const schedule=this.scheduler.get(ticket.caravanId);if(ticket.kind!=='caravan'||ticket.party!==null||schedule?.phase!=='arrived'||tick<ticket.arrivalTick+state.current.config.time.ticksPerDay)continue;
   const active=same(state.frontier.active,ticket.destination),ids=IdSpace.fromSnapshot(state.ids.snapshot());
   let owner:Simulation,prior=state.frontier.runtimeAt(ticket.destination);
   if(active)owner=Simulation.fromCheckpointRecordWithSharedIds(toCheckpointRecord(state.current),ids);
   else{
    const parked=state.frontier.parkedAt(ticket.destination);if(!parked)continue;let cp=prior?.checkpoint??parked;
    if(cp.lastAdvancedTick>tick)continue;
    if(cp.lastAdvancedTick<tick){const tile=state.tileLedger.at(ticket.destination);if(!tile)continue;const runtime=prior?ComarcaOffmapRuntime.fromRecord(prior):ComarcaOffmapRuntime.start(cp,tile);prior=runtime.advanceTo(tick,state.geography,ids);cp=prior.checkpoint;}
    owner=Simulation.fromCheckpointRecordWithSharedIds(cp,ids);owner.worldFrame=worldFrameOf({geography:state.geography,x:ticket.destination.cx+.5,y:ticket.destination.cy+.5,comarcasWide:1,comarcasHigh:1});
   }
   owner.social.worldOrigin={cx:ticket.destination.cx,cy:ticket.destination.cy};
   const actor=owner.peopleById.get(ticket.actorId);if(!actor?.alive){const closed=WorldCaravans.fromRecord(this.scheduler.toRecord());closed.cancel(ticket.caravanId);this.scheduler=closed;continue;}
   // A detailed comarca's ActionSystem owns its barter. Give that committed
   // action time to finish; off-map parties have no second motor, so settle the
   // same real inventory exchange here against a nearby canonical person.
   if(!active){state.configureTrafficContacts(owner,ticket.destination);this.exchangeAtParkedCamp(owner,actor,tick);}
   if(active&&actor.action==='trade'&&actor.actionTimer>0)continue;
   let parkedRecord:CheckpointRecord|null=null,tile:TileLedgerEntry|null=null,runtimeRecord:ReturnType<ComarcaOffmapRuntime['toRecord']>|null=null;
   if(!active){parkedRecord=toCheckpointRecord(owner);tile=new TileLedger().capture({geography:state.geography,current:owner,initialGeographicStart:startsAt(state,ticket.destination)} as WorldState);const old=state.tileLedger.at(ticket.destination);tile={...tile,revision:Math.max(tile.revision,(old?.revision??0)+1)};runtimeRecord=ComarcaOffmapRuntime.rebase(parkedRecord,tile,prior,state.frontier.compactState()).toRecord();}
   state.ids.restore(ids.snapshot());
   if(active){state.current.parkForTransfer();state.installCurrent(Simulation.fromCheckpointRecordWithSharedIds(toCheckpointRecord(owner),state.ids),state.initialGeographicStart);}
   else{state.tileLedger.update(tile!);state.frontier.park(ticket.destination,parkedRecord!,runtimeRecord!);}
   const returnCargo=actor.inventory.entries().filter(([itemId,count])=>count>0&&!!ITEMS[itemId]&&ITEMS[itemId]!.baseValue>0&&ITEMS[itemId]!.nutrition===0).map(([itemId,count])=>({itemId,count}));
   this.beginReturn(state,ticket.caravanId,returnCargo);
  }
 }

 private exchangeAtParkedCamp(owner:Simulation,actor:import('../entities/Person.ts').Person,tick:number):void {
  const nearby=owner.peopleHash.queryRadius(actor.x,actor.y,Math.max(1.5,owner.config.sightRadius))
   .filter(person=>person.id!==actor.id&&person.alive&&person.inventory.total>0&&owner.peopleById.get(person.id)===person)
   .sort((a,b)=>(Math.abs(a.x-actor.x)+Math.abs(a.y-actor.y))-(Math.abs(b.x-actor.x)+Math.abs(b.y-actor.y))||a.id-b.id);
  for(const other of nearby){
   const offer=actor.inventory.entries().filter(([itemId,count])=>count>0&&(ITEMS[itemId]?.baseValue??0)>0&&(ITEMS[itemId]?.nutrition??0)===0)
    .map(([itemId])=>({itemId,count:1})).sort((a,b)=>ITEMS[b.itemId]!.baseValue-ITEMS[a.itemId]!.baseValue||a.itemId.localeCompare(b.itemId))[0];
   if(!offer) return;
   const worth=ITEMS[offer.itemId]!.baseValue;
   const request=other.inventory.entries().filter(([itemId,count])=>count>0&&(ITEMS[itemId]?.baseValue??0)>0&&(ITEMS[itemId]?.baseValue??0)<=worth)
    .map(([itemId])=>({itemId,count:Math.min(other.inventory.count(itemId),Math.floor(worth/ITEMS[itemId]!.baseValue))}))
    .filter(row=>row.count>0).sort((a,b)=>ITEMS[b.itemId]!.baseValue*b.count-ITEMS[a.itemId]!.baseValue*a.count||a.itemId.localeCompare(b.itemId))[0];
   if(!request)continue;
   let result:{offeredValue:number;receivedValue:number;standingDelta:number};
   try{result=exchangeCaravanGoods(actor.inventory,other.inventory,[offer],[request]);}catch{continue;}
   owner.social.emit('trade',actor,other,Math.min(1,result.receivedValue/100),tick,owner.peopleHash,owner.config.sightRadius);
   this.tellSelectedTheft(owner,actor,other,tick);
   this.tellSelectedTheft(owner,other,actor,tick);
   return;
  }
 }
 private tellSelectedTheft(owner:Simulation,teller:import('../entities/Person.ts').Person,listener:import('../entities/Person.ts').Person,tick:number):void {
  const story:MemoryEntry|null=teller.memory.bestGossipOfType('theft',listener.memory);
  if(!story)return;
  // `tellStory` uses a distinct map handle to recognize archive subjects as
  // read-only. Passing the root's canonical Person directly makes that object
  // look locally mutable to the destination Simulation's authority guard.
  const peopleById=new Map(owner.peopleById),subject=owner.social.worldPersonById?.(story.actorId);
  if(subject&&!peopleById.has(subject.id))peopleById.set(subject.id,fromPersonRecord(toPersonRecord(subject,tick)));
  owner.social.tellStory(teller,listener,story,peopleById,tick,'trader');
 }
 /** Issue a real trade order at an active destination. The spatial hash chooses only visible local counterparts. */
 orderCampTrade(state:TrafficWorld,caravanId:number):boolean {
  const ticket=this.parties.get(caravanId),caravan=this.scheduler.get(caravanId),here=state.frontier.active;
  if(!ticket||ticket.kind!=='caravan'||ticket.party!==null||caravan?.phase!=='arrived'||!here||!same(here,ticket.destination))return false;
  const actor=state.current.peopleById.get(ticket.actorId);if(!actor?.alive||techPower(actor,'trade')<=0)return false;
  const radius=Math.max(1.5,state.current.config.sightRadius);
  const candidates=state.current.peopleHash.queryRadius(actor.x,actor.y,radius).filter(p=>p.id!==actor.id&&p.alive&&state.current.peopleById.get(p.id)===p&&p.inventory.total>0)
    .sort((a,b)=>(Math.abs(a.x-actor.x)+Math.abs(a.y-actor.y))-(Math.abs(b.x-actor.x)+Math.abs(b.y-actor.y))||a.id-b.id);
  for(const other of candidates)if(state.current.order(actor,'trade',{personId:other.id}))return true;
  return false;
 }

 /** Return a caravan only after root-side camp trade/stock changes have completed. */
 beginReturn(state:TrafficWorld,caravanId:number,returnCargo:readonly CaravanGoods[]=[]):void {
  const ticket=this.parties.get(caravanId),caravan=this.scheduler.get(caravanId);if(!ticket||ticket.kind!=='caravan'||ticket.party!==null||caravan?.phase!=='arrived')invalid('caravan is not camped at its destination');
  const now=state.current.time.tick,location=caravan.destination,active=same(state.frontier.active,location),ids=IdSpace.fromSnapshot(state.ids.snapshot());
  let owner:Simulation,priorRuntime=state.frontier.runtimeAt(location);
  if(active)owner=Simulation.fromCheckpointRecordWithSharedIds(toCheckpointRecord(state.current),ids);
  else {const parked=state.frontier.parkedAt(location);if(!parked)invalid('destination has no canonical parked owner');let cp=priorRuntime?.checkpoint??parked;if(cp.lastAdvancedTick>now)invalid('destination is ahead of root');if(cp.lastAdvancedTick<now){const tile=state.tileLedger.at(location);if(!tile)invalid('destination has no tile ledger');const runtime=priorRuntime?ComarcaOffmapRuntime.fromRecord(priorRuntime):ComarcaOffmapRuntime.start(parked,tile);priorRuntime=runtime.advanceTo(now,state.geography,ids);cp=priorRuntime.checkpoint;}owner=Simulation.fromCheckpointRecordWithSharedIds(cp,ids);owner.worldFrame=worldFrameOf({geography:state.geography,x:location.cx+.5,y:location.cy+.5,comarcasWide:1,comarcasHigh:1});}
  const actor=owner.peopleById.get(ticket.actorId);if(!actor?.alive)invalid('merchant is not at the destination');const offer=cargo(returnCargo);for(const stack of offer)if(actor.inventory.count(stack.itemId)<stack.count)invalid('return cargo is not physically held by merchant');
  const origin=caravan.source,route=[...caravan.returnRoute],width=state.geography.kind==='legacyIsland'?0:state.geography.map.width;
  if(!width||route.some(p=>!isLand(state,p)))invalid('return route is not land');const tpd=owner.config.time.ticksPerDay,duration=Math.max(1,(route.length-1)*tpd),arrival=now+duration;
  const transit=new Simulation({...owner.config,population:{...owner.config.population,bands:0}},ids,{geography:state.geography,...startsAt(state,origin).start,comarcasWide:1,comarcasHigh:1});transit.time.tick=now;
  owner.transferTravellersTo(transit,ticket.travellerIds,enteringEdge(route,width));for(const stack of offer)transit.peopleById.get(ticket.actorId)!.inventory.remove(stack.itemId,stack.count);
  const next=toCheckpointRecord(owner),transitRecord=toCheckpointRecord(transit);
  let tile:TileLedgerEntry|null=null,runtimeRecord:ReturnType<ComarcaOffmapRuntime['toRecord']>|null=null;
  if(!active){tile=new TileLedger().capture({geography:state.geography,current:owner,initialGeographicStart:startsAt(state,location)} as WorldState);const old=state.tileLedger.at(location);tile={...tile,revision:Math.max(tile.revision,(old?.revision??0)+1)};runtimeRecord=ComarcaOffmapRuntime.rebase(next,tile,priorRuntime,state.frontier.compactState()).toRecord();}
  const staged=WorldCaravans.fromRecord(this.scheduler.toRecord());staged.replaceCargo(caravanId,offer);staged.beginReturn(caravanId,now,arrival);
  const depart=staged.advanceTo(now,(a,b)=>({stance:state.current.bandRelations.stance(a,b),standing:state.current.bandRelations.standing(a,b)})).find(e=>e.caravanId===caravanId);if(depart?.kind!=='return-depart')invalid('return departure unavailable');staged.ack(depart.eventId);
  const changed:TrafficPartyRecord={...ticket,lastAdvancedTick:now,arrivalTick:arrival,party:transitRecord};
  state.ids.restore(ids.snapshot());this.scheduler=staged;this.parties.set(caravanId,changed);this.clock=now;
  if(active){state.current.parkForTransfer();state.installCurrent(Simulation.fromCheckpointRecordWithSharedIds(next,state.ids),state.initialGeographicStart);}
  else{state.tileLedger.update(tile!);state.frontier.park(location,next,runtimeRecord!);}
  this.validateOwners(state);
 }

 /** Apply a root-owned combat outcome to the ticket's actual named people, then release its raid event. */
 resolveRaid(state:TrafficWorld,caravanId:number,apply:(transit:Simulation,event:Extract<CaravanEvent,{kind:'raid-opportunity'}>)=>void,cargoAfter?:readonly CaravanGoods[]):void {
  const ticket=this.parties.get(caravanId),caravan=this.scheduler.get(caravanId),event=caravan?.awaiting;
  if(!ticket?.party||event?.kind!=='raid-opportunity')invalid('no pending raid event');const ids=IdSpace.fromSnapshot(state.ids.snapshot()),transit=Simulation.fromCheckpointRecordWithSharedIds(ticket.party,ids);
  apply(transit,event);const changed={...ticket,party:toCheckpointRecord(transit)};const staged=WorldCaravans.fromRecord(this.scheduler.toRecord());staged.ack(event.eventId,cargoAfter?{cargoAfter}:{});this.scheduler=staged;this.parties.set(caravanId,changed);
 }
 /** Persist the scheduler escrow and one detached checkpoint per named party. */
 toRecord():WorldTrafficRecord { return {recordType:'WorldTrafficRecord',version:1,tick:this.clock,nextId:this.nextId,caravans:this.scheduler.toRecord(),parties:this.partyRecords}; }
 static fromRecord(value:unknown):WorldTrafficCoordinator {
  if(!value||typeof value!=='object'||Array.isArray(value))invalid('traffic record');const v=value as Partial<WorldTrafficRecord>;
  if(v.recordType!=='WorldTrafficRecord'||v.version!==1||!Number.isSafeInteger(v.tick)||v.tick!<0||!Number.isSafeInteger(v.nextId)||v.nextId!<1||!Array.isArray(v.parties))invalid('traffic record shape');
  const traffic=new WorldTrafficCoordinator();traffic.clock=v.tick!;traffic.nextId=v.nextId!;traffic.scheduler=WorldCaravans.fromRecord(v.caravans);
  for(const p of v.parties){if(!p||!Number.isSafeInteger(p.caravanId)||p.caravanId<1||traffic.parties.has(p.caravanId)||!['caravan','raid'].includes(p.kind)||!Number.isSafeInteger(p.actorId)||!Array.isArray(p.travellerIds)||!Number.isSafeInteger(p.lastAdvancedTick)||!Number.isSafeInteger(p.arrivalTick)||p.lastAdvancedTick!>p.arrivalTick!||(p.party!==null&&(!p.party||p.party.recordType!=='CheckpointRecord')))invalid('party record');
   const ids=[...p.travellerIds].sort((a,b)=>a-b),owned=p.party?.roster.activePersonIds;
   if(new Set(ids).size!==ids.length||(owned&&(owned.length!==ids.length||[...owned].sort((a,b)=>a-b).some((id,index)=>id!==ids[index]))))invalid('party checkpoint ownership');
   traffic.parties.set(p.caravanId,clone({...p,travellerIds:ids}) as TrafficPartyRecord);
  }
  const schedulerRecord=traffic.scheduler.toRecord(),scheduledIds=schedulerRecord.caravans.map(c=>c.id).sort((a,b)=>a-b),partyIds=[...traffic.parties.keys()].sort((a,b)=>a-b);
  if(schedulerRecord.tick>traffic.clock||scheduledIds.length!==partyIds.length||scheduledIds.some((id,index)=>id!==partyIds[index]))invalid('scheduler ownership or clock');
  if(traffic.nextId<=Math.max(0,...traffic.parties.keys()))invalid('next traffic id');return traffic;
 }
 validateOwners(state:TrafficWorld):void {
  const owners=new Map<number,string>();const add=(id:number,owner:string)=>{const prior=owners.get(id);if(prior)invalid('person '+id+' has two owners: '+prior+' / '+owner);owners.set(id,owner);};
  for(const id of state.current.peopleById.keys())add(id,'active');
  for(const parked of state.frontier.toRecord().parked)for(const id of parked.checkpoint.roster.activePersonIds)add(id,'parked '+parked.identity.cx+','+parked.identity.cy);
  const frontier=state.frontier.toRecord();if(frontier.journey)for(const id of frontier.journey.travellerIds)add(id,'journey');
  for(const [key,p] of this.parties)if(p.party)for(const id of p.party.roster.activePersonIds)add(id,'traffic '+key);
 }
}

function enteringEdgeForArrival(party:TrafficPartyRecord,event:Extract<CaravanEvent,{kind:'arrive'|'return-arrive'}>,mapWidth:number):'n'|'e'|'s'|'w' {
 const route=event.leg==='return'?[...party.route].reverse():party.route;return enteringEdge(route,mapWidth);
}
export { WorldTrafficCoordinator as WorldTraffic };
