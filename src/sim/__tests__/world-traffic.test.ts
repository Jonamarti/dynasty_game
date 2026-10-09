import { describe, expect, it } from 'vitest';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { findGlobeStart } from '../world/WorldTerrain.ts';
import { WorldState } from '../world/WorldState.ts';
import { Simulation } from '../core/Simulation.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { WorldKnowledge } from '../social/WorldKnowledge.ts';
import { WorldNews } from '../social/WorldNews.ts';
import { WorldTrafficCoordinator } from '../world/WorldTrafficCoordinator.ts';
import { comarcaIdentityAt } from '../persistence/TileLedger.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { fromPersonRecord } from '../persistence/EntityRecords.ts';
function fixture(){
 const seed='traffic-phase36',geography=randomWorldGeography(seed,{regionsWide:24,regionsHigh:12});
 const found=findGlobeStart(geography,4)!,origin={cx:Math.floor(found.x),cy:Math.floor(found.y)};
 const state=new WorldState({seed,population:{bands:1,peoplePerBand:6},time:{ticksPerDay:8},world:{width:32,height:32}},
  {geography,start:{x:origin.cx+.5,y:origin.cy+.5},comarcasWide:1,comarcasHigh:1,peoples:false});
 const from=state.frontier.active!,width=geography.map.width;
 const destination=[[from.cx+1,from.cy],[from.cx-1,from.cy],[from.cx,from.cy+1],[from.cx,from.cy-1]].map(([cx,cy])=>({cx:(cx!+width)%width,cy:cy!})).find(p=>p.cy>=0&&p.cy<geography.map.height&&geography.profileAt(p.cx,p.cy).biome!=='ocean')!;
 return {state,destination};
}
describe('WorldTrafficCoordinator root transactions',()=>{
 it('moves an NPC merchant and selected cargo to one transit owner, then materializes at arrival after save restore',()=>{
  const {state,destination}=fixture(),merchant=state.current.people.find(p=>p.alive&&!p.isPlayer)!;
  merchant.knownTech.add('marking');merchant.knownTech.add('trade');merchant.inventory.add('gold_nugget',2);
  merchant.worldKnowledge=new WorldKnowledge();merchant.worldKnowledge.see(destination.cx,destination.cy,0);merchant.worldKnowledge.see(state.frontier.active!.cx,state.frontier.active!.cy,0);
  const traffic=new WorldTrafficCoordinator(),id=traffic.dispatchCaravan(state,{merchantId:merchant.id,destination,destinationBandId:merchant.bandId+1,cargoOffer:[{itemId:'gold_nugget',count:1}]});
  expect(state.current.peopleById.has(merchant.id)).toBe(false);expect(traffic.partyRecords[0]?.party?.roster.activePersonIds).toContain(merchant.id);
  const loaded=WorldTrafficCoordinator.fromRecord(JSON.parse(JSON.stringify(traffic.toRecord())));
  for(let i=0;i<8;i++){state.current.step();loaded.advance(state,state.current.time.tick);}
  const parked=state.frontier.parkedAt(comarcaIdentityAt(state.geography,destination.cx,destination.cy));
  expect(parked?.roster.activePersonIds).toContain(merchant.id);expect(loaded.partyRecords[0]?.caravanId).toBe(id);
  expect(loaded.validateOwners(state)).toBeUndefined();
  const ownerCount=[...state.current.peopleById.keys(),...state.frontier.toRecord().parked.flatMap(p=>p.checkpoint.roster.activePersonIds),...loaded.partyRecords.flatMap(p=>p.party?.roster.activePersonIds??[])].filter(personId=>personId===merchant.id).length;
  expect(ownerCount).toBe(1);
  const campDue=loaded.caravans.get(id)!.arrivalTick+state.current.config.time.ticksPerDay;
  while(state.current.time.tick<campDue){state.current.step();loaded.processCamps(state,state.current.time.tick);loaded.advance(state,state.current.time.tick);}
  const returning=loaded.caravans.get(id)!;
  expect(returning.phase).toBe('returning');
  for(let tick=state.current.time.tick+1;tick<=returning.returnArrivalTick!;tick++){state.current.step();loaded.advance(state,state.current.time.tick);}
  expect(state.current.peopleById.has(merchant.id)).toBe(true);
  expect(loaded.caravans.get(id)?.phase).toBe('returned');
  loaded.validateOwners(state);
 });
 it('materializes an in-transit death as a canonical dead person at destination',()=>{
  const {state,destination}=fixture(),merchant=state.current.people.find(p=>p.alive&&!p.isPlayer)!,escort=state.current.people.find(p=>p.alive&&!p.isPlayer&&p.id!==merchant.id)!;
  merchant.knownTech.add('marking');merchant.knownTech.add('trade');merchant.worldKnowledge=new WorldKnowledge();merchant.worldKnowledge.see(destination.cx,destination.cy,0);merchant.worldKnowledge.see(state.frontier.active!.cx,state.frontier.active!.cy,0);
  const traffic=new WorldTrafficCoordinator(),id=traffic.dispatchCaravan(state,{merchantId:merchant.id,destination,destinationBandId:merchant.bandId+1,escortIds:[escort.id]});
  const record=JSON.parse(JSON.stringify(traffic.toRecord())),ticket=record.parties.find((p:{caravanId:number})=>p.caravanId===id)!;
  const transit=Simulation.fromCheckpointRecordWithSharedIds(ticket.party!,IdSpace.fromSnapshot(state.ids.snapshot()));
  const traveller=transit.peopleById.get(merchant.id)!;traveller.alive=false;transit.peopleHash.remove(traveller);
  record.parties[0]!.party=toCheckpointRecord(transit);
  const resumed=WorldTrafficCoordinator.fromRecord(JSON.parse(JSON.stringify(record)));
  for(let i=0;i<8;i++){state.current.step();resumed.advance(state,state.current.time.tick);}
  const parked=state.frontier.parkedAt(comarcaIdentityAt(state.geography,destination.cx,destination.cy));
  expect(parked?.roster.activePersonIds).toContain(merchant.id);expect(parked?.roster.activePersonIds).toContain(escort.id);
  const arrivedEscort=parked?.roster.people.map(fromPersonRecord).find(person=>person.id===escort.id);expect(arrivedEscort?.alive).toBe(true);
  const corpse=parked?.roster.people.find(person=>fromPersonRecord(person).id===merchant.id);
  expect(corpse&&fromPersonRecord(corpse).alive).toBe(false);
  expect(resumed.validateOwners(state)).toBeUndefined();
 });
 it('rejects orphan scheduler tickets, future scheduler clocks, and party checkpoints with extra owners',()=>{
  // Build an independently valid record for each corruption under test.
  const create=()=>{
   const {state,destination}=fixture(),merchant=state.current.people.find(p=>p.alive&&!p.isPlayer)!;
   merchant.knownTech.add('marking');merchant.knownTech.add('trade');merchant.worldKnowledge=new WorldKnowledge();merchant.worldKnowledge.see(destination.cx,destination.cy,0);merchant.worldKnowledge.see(state.frontier.active!.cx,state.frontier.active!.cy,0);
   const traffic=new WorldTrafficCoordinator();traffic.dispatchCaravan(state,{merchantId:merchant.id,destination,destinationBandId:merchant.bandId+1});return JSON.parse(JSON.stringify(traffic.toRecord()));
  };
  const orphan=create();orphan.parties=[];expect(()=>WorldTrafficCoordinator.fromRecord(orphan)).toThrow(/scheduler ownership/);
  const future=create();future.caravans.tick=future.tick+1;expect(()=>WorldTrafficCoordinator.fromRecord(future)).toThrow(/scheduler ownership or clock/);
  const extra=create();extra.parties[0].party.roster.activePersonIds.push(999999);expect(()=>WorldTrafficCoordinator.fromRecord(extra)).toThrow(/party checkpoint ownership/);
 });
 it('passes one selected theft each way only after a real parked barter, resolving foreign culprits from the root archive',()=>{
  const {state}=fixture();const ids=IdSpace.fromSnapshot(state.ids.snapshot());
  const owner=Simulation.fromCheckpointRecordWithSharedIds(toCheckpointRecord(state.current),ids);
  const [teller,listener,culpritA,culpritB]=owner.people.filter(person=>person.alive&&!person.isPlayer).slice(0,4);
  expect(teller&&listener&&culpritA&&culpritB).toBeTruthy();
  for(const culprit of [culpritA!,culpritB!]){owner.peopleById.delete(culprit.id);owner.people.splice(owner.people.indexOf(culprit),1);}
  teller!.x=10;teller!.y=10;listener!.x=11;listener!.y=10;owner.peopleHash.rebuild(owner.people.filter(person=>person.alive));
  for(const person of owner.people)for(const [item,count] of person.inventory.entries())person.inventory.remove(item,count);
  teller!.inventory.add('gold_nugget',1);
  const first={id:1800001,type:'theft' as const,actorId:culpritA!.id,targetId:null,x:10,y:10,tick:0,magnitude:1,witnesses:0,victimBandId:null,originComarca:{cx:state.frontier.active!.cx,cy:state.frontier.active!.cy}};
  const second={id:1800002,type:'theft' as const,actorId:culpritB!.id,targetId:null,x:11,y:10,tick:0,magnitude:1,witnesses:0,victimBandId:null,originComarca:{cx:state.frontier.active!.cx,cy:state.frontier.active!.cy}};
  teller!.memory.record(first,true,1);teller!.worldNews=new WorldNews();teller!.worldNews.witnessTheft(first,teller!.memory,first.originComarca.cx,first.originComarca.cy);
  listener!.memory.record(second,true,1);listener!.worldNews=new WorldNews();listener!.worldNews.witnessTheft(second,listener!.memory,second.originComarca.cx,second.originComarca.cy);
  state.configureTrafficContacts(owner,state.frontier.active!);
  const exchange=(new WorldTrafficCoordinator() as unknown as {exchangeAtParkedCamp(owner:Simulation,actor:typeof teller,tick:number):void}).exchangeAtParkedCamp;
  exchange.call(new WorldTrafficCoordinator(),owner,teller!,1);
  expect(listener!.memory.has(1800001)).toBe(false);
  expect(teller!.memory.has(1800002)).toBe(false);
  listener!.inventory.add('tin_ore',1);
  const traffic=new WorldTrafficCoordinator();
  (traffic as unknown as {exchangeAtParkedCamp(owner:Simulation,actor:typeof teller,tick:number):void}).exchangeAtParkedCamp(owner,teller!,1);
  expect(listener!.memory.has(1800001)).toBe(true);
  expect([...listener!.worldNews!.entries()].find(entry=>entry.eventId===1800001)?.channel).toBe('trader');
  expect([...teller!.worldNews!.entries()].find(entry=>entry.eventId===1800002)?.channel).toBe('trader');
  expect(teller!.memory.has(1800002)).toBe(true);
  expect(teller!.inventory.count('tin_ore')).toBe(1);
  expect(listener!.inventory.count('gold_nugget')).toBe(1);
 }); it('rejects cargo not owned by the merchant without mutating the current checkpoint',()=>{
  const {state,destination}=fixture(),merchant=state.current.people.find(p=>p.alive&&!p.isPlayer)!;merchant.knownTech.add('marking');merchant.knownTech.add('trade');
  merchant.worldKnowledge=new WorldKnowledge();merchant.worldKnowledge.see(destination.cx,destination.cy,0);merchant.worldKnowledge.see(state.frontier.active!.cx,state.frontier.active!.cy,0);
  const traffic=new WorldTrafficCoordinator(),before=JSON.stringify(toCheckpointRecord(state.current));
  expect(()=>traffic.dispatchCaravan(state,{merchantId:merchant.id,destination,destinationBandId:merchant.bandId+1,cargoOffer:[{itemId:'gold_nugget',count:1}]})).toThrow();
  expect(JSON.stringify(toCheckpointRecord(state.current))).toBe(before);
 });
});
