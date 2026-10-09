/**
 * Compact band adapter for the existing seasonal PeopleKnowledge mechanism.
 *
 * The mechanism reasons about a society-level union of techniques. This adapter uses that union only as an input
 * view: every acquisition is assigned to one living named practitioner who individually holds all prerequisites.
 * The union is rebuilt from living members on every season, so a technique disappears when its last holder dies.
 *
 * No simulation-wide people map or relation graph is consulted. Contacts and their regions are explicit inputs.
 */
import { RNG, hashString, type RngSnapshot } from '../core/RNG.ts';
import { TRAITS, type Person } from '../entities/Person.ts';
import { TECHS, TECH, type Tech } from '../knowledge/Tech.ts';
import { DEFAULT_NORMS } from '../social/Events.ts';
import {
  PEOPLE_SEASONS, TechSet, ageBandOfYears, emptyCohorts, populationOf,
  type People, type PeopleRelation, type PeopleSeason, type PeopleSim,
} from '../world/PeopleSim.ts';
import {
  KREMER_KAPPA, KnowledgeLedger, knowledge,
  type KnowledgeEvent, type KnowledgeLedgerRecord, type KnowledgeRegion, type PartialLearning,
} from '../world/PeopleKnowledge.ts';

export const COMPACT_BAND_KNOWLEDGE_RECORD_VERSION = 1 as const;

export interface CompactBandKnowledgeState {
  readonly bandId: number;
  /** Global season index last processed; -1 means no compact season has run yet. */
  readonly lastSeason: number;
  readonly rng: RngSnapshot;
  readonly ledger: KnowledgeLedgerRecord;
}

export interface CompactBandKnowledgeRecord extends CompactBandKnowledgeState {
  readonly recordType: 'CompactBandKnowledgeRecord';
  readonly version: typeof COMPACT_BAND_KNOWLEDGE_RECORD_VERSION;
}

/** A neighbour is supplied by the caller; this adapter never discovers contacts from a world/global graph. */
export interface CompactBandKnowledgeContact {
  readonly contact: number;
  readonly people: People;
  readonly region: KnowledgeRegion;
}

export interface CompactBandKnowledgeInput {
  readonly season: number;
  readonly seasonOfYear: PeopleSeason;
  /** The canonical named people owned by this band, including dead archive entries; only living members evolve. */
  readonly members: readonly Person[];
  readonly region: KnowledgeRegion;
  readonly contacts?: readonly CompactBandKnowledgeContact[];
  /** Explicit model parameters, passed through to PeopleKnowledge. */
  readonly mu: number;
  readonly partial: PartialLearning;
  readonly kappa?: number;
}

export interface CompactBandKnowledgeEvent extends KnowledgeEvent {
  readonly personId: number;
}

const RECORD_KEYS = ['recordType', 'version', 'bandId', 'lastSeason', 'rng', 'ledger'].sort();
const TECH_SET = new Set<string>(TECHS);
const SEASON_SET = new Set<string>(PEOPLE_SEASONS);

function fail(message: string): never { throw new TypeError(`Invalid compact band knowledge: ${message}`); }
function nonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative`);
}
function validateId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a safe non-negative integer`);
}
function validateSeason(value: number, label: string, allowInitial = false): void {
  if (!Number.isSafeInteger(value) || value < (allowInitial ? -1 : 0)) throw new RangeError(`${label} is invalid`);
}
function validateRegion(region: KnowledgeRegion, label: string): void {
  if (!region || typeof region !== 'object' || !region.materials || typeof region.materials.has !== 'function' || !region.climate) {
    throw new TypeError(`${label} must contain materials and climate`);
  }
  nonNegative(region.climate.temperature, `${label} temperature`);
  nonNegative(region.climate.wetness, `${label} wetness`);
  if (region.climate.temperature > 1 || region.climate.wetness > 1) throw new RangeError(`${label} climate must be on unit axes`);
}
function validateTechList(values: readonly Tech[], label: string): void {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  for (const value of values) if (!TECH_SET.has(value)) throw new RangeError(`${label} includes unknown technique ${String(value)}`);
}
function validatePartial(partial: PartialLearning): void {
  if (!partial || typeof partial !== 'object') throw new TypeError('partial learning parameters are required');
  nonNegative(partial.rate, 'partial rate');
  nonNegative(partial.hintGain, 'partial hint gain');
  nonNegative(partial.sufferedWeapon, 'partial weapon multiplier');
}

/** Create the independent stream outside Simulation's fork order. */
export function createCompactBandKnowledgeState(
  seed: string | number, bandId: number, lastSeason = -1,
): CompactBandKnowledgeState {
  validateId(bandId, 'band id');
  validateSeason(lastSeason, 'last season', true);
  if (typeof seed !== 'string' && (!Number.isFinite(seed) || !Number.isSafeInteger(seed))) throw new RangeError('seed must be a string or safe integer');
  return {
    bandId, lastSeason,
    rng: new RNG(hashString(`compact-band-knowledge|${String(seed)}|${bandId}`)).snapshot(),
    ledger: new KnowledgeLedger().snapshot(),
  };
}

