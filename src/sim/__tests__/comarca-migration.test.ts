import { describe, expect, it } from 'vitest';
import { Person } from '../entities/Person.ts';
import { BandSystem, type BandContext } from '../systems/BandSystem.ts';
import { Simulation } from '../core/Simulation.ts';
import { IdSpace } from '../core/IdSpace.ts';
import type { Band } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { createFrontier, frontierGeography } from '../../../tools/frontierFixture.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { WorldKnowledge } from '../social/WorldKnowledge.ts';
import {
  approveMigration, canFollowMigration, chooseMigrationReason, knownMigrationDestinations,
} from '../world/ComarcaMigration.ts';
import { fissionMigratingParty } from '../world/ComarcaBandFission.ts';
import { WorldState } from '../world/WorldState.ts';

const person = (name: string, bandId = 1) => new Person(name, 0, 0, bandId, new RNG(`migration-${name}`));

describe('comarca migration policy', () => {
  it('keeps the stated reason hierarchy independent of candidate order', () => {
    expect(chooseMigrationReason(['overpopulation', 'sustained_hunger', 'no_fresh_water']))
      .toBe('no_fresh_water');
    expect(chooseMigrationReason(['exile', 'hostile_stronger_neighbour']))
      .toBe('hostile_stronger_neighbour');
    expect(chooseMigrationReason([])).toBeNull();
  });

  it('offers only known adjacent comarcas that the coordinator says are enterable', () => {
    const actor = person('scout');
    actor.worldKnowledge = new WorldKnowledge();
    actor.worldKnowledge.see(2, 1, 4); // east of the origin
    actor.worldKnowledge.see(0, 1, 3); // west
    const seen = knownMigrationDestinations(actor, { cx: 1, cy: 1 }, { mapWidth: 3, mapHeight: 3 });
    expect(seen).toEqual([
      { direction: 'e', cx: 2, cy: 1 },
      { direction: 'w', cx: 0, cy: 1 },
    ]);
    // Geography can veto a remembered place, but cannot make an unknown north
    // or south comarca known. The callback is therefore not an oracle.
    const filtered = knownMigrationDestinations(
      actor, { cx: 1, cy: 1 }, { mapWidth: 3, mapHeight: 3 }, (_x, _y, direction) => direction === 'w',
    );
    expect(filtered).toEqual([{ direction: 'w', cx: 0, cy: 1 }]);
    expect(knownMigrationDestinations(actor, { cx: 1, cy: 1 }, null)).toEqual([]);
  });

  it('uses the motive being relieved for a strict majority and keeps the no-water control', () => {
    const leader = person('vote-leader');
    const one = person('vote-one');
    const two = person('vote-two');
    const three = person('vote-three');
    const relationships = new RelationshipGraph();
    one.needs.thirst = 25;
    two.needs.thirst = 25;
    // In the drought world the adults vote to leave; the same observed thirst
    // cannot approve a move motivated only by population pressure.
    expect(approveMigration(leader, [leader, one, two, three], 'no_fresh_water', relationships).approved).toBe(true);
    expect(approveMigration(leader, [leader, one, two, three], 'overpopulation', relationships).approved).toBe(false);
    one.needs.thirst = 0;
    two.needs.thirst = 0;
    expect(approveMigration(leader, [leader, one, two, three], 'sustained_hunger', relationships).approved).toBe(false);
    one.chronic.hunger = 0.22;
    expect(approveMigration(leader, [leader, one, two, three], 'sustained_hunger', relationships).approved).toBe(false);
    two.chronic.hunger = 0.22;
    expect(approveMigration(leader, [leader, one, two, three], 'sustained_hunger', relationships).approved).toBe(true);
    expect(approveMigration(leader, [leader, one, two, three], 'overpopulation', relationships).approved).toBe(false);
    for (const adult of [one, two, three]) relationships.introduce(adult.id, leader.id, 12);
    expect(approveMigration(leader, [leader, one, two, three], 'overpopulation', relationships).approved).toBe(true);
  });
  it('hands a majority-approved drought move to the coordinator with an explicit party', () => {
    const members = ['chief', 'adult-one', 'adult-two', 'adult-three'].map(name => person(name));
    const proposer = members[0]!;
    proposer.worldKnowledge = new WorldKnowledge();
    proposer.worldKnowledge.see(2, 1, 4);
    const relationships = new RelationshipGraph();
    for (const follower of members.slice(1)) {
      follower.needs.thirst = 25;
      relationships.introduce(follower.id, proposer.id, 20);
    }
    let proposal: unknown = null;
    const band = { id: 1, outcast: false } as Band;
    const ctx = {
      day: 10,
      relationships,
      migration: {
        origin: { cx: 1, cy: 1 }, frame: { mapWidth: 3, mapHeight: 3 },
        capacityRationsPerDay: null, hasFreshWater: false,
        hostileStrongerNeighbour: () => false,
        onProposal: (input: unknown) => { proposal = input; },
      },
    } as unknown as BandContext;
    const system = new BandSystem();
    (system as unknown as { considerComarcaMigration(b: Band, m: Person[], c: BandContext): void })
      .considerComarcaMigration(band, members, ctx);
    expect(proposal).toEqual({
      reason: 'no_fresh_water', bandId: 1, actorId: proposer.id,
      direction: 'e', destination: { cx: 2, cy: 1 },
      followerIds: members.map(member => member.id),
    });
  });

  it('requests exploration when a motive exists but the band knows no neighbour', () => {
    const proposer = person('unmapped');
    proposer.worldKnowledge = new WorldKnowledge();
    const scoutRequests: unknown[] = [];
    const ctx = {
      day: 10,
      relationships: new RelationshipGraph(),
      migration: {
        origin: { cx: 1, cy: 1 }, frame: { mapWidth: 3, mapHeight: 3 },
        capacityRationsPerDay: null, hasFreshWater: false,
        hostileStrongerNeighbour: () => false,
        canEnter: (_x: number, _y: number, direction: string) => direction === 's',
        onProposal: () => { throw new Error('migration cannot target unknown ground'); },
        onScoutNeeded: (...args: unknown[]) => scoutRequests.push(args),
      },
    } as unknown as BandContext;
    const system = new BandSystem();
    (system as unknown as { considerComarcaMigration(b: Band, m: Person[], c: BandContext): void })
      .considerComarcaMigration({ id: 1, outcast: false } as Band, [proposer], ctx);
    expect(scoutRequests).toEqual([[proposer.id, 's']]);
  });
  it('runs the proposal through the public daily BandSystem update on a frontier map', () => {
    const sim = createFrontier({ seed: 'band-drought-proposal', population: { bands: 1, peoplePerBand: 6 } });
    const band = sim.bands[0]!;
    const actors = sim.livingPeople().filter(person => person.bandId === band.id && !person.isChild);
    expect(actors.length).toBeGreaterThan(1);
    const proposer = actors[0]!;
    sim.bandSystem.chiefByBand.set(band.id, proposer.id);
    band.chiefId = proposer.id;
    band.chiefSince = sim.time.day;
    const origin = sim.comarcaAtTile(proposer.x, proposer.y)!;
    const frame = sim.worldFrame!;
    const destination = { cx: (origin.cx + 1) % frame.mapWidth, cy: origin.cy };
    proposer.worldKnowledge = new WorldKnowledge();
    proposer.worldKnowledge.see(destination.cx, destination.cy, sim.time.day);
    const followers = actors.filter(person => person.id !== proposer.id);
    for (const follower of followers) {
      follower.needs.thirst = 41;
      follower.chronic.thirst = 0.25;
      follower.order = null;
      sim.relationships.edge(follower.id, proposer.id).bias = 20;
    }
    const proposals: unknown[] = [];
    sim.comarcaMigration = () => ({
      origin, frame, capacityRationsPerDay: null, hasFreshWater: false,
      hostileStrongerNeighbour: () => false,
      onProposal: proposal => proposals.push(proposal),
    });
    // Reach exactly one public daily update rather than spending a season waiting.
    sim.time.tick = sim.config.time.ticksPerDay - 1;
    sim.step();
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      reason: 'no_fresh_water', bandId: band.id, actorId: proposer.id,
      destination, followerIds: expect.arrayContaining([proposer.id]),
    });
  });
  it('fissions an approved partial party into a daughter band while conserving people and kin', () => {
    const ids = new IdSpace();
    const geography = frontierGeography();
    const config = { seed: 'migration-fission', population: { bands: 1, peoplePerBand: 6 } } as const;
    const source = new Simulation(config, ids, { geography, x: 40, y: 20, comarcasWide: 60, comarcasHigh: 20 });
    const destination = new Simulation({ ...config, population: { bands: 0, peoplePerBand: 6 } }, ids,
      { geography, x: 41, y: 20, comarcasWide: 60, comarcasHigh: 20 });
    const parent = source.bands[0]!;
    const adults = source.livingPeople().filter(person => person.bandId === parent.id && !person.isChild);
    const migrants = adults.slice(0, 2);
    expect(migrants).toHaveLength(2);
    const [kinA, kinB] = migrants;
    source.relationships.setKinship(kinA!.id, kinB!.id, 35);
    const totalBefore = source.livingPeople().length + destination.livingPeople().length;
    const originalIds = new Set(source.livingPeople().map(person => person.id));
    const movedIds = migrants.map(person => person.id);

    source.transferTravellersTo(destination, movedIds, 'w');
    const fissions = fissionMigratingParty(source, destination, movedIds);

    expect(fissions).toHaveLength(1);
    const daughterId = fissions[0]!.daughterBandId;
    expect(daughterId).not.toBe(parent.id);
    expect(source.livingPeople().filter(person => person.bandId === parent.id).length).toBeGreaterThan(0);
    expect(destination.livingPeople().filter(person => person.bandId === daughterId).map(person => person.id).sort())
      .toEqual([...movedIds].sort());
    expect(source.bands.some(band => band.id === parent.id)).toBe(true);
    expect(destination.bands.some(band => band.id === parent.id)).toBe(false);
    expect(destination.bands.find(band => band.id === daughterId)?.norms).toEqual(parent.norms);
    const migrantHouseholds = destination.households.filter(household => movedIds.some(id => household.memberIds.includes(id)));
    expect(migrantHouseholds.length).toBeGreaterThan(0);
    expect(migrantHouseholds.every(household => household.bandId === daughterId)).toBe(true);
    expect(destination.bandRelations.standing(parent.id, daughterId)).toBe(60);
    expect(destination.relationships.kinship(kinA!.id, kinB!.id)).toBe(35);
    expect(new Set([...source.people, ...destination.people].filter(person => person.alive).map(person => person.id)))
      .toEqual(originalIds);
    expect(source.livingPeople().length + destination.livingPeople().length).toBe(totalBefore);
  });

  it('fissions only a migration-marked transactional comarca crossing', () => {
    const cross = (migration: boolean) => {
      const geography = frontierGeography();
      const state = new WorldState({ seed: `migration-cross-${migration}`, world: { width: 64, height: 48 },
        population: { bands: 1, peoplePerBand: 6 } },
      { geography, start: { x: 40, y: 20 }, comarcasWide: 1, comarcasHigh: 1, peoples: false });
      const source = state.current;
      const parentBand = source.bands[0]!;
      const party = source.livingPeople().filter(person => person.bandId === parentBand.id && !person.isChild).slice(0, 2);
      expect(party).toHaveLength(2);
      const travellerIds = party.map(person => person.id);
      const originalIds = new Set(source.livingPeople().map(person => person.id));
      const totalBefore = originalIds.size;
      const origin = state.frontier.active!;
      const refused = source.comarcaTravel!.arrive({ person: party[0]!, direction: 'e', scout: false, migration, travellerIds });
      expect(refused).toBeNull();
      expect(state.commitPendingCross()).toBe(true);
      const destination = state.current;
      const parked = state.frontier.parkedAt(origin)!;
      const restoredSource = Simulation.fromCheckpointRecordWithSharedIds(parked, state.ids);
      expect(restoredSource.livingPeople().length + destination.livingPeople().length).toBe(totalBefore);
      expect(new Set([...restoredSource.people, ...destination.people].filter(person => person.alive).map(person => person.id)))
        .toEqual(originalIds);
      const arrived = travellerIds.map(id => destination.peopleById.get(id)!);
      return { parentBand, partyBandIds: arrived.map(person => person.bandId), destination, migration };
    };

    const migration = cross(true);
    expect(new Set(migration.partyBandIds).size).toBe(1);
    expect(migration.partyBandIds[0]).not.toBe(migration.parentBand.id);
    expect(migration.destination.bandRelations.standing(migration.parentBand.id, migration.partyBandIds[0]!)).toBe(60);
    const ordinary = cross(false);
    expect(new Set(ordinary.partyBandIds)).toEqual(new Set([ordinary.parentBand.id]));
  });
  it('does not choose migration when the drought motive is absent', () => {
    const adult = person('water-control');
    const system = new BandSystem();
    const ctx = {
      day: 10,
      relationships: new RelationshipGraph(),
      migration: {
        origin: { cx: 1, cy: 1 }, frame: { mapWidth: 3, mapHeight: 3 },
        capacityRationsPerDay: null, hasFreshWater: true,
        hostileStrongerNeighbour: () => false,
        onProposal: () => { throw new Error('water alone must not trigger migration when it is available'); },
        onScoutNeeded: () => { throw new Error('a scout is not needed without migration pressure'); },
      },
    } as unknown as BandContext;
    (system as unknown as { considerComarcaMigration(b: Band, m: Person[], c: BandContext): void })
      .considerComarcaMigration({ id: 1, outcast: false } as Band, [adult], ctx);
  });
  it('requires a real social tie and safe travel needs before asking someone to follow', () => {
    const leader = person('leader');
    const follower = person('follower');
    const relationships = new RelationshipGraph();
    expect(canFollowMigration(leader, follower, relationships)).toBe(false);
    relationships.introduce(follower.id, leader.id, 20);
    expect(canFollowMigration(leader, follower, relationships)).toBe(true);
    follower.needs.thirst = 41;
    expect(canFollowMigration(leader, follower, relationships)).toBe(false);
    expect(canFollowMigration(leader, follower, relationships, 'no_fresh_water')).toBe(true);
    follower.needs.thirst = 0;
    follower.captiveOf = leader.id;
    expect(canFollowMigration(leader, follower, relationships)).toBe(false);
  });
});








