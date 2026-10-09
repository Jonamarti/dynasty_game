/**
 * M15 phase 36: detached, persistent caravan schedules.
 * The root owns comarca stock and person authority. This module owns only the
 * in-transit escrow and emits replayable transactions for root to apply/ack.
 */
import { ITEMS, type Inventory } from '../entities/Item.ts';
import type { ComarcaIdentity } from '../persistence/TileLedger.ts';
import type { JourneyPoint } from './Transport.ts';

export const WORLD_CARAVAN_VERSION = 1 as const;
export interface CaravanGoods { readonly itemId: string; readonly count: number }
export interface CaravanTraveller { readonly personId: number; readonly name: string }
export interface CaravanCampStop { readonly point: JourneyPoint; readonly tick: number; readonly resumeTick: number }
export type CaravanPhase = 'scheduled' | 'outbound' | 'camped' | 'arrived' | 'return-scheduled' | 'returning' | 'returned' | 'cancelled';
export interface WorldCaravanRecord {
  readonly id: number; readonly source: ComarcaIdentity; readonly destination: ComarcaIdentity;
  readonly sourcePeopleId: number; readonly destinationPeopleId: number;
  readonly travellers: readonly CaravanTraveller[]; readonly escortIds: readonly number[];
  readonly route: readonly JourneyPoint[]; readonly returnRoute: readonly JourneyPoint[];
  readonly departureTick: number; readonly arrivalTick: number;
  readonly returnDepartureTick: number | null; readonly returnArrivalTick: number | null;
  readonly campStops: readonly CaravanCampStop[]; readonly nextCamp: number; readonly campUntilTick: number | null;
  readonly cargo: readonly CaravanGoods[]; readonly phase: CaravanPhase;
  readonly awaiting: CaravanEvent | null; readonly raidResolved: boolean;
}
export type CaravanEvent =
 | { readonly eventId:string; readonly kind:'depart'|'return-depart'; readonly caravanId:number; readonly tick:number; readonly origin:ComarcaIdentity; readonly destination:ComarcaIdentity; readonly route:readonly JourneyPoint[]; readonly travellers:readonly CaravanTraveller[]; readonly escortIds:readonly number[]; readonly cargo:readonly CaravanGoods[]; readonly cargoBaseValue:number; readonly leg:'outbound'|'return' }
 | { readonly eventId:string; readonly kind:'raid-opportunity'; readonly caravanId:number; readonly tick:number; readonly raiderPeopleId:number; readonly targetPeopleId:number; readonly stance:'war'|null; readonly standing:number; readonly travellers:readonly CaravanTraveller[]; readonly escortIds:readonly number[]; readonly cargo:readonly CaravanGoods[] }
 | { readonly eventId:string; readonly kind:'arrive'|'return-arrive'; readonly caravanId:number; readonly tick:number; readonly at:ComarcaIdentity; readonly peopleId:number; readonly travellers:readonly CaravanTraveller[]; readonly escortIds:readonly number[]; readonly cargo:readonly CaravanGoods[]; readonly cargoBaseValue:number; readonly standingDelta:number; readonly contactDelta:number; readonly leg:'outbound'|'return' }
 | { readonly eventId:string; readonly kind:'camp'|'resume'; readonly caravanId:number; readonly tick:number; readonly at:JourneyPoint; readonly resumeTick:number|null; readonly travellers:readonly CaravanTraveller[]; readonly escortIds:readonly number[] };