function validateLedger(record: KnowledgeLedgerRecord): KnowledgeLedger {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('ledger must be an object');
  const ledgerKeys = Object.keys(record).sort();
  if (ledgerKeys.join(',') !== 'insights,pending,seen') fail('ledger fields do not match v1');
  if (!Array.isArray(record.insights) || !Array.isArray(record.pending) || !Array.isArray(record.seen)) fail('ledger arrays are required');
  const seen = new Set<string>();
  for (const id of record.seen) {
    if (typeof id !== 'string' || seen.has(id)) fail('ledger seen ids must be unique strings');
    seen.add(id);
  }
  for (const row of record.insights) {
    if (!Array.isArray(row) || row.length !== 2 || !Number.isSafeInteger(row[0]) || row[0] < 0 || !Array.isArray(row[1])) fail('bad ledger insight row');
    const found = new Set<Tech>();
    for (const item of row[1]) {
      if (!Array.isArray(item) || item.length !== 2 || !TECH_SET.has(item[0])) fail('bad ledger insight');
      if (found.has(item[0])) fail('duplicate ledger insight technique');
      found.add(item[0]);
      nonNegative(item[1], 'ledger insight');
    }
  }
  for (const row of record.pending) {
    if (!Array.isArray(row) || row.length !== 2 || !Number.isSafeInteger(row[0]) || row[0] < 0 || !Array.isArray(row[1])) fail('bad ledger pending row');
    for (const exposure of row[1]) {
      if (!exposure || typeof exposure !== 'object' || Array.isArray(exposure)) fail('bad pending exposure');
      const keys = Object.keys(exposure).sort();
      if (keys.join(',') !== 'how,id,intensity,peopleId,tech') fail('pending exposure fields do not match');
      if (typeof exposure.id !== 'string' || !Number.isSafeInteger(exposure.peopleId) || exposure.peopleId < 0 || !TECH_SET.has(exposure.tech) ||
          !['witnessed', 'suffered'].includes(exposure.how) || !Number.isFinite(exposure.intensity) || exposure.intensity < 0 || exposure.intensity > 1) {
        fail('bad pending exposure values');
      }
    }
  }
  return KnowledgeLedger.fromSnapshot(record);
}

function validatedState(state: CompactBandKnowledgeState): CompactBandKnowledgeState {
  if (!state || typeof state !== 'object') throw new TypeError('compact band knowledge state is required');
  validateId(state.bandId, 'band id');
  validateSeason(state.lastSeason, 'last season', true);
  const rng = RNG.fromSnapshot(state.rng).snapshot();
  const ledger = validateLedger(state.ledger).snapshot();
  return { bandId: state.bandId, lastSeason: state.lastSeason, rng, ledger };
}

/**
 * Advance one band's knowledge through the shared PeopleKnowledge seasonal machinery.
 * The returned band state is detached; only an individually qualified member receives each acquired technique.
 */
