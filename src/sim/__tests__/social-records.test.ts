import { describe, expect, it } from 'vitest';
import { RelationshipGraph } from '../social/Relationships.ts';
import { BandRelations } from '../social/BandRelations.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { Simulation } from '../core/Simulation.ts';
import {
  fromBandRelationsRecord, fromRelationshipGraphRecord, toBandRelationsRecord, toRelationshipGraphRecord,
} from '../persistence/SocialRecords.ts';

describe('versioned external social records', () => {
  it('round-trips directed opinions and keeps methods and storage independent', () => {
    const graph = new RelationshipGraph();
    graph.introduce(4, 9, -6);
    graph.addDeed(4, 9, -18, 120);
    graph.addFamiliarity(4, 9, 23, 121);
    graph.addRomance(9, 4, 31, 122);
    graph.setKinship(9, 4, 42);
    graph.addDread(4, 9, 16);
    graph.edge(7, 8).bias = 11;
    const record = toRelationshipGraphRecord(graph);
    const restored = fromRelationshipGraphRecord(JSON.parse(JSON.stringify(record)));
    expect(toRelationshipGraphRecord(restored)).toEqual(record);
    expect(restored.opinion(4, 9)).toBe(graph.opinion(4, 9));
    expect(restored.mutualOpinion(4, 9)).toBe(graph.mutualOpinion(4, 9));
    expect(restored.knownBy(4)[0]?.relationship).toEqual(graph.knownBy(4)[0]?.relationship);
    graph.decay(); restored.decay();
    graph.addDeed(4, 9, 3, 130); restored.addDeed(4, 9, 3, 130);
    graph.addFamiliarity(9, 4, 2, 131); restored.addFamiliarity(9, 4, 2, 131);
    expect(toRelationshipGraphRecord(restored)).toEqual(toRelationshipGraphRecord(graph));
    restored.edge(4, 9).deeds = 99;
    expect(graph.edge(4, 9).deeds).not.toBe(99);

    const detached = toRelationshipGraphRecord(graph);
    detached.snapshot[0]![1][0]![1].deeds = -99;
    expect(graph.edge(4, 9).deeds).not.toBe(-99);
    const sourceRecord = toRelationshipGraphRecord(graph);
    const hydrated = fromRelationshipGraphRecord(sourceRecord);
    sourceRecord.snapshot[0]![1][0]![1].deeds = 77;
    expect(hydrated.edge(4, 9).deeds).not.toBe(77);
  });

  it('keeps relationship tie order and the existing decay pruning behavior', () => {
    const graph = new RelationshipGraph();
    graph.introduce(1, 9, 7);
    graph.introduce(1, 3, 7);
    const restored = fromRelationshipGraphRecord(JSON.parse(JSON.stringify(toRelationshipGraphRecord(graph))));
    expect(restored.knownBy(1).map(edge => edge.subjectId)).toEqual([9, 3]);
    graph.decay(); restored.decay();
    expect(toRelationshipGraphRecord(restored)).toEqual(toRelationshipGraphRecord(graph));

    const ephemeral = new RelationshipGraph(); ephemeral.edge(4, 8);
    const loaded = fromRelationshipGraphRecord(JSON.parse(JSON.stringify(toRelationshipGraphRecord(ephemeral))));
    ephemeral.decay(); loaded.decay();
    expect(loaded.peek(4, 8)).toBeNull();
    expect(toRelationshipGraphRecord(loaded)).toEqual(toRelationshipGraphRecord(ephemeral));

    const selfEdge = new RelationshipGraph(); selfEdge.edge(4, 4).bias = 2;
    const selfLoaded = fromRelationshipGraphRecord(JSON.parse(JSON.stringify(toRelationshipGraphRecord(selfEdge))));
    expect(toRelationshipGraphRecord(selfLoaded)).toEqual(toRelationshipGraphRecord(selfEdge));
  });

  it('round-trips social graphs produced by a live two-band simulation', () => {
    const sim = new Simulation({
      seed: 'social-record-live-simulation',
      world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
      population: { bands: 2, peoplePerBand: 4 },
    });
    for (let i = 0; i < 500; i++) sim.step();
    const relRecord = JSON.parse(JSON.stringify(toRelationshipGraphRecord(sim.relationships)));
    const bandRecord = JSON.parse(JSON.stringify(toBandRelationsRecord(sim.bandRelations)));
    expect(toRelationshipGraphRecord(fromRelationshipGraphRecord(relRecord))).toEqual(relRecord);
    expect(toBandRelationsRecord(fromBandRelationsRecord(bandRecord))).toEqual(bandRecord);
  });

  it('round-trips standing and declared stances, including contact queries', () => {
    const bands = new BandRelations();
    bands.add(2, 8, -37.5);
    bands.add(2, 5, 13);
    bands.setStance(2, 8, 'war', 31);
    bands.setStance(5, 9, 'tributary', 44, 9);
    const record = toBandRelationsRecord(bands);
    const restored = fromBandRelationsRecord(JSON.parse(JSON.stringify(record)));
    expect(toBandRelationsRecord(restored)).toEqual(record);
    expect(restored.touching(2)).toEqual(bands.touching(2));
    expect(restored.stanceRecord(2, 8)).toEqual(bands.stanceRecord(2, 8));
    expect(restored.overlordOf(5)).toBe(9);
    expect(restored.tributariesOf(9)).toEqual([5]);
    bands.decay(); restored.decay(); bands.add(2, 8, 1); restored.add(2, 8, 1);
    bands.setStance(2, 8, 'peace', 50); restored.setStance(2, 8, 'peace', 50);
    expect(toBandRelationsRecord(restored)).toEqual(toBandRelationsRecord(bands));
    bands.add(2, 8, 2); bands.setStance(2, 8, 'war', 51);
    expect(restored.stance(2, 8)).toBe('peace');
    const detached = toBandRelationsRecord(bands);
    detached.snapshot.edges[0]![1] = 91;
    detached.snapshot.stances[0]![1].since = 99;
    expect(bands.standing(2, 8)).not.toBe(91);
    expect(bands.stanceRecord(2, 8)?.since).not.toBe(99);
    const sourceRecord = toBandRelationsRecord(bands);
    const hydrated = fromBandRelationsRecord(sourceRecord);
    sourceRecord.snapshot.edges[0]![1] = -99;
    sourceRecord.snapshot.stances[0]![1].since = 100;
    expect(hydrated.standing(2, 8)).not.toBe(-99);
    expect(hydrated.stanceRecord(2, 8)?.since).not.toBe(100);
  });

  it('keeps stance-only contact after standing has decayed away', () => {
    const bands = new BandRelations();
    bands.add(3, 7, 0.05);
    bands.setStance(3, 7, 'war', 5);
    const restored = fromBandRelationsRecord(JSON.parse(JSON.stringify(toBandRelationsRecord(bands))));
    bands.decay(); restored.decay();
    expect(restored.standing(3, 7)).toBe(0);
    expect(restored.stance(3, 7)).toBe('war');
    expect(restored.touching(3)).toEqual([7]);
    expect(toBandRelationsRecord(restored)).toEqual(toBandRelationsRecord(bands));
  });

  it('rejects unknown fields, malformed values, duplicate and noncanonical keys', () => {
    const g = toRelationshipGraphRecord(new RelationshipGraph());
    expect(() => fromRelationshipGraphRecord({ ...g, extra: true })).toThrow(/unknown or missing/);
    expect(() => fromRelationshipGraphRecord({ ...g, version: 2 })).toThrow(/v1/);
    const b = toBandRelationsRecord(new BandRelations());
    expect(() => fromBandRelationsRecord({ ...b, snapshot: { ...b.snapshot, hidden: [] } })).toThrow(/unknown or missing/);
    const bad = JSON.parse(JSON.stringify(b)); bad.snapshot.edges = [['8:2', 1]];
    expect(() => fromBandRelationsRecord(bad)).toThrow(/standing edge/);
    const invalidStance = JSON.parse(JSON.stringify(b)); invalidStance.snapshot.stances = [['2:8', { kind: 'war', since: 3, overlord: 2 }]];
    expect(() => fromBandRelationsRecord(invalidStance)).toThrow(/stance record/);

    const rich = new RelationshipGraph(); rich.addDeed(2, 3, 1, 1);
    const duplicateViewer = JSON.parse(JSON.stringify(toRelationshipGraphRecord(rich)));
    duplicateViewer.snapshot.push(duplicateViewer.snapshot[0]);
    expect(() => fromRelationshipGraphRecord(duplicateViewer)).toThrow(/viewer row/);
    const duplicateSubject = JSON.parse(JSON.stringify(toRelationshipGraphRecord(rich)));
    duplicateSubject.snapshot[0][1].push(duplicateSubject.snapshot[0][1][0]);
    expect(() => fromRelationshipGraphRecord(duplicateSubject)).toThrow(/relationship edge/);
    const invalidId = JSON.parse(JSON.stringify(toRelationshipGraphRecord(rich)));
    invalidId.snapshot[0][0] = -1;
    expect(() => fromRelationshipGraphRecord(invalidId)).toThrow(/viewer row/);
    const nan = JSON.parse(JSON.stringify(toRelationshipGraphRecord(rich)));
    nan.snapshot[0][1][0][1].deeds = NaN;
    expect(() => fromRelationshipGraphRecord(nan)).toThrow(/relationship values/);
    const badContact = JSON.parse(JSON.stringify(toRelationshipGraphRecord(rich)));
    badContact.snapshot[0][1][0][1].lastContact = -1;
    expect(() => fromRelationshipGraphRecord(badContact)).toThrow(/relationship values/);
    const badRange = JSON.parse(JSON.stringify(toRelationshipGraphRecord(rich)));
    badRange.snapshot[0][1][0][1].dread = 101;
    expect(() => fromRelationshipGraphRecord(badRange)).toThrow(/relationship values/);

    const pair = new BandRelations(); pair.add(2, 8, 1);
    const duplicatePair = JSON.parse(JSON.stringify(toBandRelationsRecord(pair)));
    duplicatePair.snapshot.edges.push(duplicatePair.snapshot.edges[0]);
    expect(() => fromBandRelationsRecord(duplicatePair)).toThrow(/standing edge/);
    const invalidBandId = JSON.parse(JSON.stringify(toBandRelationsRecord(pair)));
    invalidBandId.snapshot.edges[0][0] = '2:9007199254740992';
    expect(() => fromBandRelationsRecord(invalidBandId)).toThrow(/standing edge/);
    const invalidStanding = JSON.parse(JSON.stringify(toBandRelationsRecord(pair)));
    invalidStanding.snapshot.edges[0][1] = NaN;
    expect(() => fromBandRelationsRecord(invalidStanding)).toThrow(/standing edge/);
    const duplicateStance = JSON.parse(JSON.stringify(toBandRelationsRecord(new BandRelations())));
    duplicateStance.snapshot.stances = [['2:8', { kind: 'war', since: 3, overlord: null }], ['2:8', { kind: 'peace', since: 4, overlord: null }]];
    expect(() => fromBandRelationsRecord(duplicateStance)).toThrow(/stance edge/);
  });

  it('does not consume entity ids; the codec accepts no RNG', () => {
    const first = new Person('First', 0, 0, 0, new RNG('social-record-person'));
    const graph = new RelationshipGraph(); graph.addDeed(0, 1, 4, 3);
    const relations = new BandRelations(); relations.add(0, 1, -4);
    fromRelationshipGraphRecord(JSON.parse(JSON.stringify(toRelationshipGraphRecord(graph))));
    fromBandRelationsRecord(JSON.parse(JSON.stringify(toBandRelationsRecord(relations))));
    const next = new Person('Next', 0, 0, 0, new RNG('social-record-person-next'));
    expect(next.id).toBe(first.id + 1);
  });
});