export interface CaravanRelation { readonly stance:'war'|'peace'|'tributary'|null; readonly standing:number }
export type CaravanRelationLookup = (aPeopleId:number,bPeopleId:number)=>CaravanRelation;
export interface ScheduleCaravanInput {
  readonly id:number; readonly source:ComarcaIdentity; readonly destination:ComarcaIdentity;
  readonly sourcePeopleId:number; readonly destinationPeopleId:number;
  /** Must be copied from root's canonical people; names never create people. */
  readonly travellers:readonly CaravanTraveller[]; readonly escortIds:readonly number[];
  readonly route:readonly JourneyPoint[]; readonly returnRoute:readonly JourneyPoint[];
  readonly departureTick:number; readonly arrivalTick:number;
  readonly campStops?:readonly CaravanCampStop[]; readonly cargo:readonly CaravanGoods[];
}
export interface WorldCaravansRecord { readonly recordType:'WorldCaravansRecord'; readonly version:typeof WORLD_CARAVAN_VERSION; readonly tick:number; readonly caravans:readonly WorldCaravanRecord[] }
function clone<T>(v:T):T { return JSON.parse(JSON.stringify(v)) as T; }
function invalid(s:string):never { throw new TypeError('Invalid WorldCaravans: '+s); }
function id(v:unknown,s:string):number { if(!Number.isSafeInteger(v)||(v as number)<1) invalid(s); return v as number; }
function at(v:unknown,s:string):number { if(!Number.isSafeInteger(v)||(v as number)<0) invalid(s); return v as number; }
function groupId(v:unknown,s:string):number { if(!Number.isSafeInteger(v)||(v as number)<0) invalid(s); return v as number; }
function point(v:unknown,s:string):JourneyPoint {
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==2) invalid(s);
 const p=v as Record<string,unknown>; if(!Number.isSafeInteger(p.cx)||(p.cx as number)<0||!Number.isSafeInteger(p.cy)||(p.cy as number)<0) invalid(s);
 return {cx:p.cx as number,cy:p.cy as number};
}
function samePoint(a:JourneyPoint,b:JourneyPoint):boolean { return a.cx===b.cx&&a.cy===b.cy; }
function ident(v:unknown):ComarcaIdentity {
 if(!v||typeof v!=='object'||Array.isArray(v)) invalid('identity');
 const p=v as Record<string,unknown>; point({cx:p.cx,cy:p.cy},'identity coordinates');
 if(p.kind==='random'&&Object.keys(p).length===6&&typeof p.seed==='string'&&!!p.seed&&Number.isSafeInteger(p.regionsWide)&&(p.regionsWide as number)>=2&&Number.isSafeInteger(p.regionsHigh)&&(p.regionsHigh as number)>=2&&(p.cx as number)<(p.regionsWide as number)*10&&(p.cy as number)<(p.regionsHigh as number)*10) return clone(p) as unknown as ComarcaIdentity;
 if(p.kind==='earth'&&Object.keys(p).length===8&&typeof p.mapId==='string'&&/^[a-z0-9-]+$/.test(p.mapId)&&Number.isSafeInteger(p.rasterWidth)&&(p.rasterWidth as number)>=2&&Number.isSafeInteger(p.rasterHeight)&&(p.rasterHeight as number)>=2&&Number.isSafeInteger(p.comarcasPerRegion)&&(p.comarcasPerRegion as number)>=1&&Number.isSafeInteger(p.seaLevelMeters)&&(p.cx as number)<(p.rasterWidth as number)*(p.comarcasPerRegion as number)&&(p.cy as number)<(p.rasterHeight as number)*(p.comarcasPerRegion as number)) return clone(p) as unknown as ComarcaIdentity;
 return invalid('identity fields');
}
function route(v:unknown,s:string):JourneyPoint[] { if(!Array.isArray(v)||v.length<2) invalid(s); return v.map((p,i)=>point(p,s+'['+i+']')); }
function goods(v:unknown):CaravanGoods[] {
 if(!Array.isArray(v)) invalid('cargo'); const seen=new Set<string>();
 return v.map(x=>{ if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==2||typeof x.itemId!=='string'||!Object.hasOwn(ITEMS,x.itemId)||!Number.isSafeInteger(x.count)||x.count<=0||seen.has(x.itemId)) invalid('cargo stack'); seen.add(x.itemId); return {itemId:x.itemId,count:x.count}; }).sort((a,b)=>a.itemId.localeCompare(b.itemId));
}
function ids(v:unknown,s:string):number[] { if(!Array.isArray(v)) invalid(s); const out=v.map((x,i)=>id(x,s+'['+i+']')); if(new Set(out).size!==out.length) invalid(s+' duplicate'); return out.sort((a,b)=>a-b); }
function sameIdentity(a:ComarcaIdentity,b:ComarcaIdentity):boolean { return JSON.stringify(a)===JSON.stringify(b); }
/** Gross barter value of actual escrow, using the game's ItemDef values. */
export function cargoBaseValue(cargo:readonly CaravanGoods[]):number { let sum=0; for(const stack of goods(cargo)) sum+=ITEMS[stack.itemId]!.baseValue*stack.count; if(!Number.isSafeInteger(sum)) throw new RangeError('caravan value exceeds safe integer range'); return sum; }
function standingDelta(value:number):number { return Math.min(20,Math.max(1,Math.floor(value/20))); }
/** Physical barter against caller-owned inventories. All validation precedes mutation; no abstract stock is created. */
export function exchangeCaravanGoods(source:Inventory,destination:Inventory,offerInput:readonly CaravanGoods[],requestInput:readonly CaravanGoods[]):{offeredValue:number;receivedValue:number;standingDelta:number} {
 if(source===destination) throw new RangeError('caravan trade needs two inventories');
 const offer=goods(offerInput), request=goods(requestInput), offeredValue=cargoBaseValue(offer), receivedValue=cargoBaseValue(request);
 if(offeredValue<=0||receivedValue<=0||receivedValue>offeredValue) throw new RangeError('requested goods exceed the offered barter value');
 for(const row of offer) if(source.count(row.itemId)<row.count) throw new RangeError('source stock changed before caravan barter');
 for(const row of request) if(destination.count(row.itemId)<row.count) throw new RangeError('destination stock changed before caravan barter');
 // Inventory operations cannot fail after the positive-stack/count/id preflight, so this synchronous block is atomic to callers.
 for(const row of offer) source.remove(row.itemId,row.count);
 for(const row of request) destination.remove(row.itemId,row.count);
 for(const row of offer) destination.add(row.itemId,row.count);
 for(const row of request) source.add(row.itemId,row.count);
 return {offeredValue,receivedValue,standingDelta:standingDelta(receivedValue)};
}