export function advanceCompactBandKnowledge(
  state: CompactBandKnowledgeState,
  input: CompactBandKnowledgeInput,
): { readonly state: CompactBandKnowledgeState; readonly events: readonly CompactBandKnowledgeEvent[] } {
  const current = validatedState(state);
  if (!input || typeof input !== 'object') throw new TypeError('knowledge input is required');
  validateSeason(input.season, 'input season');
  if (input.season <= current.lastSeason) throw new RangeError(`knowledge season ${input.season} was already processed`);
  if (!SEASON_SET.has(input.seasonOfYear) || input.seasonOfYear !== PEOPLE_SEASONS[input.season % PEOPLE_SEASONS.length]) {
    throw new RangeError('seasonOfYear does not match global season');
  }
  if (!Array.isArray(input.members)) throw new TypeError('named band members are required');
  validateRegion(input.region, 'band region');
  nonNegative(input.mu, 'learning rate');
  validatePartial(input.partial);
  const kappa = input.kappa ?? KREMER_KAPPA;
  nonNegative(kappa, 'invention rate');

  const memberIds = new Set<number>();
  const living: Person[] = [];
  const cohorts = emptyCohorts();
  const held = new Set<Tech>();
  for (const member of input.members) {
    if (!member || typeof member !== 'object') throw new TypeError('band members must be people');
    validateId(member.id, 'person id');
    if (member.bandId !== current.bandId) throw new RangeError(`person ${member.id} belongs to another band`);
    if (memberIds.has(member.id)) throw new RangeError(`duplicate band member ${member.id}`);
    memberIds.add(member.id);
    validateTechList([...member.knownTech] as Tech[], `person ${member.id} techniques`);
    for (const tech of member.knownTech) {
      if (!TECH[tech as Tech].requires.every(required => member.knownTech.has(required))) {
        throw new RangeError('person ' + member.id + ' holds ' + tech + ' without its individual prerequisites');
      }
    }
    if (!member.alive) continue;
    if (!Number.isFinite(member.years) || member.years < 0 || (member.sex !== 'male' && member.sex !== 'female')) {
      throw new RangeError(`person ${member.id} has invalid demographic state`);
    }
    living.push(member);
    const ageBand = ageBandOfYears(member.years);
    const sex = member.sex === 'female' ? 'female' : 'male';
    cohorts[sex][ageBand]!++;
    for (const tech of member.knownTech) held.add(tech as Tech);
  }
  living.sort((a, b) => a.id - b.id);
  const proxyTechs = new TechSet(held);
  const proxy: People = {
    id: current.bandId,
    comarcas: 1,
    cohorts,
    techs: proxyTechs,
    culture: {
      norms: { ...DEFAULT_NORMS }, strangerRegard: 0.5,
      traitMeans: Object.fromEntries(TRAITS.map(trait => [trait, 0])) as People['culture']['traitMeans'],
    },
    surplus: 0, drawn: 0, away: 0,
    rng: RNG.fromSnapshot(current.rng),
    nextDue: 0,
  };

  const regions = new Map<number, KnowledgeRegion>([[proxy.id, input.region]]);
  const peoples = new Map<number, People>([[proxy.id, proxy]]);
  const relations: PeopleRelation[] = [];
  const contactIds = new Set<number>([proxy.id]);
  const contacts = [...(input.contacts ?? [])].sort((a, b) => a.people.id - b.people.id);
  for (const [index, contact] of contacts.entries()) {
    if (!contact || !contact.people || typeof contact.people !== 'object') throw new TypeError('contact people are required');
    validateId(contact.people.id, 'contact people id');
    if (contactIds.has(contact.people.id)) throw new RangeError(`duplicate contact people ${contact.people.id}`);
    contactIds.add(contact.people.id);
    if (!Number.isFinite(contact.contact) || contact.contact < 0 || contact.contact > 1) throw new RangeError('contact must be in [0, 1]');
    validateRegion(contact.region, `contact ${contact.people.id} region`);
    validateTechList(contact.people.techs.list(), `contact ${contact.people.id} techniques`);
    populationOf(contact.people);
    peoples.set(contact.people.id, contact.people);
    regions.set(contact.people.id, contact.region);
    const a = Math.min(proxy.id, contact.people.id), b = Math.max(proxy.id, contact.people.id);
    relations.push({ id: index + 1, a, b, standing: 0, contact: contact.contact, stance: null, overlord: null, since: null });
  }
  const sim = {
    peoples,
    relationsOf: (id: number) => id === proxy.id ? relations : [],
  } as unknown as PeopleSim;
  const arrivals: KnowledgeEvent[] = [];
  const ledger = validateLedger(current.ledger);
  const mechanism = knowledge({
    regionOf: people => {
      const region = regions.get(people.id);
      if (!region) throw new RangeError(`knowledge region missing for people ${people.id}`);
      return region;
    },
    kappa, mu: input.mu, partial: { ...input.partial }, ledger,
  }, event => arrivals.push(event));
  mechanism({
    sim, people: proxy, season: input.season, seasonOfYear: input.seasonOfYear,
    step: input.season,
  });

  const events: CompactBandKnowledgeEvent[] = [];
  for (const arrival of arrivals) {
    const practitioner = living.find(person => !person.knownTech.has(arrival.tech) &&
      TECH[arrival.tech].requires.every(required => person.knownTech.has(required)));
    // The society-level union can contain prerequisites held by different people. That is not a practitioner.
    if (!practitioner) continue;
    practitioner.knownTech.add(arrival.tech);
    practitioner.noteDiscovery();
    events.push({ ...arrival, personId: practitioner.id });
  }

  return {
    state: {
      bandId: current.bandId, lastSeason: input.season,
      rng: proxy.rng.snapshot(), ledger: ledger.snapshot(),
    },
    events,
  };
}

/** Detached strict v1 checkpoint for compact band knowledge. */
export function toCompactBandKnowledgeRecord(state: CompactBandKnowledgeState): CompactBandKnowledgeRecord {
  const clean = validatedState(state);
  return {
    recordType: 'CompactBandKnowledgeRecord', version: COMPACT_BAND_KNOWLEDGE_RECORD_VERSION,
    ...clean,
  };
}

/** Restore an independent state; extra/missing fields and malformed nested records are rejected. */
export function fromCompactBandKnowledgeRecord(value: unknown): CompactBandKnowledgeState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('record must be an object');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== RECORD_KEYS.length || keys.some((key, index) => key !== RECORD_KEYS[index])) fail('record fields do not match v1');
  if (record.recordType !== 'CompactBandKnowledgeRecord' || record.version !== COMPACT_BAND_KNOWLEDGE_RECORD_VERSION) fail('unsupported record version');
  return validatedState({
    bandId: record.bandId as number,
    lastSeason: record.lastSeason as number,
    rng: record.rng as RngSnapshot,
    ledger: record.ledger as KnowledgeLedgerRecord,
  });
}








