import { describe, expect, it } from 'vitest';
import { Memory } from '../Memory.ts';
import type { SocialEvent } from '../Events.ts';
import { WorldNews } from '../WorldNews.ts';
import { Person } from '../../entities/Person.ts';
import { RNG } from '../../core/RNG.ts';
import { fromPersonRecord, toPersonRecord } from '../../persistence/EntityRecords.ts';

function theft(id = 17): SocialEvent {
  return { id, type: 'theft', actorId: 4, targetId: 9, victimBandId: 2, x: 6, y: 8, tick: 120, magnitude: 0.6, witnesses: 1 };
}

describe('person-carried world news', () => {
  it('requires firsthand deed memory before a comarca can become the story origin', () => {
    const event = theft();
    const witness = new Memory(12);
    const hearsay = new Memory(13);
    witness.record(event, true, 1);
    hearsay.record(event, false, 0.7, 12);
    const news = new WorldNews();

    expect(news.witnessTheft(event, hearsay, 3, 5)).toBe(false);
    expect(news.witnessTheft({ ...event, type: 'gift' }, witness, 3, 5)).toBe(false);
    expect(news.witnessTheft(event, witness, 3, 5)).toBe(true);
    expect(news.witnessTheft(event, witness, 3, 5)).toBe(false);
    expect([...news.entries()]).toMatchObject([{ originCx: 3, originCy: 5, firsthand: true, confidence: 1, sourceId: null }]);
  });

  it('moves only over an explicit person-to-person contact and marks the arriving report as hearsay', () => {
    const event = theft();
    const memory = new Memory(12);
    memory.record(event, true, 1);
    const origin = new WorldNews();
    const stranger = new WorldNews();
    const comarcaB = new WorldNews();
    origin.witnessTheft(event, memory, 3, 5);

    // A third comarca has no global subscription or world-level lookup.
    expect(comarcaB.has(event.id, 3, 5)).toBe(false);
    expect(origin.tellTo(stranger, 12, 'conversation', 240)).toBe(1);
    expect(stranger.tellTo(comarcaB, 28, 'traveller', 360)).toBe(1);
    expect([...comarcaB.entries()]).toMatchObject([{
      originCx: 3, originCy: 5, occurredTick: 120, learnedTick: 360,
      firsthand: false, sourceId: 28, channel: 'traveller',
    }]);
    expect([...comarcaB.entries()][0]!.confidence).toBeCloseTo(0.49);
    expect(origin.tellTo(comarcaB, 12, 'spouse', 360)).toBe(0);
  });


  it('survives the existing person object-graph checkpoint', () => {
    const event = theft(91);
    const witness = new Memory(12);
    witness.record(event, true, 1);
    const person = new Person('Witness', 8, 9, 0, new RNG('news-checkpoint'));
    person.memory.record(event, true, 1);
    person.worldNews = new WorldNews();
    person.worldNews.witnessTheft(event, person.memory, 10, 12);

    const restored = fromPersonRecord(JSON.parse(JSON.stringify(toPersonRecord(person, event.tick))));
    expect([...restored.worldNews!.entries()]).toEqual([...person.worldNews.entries()]);
  });

  it('supports the other declared carriers, bounds payloads, and rejects impossible handoffs', () => {
    const memory = new Memory(12);
    const source = new WorldNews();
    for (let id = 1; id <= 51; id++) {
      const event = theft(id);
      memory.record(event, true, 1);
      source.witnessTheft(event, memory, 3, 5);
    }
    expect(source.size).toBe(48);
    for (const channel of ['spouse', 'captive', 'trader'] as const) {
      const receiver = new WorldNews();
      expect(source.tellTo(receiver, 40, channel, 400, 1)).toBe(1);
      expect([...receiver.entries()][0].channel).toBe(channel);
    }
    const receiver = new WorldNews();
    expect(source.tellTo(receiver, 40, 'traveller', 100, 1)).toBe(0);
    expect(source.tellTo(source, 40, 'traveller', 400)).toBe(0);
    expect(source.tellTo(receiver, 40, 'traveller', 400, 0)).toBe(0);
  });
});
