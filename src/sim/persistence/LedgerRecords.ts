/** Inert v2 snapshot of execution ledgers kept outside entity records. */
import type { Simulation, InsightNotice, StopNotice, WatchedNotice } from '../core/Simulation.ts';
import type { Person } from '../entities/Person.ts';
import type { Building } from '../entities/Building.ts';
import type { Case } from '../social/Justice.ts';
import { EVENT_TYPES, type EventType, type Norms, type SocialEvent } from '../social/Events.ts';
import type { Sighting } from '../social/Fear.ts';
import type { PropertyUse } from '../social/Property.ts';
import type { Autonomy } from '../ai/Autonomy.ts';
import { ERAS, TECHS, type EraDef, type Tech } from '../knowledge/Tech.ts';

export const LEDGER_RECORD_VERSION = 2 as const;

type Entry<K, V> = [K, V];
export interface LedgerRecord {
  readonly recordType: 'LedgerRecord'; readonly version: 2; readonly lastAdvancedTick: number; readonly lastAdvancedDay: number;
  readonly playerId: number | null; readonly autonomy: Autonomy; readonly autonomyStall: string | null;
  readonly lastRefusal: string | null; readonly snowDepth: number;
  readonly succession: { diedId: number; heirId: number | null } | null;
  readonly interruptions: StopNotice[]; readonly watchedUses: { personId: number; use: Omit<PropertyUse, 'seen'> & { seenId: number | null } }[];
  readonly helpCalls: { callerId: number; x: number; y: number }[]; readonly insights: InsightNotice[];
  readonly territoryPermissions: [number, number, number][]; readonly feudEvents: number[]; readonly pendingVerdicts: Case[];
  readonly sightings: [number, [number, Sighting][]][];
  readonly edgeReserve: Record<string, number>; readonly foundingFauna: Record<string, number>; readonly nextEdgeHerd: number;
  readonly normsByBand: [number, Norms][]; readonly strangerRegardByBand: [number, number][];
  readonly socialRecent: SocialEvent[];
  readonly knownTech: string[]; readonly recordedTech: string[]; readonly rememberedTech: string[]; readonly recordsInHand: string[];
  readonly techHolders: [Tech, number][]; readonly eraId: string; readonly templeByBand: [number, number][];
  readonly bandSystem: {
    chiefByBand: Entry<number, number>[]; siteProgress: Entry<number, { mark: number; day: number }>[];
    raidConsidered: Entry<number, number>[]; foodFailureSince: Entry<number, number>[];
    coupConsidered: Entry<number, number>[]; tributePaid: Entry<number, number>[];
  };
  /** Daily AI snapshot; IDs preserve intentionally stale membership until midnight. */
  readonly sabotageCache: Entry<number, number[]>[];
  readonly wildlifeOwed: Entry<number, number>[];
}

export interface LedgerState {
  readonly lastAdvancedTick: number; readonly lastAdvancedDay: number; readonly player: Person | null; readonly playerId: number | null;
  readonly autonomy: Autonomy; readonly autonomyStall: string | null; readonly lastRefusal: string | null; readonly snowDepth: number;
  readonly succession: { died: Person; heir: Person | null } | null;
  readonly interruptions: StopNotice[]; readonly watchedUses: WatchedNotice[];
  readonly helpCalls: { callerId: number; x: number; y: number }[]; readonly insights: InsightNotice[];
  readonly territoryPermissions: Map<string, number>; readonly feudEvents: Set<number>; readonly pendingVerdicts: Case[];
  readonly sightings: Map<number, Map<number, Sighting>>;
  readonly edgeReserve: Record<string, number>; readonly foundingFauna: Record<string, number>; readonly nextEdgeHerd: number;
  readonly normsByBand: Map<number, Norms>; readonly strangerRegardByBand: Map<number, number>;
  readonly socialRecent: SocialEvent[];
  readonly knownTech: Set<string>; readonly recordedTech: Set<string>; readonly rememberedTech: Set<string>; readonly recordsInHand: Set<string>;
  readonly techHolders: Map<Tech, number>; readonly era: EraDef; readonly templeByBand: Map<number, number>;
  readonly bandSystem: LedgerRecord['bandSystem']; readonly sabotageCache: Map<number, Building[]>;
  readonly wildlifeOwed: Map<number, number>;
}

