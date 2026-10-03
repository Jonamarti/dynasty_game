/** Versioned inert records for social state owned outside people and bands. */
import { RelationshipGraph, type Relationship, type RelationshipGraphSnapshot } from '../social/Relationships.ts';
import { BandRelations, type BandRelationsSnapshot, type Stance } from '../social/BandRelations.ts';

export const SOCIAL_RECORD_VERSION = 1 as const;
export interface RelationshipGraphRecord {
  readonly recordType: 'RelationshipGraphRecord'; readonly version: 1; readonly snapshot: RelationshipGraphSnapshot;
}
export interface BandRelationsRecord {
  readonly recordType: 'BandRelationsRecord'; readonly version: 1; readonly snapshot: BandRelationsSnapshot;
}

function invalid(why: string): never { throw new TypeError(`Invalid social record: ${why}`); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid('unknown or missing fields');
}
function id(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function canonicalPair(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  const match = /^(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(key);
  return !!match && Number.isSafeInteger(Number(match[1])) && Number.isSafeInteger(Number(match[2])) && Number(match[1]) < Number(match[2]);
}
const REL_FIELDS = ['kinship', 'deeds', 'familiarity', 'romance', 'lastContact', 'bias', 'dread'] as const;

export function toRelationshipGraphRecord(graph: RelationshipGraph): RelationshipGraphRecord {
  return { recordType: 'RelationshipGraphRecord', version: SOCIAL_RECORD_VERSION, snapshot: graph.snapshot() };
}
export function fromRelationshipGraphRecord(input: unknown): RelationshipGraph {
  if (!object(input)) invalid('expected RelationshipGraphRecord');
  exact(input, ['recordType', 'version', 'snapshot']);
  if (input.recordType !== 'RelationshipGraphRecord' || input.version !== SOCIAL_RECORD_VERSION || !Array.isArray(input.snapshot)) invalid('expected RelationshipGraphRecord v1');
  const viewers = new Set<number>();
  const snapshot: RelationshipGraphSnapshot = input.snapshot.map((rawRow): [number, [number, Relationship][]] => {
    if (!Array.isArray(rawRow) || rawRow.length !== 2 || !id(rawRow[0]) || viewers.has(rawRow[0]) || !Array.isArray(rawRow[1])) invalid('invalid viewer row');
    const viewer = rawRow[0]; viewers.add(viewer);
    const subjects = new Set<number>();
    const row = rawRow[1].map((rawEdge): [number, Relationship] => {
      if (!Array.isArray(rawEdge) || rawEdge.length !== 2 || !id(rawEdge[0]) || subjects.has(rawEdge[0]) || !object(rawEdge[1])) invalid('invalid relationship edge');
      const subject = rawEdge[0], rel = rawEdge[1]; subjects.add(subject);
      exact(rel, [...REL_FIELDS]);
      if (!REL_FIELDS.every(field => finite(rel[field])) ||
          !Number.isSafeInteger(rel.lastContact) || (rel.lastContact as number) < 0 ||
          (rel.deeds as number) < -100 || (rel.deeds as number) > 100 ||
          (rel.familiarity as number) < 0 || (rel.familiarity as number) > 100 ||
          (rel.romance as number) < 0 || (rel.romance as number) > 100 ||
          (rel.dread as number) < 0 || (rel.dread as number) > 100) invalid('invalid relationship values');
      return [subject, Object.fromEntries(REL_FIELDS.map(field => [field, rel[field]])) as unknown as Relationship];
    });
    return [viewer, row];
  });
  return RelationshipGraph.fromSnapshot(snapshot);
}

export function toBandRelationsRecord(relations: BandRelations): BandRelationsRecord {
  return { recordType: 'BandRelationsRecord', version: SOCIAL_RECORD_VERSION, snapshot: relations.snapshot() };
}
export function fromBandRelationsRecord(input: unknown): BandRelations {
  if (!object(input)) invalid('expected BandRelationsRecord');
  exact(input, ['recordType', 'version', 'snapshot']);
  if (input.recordType !== 'BandRelationsRecord' || input.version !== SOCIAL_RECORD_VERSION || !object(input.snapshot)) invalid('expected BandRelationsRecord v1');
  const raw = input.snapshot;
  exact(raw, ['edges', 'stances']);
  if (!Array.isArray(raw.edges) || !Array.isArray(raw.stances)) invalid('invalid band relation snapshot');
  const seenEdges = new Set<string>(), seenStances = new Set<string>();
  const edges = raw.edges.map((entry): [string, number] => {
    if (!Array.isArray(entry) || entry.length !== 2 || !canonicalPair(entry[0]) || !finite(entry[1]) || entry[1] < -100 || entry[1] > 100 || seenEdges.has(entry[0])) invalid('invalid standing edge');
    seenEdges.add(entry[0]); return [entry[0], entry[1]];
  });
  const stances = raw.stances.map((entry): [string, { kind: Stance; since: number; overlord: number | null }] => {
    if (!Array.isArray(entry) || entry.length !== 2 || !canonicalPair(entry[0]) || !object(entry[1]) || seenStances.has(entry[0])) invalid('invalid stance edge');
    seenStances.add(entry[0]);
    const stance = entry[1]; exact(stance, ['kind', 'since', 'overlord']);
    const [low, high] = entry[0].split(':').map(Number);
    if (!['war', 'peace', 'tributary'].includes(String(stance.kind)) || !Number.isSafeInteger(stance.since) || (stance.since as number) < 0 ||
        !(stance.overlord === null || id(stance.overlord)) ||
        (stance.kind === 'tributary' ? stance.overlord !== low && stance.overlord !== high : stance.overlord !== null)) invalid('invalid stance record');
    return [entry[0], { kind: stance.kind as Stance, since: stance.since as number, overlord: stance.overlord as number | null }];
  });
  return BandRelations.fromSnapshot({ edges, stances } as BandRelationsSnapshot);
}
