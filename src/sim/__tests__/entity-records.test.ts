import { describe, expect, it } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { Household } from '../entities/Household.ts';
import { DEFAULT_NORMS, type SocialEvent } from '../social/Events.ts';
import type { Band } from '../core/Simulation.ts';
import {
  fromBandRecord, fromHouseholdRecord, fromPersonRecord,
  toBandRecord, toHouseholdRecord, toPersonRecord,
} from '../persistence/EntityRecords.ts';

describe('versioned entity records', () => {
  it('round-trips a live person graph and keeps methods, aliases, mutable state and pending work', () => {
    const personRng = new RNG('record-person');
    const person = new Person('Ada', 18, 23, 4, personRng);
    person.surname = 'River';
    person.householdId = 12;
    person.motherId = 8;
    person.fatherId = 9;
    person.childIds = [31, 32];
    person.spouseId = 10;
    person.pregnant = true;
    person.gestationLeft = 12.5;
    person.skills.forage = 4;
    person.traits.curiosity = 0.91;
    person.needs.hunger = 67;
    person.equipment = { left: { item: 'stone_axe', count: 1 }, right: { item: 'torch', count: 1, wear: 0.35, lit: 12 } };
    person.inventory.add('berries', 7);
    person.inventory.add('herbs', 2);
    person.body.left_leg.damage = 0.23;
    person.body.left_leg.wound = 'fresh';
    person.body.left_leg.peak = 0.23;
    person.conditions.push({ kind: 'poisoning', severity: 'moderate', daysLeft: 9, item: 'toxic_berries' });
    person.beliefs.learn('eat:toxic_berries', -8, 0.8, 'own', 422);
    person.placeMemory.remember('water', 20, 20, 14, 2);
    person.placeMemory.remember('person', 20, 20, 14, 2, 'seen', {
      type: 'person', id: 77, sex: 'female', age: 'adult', bandId: 5,
    });
    person.seasonLore.observe('berries', 'winter', 2, false);
    person.seasonLore.observe('berries', 'winter', 3, false);
    person.seasonLore.observe('berries', 'summer', 1, true);
    person.knownTech.add('firemaking');
    person.ideas.push({ tech: 'pottery', stage: 'researching', insight: 0.44, story: 'A shaped vessel',
      conceivedTick: 400, effort: 32, discussedWith: [8], proof: 0, trials: 2, failedTests: 0, tries: 0 });
    const deed: SocialEvent = { id: 99, type: 'gift', actorId: 8, targetId: person.id, x: 18, y: 23,
      tick: 420, magnitude: 1, witnesses: 0, victimBandId: 4 };
    person.memory.record(deed, true, 1);
    person.order = 'build';
    person.resume = {
      action: 'craft', expiresAt: 900, nodeId: null, treeId: null, buildingId: 80,
      personId: null, animalId: null, recipe: 'rope', inscriptionId: null, pileId: null,
      tech: null, itemId: null, count: null, x: 20, y: 21,
    };
    person.workBankKey = 'building:80';
    person.workBankTicks = 88;
    person.action = 'build';
    person.workedTicks = 17;
    person.targetBuildingId = 80;
    person.path = new Int16Array([2, 5, 8]);
    person.alongside[0] = 13.5;
    person.curiosityDays = 3;

    const record = toPersonRecord(person, 422);
    expect(record.lastAdvancedTick).toBe(422);
    const wire = JSON.stringify(record);
    const restored = fromPersonRecord(JSON.parse(wire));
    expect(toPersonRecord(restored, 422)).toEqual(record);
    // Hydrating must not consume the global ID sequence through constructors.
    const next = new Person('Next', 0, 0, 0, new RNG('next-person'));
    expect(next.id).toBe(person.id + 1);
    const controlRng = new RNG('record-person');
    new Person('Ada', 18, 23, 4, controlRng);
    expect(personRng.nextUint32()).toBe(controlRng.nextUint32());
    expect(restored).toBeInstanceOf(Person);
    expect(restored.id).toBe(person.id);
    expect(restored.inventory.count('berries')).toBe(7);
    expect(restored.inventory.entries()).toEqual(person.inventory.entries());
    expect(restored.equipment).toEqual(person.equipment);
    expect(restored.body.left_leg).toEqual(person.body.left_leg);
    expect(restored.conditions).toEqual(person.conditions);
    expect(restored.memory.has(99)).toBe(true);
    expect(restored.beliefs.get('eat:toxic_berries')).toEqual(person.beliefs.get('eat:toxic_berries'));
    const rememberedPerson = restored.placeMemory.records('person')[0]!;
    expect(rememberedPerson.visual).toEqual({
      type: 'person', id: 77, sex: 'female', age: 'adult', bandId: 5,
    });
    const placeIndexes = restored.placeMemory as unknown as {
      places: Map<string, Map<number, typeof rememberedPerson>>;
      allPlacesHash: { queryRadius(x: number, y: number, radius: number): typeof rememberedPerson[] };
    };
    const key = -1 - 77;
    expect(placeIndexes.places.get('person')?.get(key)).toBe(rememberedPerson);
    expect(placeIndexes.allPlacesHash.queryRadius(20, 20, 0.01)).toContain(rememberedPerson);
    expect(restored.seasonLore.barrenIn('berries', 'winter')).toBe(true);
    expect(restored.order).toBe('build');
    expect(restored.resume?.recipe).toBe('rope');
    expect(restored.workBankTicks).toBe(88);
    expect(restored.workedTicks).toBe(17);
    expect(restored.alongside).toBeInstanceOf(Float32Array);
    expect(restored.alongside[0]).toBe(13.5);

    // The original callback closed over `person`; hydration must bind it to the new owner.
    restored.curiosityDays = 7;
    restored.beliefs.learn('eat:berries', 2, 0.7, 'own', 430);
    expect(restored.curiosityDays).toBe(0);
    expect(person.curiosityDays).not.toBe(0);
    restored.noteDid('gather');
    expect(restored.lately.get('gather')).toBe(1);
    expect(person.lately.has('gather')).toBe(false);
    restored.inventory.remove('berries', 2);
    restored.placeMemory.remember('water', 24, 24, 15, 1);
    expect(person.inventory.count('berries')).toBe(7);
    expect(person.placeMemory.hasNear('water', 24, 24)).toBe(false);

  });

  it('round-trips households without losing map indexes or consuming household IDs', () => {
    const household = new Household('Willow', 14, 4, 3);
    household.memberIds = [14, 15, 16];
    household.homeBuildingId = 23;
    household.renown = 92;
    household.lastFeastDay = -Infinity;
    household.feud.set(7, 0.83);
    household.feudSuspects.set(7, 33);
    const record = toHouseholdRecord(household, 422);
    const restored = fromHouseholdRecord(JSON.parse(JSON.stringify(record)));
    expect(toHouseholdRecord(restored, 422)).toEqual(record);
    expect(restored).toBeInstanceOf(Household);
    expect(restored.id).toBe(household.id);
    expect(restored.lastFeastDay).toBe(-Infinity);
    expect(restored.feud.get(7)).toBe(0.83);
    expect(restored.feudSuspects.get(7)).toBe(33);
    restored.add(17);
    expect(restored.memberIds).toEqual([14, 15, 16, 17]);
    expect(household.memberIds).toEqual([14, 15, 16]);
    const next = new Household('Next', 1, 1, 4);
    expect(next.id).toBe(household.id + 1);
  });

  it('preserves aliases and cycles in band records and rejects malformed or unsupported data', () => {
    const shared = new Map<number, number>([[3, 4]]);
    const band: Band & { relations: Map<number, number>; alias: Map<number, number>; self?: unknown } = {
      id: 4, name: 'River', homeX: 20, homeY: 30, norms: { ...DEFAULT_NORMS }, chiefId: 9,
      chiefSince: 5, strangerRegard: 0.5, relations: shared, alias: shared,
    };
    band.self = band;
    const bandRecord = toBandRecord(band, 422);
    const restored = fromBandRecord(JSON.parse(JSON.stringify(bandRecord))) as typeof band;
    expect(toBandRecord(restored, 422)).toEqual(bandRecord);
    expect(restored.self).toBe(restored);
    expect(restored.relations).toBe(restored.alias);
    expect(restored.relations.get(3)).toBe(4);
    expect(() => fromPersonRecord({ recordType: 'PersonRecord', version: 2, graph: {} })).toThrow(/Invalid entity record/);
    const incompletePerson = JSON.parse(JSON.stringify(toPersonRecord(new Person('Missing', 0, 0, 0, new RNG('missing')), 0)));
    incompletePerson.graph.nodes[0].fields = incompletePerson.graph.nodes[0].fields.filter(([key]: [string, unknown]) => key !== 'inventory');
    expect(() => fromPersonRecord(incompletePerson)).toThrow(/missing required state/);
    const invalidBand: Band & { callback: () => number } = { ...band, callback: () => 1 };
    expect(() => toBandRecord(invalidBand, 422)).toThrow(/unsupported function/);
    const infinityBand = { ...band, bad: Infinity };
    expect((fromBandRecord(JSON.parse(JSON.stringify(toBandRecord(infinityBand, 422)))) as typeof band & { bad: number }).bad).toBe(Infinity);
    const malformed = JSON.parse(JSON.stringify(toBandRecord(band, 422)));
    malformed.graph.root = { ref: 999 };
    expect(() => fromBandRecord(malformed)).toThrow(/dangling reference/);
    const badId = JSON.parse(JSON.stringify(toBandRecord(band, 422)));
    badId.graph.nodes[0].fields.find(([key]: [string, unknown]) => key === 'id')[1] = '4';
    expect(() => fromBandRecord(badId)).toThrow(/invalid id/);
    expect(() => toBandRecord(band, -1)).toThrow(/lastAdvancedTick/);
  });
});