/** Owns route/party metadata and cargo escrow; never clones macro inventories or creates people. */
export class WorldCaravans {
 private readonly records=new Map<number,WorldCaravanRecord>(); private tick=0;
 schedule(input:ScheduleCaravanInput):WorldCaravanRecord {
  const caravanId=id(input.id,'id'); if(this.records.has(caravanId)) invalid('duplicate id');
  const source=ident(input.source), destination=ident(input.destination); if(sameIdentity(source,destination)) invalid('same comarca');
  const sourcePeopleId=groupId(input.sourcePeopleId,'sourcePeopleId'), destinationPeopleId=groupId(input.destinationPeopleId,'destinationPeopleId'); if(sourcePeopleId===destinationPeopleId) invalid('same people');
  if(!Array.isArray(input.travellers)||!input.travellers.length) invalid('travellers');
  const travellers=input.travellers.map((p,i)=>{if(!p||!Number.isSafeInteger(p.personId)||p.personId<1||typeof p.name!=='string'||!p.name.trim()||p.name.length>120) invalid('traveller['+i+']');return {personId:p.personId,name:p.name};}).sort((a,b)=>a.personId-b.personId);
  if(new Set(travellers.map(p=>p.personId)).size!==travellers.length) invalid('duplicate traveller');
  const escortIds=ids(input.escortIds,'escortIds'); if(travellers.some(p=>escortIds.includes(p.personId))) invalid('person both traveller and escort');
  const out=route(input.route,'route'),back=route(input.returnRoute,'returnRoute');
  if(!samePoint(out[0]!,source)||!samePoint(out.at(-1)!,destination)||!samePoint(back[0]!,destination)||!samePoint(back.at(-1)!,source)) invalid('route endpoints');
  const departureTick=at(input.departureTick,'departureTick'),arrivalTick=at(input.arrivalTick,'arrivalTick'); if(arrivalTick<=departureTick) invalid('arrival before departure');
  const campStops=(input.campStops??[]).map((s,i)=>{const p=point(s.point,'camp['+i+']'),campTick=at(s.tick,'camp tick'),resumeTick=at(s.resumeTick,'resume tick'); const idx=out.findIndex(v=>samePoint(v,p)); if(idx<=0||idx>=out.length-1||campTick<=departureTick||resumeTick<=campTick||resumeTick>=arrivalTick) invalid('camp schedule'); return {point:p,tick:campTick,resumeTick};}).sort((a,b)=>a.tick-b.tick);
  for(let i=1;i<campStops.length;i++) if(campStops[i]!.tick<campStops[i-1]!.resumeTick) invalid('overlapping camps');
  const record:WorldCaravanRecord={id:caravanId,source,destination,sourcePeopleId,destinationPeopleId,travellers,escortIds,route:out,returnRoute:back,departureTick,arrivalTick,returnDepartureTick:null,returnArrivalTick:null,campStops,nextCamp:0,campUntilTick:null,cargo:goods(input.cargo),phase:'scheduled',awaiting:null,raidResolved:false};
  this.records.set(caravanId,record); return clone(record);
 }
 get(caravanId:number):WorldCaravanRecord|null { const r=this.records.get(caravanId); return r?clone(r):null; }
 list():WorldCaravanRecord[] { return [...this.records.values()].sort((a,b)=>a.id-b.id).map(clone); }
 beginReturn(caravanId:number,departureTick:number,arrivalTick:number):void {
  const r=this.required(caravanId),depart=at(departureTick,'return departure'),arrive=at(arrivalTick,'return arrival');
  if(r.phase!=='arrived'||r.awaiting||depart<this.tick||arrive<=depart) invalid('return schedule');
  this.records.set(caravanId,{...r,returnDepartureTick:depart,returnArrivalTick:arrive,phase:'return-scheduled',raidResolved:false});
 }
 /** Replace the physical escrow after root transfers it to/from merchant inventory or settles travel needs. */
 cancel(caravanId:number):void {
  const r=this.required(caravanId); if(r.phase!=='arrived'||r.awaiting)invalid('only a completed arrival can be cancelled');
  this.records.set(caravanId,{...r,phase:'cancelled',cargo:[]});
 }
 /** Replace the physical escrow after root transfers it to/from merchant inventory or settles travel needs. */
 replaceCargo(caravanId:number,cargo:readonly CaravanGoods[]):void {
  const r=this.required(caravanId); if(r.phase==='returned'||r.phase==='cancelled') invalid('caravan is terminal');
  this.records.set(caravanId,{...r,cargo:goods(cargo)});
 }
 /** Due events are stable and replayable until ack() succeeds. */
 advanceTo(tick:number,relation:CaravanRelationLookup):CaravanEvent[] {
  at(tick,'tick'); if(tick<this.tick) invalid('clock moved backwards'); this.tick=tick; const due:CaravanEvent[]=[];
  for(const [key,r] of [...this.records].sort(([a],[b])=>a-b)) { const event=r.awaiting??this.nextEvent(r,tick,relation); if(!event) continue; if(!r.awaiting)this.records.set(key,{...r,awaiting:clone(event)}); due.push(clone(event)); }
  return due;
 }
 /** Root acknowledges after transaction success; cargoAfter is the exact remaining physical escrow. */
 ack(eventId:string,result:{readonly cargoAfter?:readonly CaravanGoods[]}={}):void {
  const r=[...this.records.values()].find(x=>x.awaiting?.eventId===eventId); if(!r?.awaiting) invalid('unknown or acknowledged event'); const e=r.awaiting; let n:WorldCaravanRecord;
  switch(e.kind){
   case 'depart': n={...r,phase:'outbound',awaiting:null}; break;
   case 'return-depart': n={...r,phase:'returning',awaiting:null}; break;
   case 'raid-opportunity': n={...r,cargo:result.cargoAfter===undefined?r.cargo:goods(result.cargoAfter),raidResolved:true,awaiting:null}; break;
   case 'camp': n={...r,phase:'camped',campUntilTick:e.resumeTick,nextCamp:r.nextCamp+1,awaiting:null}; break;
   case 'resume': n={...r,phase:'outbound',campUntilTick:null,awaiting:null}; break;
   case 'arrive': n={...r,phase:'arrived',cargo:result.cargoAfter===undefined?r.cargo:goods(result.cargoAfter),awaiting:null,raidResolved:false}; break;
   case 'return-arrive': n={...r,phase:'returned',cargo:result.cargoAfter===undefined?r.cargo:goods(result.cargoAfter),awaiting:null}; break;
  }
  this.records.set(r.id,n);
 }
 toRecord():WorldCaravansRecord { return {recordType:'WorldCaravansRecord',version:WORLD_CARAVAN_VERSION,tick:this.tick,caravans:this.list()}; }
 static fromRecord(value:unknown):WorldCaravans {
  if(!value||typeof value!=='object'||Array.isArray(value)) invalid('record'); const r=value as Partial<WorldCaravansRecord>;
  if(r.recordType!=='WorldCaravansRecord'||r.version!==WORLD_CARAVAN_VERSION||!Number.isSafeInteger(r.tick)||r.tick!<0||!Array.isArray(r.caravans)) invalid('record version');
  const result=new WorldCaravans(); result.tick=r.tick!; let last=0;
  for(const raw of r.caravans){const c=validateRecord(raw);if(c.id<=last)invalid('records must be uniquely ordered');last=c.id;result.records.set(c.id,c);} return result;
 }
 private required(caravanId:number):WorldCaravanRecord { const r=this.records.get(id(caravanId,'caravan id')); if(!r)invalid('unknown caravan'); return r; }
 private nextEvent(c:WorldCaravanRecord,now:number,lookup:CaravanRelationLookup):CaravanEvent|null {
  const join=(parts:(string|number)[])=>parts.join(':');
  if(c.phase==='scheduled'&&now>=c.departureTick)return {eventId:join([c.id,'depart',c.departureTick]),kind:'depart',caravanId:c.id,tick:c.departureTick,origin:c.source,destination:c.destination,route:c.route,travellers:c.travellers,escortIds:c.escortIds,cargo:c.cargo,cargoBaseValue:cargoBaseValue(c.cargo),leg:'outbound'};
  if(c.phase==='outbound'){
   const stop=c.campStops[c.nextCamp]; if(stop&&now>=stop.tick)return {eventId:join([c.id,'camp',c.nextCamp,stop.tick]),kind:'camp',caravanId:c.id,tick:stop.tick,at:stop.point,resumeTick:stop.resumeTick,travellers:c.travellers,escortIds:c.escortIds};
   if(now>=c.arrivalTick){if(!c.raidResolved){const r=lookup(c.sourcePeopleId,c.destinationPeopleId);if(r.stance==='war'||r.standing<=-60)return {eventId:join([c.id,'raid',c.arrivalTick]),kind:'raid-opportunity',caravanId:c.id,tick:c.arrivalTick,raiderPeopleId:c.destinationPeopleId,targetPeopleId:c.sourcePeopleId,stance:r.stance==='war'?'war':null,standing:r.standing,travellers:c.travellers,escortIds:c.escortIds,cargo:c.cargo};}
    const value=cargoBaseValue(c.cargo);return {eventId:join([c.id,'arrive',c.arrivalTick]),kind:'arrive',caravanId:c.id,tick:c.arrivalTick,at:c.destination,peopleId:c.destinationPeopleId,travellers:c.travellers,escortIds:c.escortIds,cargo:c.cargo,cargoBaseValue:value,standingDelta:standingDelta(value),contactDelta:Math.min(1,value/100),leg:'outbound'};}
  }
  if(c.phase==='camped'&&c.campUntilTick!==null&&now>=c.campUntilTick){const p=c.campStops[c.nextCamp-1]!.point;return {eventId:join([c.id,'resume',c.campUntilTick]),kind:'resume',caravanId:c.id,tick:c.campUntilTick,at:p,resumeTick:null,travellers:c.travellers,escortIds:c.escortIds};}
  if(c.phase==='return-scheduled'&&c.returnDepartureTick!==null&&c.returnArrivalTick!==null&&now>=c.returnDepartureTick)return {eventId:join([c.id,'return-depart',c.returnDepartureTick]),kind:'return-depart',caravanId:c.id,tick:c.returnDepartureTick,origin:c.destination,destination:c.source,route:c.returnRoute,travellers:c.travellers,escortIds:c.escortIds,cargo:c.cargo,cargoBaseValue:cargoBaseValue(c.cargo),leg:'return'};
  if(c.phase==='returning'&&c.returnArrivalTick!==null&&now>=c.returnArrivalTick){const r=lookup(c.destinationPeopleId,c.sourcePeopleId);if(!c.raidResolved&&(r.stance==='war'||r.standing<=-60))return {eventId:join([c.id,'return-raid',c.returnArrivalTick]),kind:'raid-opportunity',caravanId:c.id,tick:c.returnArrivalTick,raiderPeopleId:c.sourcePeopleId,targetPeopleId:c.destinationPeopleId,stance:r.stance==='war'?'war':null,standing:r.standing,travellers:c.travellers,escortIds:c.escortIds,cargo:c.cargo};const value=cargoBaseValue(c.cargo);return {eventId:join([c.id,'return-arrive',c.returnArrivalTick]),kind:'return-arrive',caravanId:c.id,tick:c.returnArrivalTick,at:c.source,peopleId:c.sourcePeopleId,travellers:c.travellers,escortIds:c.escortIds,cargo:c.cargo,cargoBaseValue:value,standingDelta:standingDelta(value),contactDelta:Math.min(1,value/100),leg:'return'};}
  return null;
 }
}
function validateRecord(v:unknown):WorldCaravanRecord {
 if(!v||typeof v!=='object'||Array.isArray(v))invalid('caravan record');const c=v as Partial<WorldCaravanRecord>,source=ident(c.source),destination=ident(c.destination);
 if(sameIdentity(source,destination))invalid('same comarca');const sourcePeopleId=groupId(c.sourcePeopleId,'source people'),destinationPeopleId=groupId(c.destinationPeopleId,'destination people');if(sourcePeopleId===destinationPeopleId)invalid('same people');
 if(!Array.isArray(c.travellers)||!c.travellers.length)invalid('travellers');const travellers=c.travellers.map(p=>{if(!p||!Number.isSafeInteger(p.personId)||p.personId<1||typeof p.name!=='string'||!p.name.trim()||p.name.length>120)invalid('traveller');return {personId:p.personId,name:p.name};});if(new Set(travellers.map(p=>p.personId)).size!==travellers.length)invalid('duplicate traveller');
 const escortIds=ids(c.escortIds,'escortIds');if(travellers.some(p=>escortIds.includes(p.personId)))invalid('duplicate party member');const out=route(c.route,'route'),back=route(c.returnRoute,'return route');if(!samePoint(out[0]!,source)||!samePoint(out.at(-1)!,destination)||!samePoint(back[0]!,destination)||!samePoint(back.at(-1)!,source))invalid('route endpoints');
 const departureTick=at(c.departureTick,'departure'),arrivalTick=at(c.arrivalTick,'arrival');if(arrivalTick<=departureTick)invalid('arrival');if(!Array.isArray(c.campStops))invalid('camp stops');const campStops=c.campStops.map(s=>{if(!s)invalid('camp');const p=point(s.point,'camp point'),start=at(s.tick,'camp tick'),resume=at(s.resumeTick,'camp resume');if(!out.some(q=>samePoint(q,p))||start<=departureTick||resume<=start||resume>=arrivalTick)invalid('camp timing');return {point:p,tick:start,resumeTick:resume};});for(let i=1;i<campStops.length;i++)if(campStops[i]!.tick<campStops[i-1]!.resumeTick)invalid('overlapping camps');
 if(!Number.isSafeInteger(c.nextCamp)||c.nextCamp!<0||c.nextCamp!>campStops.length)invalid('next camp');if(c.campUntilTick!==null)at(c.campUntilTick,'camp until');if(!['scheduled','outbound','camped','arrived','return-scheduled','returning','returned','cancelled'].includes(c.phase as string))invalid('phase');
 const returnDepartureTick=c.returnDepartureTick===null?null:at(c.returnDepartureTick,'return departure'),returnArrivalTick=c.returnArrivalTick===null?null:at(c.returnArrivalTick,'return arrival');if((returnDepartureTick===null)!==(returnArrivalTick===null)||(returnArrivalTick!==null&&returnArrivalTick<=returnDepartureTick!))invalid('return timing');if(typeof c.raidResolved!=='boolean')invalid('raid flag');
 const awaiting=c.awaiting??null;if(awaiting&&(awaiting.caravanId!==c.id||typeof awaiting.eventId!=='string'))invalid('pending event');return {id:id(c.id,'id'),source,destination,sourcePeopleId,destinationPeopleId,travellers,escortIds,route:out,returnRoute:back,departureTick,arrivalTick,returnDepartureTick,returnArrivalTick,campStops,nextCamp:c.nextCamp!,campUntilTick:c.campUntilTick??null,cargo:goods(c.cargo),phase:c.phase as CaravanPhase,awaiting:awaiting?clone(awaiting):null,raidResolved:c.raidResolved};
}
