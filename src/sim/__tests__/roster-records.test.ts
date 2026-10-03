import { describe, expect, it } from 'vitest';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { Simulation } from '../core/Simulation.ts';
import { fromHouseholdRecord, toHouseholdRecord, toPersonRecord } from '../persistence/EntityRecords.ts';
import { fromRosterRecord, toRosterRecord } from '../persistence/RosterRecords.ts';
import { toRelationshipGraphRecord } from '../persistence/SocialRecords.ts';

function world(): Simulation {
  return new Simulation({
    seed: 'roster-records-live-world',
    world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
    population: { bands: 2, peoplePerBand: 4 },
  });
}

describe('coordinated roster records', () => {
  it('round-trips the full known roster and detached social state at one tick', () => {
    const sim = world();
    for (let i = 0; i < 500; i++) sim.step();
    const survivor = sim.livingPeople().find(person => person.householdId !== null)!;
    const household = sim.householdsById.get(survivor.householdId!)!;
    const exile = sim.livingPeople().find(person => person.id !== survivor.id && person.householdId !== null)!;
    const birthBand = exile.bandId;
    const exileHousehold = sim.householdsById.get(exile.householdId!)!;
    (sim as unknown as { removeBandMembership(person: Person): void }).removeBandMembership(exile);
    expect(exile.bandId).not.toBe(birthBand);
    expect(exileHousehold.bandId).toBe(birthBand);

    const departed = sim.livingPeople().find(person => person.id !== survivor.id && !person.isPlayer)!;
    const departedId = departed.id;
    const departedHouseholdId = departed.householdId;
    departed.alive = false;
    sim.step();
    expect(sim.peopleById.has(departedId)).toBe(true);
    expect(sim.people.some(person => person.id === departedId)).toBe(false);
    expect(departedHouseholdId).not.toBeNull();
    expect(sim.householdsById.get(departedHouseholdId!)!.memberIds).not.toContain(departedId);

    const deadPlayer = sim.livingPeople().find(person => person.id !== survivor.id && person.id !== exile.id && !person.isPlayer)!;
    const deadPlayerId = deadPlayer.id;
    deadPlayer.isPlayer = true;
    deadPlayer.alive = false;
    sim.step();
    expect(sim.peopleById.has(deadPlayerId)).toBe(true);
    expect(sim.people.some(person => person.id === deadPlayerId)).toBe(true); // pending succession keeps the body active.

    survivor.inventory.add('berries', 6);
    survivor.workBankKey = 'building:987';
    survivor.workBankTicks = 73;
    survivor.motherId = 900001; // family history is allowed to name people outside this roster.
    sim.relationships.addDeed(survivor.id, 900002, -12, sim.time.tick);
    sim.bandRelations.setStance(sim.bands[0]!.id, sim.bands[1]!.id, 'war', sim.time.day);
    household.feud.set(900003, 0.72);
    household.feudSuspects.set(900003, 900004);

    const record = toRosterRecord(sim);
    expect(record.lastAdvancedTick).toBe(sim.time.tick);
    expect(record.people.some(person => person.graph.nodes.some(node =>
      node.kind === 'object' && node.fields.some(([key, value]) => key === 'id' && value === departedId)))).toBe(true);
    const wire = JSON.parse(JSON.stringify(record));
    const restored = fromRosterRecord(wire);
    expect(restored.lastAdvancedTick).toBe(sim.time.tick);
    expect(restored.peopleById.has(departedId)).toBe(true);
    expect(restored.activePeople.some(person => person.id === departedId)).toBe(false);
    expect(restored.peopleById.get(deadPlayerId)?.alive).toBe(false);
    expect(restored.activePeople.some(person => person.id === deadPlayerId)).toBe(true);
    expect(restored.activePeople.map(person => person.id)).toEqual(record.activePersonIds);
    expect(restored.peopleById.get(survivor.id)).toBe(restored.activePeople.find(person => person.id === survivor.id));
    expect(restored.householdsById.get(household.id)).toBe(restored.households.find(item => item.id === household.id));
    expect(restored.peopleById.get(survivor.id)!.inventory.count('berries')).toBe(6);
    expect(restored.peopleById.get(survivor.id)!.workBankTicks).toBe(73);
    expect(restored.peopleById.get(survivor.id)!.motherId).toBe(900001);
    expect(restored.householdsById.get(household.id)!.feud.get(900003)).toBe(0.72);
    expect(restored.relationships.opinion(survivor.id, 900002)).toBe(sim.relationships.opinion(survivor.id, 900002));
    expect(restored.bandRelations.stance(sim.bands[0]!.id, sim.bands[1]!.id)).toBe('war');
    expect(restored.peopleById.get(exile.id)!.bandId).not.toBe(restored.householdsById.get(exileHousehold.id)!.bandId);

    const restoredPerson = restored.peopleById.get(survivor.id)!;
    restoredPerson.inventory.remove('berries', 2);
    survivor.inventory.remove('berries', 2);
    restored.relationships.decay(); sim.relationships.decay();
    restored.relationships.addDeed(survivor.id, 900002, 3, sim.time.tick + 1);
    sim.relationships.addDeed(survivor.id, 900002, 3, sim.time.tick + 1);
    expect(toPersonRecord(restoredPerson, sim.time.tick)).toEqual(toPersonRecord(survivor, sim.time.tick));
    expect(toRelationshipGraphRecord(restored.relationships)).toEqual(toRelationshipGraphRecord(sim.relationships));
    expect(restoredPerson.inventory.count('berries')).toBe(survivor.inventory.count('berries'));
    expect(survivor.inventory.count('berries')).toBe(4);

    const copiedRecord = toRosterRecord(sim);
    const personRecordIndex = [...sim.peopleById.keys()].indexOf(survivor.id);
    const personRoot = copiedRecord.people[personRecordIndex]!.graph.nodes[0]!;
    if (personRoot.kind !== 'object') throw new Error('Person record root is not an object');
    const recordFields = personRoot.fields;
    recordFields.find(([key]) => key === 'workBankTicks')![1] = 99;
    expect(survivor.workBankTicks).toBe(73);
    const independentWire = JSON.parse(JSON.stringify(copiedRecord));
    const wireField = independentWire.people[personRecordIndex].graph.nodes[0].fields.find(([key]: [string, unknown]) => key === 'workBankTicks')!;
    wireField[1] = 101;
    expect(recordFields.find(([key]) => key === 'workBankTicks')![1]).toBe(99);
    const independent = fromRosterRecord(independentWire);
    wireField[1] = 66;
    expect(independent.peopleById.get(survivor.id)!.workBankTicks).toBe(101);
    independent.peopleById.get(survivor.id)!.workBankTicks = 55;
    expect(wireField[1]).toBe(66);
    expect(survivor.workBankTicks).toBe(73);
  });

  it('requires one matching tick and consistent roster memberships before returning maps', () => {
    const sim = world();
    const record = JSON.parse(JSON.stringify(toRosterRecord(sim)));
    expect(() => toRosterRecord(sim, sim.time.tick + 1)).toThrow(/current simulation tick/);
    expect(() => fromRosterRecord({ ...record, version: 2 })).toThrow(/v1/);
    expect(() => fromRosterRecord({ ...record, extra: true })).toThrow(/unknown or missing/);
    expect(() => fromRosterRecord({ ...record, lastAdvancedTick: -1 })).toThrow(/v1/);
    const mismatchedNestedTick = JSON.parse(JSON.stringify(record));
    mismatchedNestedTick.people[0].lastAdvancedTick++;
    expect(() => fromRosterRecord(mismatchedNestedTick)).toThrow(/tick does not match/);

    const duplicatePerson = JSON.parse(JSON.stringify(record));
    duplicatePerson.people.push(duplicatePerson.people[0]);
    expect(() => fromRosterRecord(duplicatePerson)).toThrow(/duplicate or invalid person id/);
    const duplicateHousehold = JSON.parse(JSON.stringify(record));
    duplicateHousehold.households.push(duplicateHousehold.households[0]);
    expect(() => fromRosterRecord(duplicateHousehold)).toThrow(/duplicate or invalid household id/);
    const duplicateBand = JSON.parse(JSON.stringify(record));
    duplicateBand.bands.push(duplicateBand.bands[0]);
    expect(() => fromRosterRecord(duplicateBand)).toThrow(/duplicate or invalid band id/);

    const missingBand = JSON.parse(JSON.stringify(record));
    missingBand.bands = missingBand.bands.filter((band: { graph: { nodes: { kind: string; fields?: [string, unknown][] }[] } }) =>
      !band.graph.nodes.some(node => node.kind === 'object' && node.fields?.some(([key, value]) => key === 'id' && value === sim.people[0]!.bandId)));
    expect(() => fromRosterRecord(missingBand)).toThrow(/missing band/);
    const missingHousehold = JSON.parse(JSON.stringify(record));
    const referencedHouseholdIndex = [...sim.peopleById.values()].findIndex(person => person.householdId !== null);
    const personRoot = missingHousehold.people[referencedHouseholdIndex].graph.nodes[0];
    personRoot.fields.find(([key]: [string, unknown]) => key === 'householdId')![1] = 999999;
    expect(() => fromRosterRecord(missingHousehold)).toThrow(/missing household/);
    const brokenMember = JSON.parse(JSON.stringify(record));
    const person = sim.people[0]!;
    const householdIndex = sim.households.findIndex(household => household.id === person.householdId);
    const householdRoot = brokenMember.households[householdIndex].graph.nodes.find((node: { kind: string; fields?: [string, unknown][] }) =>
      node.kind === 'object' && node.fields?.some(([key]) => key === 'memberIds'))!;
    const memberField = householdRoot.fields.find(([key]: [string, unknown]) => key === 'memberIds')!;
    const memberNode = brokenMember.households[householdIndex].graph.nodes[(memberField[1] as { ref: number }).ref];
    memberNode.values = memberNode.values.filter((value: unknown) => value !== person.id);
    expect(() => fromRosterRecord(brokenMember)).toThrow(/missing from household membership/);
    const missingMember = JSON.parse(JSON.stringify(record));
    const householdWithMembers = missingMember.households.find((entry: { graph: { nodes: { kind: string; fields?: [string, unknown][] }[] } }) =>
      entry.graph.nodes.some(node => node.kind === 'object' && node.fields?.some(([key, value]) =>
        key === 'memberIds' && typeof value === 'object' && value !== null && 'ref' in value)));
    const root = householdWithMembers.graph.nodes[0];
    const membersRef = root.fields.find(([key]: [string, unknown]) => key === 'memberIds')![1] as { ref: number };
    const members = householdWithMembers.graph.nodes[membersRef.ref];
    const removedMemberId = members.values[0];
    members.values[0] = 999999;
    const removedMember = missingMember.people.find((entry: { graph: { nodes: { kind: string; fields?: [string, unknown][] }[] } }) =>
      entry.graph.nodes[0].fields?.some(([key, value]) => key === 'id' && value === removedMemberId));
    removedMember.graph.nodes[0].fields.find(([key]: [string, unknown]) => key === 'householdId')![1] = null;
    expect(() => fromRosterRecord(missingMember)).toThrow(/references missing member/);
    const badActiveId = JSON.parse(JSON.stringify(record)); badActiveId.activePersonIds[0] = 999999;
    expect(() => fromRosterRecord(badActiveId)).toThrow(/active person reference/);
    const missingLiving = JSON.parse(JSON.stringify(record));
    const livingId = [...sim.peopleById.values()].find(person => person.alive)!.id;
    missingLiving.activePersonIds = missingLiving.activePersonIds.filter((id: number) => id !== livingId);
    expect(() => fromRosterRecord(missingLiving)).toThrow(/living person .* missing from active membership/);

    const duplicatedHouseholds = world();
    duplicatedHouseholds.households[0] = duplicatedHouseholds.households[1]!;
    expect(() => toRosterRecord(duplicatedHouseholds)).toThrow(/duplicate or invalid simulation household id/);
    const mismatchedMaps = world();
    const sourceHousehold = mismatchedMaps.households[0]!;
    const detachedHousehold = fromHouseholdRecord(toHouseholdRecord(sourceHousehold, mismatchedMaps.time.tick));
    mismatchedMaps.householdsById.set(sourceHousehold.id, detachedHousehold);
    expect(() => toRosterRecord(mismatchedMaps)).toThrow(/arrays and identity maps disagree/);
  });

  it('does not allocate standalone entity ids while hydrating', () => {
    const first = new Person('Before roster load', 0, 0, 0, new RNG('roster-id-test'));
    const sim = world();
    fromRosterRecord(JSON.parse(JSON.stringify(toRosterRecord(sim))));
    const next = new Person('After roster load', 0, 0, 0, new RNG('roster-id-test-next'));
    expect(next.id).toBe(first.id + 1);
  });
});
