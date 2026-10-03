import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { fromLedgerRecord, toLedgerRecord } from '../persistence/LedgerRecords.ts';
import { EVENT_TYPES } from '../social/Events.ts';

function world(): Simulation {
  return new Simulation({
    seed: 'ledger-records-live-world',
    time: { ticksPerDay: 24, startDay: 7 },
    world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
    population: { bands: 2, peoplePerBand: 4 },
  });
}

describe('execution ledger records', () => {
  it('round-trips retained queues, future decisions and canonical person references through JSON', () => {
    const sim = world();
    for (let i = 0; i < 80; i++) sim.step();
    const people = [...sim.peopleById.values()];
    const [p, q] = people;
    const [bandA, bandB] = sim.bands;
    sim.player = p!;
    sim.autonomy = 'urgent';
    sim.autonomyStall = 'waiting for food';
    sim.lastRefusal = 'the path is blocked';
    sim.snowDepth = 2.25;
    sim.succession = { died: q!, heir: p! };
    sim.interruptions.push({ personId: p!.id, action: 'craft', reason: 'thirsty', recipe: 'basket' });
    sim.watchedUses.push({ personId: p!.id, use: { ours: false, watched: true, seen: q!, basis: 'seen' } });
    sim.helpCalls.push({ callerId: q!.id, x: 14.5, y: 20 });
    sim.insights.push({ personId: p!.id, text: 'new idea', kind: 'idea' });
    const internal = sim as unknown as Record<string, any>;
    internal.territoryPermissions.set(`${p!.id}:${bandB!.id}`, sim.time.day + 2);
    internal.feudEvents.add(801);
    sim.pendingVerdicts.push({ plaintiffId: p!.id, plaintiffBandId: bandA!.id, accusedId: q!.id, accusedBandId: bandB!.id, kind: 'theft', tick: sim.time.tick });
    sim.sightings.set(bandA!.id, new Map([[q!.id, { tick: sim.time.tick, bandId: bandB!.id }]]));
    sim.edgeReserve.deer = 3.25;
    sim.foundingFauna.deer = 19;
    internal.nextEdgeHerd = 5099;
    internal.normsByBand.set(bandA!.id, { ...internal.normsByBand.get(bandA!.id), theft: 1.37 });
    internal.strangerRegardByBand.set(bandA!.id, 0.62);
    sim.social.recent.push({ id: 800, type: 'gift', actorId: p!.id, targetId: q!.id, x: 1, y: 2, tick: sim.time.tick, magnitude: 0.5, witnesses: 2, victimBandId: bandB!.id });
    sim.knownTech.add('firemaking'); sim.recordedTech.add('weaving'); sim.rememberedTech.add('ochre'); sim.recordsInHand.add('basketry');
    sim.techHolders.set('firemaking', 2); sim.templeByBand.set(bandA!.id, 123);
    const bandSystem = sim.bandSystem as unknown as Record<string, Map<number, unknown>>;
    bandSystem.chiefByBand.set(bandA!.id, p!.id);
    bandSystem.siteProgress.set(bandA!.id, { mark: 12.5, day: sim.time.day });
    bandSystem.raidConsidered.set(bandA!.id, sim.time.day);
    bandSystem.foodFailureSince.set(bandB!.id, sim.time.day - 1);
    bandSystem.coupConsidered.set(bandB!.id, sim.time.day);
    bandSystem.tributePaid.set(bandA!.id, sim.time.day - 2);
    (internal.wildlifeSystem.owed as Map<number, number>).set(440, 0.625);

    const record = toLedgerRecord(sim);
    const wire = JSON.parse(JSON.stringify(record));
    const restored = fromLedgerRecord(wire, sim.peopleById);
    expect(restored.lastAdvancedTick).toBe(sim.time.tick);
    expect(restored.lastAdvancedDay).toBe(sim.time.day);
    expect(restored.player).toBe(p);
    expect(restored.succession?.died).toBe(q);
    expect(restored.succession?.heir).toBe(p);
    expect(restored.watchedUses[0]?.use.seen).toBe(q);
    expect(restored.territoryPermissions.get(`${p!.id}:${bandB!.id}`)).toBe(sim.time.day + 2);
    expect(restored.pendingVerdicts[0]?.kind).toBe('theft');
    expect(restored.sightings.get(bandA!.id)?.get(q!.id)).toEqual({ tick: sim.time.tick, bandId: bandB!.id });
    expect(restored.normsByBand.get(bandA!.id)?.theft).toBe(1.37);
    expect(restored.socialRecent[0]?.id).toBe(800);
    expect(restored.knownTech.has('firemaking')).toBe(true);
    expect(restored.recordedTech.has('weaving')).toBe(true);
    expect(restored.rememberedTech.has('ochre')).toBe(true);
    expect(restored.recordsInHand.has('basketry')).toBe(true);
    expect(restored.techHolders.get('firemaking')).toBe(2);
    expect(restored.templeByBand.get(bandA!.id)).toBe(123);
    expect(restored.bandSystem.siteProgress).toContainEqual([bandA!.id, { mark: 12.5, day: sim.time.day }]);
    expect(restored.wildlifeOwed.get(440)).toBe(0.625);

    // Editing the hydrated ledger never changes its JSON source or the live simulation.
    restored.edgeReserve.deer = 0;
    restored.interruptions.pop();
    expect(wire.edgeReserve.deer).toBe(3.25);
    expect(sim.edgeReserve.deer).toBe(3.25);
    expect(sim.interruptions).toHaveLength(record.interruptions.length);
  });

  it('rejects unknown versions, future ledger days, broken identities and malformed nested collections', () => {
    const sim = world();
    const record = JSON.parse(JSON.stringify(toLedgerRecord(sim)));
    expect(() => fromLedgerRecord({ ...record, version: 2 }, sim.peopleById)).toThrow(/v1/);
    expect(() => fromLedgerRecord({ ...record, extra: true }, sim.peopleById)).toThrow(/unknown or missing/);
    expect(() => fromLedgerRecord({ ...record, lastAdvancedDay: -1 }, sim.peopleById)).toThrow(/v1/);
    const missingPerson = JSON.parse(JSON.stringify(record));
    missingPerson.playerId = 999999;
    expect(() => fromLedgerRecord(missingPerson, sim.peopleById)).toThrow(/not retained/);
    const futureDay = JSON.parse(JSON.stringify(record));
    futureDay.bandSystem.raidConsidered = [[sim.bands[0]!.id, sim.time.day + 1]];
    expect(() => fromLedgerRecord(futureDay, sim.peopleById)).toThrow(/invalid or duplicate map entry/);
    const malformedEvent = JSON.parse(JSON.stringify(record));
    malformedEvent.socialRecent = [{ id: 1, type: 'not-an-event', actorId: 0, targetId: null, x: 0, y: 0, tick: 0, magnitude: 1, witnesses: 0, victimBandId: null }];
    expect(() => fromLedgerRecord(malformedEvent, sim.peopleById)).toThrow(/invalid social event/);
    const malformedNorms = JSON.parse(JSON.stringify(record));
    malformedNorms.normsByBand = [[sim.bands[0]!.id, Object.fromEntries(EVENT_TYPES.map(type => [type, 1]).slice(1))]];
    expect(() => fromLedgerRecord(malformedNorms, sim.peopleById)).toThrow(/invalid or duplicate map entry/);
    const badWitness = JSON.parse(JSON.stringify(record));
    badWitness.watchedUses = [{ personId: sim.people[0]!.id, use: { ours: false, watched: true, basis: 'seen', seenId: 999999 } }];
    expect(() => fromLedgerRecord(badWitness, sim.peopleById)).toThrow(/not retained/);
    const duplicateEvents = JSON.parse(JSON.stringify(record));
    const event = { id: 1, type: 'gift', actorId: sim.people[0]!.id, targetId: null,
      x: 0, y: 0, tick: 0, magnitude: 1, witnesses: 0, victimBandId: null };
    duplicateEvents.socialRecent = [event, { ...event }];
    expect(() => fromLedgerRecord(duplicateEvents, sim.peopleById)).toThrow(/duplicate social event/);
  });
});
