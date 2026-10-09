import type { ComarcaEcologyRecord } from './ComarcaEcology.ts';
import type { CompactPersonRecord } from '../compact/CompactPerson.ts';
import { RNG } from '../core/RNG.ts';
import { ComarcaOffmapRuntime, type ComarcaOffmapRuntimeRecord } from './ComarcaOffmapRuntime.ts';
import { toObjectGraph, fromObjectGraph, type ObjectGraph } from '../persistence/GraphRecords.ts';
import type { PlaceMemory } from '../social/PlaceMemory.ts';
/** Persistent ownership map for M15 comarca transitions. It is data only: a parked checkpoint never owns a running Simulation. */
import type { CheckpointRecord } from '../persistence/CheckpointRecords.ts';
import type { ComarcaIdentity } from '../persistence/TileLedger.ts';
import { COMARCAS_PER_REGION } from './WorldMap.ts';
import type { ComarcaEdge } from './ComarcaNeighbour.ts';
import type { JourneyPoint, JourneyTransport } from './Transport.ts';

export interface PendingComarcaCross {
  readonly actorId: number;
  readonly direction: ComarcaEdge;
  readonly source: ComarcaIdentity;
  readonly destination: ComarcaIdentity;
  readonly requestedAtTick: number;
  readonly travellerIds: readonly number[];
  readonly scout: boolean;
  readonly migration: boolean;
}

export interface ComarcaScoutTicket {
  readonly personId: number;
  readonly source: ComarcaIdentity;
  readonly destination: ComarcaIdentity;
  readonly departureTick: number;
  readonly returnTick: number;
}

export interface ParkedComarcaCheckpoint {
  readonly identity: ComarcaIdentity;
  readonly checkpoint: CheckpointRecord;
  readonly runtime?: ComarcaOffmapRuntimeRecord;
}

export interface ComarcaJourneyRecord {
  readonly recordType: 'ComarcaJourneyRecord'; readonly version: 1;
  readonly actorId: number; readonly travellerIds: readonly number[]; readonly source: ComarcaIdentity; readonly destination: ComarcaIdentity;
  readonly departureTick: number; readonly arrivalTick: number; readonly lastAdvancedTick: number;
  readonly route: readonly JourneyPoint[]; readonly enteringEdge: ComarcaEdge; readonly provisions: number; readonly preservedProvisions: number; readonly cargoUnits: number; readonly migration: boolean; readonly playerTravelling: boolean;
  readonly transport: JourneyTransport; readonly transit: CheckpointRecord;
  readonly rng: ReturnType<RNG['snapshot']>; readonly encounters: readonly string[];
}
export interface ComarcaFrontierRecord {
  readonly recordType: 'ComarcaFrontier';
  readonly version: 5;
  readonly ecologies: readonly { identity: ComarcaIdentity; streams: Pick<ComarcaEcologyRecord,'forestRng'|'wildlifeRng'|'ecologyRng'|'wildlifeOwed'> }[];
  readonly origins: readonly (readonly [number,number])[];
  readonly continuity: readonly Omit<CompactPersonRecord,'person'>[];
  readonly active: ComarcaIdentity | null;
  readonly parked: readonly ParkedComarcaCheckpoint[];
  readonly pendingCross: PendingComarcaCross | null;
  readonly scouts: readonly ComarcaScoutTicket[];
  readonly memories: readonly { personId: number; identity: ComarcaIdentity; graph: ObjectGraph }[];
  readonly journey: ComarcaJourneyRecord | null;
}

