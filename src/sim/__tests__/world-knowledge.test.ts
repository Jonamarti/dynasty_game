import { describe, expect, it } from 'vitest';
import { WorldKnowledge, comarcaKey } from '../social/WorldKnowledge.ts';
import { createFrontier } from '../../../tools/frontierFixture.ts';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { toPersonRecord, fromPersonRecord } from '../persistence/EntityRecords.ts';

describe('WorldKnowledge', () => {
  it('knows nothing until it has seen or been told', () => {
    const k = new WorldKnowledge();
    expect(k.size).toBe(0);
    expect(k.entry(3, 4)).toBeUndefined();
  });

  it('seen beats told, and a rumour never replaces a sighting', () => {
    const k = new WorldKnowledge();
    expect(k.hear(5, 5, 10)).toBe(true);
    expect(k.entry(5, 5)).toMatchObject({ source: 'told', day: 10 });
    k.hear(5, 5, 30);
    expect(k.entry(5, 5)!.day).toBe(30);
    k.see(5, 5, 40);
    expect(k.entry(5, 5)).toMatchObject({ source: 'seen', day: 40 });
    expect(k.hear(5, 5, 99)).toBe(false);
    expect(k.entry(5, 5)).toMatchObject({ source: 'seen', day: 40 });
  });

  it('records other peoples only where the comarca was seen', () => {
    const k = new WorldKnowledge();
    k.meet(1, 1, 7, 3);
    expect(k.entry(1, 1)).toBeUndefined();
    k.hear(2, 2, 3);
    k.meet(2, 2, 7, 3);
    expect(k.entry(2, 2)!.peoples).toBeUndefined();
    k.see(1, 1, 3);
    k.meet(1, 1, 7, 5);
    expect(k.entry(1, 1)!.peoples).toEqual({ 7: 5 });
  });

  it('a story carries the place and its age, not what the teller saw there', () => {
    const teller = new WorldKnowledge();
    teller.see(1, 1, 5);
    teller.meet(1, 1, 9, 5);
    teller.see(2, 2, 20);
    const listener = new WorldKnowledge();
    expect(teller.tellTo(listener, 1)).toBe(1);
    // The freshest first.
    expect(listener.entry(2, 2)).toMatchObject({ source: 'told', day: 20 });
    expect(listener.entry(1, 1)).toBeUndefined();
    expect(teller.tellTo(listener, 5)).toBe(1);
    expect(listener.entry(1, 1)).toMatchObject({ source: 'told', day: 5 });
    expect(listener.entry(1, 1)!.peoples).toBeUndefined();
    // Nothing left to tell.
    expect(teller.tellTo(listener, 5)).toBe(0);
  });

  it('keeps a stable key and revision only moves when the map does', () => {
    const k = new WorldKnowledge();
    k.see(1, 2, 1);
    const r = k.revision;
    k.see(1, 2, 2);
    expect(k.revision).toBe(r);
    expect(comarcaKey(1, 2)).not.toBe(comarcaKey(2, 1));
  });
});

const small = { seed: 'world-knowledge', world: { width: 48, height: 32 },
  population: { bands: 2, peoplePerBand: 8 } };

describe('WorldKnowledge in a world with a globe', () => {
  it('gives the founders the comarcas they can see, and no more', () => {
    const sim = createFrontier(small);
    const person = sim.livingPeople()[0]!;
    const knowledge = person.worldKnowledge!;
    expect(knowledge).toBeDefined();
    expect(knowledge.size).toBeGreaterThan(0);
    // The local map spans sixty by twenty comarcas. A founder's radius covers
    // part of it, so some of the span stays dark — the whole of it never lit.
    expect(knowledge.size).toBeLessThan(60 * 20);
    for (const [, entry] of knowledge.entries()) expect(entry.source).toBe('seen');
  });

  it('a newborn is told what the mother knows, as hearsay', () => {
    const sim = createFrontier(small);
    const mother = sim.livingPeople().find(p => p.sex === 'female' && !p.isChild)!;
    const child = sim.livingPeople().find(p => p.isChild)!;
    // registerBirth is private: reach it the way LifeSystem's callback does.
    (sim as unknown as { registerBirth(c: unknown, m: unknown, f: unknown): void })
      .registerBirth(child, mother, null);
    expect(child.worldKnowledge!.size).toBeGreaterThanOrEqual(mother.worldKnowledge!.size);
  });

  it('a conversation hands a stranger to the globe', () => {
    const a = new WorldKnowledge();
    const b = new WorldKnowledge();
    a.see(10, 10, 1);
    b.see(11, 11, 2);
    a.tellTo(b, 1);
    b.tellTo(a, 1);
    expect(a.entry(11, 11)!.source).toBe('told');
    expect(b.entry(10, 10)!.source).toBe('told');
  });

  it('survives a checkpoint and a person record', () => {
    const sim = createFrontier(small);
    for (let i = 0; i < 20; i++) sim.step();
    const restored = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const was = sim.livingPeople()[0]!;
    const now = restored.peopleById.get(was.id)!;
    expect([...now.worldKnowledge!.entries()]).toEqual([...was.worldKnowledge!.entries()]);
    const copy = fromPersonRecord(JSON.parse(JSON.stringify(toPersonRecord(was, 0))));
    expect([...copy.worldKnowledge!.entries()]).toEqual([...was.worldKnowledge!.entries()]);
  });

  it('is absent, not empty, in a classic world', () => {
    const sim = new Simulation({ seed: 'classic-no-globe' });
    for (let i = 0; i < 30; i++) sim.step();
    for (const person of sim.people) expect('worldKnowledge' in person).toBe(false);
    expect(sim.worldFrame).toBeNull();
    expect(sim.comarcaAtTile(1, 1)).toBeNull();
  });

  it('maps tiles to comarcas across the whole local span', () => {
    const sim = createFrontier(small);
    // Origin is x 40 - 30 = 10, y 20 - 10 = 10; one comarca per 48/60 tile.
    expect(sim.comarcaAtTile(0, 0)).toEqual({ cx: 10, cy: 10 });
    expect(sim.comarcaAtTile(sim.world.width - 0.01, sim.world.height - 0.01)).toEqual({ cx: 69, cy: 29 });
  });
});