function invalid(message: string): never { throw new TypeError(`Invalid ledger record: ${message}`); }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid('unknown or missing fields');
}
function id(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function tick(value: unknown): value is number { return id(value); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function clone<T>(value: T): T { return structuredClone(value); }
function mapEntries<K, V>(map: Map<K, V>): Entry<K, V>[] { return [...map].map(([key, value]) => [key, clone(value)]); }
function validMap<K, V>(raw: unknown, keyCheck: (key: unknown) => key is K, valueCheck: (value: unknown) => value is V): Map<K, V> {
  if (!Array.isArray(raw)) invalid('expected map entries');
  const result = new Map<K, V>();
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2 || !keyCheck(entry[0]) || !valueCheck(entry[1]) || result.has(entry[0])) invalid('invalid or duplicate map entry');
    result.set(entry[0], clone(entry[1]));
  }
  return result;
}
function numberRecord(raw: unknown): Record<string, number> {
  if (!object(raw)) invalid('expected numeric record');
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key || !finite(value) || value < 0) invalid('invalid numeric record value');
    result[key] = value;
  }
  return result;
}
function validateNorms(raw: unknown): raw is Norms {
  if (!object(raw) || Object.keys(raw).length !== EVENT_TYPES.length || EVENT_TYPES.some(type => !Object.hasOwn(raw, type))) return false;
  return EVENT_TYPES.every(type => finite(raw[type]) && raw[type] >= 0);
}
function validateEvent(raw: unknown): raw is SocialEvent {
  if (!object(raw)) return false;
  exact(raw, ['id', 'type', 'actorId', 'targetId', 'x', 'y', 'tick', 'magnitude', 'witnesses', 'victimBandId']);
  return id(raw.id) && EVENT_TYPES.includes(raw.type as EventType) && id(raw.actorId) &&
    (raw.targetId === null || id(raw.targetId)) && finite(raw.x) && finite(raw.y) && tick(raw.tick) &&
    finite(raw.magnitude) && raw.magnitude >= 0 && id(raw.witnesses) &&
    (raw.victimBandId === null || id(raw.victimBandId));
}
function mapIdNumber(raw: unknown, valuePredicate: (n: number) => boolean): Map<number, number> {
  return validMap(raw, id, (value): value is number => finite(value) && valuePredicate(value));
}