function key(identity: ComarcaIdentity): string { return JSON.stringify(identity); }
function clone<T>(value: T): T { return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T; }
function invalid(reason: string): never { throw new TypeError(`Invalid ComarcaFrontier: ${reason}`); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, fields: readonly string[]): void {
  if (Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) invalid(`unknown or missing fields (${Object.keys(value).join(',')}; expected ${fields.join(',')})`);
}
function safeId(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid(field);
  return value as number;
}
function tick(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid(field);
  return value as number;
}
function edge(value: unknown): value is ComarcaEdge { return value === 'n' || value === 'e' || value === 's' || value === 'w'; }
function identity(value: unknown): ComarcaIdentity {
  if (!object(value) || typeof value.kind !== 'string') invalid('identity');
  if (value.kind === 'random') {
    exact(value, ['kind','seed','regionsWide','regionsHigh','cx','cy']);
    if (typeof value.seed !== 'string' || !value.seed || !Number.isSafeInteger(value.regionsWide) || (value.regionsWide as number) < 2 ||
        !Number.isSafeInteger(value.regionsHigh) || (value.regionsHigh as number) < 2 || !Number.isSafeInteger(value.cx) || (value.cx as number) < 0 ||
        !Number.isSafeInteger(value.cy) || (value.cy as number) < 0 || (value.cx as number) >= (value.regionsWide as number) * COMARCAS_PER_REGION ||
        (value.cy as number) >= (value.regionsHigh as number) * COMARCAS_PER_REGION) invalid('random identity');
    return clone(value) as unknown as ComarcaIdentity;
  }
  if (value.kind === 'earth') {
    exact(value, ['kind','mapId','rasterWidth','rasterHeight','seaLevelMeters','comarcasPerRegion','cx','cy']);
    if (typeof value.mapId !== 'string' || !/^[a-z0-9-]+$/.test(value.mapId) ||
        !Number.isSafeInteger(value.rasterWidth) || (value.rasterWidth as number) < 2 ||
        !Number.isSafeInteger(value.rasterHeight) || (value.rasterHeight as number) < 2 ||
        !Number.isSafeInteger(value.comarcasPerRegion) || (value.comarcasPerRegion as number) < 1 ||
        !Number.isSafeInteger(value.seaLevelMeters) || !Number.isSafeInteger(value.cx) || (value.cx as number) < 0 ||
        !Number.isSafeInteger(value.cy) || (value.cy as number) < 0 ||
        (value.cx as number) >= (value.rasterWidth as number) * (value.comarcasPerRegion as number) ||
        (value.cy as number) >= (value.rasterHeight as number) * (value.comarcasPerRegion as number)) invalid('Earth identity');
    return clone(value) as unknown as ComarcaIdentity;
  }
  return invalid('identity kind');
}
function parsePending(value: unknown): PendingComarcaCross | null {
  if (value === null) return null;
  if (!object(value)) invalid('pendingCross');
  const version2 = Object.hasOwn(value, 'migration');
  exact(value, version2 ? ['actorId','direction','source','destination','requestedAtTick','travellerIds','scout','migration'] : ['actorId','direction','source','destination','requestedAtTick','travellerIds','scout']);
  if (!edge(value.direction) || typeof value.scout !== 'boolean' || (version2 && typeof value.migration !== 'boolean') || !Array.isArray(value.travellerIds)) invalid('pending cross fields');
  const travellerIds = value.travellerIds.map((id, i) => safeId(id, `travellerIds[${i}]`));
  if (travellerIds.length === 0 || new Set(travellerIds).size !== travellerIds.length) invalid('traveller IDs');
  return { actorId: safeId(value.actorId, 'actorId'), direction: value.direction,
    source: identity(value.source), destination: identity(value.destination),
    requestedAtTick: tick(value.requestedAtTick, 'requestedAtTick'), travellerIds, scout: value.scout, migration: version2 ? value.migration as boolean : false };
}