/** Capture persistent side ledgers at the same tick as the roster. */
export function toLedgerRecord(sim: Simulation, lastAdvancedTick = sim.time.tick): LedgerRecord {
  if (!tick(lastAdvancedTick) || lastAdvancedTick !== sim.time.tick) invalid('tick must equal the current simulation tick');
  const retained = (person: Person | null): number | null => {
    if (!person) return null;
    if (sim.peopleById.get(person.id) !== person) invalid(`person ${person.id} is not the canonical retained identity`);
    return person.id;
  };
  retained(sim.player);
  if (sim.succession) { retained(sim.succession.died); retained(sim.succession.heir); }
  for (const notice of sim.watchedUses) retained(notice.use.seen);
  const internals = sim as unknown as Record<string, any>;
  const band = sim.bandSystem as unknown as Record<string, Map<number, unknown>>;
  const wildlife = internals.wildlifeSystem as { owed: Map<number, number> };
  const sabotageCache = internals.sabotageCache as Map<number, Building[]>;
  const sabotageCacheRecord = [...sabotageCache].map(([bandId, buildings]) => [bandId, buildings.map(building => {
    if (sim.buildingsById.get(building.id) !== building) invalid(`sabotage cache building ${building.id} is not canonical`);
    return building.id;
  })] as Entry<number, number[]>);
  return {
    recordType: 'LedgerRecord', version: LEDGER_RECORD_VERSION, lastAdvancedTick, lastAdvancedDay: sim.time.day,
    playerId: sim.player?.id ?? null, autonomy: sim.autonomy, autonomyStall: sim.autonomyStall,
    lastRefusal: sim.lastRefusal, snowDepth: sim.snowDepth,
    succession: sim.succession ? { diedId: sim.succession.died.id, heirId: sim.succession.heir?.id ?? null } : null,
    interruptions: clone(sim.interruptions),
    watchedUses: sim.watchedUses.map(({ personId, use }) => ({ personId, use: { ours: use.ours, watched: use.watched, basis: use.basis, seenId: use.seen?.id ?? null } })),
    helpCalls: clone(sim.helpCalls), insights: clone(sim.insights),
    territoryPermissions: [...internals.territoryPermissions].map(([key, expires]: [string, number]) => {
      const match = /^(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(key);
      if (!match) invalid('malformed territory permission key');
      return [Number(match[1]), Number(match[2]), expires];
    }),
    feudEvents: [...internals.feudEvents], pendingVerdicts: clone(sim.pendingVerdicts),
    sightings: [...sim.sightings].map(([bandId, seen]) => [bandId, mapEntries(seen)]),
    edgeReserve: clone(sim.edgeReserve), foundingFauna: clone(sim.foundingFauna), nextEdgeHerd: internals.nextEdgeHerd,
    normsByBand: mapEntries(internals.normsByBand), strangerRegardByBand: mapEntries(internals.strangerRegardByBand),
    socialRecent: clone(sim.social.recent),
    knownTech: [...sim.knownTech], recordedTech: [...sim.recordedTech], rememberedTech: [...sim.rememberedTech], recordsInHand: [...sim.recordsInHand],
    techHolders: [...sim.techHolders], eraId: sim.era.id, templeByBand: mapEntries(sim.templeByBand),
    bandSystem: {
      chiefByBand: mapEntries(sim.bandSystem.chiefByBand), siteProgress: mapEntries(band.siteProgress as Map<number, { mark: number; day: number }>),
      raidConsidered: mapEntries(band.raidConsidered as Map<number, number>), foodFailureSince: mapEntries(band.foodFailureSince as Map<number, number>),
      coupConsidered: mapEntries(band.coupConsidered as Map<number, number>), tributePaid: mapEntries(band.tributePaid as Map<number, number>),
    },
    sabotageCache: sabotageCacheRecord,
    wildlifeOwed: mapEntries(wildlife.owed),
  };
}

/** Validate and hydrate detached ledgers. Person references are rebound by retained ID. */
export function fromLedgerRecord(input: unknown, peopleById?: ReadonlyMap<number, Person>, buildingsById?: ReadonlyMap<number, Building>): LedgerState {
  if (!object(input)) invalid('expected LedgerRecord');
  exact(input, ['recordType', 'version', 'lastAdvancedTick', 'lastAdvancedDay', 'playerId', 'autonomy', 'autonomyStall', 'lastRefusal', 'snowDepth', 'succession', 'interruptions', 'watchedUses', 'helpCalls', 'insights', 'territoryPermissions', 'feudEvents', 'pendingVerdicts', 'sightings', 'edgeReserve', 'foundingFauna', 'nextEdgeHerd', 'normsByBand', 'strangerRegardByBand', 'socialRecent', 'knownTech', 'recordedTech', 'rememberedTech', 'recordsInHand', 'techHolders', 'eraId', 'templeByBand', 'bandSystem', 'sabotageCache', 'wildlifeOwed']);
  if (input.recordType !== 'LedgerRecord' || input.version !== LEDGER_RECORD_VERSION || !tick(input.lastAdvancedTick) || !tick(input.lastAdvancedDay) ||
      !(input.playerId === null || id(input.playerId)) || !['manual', 'urgent', 'auto'].includes(String(input.autonomy)) ||
      !(input.autonomyStall === null || typeof input.autonomyStall === 'string') || !(input.lastRefusal === null || typeof input.lastRefusal === 'string') ||
      !finite(input.snowDepth) || input.snowDepth < 0 || !id(input.nextEdgeHerd)) invalid('expected LedgerRecord v2 fields');
  const checkpointTick = input.lastAdvancedTick as number;
  const checkpointDay = input.lastAdvancedDay as number;
  const person = (personId: unknown): Person | null => {
    if (personId === null) return null;
    if (!id(personId)) invalid('invalid person reference');
    if (!peopleById) invalid('canonical people map required for person references');
    const found = peopleById?.get(personId);
    if (peopleById && !found) invalid(`person ${personId} is not retained`);
    return found ?? null;
  };
  const player = person(input.playerId);
  let succession: LedgerState['succession'] = null;
  if (input.succession !== null) {
    if (!object(input.succession)) invalid('invalid succession');
    exact(input.succession, ['diedId', 'heirId']);
    const died = person(input.succession.diedId), heir = person(input.succession.heirId);
    if (!died) invalid('succession requires a retained deceased person');
    succession = { died, heir };
  }
  if (!Array.isArray(input.interruptions) || !Array.isArray(input.watchedUses) || !Array.isArray(input.helpCalls) || !Array.isArray(input.insights) ||
      !Array.isArray(input.territoryPermissions) || !Array.isArray(input.feudEvents) || !Array.isArray(input.pendingVerdicts) ||
      !Array.isArray(input.sightings) || !Array.isArray(input.socialRecent) || !object(input.bandSystem)) invalid('invalid ledger collections');
  const interruptions = input.interruptions.map(raw => {
    if (!object(raw)) invalid('invalid interruption');
    const hasCommitmentSource = Object.hasOwn(raw, 'autonomousCommitment');
    if (Object.keys(raw).length !== (hasCommitmentSource ? 5 : 4) ||
        !['personId', 'action', 'reason', 'recipe'].every(key => Object.hasOwn(raw, key)) ||
        (hasCommitmentSource && typeof raw.autonomousCommitment !== 'boolean')) invalid('unknown or missing interruption fields');
    if (!id(raw.personId) || typeof raw.action !== 'string' || typeof raw.reason !== 'string' || !(raw.recipe === null || typeof raw.recipe === 'string')) invalid('invalid interruption fields');
    person(raw.personId); return { personId: raw.personId, action: raw.action, reason: raw.reason, recipe: raw.recipe,
      ...(hasCommitmentSource ? { autonomousCommitment: raw.autonomousCommitment as boolean } : {}) };
  });
  if (interruptions.length > 32) invalid('too many interruption notices');
  const watchedUses: WatchedNotice[] = input.watchedUses.map(raw => {
    if (!object(raw)) invalid('invalid watched use'); exact(raw, ['personId', 'use']); person(raw.personId);
    if (!object(raw.use)) invalid('invalid property use'); exact(raw.use, ['ours', 'watched', 'basis', 'seenId']);
    if (typeof raw.use.ours !== 'boolean' || typeof raw.use.watched !== 'boolean' || !['own', 'ally', 'seen', 'unseen'].includes(String(raw.use.basis)) ||
        raw.use.ours !== (raw.use.basis === 'own' || raw.use.basis === 'ally') || raw.use.watched !== (raw.use.basis === 'seen')) invalid('invalid property use fields');
    const seen = person(raw.use.seenId);
    if ((raw.use.basis === 'seen') !== (seen !== null)) invalid('property witness does not match its basis');
    return { personId: raw.personId as number, use: { ours: raw.use.ours, watched: raw.use.watched, seen, basis: raw.use.basis as PropertyUse['basis'] } };
  });
  const helpCalls = input.helpCalls.map(raw => {
    if (!object(raw)) invalid('invalid help call'); exact(raw, ['callerId', 'x', 'y']); person(raw.callerId);
    if (!finite(raw.x) || !finite(raw.y)) invalid('invalid help call location');
    return { callerId: raw.callerId as number, x: raw.x as number, y: raw.y as number };
  });
  const insights = input.insights.map(raw => {
    if (!object(raw)) invalid('invalid insight'); exact(raw, ['personId', 'text', 'kind']); person(raw.personId);
    if (typeof raw.text !== 'string' || !['idea', 'gain', 'setback'].includes(String(raw.kind))) invalid('invalid insight fields');
    return { personId: raw.personId as number, text: raw.text, kind: raw.kind as InsightNotice['kind'] };
  });
  const territoryPermissions = new Map<string, number>();
  for (const entry of input.territoryPermissions) {
    if (!Array.isArray(entry) || entry.length !== 3 || !id(entry[0]) || !id(entry[1]) || !tick(entry[2])) invalid('invalid territory permission');
    const key = `${entry[0]}:${entry[1]}`; if (territoryPermissions.has(key)) invalid('duplicate territory permission'); territoryPermissions.set(key, entry[2]);
  }
  const feudEvents = new Set<number>();
  for (const eventId of input.feudEvents) { if (!id(eventId) || feudEvents.has(eventId)) invalid('invalid or duplicate feud event'); feudEvents.add(eventId); }
  const pendingVerdicts = input.pendingVerdicts.map(raw => {
    if (!object(raw)) invalid('invalid verdict'); exact(raw, ['plaintiffId', 'plaintiffBandId', 'accusedId', 'accusedBandId', 'kind', 'tick']);
    if (!id(raw.plaintiffId) || !id(raw.plaintiffBandId) || !id(raw.accusedId) || !id(raw.accusedBandId) || !['theft', 'threaten', 'assault'].includes(String(raw.kind)) || !tick(raw.tick) || raw.tick > checkpointTick) invalid('invalid verdict fields');
    person(raw.plaintiffId); person(raw.accusedId);
    return { plaintiffId: raw.plaintiffId, plaintiffBandId: raw.plaintiffBandId, accusedId: raw.accusedId, accusedBandId: raw.accusedBandId, kind: raw.kind as Case['kind'], tick: raw.tick };
  });
  const sightings = new Map<number, Map<number, Sighting>>();
  for (const raw of input.sightings) {
    if (!Array.isArray(raw) || raw.length !== 2 || !id(raw[0]) || sightings.has(raw[0]) || !Array.isArray(raw[1])) invalid('invalid sighting band');
    const seen = validMap(raw[1], id, (value): value is Sighting => object(value) && Object.keys(value).length === 2 && id(value.tick) && id(value.bandId) && value.tick <= checkpointTick);
    sightings.set(raw[0], seen);
  }
  const eventIds = new Set<number>();
  const socialRecent = input.socialRecent.map(raw => {
    if (!validateEvent(raw) || raw.tick > checkpointTick) invalid('invalid social event');
    // An allocated event has one identity. Duplicate copies make the saved
    // feed ambiguous, even when their fields happen to agree.
    if (eventIds.has(raw.id)) invalid('duplicate social event');
    eventIds.add(raw.id);
    return clone(raw);
  });
  if (socialRecent.length > 200) invalid('social event feed exceeds capacity');
  const techSet = (raw: unknown): Set<string> => {
    if (!Array.isArray(raw)) invalid('expected technology list');
    const result = new Set<string>();
    for (const value of raw) {
      if (typeof value !== 'string' || !TECHS.includes(value as Tech) || result.has(value)) invalid('invalid or duplicate technology');
      result.add(value);
    }
    return result;
  };
  const knownTech = techSet(input.knownTech), recordedTech = techSet(input.recordedTech), rememberedTech = techSet(input.rememberedTech), recordsInHand = techSet(input.recordsInHand);
  if (!Array.isArray(input.techHolders)) invalid('expected technology holder entries');
  const techHolders = new Map<Tech, number>();
  for (const entry of input.techHolders) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !TECHS.includes(entry[0] as Tech) || !id(entry[1]) || techHolders.has(entry[0] as Tech)) invalid('invalid technology holder entry');
    techHolders.set(entry[0] as Tech, entry[1]);
  }
  if (typeof input.eraId !== 'string') invalid('invalid era id');
  const era = ERAS.find(candidate => candidate.id === input.eraId);
  if (!era) invalid('unknown era');
  const templeByBand = mapIdNumber(input.templeByBand, id);
  const edgeReserve = numberRecord(input.edgeReserve), foundingFauna = numberRecord(input.foundingFauna);
  const normsByBand = validMap(input.normsByBand, id, validateNorms);
  const strangerRegardByBand = mapIdNumber(input.strangerRegardByBand, n => n >= 0 && n <= 1);
  const bandRaw = input.bandSystem; exact(bandRaw, ['chiefByBand', 'siteProgress', 'raidConsidered', 'foodFailureSince', 'coupConsidered', 'tributePaid']);
  const chiefByBand = mapIdNumber(bandRaw.chiefByBand, id);
  const siteProgress = validMap(bandRaw.siteProgress, id, (raw): raw is { mark: number; day: number } => object(raw) && Object.keys(raw).length === 2 && finite(raw.mark) && tick(raw.day) && raw.day <= checkpointDay);
  const dayMap = (raw: unknown): Map<number, number> => validMap(raw, id, (value): value is number => tick(value) && value <= checkpointDay);
  const bandSystem = { chiefByBand: mapEntries(chiefByBand), siteProgress: mapEntries(siteProgress), raidConsidered: mapEntries(dayMap(bandRaw.raidConsidered)), foodFailureSince: mapEntries(dayMap(bandRaw.foodFailureSince)), coupConsidered: mapEntries(dayMap(bandRaw.coupConsidered)), tributePaid: mapEntries(dayMap(bandRaw.tributePaid)) };
  if (!Array.isArray(input.sabotageCache)) invalid('invalid sabotage cache');
  const sabotageCache = new Map<number, Building[]>();
  const cachedBuildings = new Set<number>();
  for (const entry of input.sabotageCache) {
    if (!Array.isArray(entry) || entry.length !== 2 || !id(entry[0]) || !Array.isArray(entry[1]) || sabotageCache.has(entry[0])) invalid('invalid sabotage cache band');
    const candidates: Building[] = [];
    for (const buildingId of entry[1]) {
      if (!id(buildingId) || buildingId === 0 || cachedBuildings.has(buildingId)) invalid('invalid or duplicate sabotage cache building');
      if (!buildingsById) invalid('canonical buildings map required for sabotage cache references');
      const building = buildingsById.get(buildingId);
      if (!building) invalid(`building ${buildingId} is not retained`);
      if (building.ownerBandId !== entry[0]) invalid('sabotage cache band does not own its building');
      cachedBuildings.add(buildingId);
      candidates.push(building);
    }
    sabotageCache.set(entry[0], candidates);
  }
  const wildlifeOwed = mapIdNumber(input.wildlifeOwed, n => n >= 0 && n < 1);
  return {
    lastAdvancedTick: checkpointTick, lastAdvancedDay: checkpointDay, player, playerId: input.playerId as number | null,
    autonomy: input.autonomy as Autonomy, autonomyStall: input.autonomyStall as string | null,
    lastRefusal: input.lastRefusal as string | null, snowDepth: input.snowDepth,
    succession, interruptions, watchedUses, helpCalls, insights, territoryPermissions, feudEvents, pendingVerdicts, sightings,
    edgeReserve, foundingFauna, nextEdgeHerd: input.nextEdgeHerd as number, normsByBand, strangerRegardByBand,
    socialRecent, knownTech, recordedTech, rememberedTech, recordsInHand, techHolders, era, templeByBand, bandSystem, sabotageCache, wildlifeOwed,
  };
}