/** Owns only detached records and request metadata; it never advances a parked simulation. */
export class ComarcaFrontier {
  private readonly ecologyContinuity = new Map<string,{identity:ComarcaIdentity;streams:Pick<ComarcaEcologyRecord,'forestRng'|'wildlifeRng'|'ecologyRng'|'wildlifeOwed'>}>();
  rememberEcology(record:ComarcaEcologyRecord): void { const {forestRng,wildlifeRng,ecologyRng,wildlifeOwed}=record; this.ecologyContinuity.set(key(record.entry.identity),clone({identity:record.entry.identity,streams:{forestRng,wildlifeRng,ecologyRng,wildlifeOwed}})); }
  ecologyState(at:ComarcaIdentity) { return clone(this.ecologyContinuity.get(key(at))?.streams); }
  private readonly origins = new Map<number,number>();
  noteMaterialized(id:number,peopleId:number): void { this.origins.set(safeId(id,'materialized person'),safeId(peopleId,'macro people')); }
  materializedOrigins(): ReadonlyMap<number,number> { return new Map(this.origins); }
  private readonly compactContinuity = new Map<number,Omit<CompactPersonRecord,'person'>>();
  compactState(): ReadonlyMap<number,Omit<CompactPersonRecord,'person'>> { return new Map([...this.compactContinuity].map(([id,v])=>[id,clone(v)])); }
  rememberCompact(records: readonly CompactPersonRecord[]): void { for (const {person,...meta} of records) this.compactContinuity.set(meta.personId,clone(meta)); }
  private activeIdentity: ComarcaIdentity | null;
  private readonly parkedByKey = new Map<string, ParkedComarcaCheckpoint>();
  private pending: PendingComarcaCross | null = null;
  private readonly scoutByPerson = new Map<number, ComarcaScoutTicket>();
  private journey: ComarcaJourneyRecord | null = null;
  get pendingJourney(): ComarcaJourneyRecord | null { return this.journey ? clone(this.journey) : null; }
  setJourney(record: ComarcaJourneyRecord): void {
    if (this.journey) invalid('journey already active');
    if (record.recordType !== 'ComarcaJourneyRecord' || record.version !== 1 || !Number.isSafeInteger(record.actorId) || !Array.isArray(record.travellerIds) || !record.travellerIds.length || new Set(record.travellerIds).size !== record.travellerIds.length || !record.travellerIds.includes(record.actorId) || record.travellerIds.some(id=>!Number.isSafeInteger(id)||id<1) ||
        !Number.isSafeInteger(record.departureTick) || !Number.isSafeInteger(record.arrivalTick) || record.arrivalTick <= record.departureTick ||
        !Number.isSafeInteger(record.lastAdvancedTick) || record.lastAdvancedTick < record.departureTick || record.lastAdvancedTick > record.arrivalTick ||
        !Array.isArray(record.route) || record.route.length < 2 || !Number.isSafeInteger(record.provisions) || record.provisions < 0 || !Number.isSafeInteger(record.preservedProvisions) || record.preservedProvisions < 0 || record.preservedProvisions > record.provisions || !Number.isSafeInteger(record.cargoUnits) || record.cargoUnits < record.provisions || !Array.isArray(record.encounters) || !record.transit || typeof record.migration!=='boolean' || typeof record.playerTravelling!=='boolean' ||
        record.transit.recordType !== 'CheckpointRecord' || record.transit.version !== 1 || !edge(record.enteringEdge)) invalid('journey');
    const transport = record.transport;
    if (!transport || !['foot', 'sledge', 'cart', 'boat'].includes(transport.mode) ||
        !Number.isSafeInteger(transport.distance) || transport.distance < 1 || transport.distance !== record.route.length - 1 ||
        !Number.isFinite(transport.days) || transport.days <= 0 ||
        !Number.isSafeInteger(transport.maximumDistance) || transport.maximumDistance < transport.distance ||
        !Number.isFinite(transport.cargoCapacity) || transport.cargoCapacity < 0 || typeof transport.crossedSea !== 'boolean' ||
        (transport.mode === 'boat' && !transport.crossedSea) ||
        record.encounters.some(kind => !['storm', 'wildlife', 'settlement'].includes(kind))) invalid('journey transport');
    RNG.fromSnapshot(record.rng);
    if(record.transit.lastAdvancedTick!==record.lastAdvancedTick || record.transit.execution.time.tick!==record.lastAdvancedTick ||
       record.route[0]?.cx!==record.source.cx || record.route[0]?.cy!==record.source.cy ||
       record.route.at(-1)?.cx!==record.destination.cx || record.route.at(-1)?.cy!==record.destination.cy) invalid('journey checkpoint continuity');
    this.journey = clone(record);
  }
  updateJourney(record: ComarcaJourneyRecord): void {
    if (!this.journey || this.journey.actorId !== record.actorId || JSON.stringify(this.journey.source) !== JSON.stringify(record.source) ||
        JSON.stringify(this.journey.travellerIds) !== JSON.stringify(record.travellerIds) || record.lastAdvancedTick < this.journey.lastAdvancedTick ||
        record.transit.lastAdvancedTick!==record.lastAdvancedTick || record.transit.execution.time.tick!==record.lastAdvancedTick ||
        record.arrivalTick<this.journey.arrivalTick) invalid('journey continuity');
    this.journey = clone(record);
  }
  takeJourney(): ComarcaJourneyRecord | null { const value=this.journey; this.journey=null; return value ? clone(value) : null; }

  private readonly memoryByKey = new Map<string, { personId: number; identity: ComarcaIdentity; graph: ObjectGraph }>();
  constructor(active: ComarcaIdentity | null = null) { this.activeIdentity = active ? identity(active) : null; }
  get active(): ComarcaIdentity | null { return this.activeIdentity ? clone(this.activeIdentity) : null; }
  get pendingCross(): PendingComarcaCross | null { return this.pending ? clone(this.pending) : null; }
  get scouts(): readonly ComarcaScoutTicket[] { return [...this.scoutByPerson.values()].sort((a,b) => a.personId - b.personId).map(clone); }
  parkedAt(at: ComarcaIdentity): CheckpointRecord | null {
    const record = this.parkedByKey.get(key(identity(at)));
    return record ? clone(record.checkpoint) : null;
  }
  runtimeAt(at: ComarcaIdentity): ComarcaOffmapRuntimeRecord | null { return clone(this.parkedByKey.get(key(at))?.runtime ?? null); }
  unpark(at: ComarcaIdentity): void { this.parkedByKey.delete(key(at)); }
  remember(personId: number, at: ComarcaIdentity, memory: PlaceMemory): void {
    this.memoryByKey.set(personId+'|'+key(at), { personId, identity: clone(at), graph: toObjectGraph(memory) });
  }
  memoryAt(personId: number, at: ComarcaIdentity): PlaceMemory | null {
    const entry = this.memoryByKey.get(personId+'|'+key(at));
    return entry ? fromObjectGraph(entry.graph, 'PlaceMemory', 'comarca memory') as PlaceMemory : null;
  }
  setActive(at: ComarcaIdentity | null): void { this.activeIdentity = at === null ? null : identity(at); }
  park(at: ComarcaIdentity, checkpoint: CheckpointRecord, runtime?: ComarcaOffmapRuntimeRecord): void {
    const id = identity(at);
    const copy = clone(checkpoint);
    if (copy.recordType !== 'CheckpointRecord' || copy.version !== 1) invalid('parked checkpoint');
    if (runtime && JSON.stringify(runtime.checkpoint) !== JSON.stringify(checkpoint)) invalid('runtime and checkpoint disagree');
    this.parkedByKey.set(key(id), { identity: id, checkpoint: copy, ...(runtime ? { runtime: clone(runtime) } : {}) });
  }
  queueCross(request: PendingComarcaCross): void {
    if (this.pending) invalid('cross already pending');
    const parsed = parsePending(request);
    if (!parsed) invalid('pending cross');
    if (!this.activeIdentity || key(parsed.source) !== key(this.activeIdentity)) invalid('cross source is not active');
    this.pending = parsed;
  }
  takePendingCross(): PendingComarcaCross | null {
    const request = this.pending;
    this.pending = null;
    return request ? clone(request) : null;
  }
  addScout(ticket: ComarcaScoutTicket): void {
    safeId(ticket.personId, 'scout personId');
    tick(ticket.departureTick, 'scout departureTick');
    tick(ticket.returnTick, 'scout returnTick');
    if (ticket.returnTick <= ticket.departureTick || this.scoutByPerson.has(ticket.personId)) invalid('scout ticket');
    this.scoutByPerson.set(ticket.personId, { ...ticket, source: identity(ticket.source), destination: identity(ticket.destination) });
  }
  takeDueScouts(atTick: number): ComarcaScoutTicket[] {
    tick(atTick, 'tick');
    const due = [...this.scoutByPerson.values()].filter(ticket => ticket.returnTick <= atTick).sort((a,b) => a.returnTick - b.returnTick || a.personId - b.personId);
    for (const ticket of due) this.scoutByPerson.delete(ticket.personId);
    return due.map(clone);
  }
  toRecord(): ComarcaFrontierRecord {
    return { recordType: 'ComarcaFrontier', version: 5, ecologies: [...this.ecologyContinuity.values()].map(clone), origins: [...this.origins].sort((a,b)=>a[0]-b[0]), continuity: [...this.compactContinuity.values()].sort((a,b)=>a.personId-b.personId).map(clone),
      active: this.active, parked: [...this.parkedByKey.values()].sort((a,b) => key(a.identity).localeCompare(key(b.identity))).map(clone),
      pendingCross: this.pendingCross, scouts: this.scouts, memories: [...this.memoryByKey.values()].map(clone), journey: this.pendingJourney };
  }
  static fromRecord(input: unknown): ComarcaFrontier {
    if (!object(input)) invalid('expected record');
    if (input.version !== 1 && input.version !== 2 && input.version !== 3 && input.version !== 4 && input.version !== 5) invalid('version');
    exact(input, ['recordType','version','active','parked','pendingCross','scouts', ...(input.version >= 3 ? ['memories'] : []), ...(input.version >= 4 ? ['continuity','origins','ecologies'] : []), ...(input.version === 5 ? ['journey'] : [])]);
    if (input.recordType !== 'ComarcaFrontier' ||
        (input.active !== null && !object(input.active)) || !Array.isArray(input.parked) || !Array.isArray(input.scouts)) invalid('expected v1/v2 record');
    const frontier = new ComarcaFrontier(input.active === null ? null : identity(input.active));
    const parkedKeys = new Set<string>();
    for (const [index, raw] of input.parked.entries()) {
      if (!object(raw)) invalid(`parked[${index}]`);
      exact(raw, ['identity','checkpoint', ...(Object.hasOwn(raw,'runtime') ? ['runtime'] : [])]);
      const id = identity(raw.identity);
      if (key(id) === (frontier.active ? key(frontier.active) : '') || parkedKeys.has(key(id)) || !object(raw.checkpoint) ||
          raw.checkpoint.recordType !== 'CheckpointRecord' || raw.checkpoint.version !== 1) invalid(`parked[${index}]`);
      parkedKeys.add(key(id));
      const runtime = raw.runtime ? ComarcaOffmapRuntime.fromRecord(raw.runtime as ComarcaOffmapRuntimeRecord).toRecord() : undefined;
      frontier.park(id, raw.checkpoint as unknown as CheckpointRecord, runtime);
    }
    frontier.pending = parsePending(input.pendingCross);
    if (frontier.pending && (!frontier.active || key(frontier.pending.source) !== key(frontier.active))) invalid('pending source');
    for (const [index, raw] of input.scouts.entries()) {
      if (!object(raw)) invalid(`scouts[${index}]`);
      exact(raw, ['personId','source','destination','departureTick','returnTick']);
      frontier.addScout({ personId: safeId(raw.personId, 'scout personId'), source: identity(raw.source),
        destination: identity(raw.destination), departureTick: tick(raw.departureTick, 'departureTick'),
        returnTick: tick(raw.returnTick, 'returnTick') });
    }
    if (input.version >= 3) {
      if (!Array.isArray(input.memories)) invalid('memories');
      for (const raw of input.memories) {
        if (!object(raw)) invalid('memory'); exact(raw, ['personId','identity','graph']);
        const personId = safeId(raw.personId,'memory person'), at = identity(raw.identity);
        const memory = fromObjectGraph(raw.graph as ObjectGraph,'PlaceMemory','comarca memory') as PlaceMemory;
        frontier.remember(personId,at,memory);
      }
    }
    if (input.version >= 4) {
      if(!Array.isArray(input.ecologies)) invalid('ecology metadata');
      for(const raw of input.ecologies) { if(!object(raw)||!object(raw.streams)) invalid('ecology metadata'); exact(raw,['identity','streams']); exact(raw.streams,['forestRng','wildlifeRng','ecologyRng','wildlifeOwed']); const at=identity(raw.identity); for(const stream of ['forestRng','wildlifeRng','ecologyRng']) RNG.fromSnapshot(raw.streams[stream]); if(frontier.ecologyContinuity.has(key(at))) invalid('duplicate ecology metadata'); frontier.ecologyContinuity.set(key(at),clone(raw) as unknown as {identity:ComarcaIdentity;streams:Pick<ComarcaEcologyRecord,'forestRng'|'wildlifeRng'|'ecologyRng'|'wildlifeOwed'>}); }
      if (!Array.isArray(input.origins)) invalid('origins');
      for(const pair of input.origins) { if(!Array.isArray(pair)||pair.length!==2||frontier.origins.has(pair[0])) invalid('origin'); frontier.noteMaterialized(pair[0],pair[1]); }
      if (!Array.isArray(input.continuity)) invalid('compact continuity');
      for (const raw of input.continuity) {
        if (!object(raw)) invalid('compact continuity');
        exact(raw,['recordType','version','personId','lastAdvancedTick','epoch','rng','goal','intake']);
        if (raw.recordType !== 'CompactPersonRecord' || raw.version !== 1) invalid('compact metadata');
        const id = safeId(raw.personId,'compact person'); tick(raw.lastAdvancedTick,'compact date'); tick(raw.epoch,'compact epoch'); RNG.fromSnapshot(raw.rng);
        if (frontier.compactContinuity.has(id)) invalid('duplicate compact metadata');
        frontier.compactContinuity.set(id,clone(raw) as unknown as Omit<CompactPersonRecord,'person'>);
      }
    }
    if (input.version === 5) {
      if (input.journey !== null) {
        if (!object(input.journey)) invalid('journey');
        const raw=input.journey;
        exact(raw,['recordType','version','actorId','travellerIds','source','destination','departureTick','arrivalTick','lastAdvancedTick','route','enteringEdge','provisions','preservedProvisions','cargoUnits','migration','playerTravelling','transport','transit','rng','encounters']);
        if (raw.recordType !== 'ComarcaJourneyRecord' || raw.version !== 1 || !edge(raw.enteringEdge) || !Array.isArray(raw.route) || !Array.isArray(raw.travellerIds) || !Array.isArray(raw.encounters) || typeof raw.migration!=='boolean' || typeof raw.playerTravelling!=='boolean' || !object(raw.transport) || !object(raw.transit)) invalid('journey');
        const route=raw.route.map((p: unknown)=>{if(!object(p)) invalid('journey route'); exact(p,['cx','cy']); return {cx:tick(p.cx,'journey cx'),cy:tick(p.cy,'journey cy')};});
        exact(raw.transport,['distance','days','maximumDistance','mode','cargoCapacity','crossedSea']);
        const transport=raw.transport as unknown as JourneyTransport;
        if(!Number.isFinite(transport.distance)||transport.distance<1||!Number.isFinite(transport.days)||transport.days<=0||!Number.isFinite(transport.maximumDistance)||transport.maximumDistance<transport.distance||!Number.isFinite(transport.cargoCapacity)||transport.cargoCapacity<0||typeof transport.crossedSea!=='boolean'||!['foot','sledge','cart','boat'].includes(transport.mode)||(transport.mode==='boat'&&!transport.crossedSea))invalid('journey transport');
        frontier.setJourney({recordType:'ComarcaJourneyRecord',version:1,actorId:safeId(raw.actorId,'journey actor'),travellerIds:(()=>{if(!Array.isArray(raw.travellerIds)||!raw.travellerIds.length)invalid('journey travellers');const ids=raw.travellerIds.map((id:unknown)=>safeId(id,'journey traveller'));if(new Set(ids).size!==ids.length||!ids.includes(raw.actorId as number))invalid('journey travellers');return ids;})(),source:identity(raw.source),destination:identity(raw.destination),departureTick:tick(raw.departureTick,'journey departure'),arrivalTick:tick(raw.arrivalTick,'journey arrival'),lastAdvancedTick:tick(raw.lastAdvancedTick,'journey advanced'),route,enteringEdge:raw.enteringEdge,provisions:tick(raw.provisions,'journey provisions'),preservedProvisions:tick(raw.preservedProvisions,'journey preserved provisions'),cargoUnits:tick(raw.cargoUnits,'journey cargo'),migration:raw.migration,playerTravelling:raw.playerTravelling,transport,transit:raw.transit as unknown as CheckpointRecord,rng:raw.rng as ReturnType<RNG['snapshot']>,encounters:raw.encounters.map((e:unknown)=>{if(typeof e!=='string') invalid('journey encounter'); return e;})});
      }
    }
    return frontier;
  }
}
