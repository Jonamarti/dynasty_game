import { describe, expect, it, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { ParkedSimulation, SimulationAuthorityError } from '../runtime/authority.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function evolved(seed: string): Simulation {
  const sim = new Simulation({ seed, time: { ticksPerDay: 24, startDay: 7 },
    world: { width: 48, height: 48, treeDensity: 0.1 },
    population: { bands: 2, peoplePerBand: 4 } });
  sim.possessFirst();
  for (let tick = 0; tick < 180; tick++) sim.step();
  return sim;
}

function checkpoint(sim: Simulation): unknown {
  return wire(toCheckpointRecord(sim));
}

function expectSameWorld(left: Simulation, right: Simulation): void {
  expect(checkpoint(left)).toEqual(checkpoint(right));
}

describe('single-owner Simulation handoff', () => {
  it('parks and resumes the same state, rejects stale writes, and can transfer back once', () => {
    const source = evolved('authority-transfer-roundtrip');
    const stalePlayer = source.player!;
    const before = checkpoint(source);
    const tick = source.time.tick;
    const ids = source.ids;

    const handle = source.parkForTransfer();
    expect(checkpoint(source)).toEqual(before);
    expect(() => source.step()).toThrow('Simulation authority has been transferred');
    expect(() => source.order(stalePlayer, 'goto', { x: stalePlayer.x + 1, y: stalePlayer.y }))
      .toThrow('Simulation authority has been transferred');
    expect(source.time.tick).toBe(tick);
    expect(checkpoint(source)).toEqual(before);

    const first = Simulation.resumeTransfer(handle);
    expect(first.ids).toBe(ids);
    expect(checkpoint(first)).toEqual(before);
    expect(() => Simulation.resumeTransfer(handle)).toThrow('Simulation authority has been transferred');

    const returnedHandle = first.parkForTransfer();
    expect(() => first.step()).toThrow('Simulation authority has been transferred');
    const returned = Simulation.resumeTransfer(returnedHandle);
    expect(returned.ids).toBe(ids);
    expect(checkpoint(returned)).toEqual(before);
    expect(() => first.parkForTransfer()).toThrow('Simulation authority has been transferred');
  });

  it('keeps an in-flight action and resolves a real birth identically across repeated handoffs', () => {
    const source = evolved('authority-transfer-birth-action');
    const player = source.player!;
    const tree = source.trees.find(candidate => candidate.standing &&
      source.world.sameRegion(player.x, player.y, candidate.x, candidate.y))!;
    expect(tree).toBeDefined();
    player.x = tree.x;
    player.y = tree.y;
    expect(source.order(player, 'chop', { treeId: tree.id })).toBe(true);
    for (let tick = 0; tick < 6; tick++) source.step();
    expect(player.action).toBe('chop');
    expect(tree.chopProgress).toBeGreaterThan(0);

    const mother = source.livingPeople().find(person => person.sex === 'female' && person.spouseId !== null)!;
    expect(mother).toBeDefined();
    mother.pregnant = true;
    mother.gestationLeft = 1;
    mother.pregnantBy = mother.spouseId!;
    const childrenBefore = mother.childIds.length;
    const control = Simulation.fromCheckpointRecord(checkpoint(source));
    const ticksPerDay = source.time.snapshot().config.ticksPerDay;
    const untilNextDay = ticksPerDay - (source.time.tick % ticksPerDay);
    const originalIds = source.ids;

    let handle = source.parkForTransfer();
    let active = Simulation.resumeTransfer(handle);
    expect(active.ids).toBe(originalIds);
    for (let tick = 0; tick < untilNextDay; tick++) {
      active.step();
      control.step();
      if (tick === Math.floor(untilNextDay / 2)) {
        handle = active.parkForTransfer();
        expect(() => active.step()).toThrow('Simulation authority has been transferred');
        active = Simulation.resumeTransfer(handle);
        expect(active.ids).toBe(originalIds);
      }
    }

    expectSameWorld(active, control);
    expect(active.peopleById.get(mother.id)!.childIds.length).toBe(childrenBefore + 1);
    expect(active.player?.action).toBe('chop');
  });

  it('carries pending succession through a handoff and keeps the shared allocator advancing', () => {
    const source = evolved('authority-transfer-succession');
    const deceased = source.player!;
    deceased.alive = false;
    source.step();
    expect(source.succession?.died.id).toBe(deceased.id);
    const control = Simulation.fromCheckpointRecord(checkpoint(source));
    const ids = source.ids;

    const resumed = source.transferAuthority();
    expect(() => source.step()).toThrow(SimulationAuthorityError);
    expect(resumed.ids).toBe(ids);
    const expectedHeir = control.takeUpSuccession();
    const actualHeir = resumed.takeUpSuccession();
    expect(actualHeir?.id).toBe(expectedHeir?.id);
    expectSameWorld(resumed, control);

    // Direct reservations must continue the shared identity sequence too.
    // The preceding birth test exercises a real newborn; here the control has
    // its own allocator, so only reserve from the transferred world.
    const prior = ids.snapshot().next.person;
    const allocated = ids.allocate('person');
    expect(allocated).toBe(prior);
    expect(resumed.ids).toBe(source.ids);
  });

  it('does not revoke the old owner when checkpoint reconstruction fails', () => {
    const source = evolved('authority-transfer-atomic-failure');
    const before = checkpoint(source);
    const loader = vi.spyOn(Simulation as any, 'fromCheckpointRecordWithIds').mockImplementation(() => {
      expect(() => source.step()).toThrow(SimulationAuthorityError);
      expect(() => source.transferAuthority()).toThrow(SimulationAuthorityError);
      throw new Error('injected hydration failure');
    });
    try {
      expect(() => source.transferAuthority()).toThrow('injected hydration failure');
    } finally {
      loader.mockRestore();
    }
    expect(checkpoint(source)).toEqual(before);
    const tick = source.time.tick;
    source.step();
    expect(source.time.tick).toBe(tick + 1);
  });

  it('leaves a parked handle retryable when hydration fails before consumption', () => {
    const source = evolved('authority-transfer-retry');
    const handle = source.parkForTransfer();
    const loader = vi.spyOn(Simulation as any, 'fromCheckpointRecordWithIds').mockImplementation(() => {
      throw new Error('temporary hydration failure');
    });
    try {
      expect(() => Simulation.resumeTransfer(handle)).toThrow('temporary hydration failure');
    } finally {
      loader.mockRestore();
    }
    expect(() => source.step()).toThrow('Simulation authority has been transferred');
    const resumed = Simulation.resumeTransfer(handle);
    expect(resumed.ids).toBe(source.ids);
    expect(() => Simulation.resumeTransfer(handle)).toThrow('Simulation authority has been transferred');
  });

  it('rejects stale entity objects with retained IDs before mutating either state graph', () => {
    const source = evolved('authority-transfer-stale-entities');
    const oldPlayer = source.player!;
    const oldReceiver = source.livingPeople().find(person => person.id !== oldPlayer.id)!;
    const oldSpouseCandidate = source.people.find(person =>
      person.id !== oldPlayer.id && person.householdId !== oldPlayer.householdId)!;
    expect(oldSpouseCandidate).toBeDefined();
    oldPlayer.inventory.add('sticks', 8);
    oldPlayer.inventory.add('berries', 8);
    const oldStore = new Building(BUILDINGS.storage_pit!, oldPlayer.x, oldPlayer.y,
      oldPlayer.bandId, source.ids);
    oldStore.complete = true;
    source.buildings.push(oldStore);
    source.buildingsById.set(oldStore.id, oldStore);
    source.dropAt(oldPlayer.x + 8, oldPlayer.y + 8, 'flint', 4);
    const oldPile = source.piles.at(-1)!;

    const active = Simulation.resumeTransfer(source.parkForTransfer());
    const idSnapshot = source.ids.snapshot();
    const beforeSource = checkpoint(source);
    const beforeActive = checkpoint(active);
    const rejectOldReference = (operation: () => unknown) => {
      expect(operation).toThrow(SimulationAuthorityError);
      expect(source.ids.snapshot()).toEqual(idSnapshot);
      expect(checkpoint(source)).toEqual(beforeSource);
      expect(checkpoint(active)).toEqual(beforeActive);
    };

    rejectOldReference(() => active.drop(oldPlayer, 'sticks', 1));
    rejectOldReference(() => active.order(oldPlayer, 'goto', { x: oldPlayer.x + 1, y: oldPlayer.y }));
    rejectOldReference(() => active.handOver(oldPlayer, oldReceiver, 'sticks', 1));
    rejectOldReference(() => active.storeItem(oldPlayer, oldStore, 'berries', 1));
    rejectOldReference(() => active.takeFromPile(oldPlayer, oldPile, 'flint', 1));
    rejectOldReference(() => active.mergeHouseholds(oldPlayer, oldSpouseCandidate));
    rejectOldReference(() => active.possess(oldReceiver));
    rejectOldReference(() => active.social.emit('gift', oldPlayer, oldReceiver, 0.5,
      active.time.tick, active.peopleHash, active.config.sightRadius));

    // IDs alone are not authority: the matching objects in the resumed graph
    // are accepted and each path still works with canonical references.
    const person = active.peopleById.get(oldPlayer.id)!;
    const receiver = active.peopleById.get(oldReceiver.id)!;
    const store = active.buildingsById.get(oldStore.id)!;
    const pile = active.pilesById.get(oldPile.id)!;
    person.inventory.add('sticks', 2);
    const dropped = active.drop(person, 'sticks', 1)!;
    expect(dropped).toBeDefined();
    expect(active.pilesById.get(dropped.id)).toBe(dropped);
    person.inventory.add('sticks', 1);
    expect(() => active.order(person, 'goto', { x: person.x + 1, y: person.y })).not.toThrow();
    expect(active.handOver(person, receiver, 'sticks', 1)).toBe(1);
    person.inventory.add('berries', 1);
    expect(active.storeItem(person, store, 'berries', 1)).toBe(1);
    receiver.inventory.remove('sticks', receiver.inventory.count('sticks'));
    expect(active.takeFromPile(receiver, pile, 'flint', 1)).toBe(1);
    const spouseCandidate = active.peopleById.get(oldSpouseCandidate.id)!;
    expect(() => active.mergeHouseholds(person, spouseCandidate)).not.toThrow();
    expect(active.possess(receiver)).toBe(receiver);
    expect(active.ids).toBe(source.ids);
  });

  it('keeps allocator reservations made by another owner while the record is parked', () => {
    const source = evolved('authority-transfer-shared-ids');
    const ids = source.ids;
    const handle = source.parkForTransfer();
    const other = new Simulation({ seed: 'authority-transfer-other-owner',
      world: { width: 48, height: 48, treeDensity: 0.1 },
      population: { bands: 1, peoplePerBand: 2 } }, ids);
    other.dropAt(47, 47, 'sticks', 1);
    const otherPileId = other.piles.at(-1)!.id;
    const resumed = Simulation.resumeTransfer(handle);
    expect(resumed.ids).toBe(ids);
    resumed.dropAt(47, 47, 'sticks', 1);
    const created = resumed.pilesById.get(resumed.piles.at(-1)!.id)!;
    expect(created.id).toBeGreaterThan(otherPileId);
    expect(created.id).not.toBe(otherPileId);
    expect(source.ids.snapshot().next.itemPile).toBe(created.id + 1);
  });

  it('rejects reentrant resume without issuing a second owner or consuming the handle early', () => {
    const source = evolved('authority-transfer-reentrant-resume');
    const handle = source.parkForTransfer();
    const factory = Simulation as any;
    const original = factory.fromCheckpointRecordWithIds;
    let nestedAttempt = false;
    const loader = vi.spyOn(factory, 'fromCheckpointRecordWithIds').mockImplementation(function (
      this: unknown, record: unknown, ids: unknown,
    ) {
      if (!nestedAttempt) {
        nestedAttempt = true;
        expect(() => Simulation.resumeTransfer(handle)).toThrow(SimulationAuthorityError);
      }
      return original.call(factory, record, ids);
    });
    let resumed: Simulation;
    try {
      resumed = Simulation.resumeTransfer(handle);
    } finally {
      loader.mockRestore();
    }
    expect(resumed!.ids).toBe(source.ids);
    expect(() => Simulation.resumeTransfer(handle)).toThrow(SimulationAuthorityError);
  });

  it('rejects retained owner callbacks, stale founding factories, and forged handles without changing state', () => {
    const source = evolved('authority-transfer-retained-callbacks');
    const oldPlayer = source.player!;
    const oldReceiver = source.livingPeople().find(person => person.id !== oldPlayer.id)!;
    const staleFounding = source.foundingContext(source.rng);
    const beforeSource = checkpoint(source);
    const idsBefore = source.ids.snapshot();
    const handle = source.parkForTransfer();

    expect(() => Simulation.resumeTransfer(new ParkedSimulation())).toThrow(SimulationAuthorityError);
    expect(() => Simulation.resumeTransfer(wire(handle) as ParkedSimulation)).toThrow(SimulationAuthorityError);

    const active = Simulation.resumeTransfer(handle);
    const beforeActive = checkpoint(active);
    const assertUnchanged = () => {
      expect(source.ids.snapshot()).toEqual(idsBefore);
      expect(checkpoint(source)).toEqual(beforeSource);
      expect(checkpoint(active)).toEqual(beforeActive);
    };

    expect(() => source.social.emit('gift', oldPlayer, oldReceiver, 0.5,
      source.time.tick, source.peopleHash, source.config.sightRadius)).toThrow(SimulationAuthorityError);
    assertUnchanged();

    expect(() => source.cryReaches(oldPlayer)).toThrow(SimulationAuthorityError);
    expect(() => active.cryReaches(oldPlayer)).toThrow(SimulationAuthorityError);
    assertUnchanged();

    expect(() => staleFounding.makePerson('Stale founder', oldPlayer.x, oldPlayer.y,
      oldPlayer.bandId, source.rng)).toThrow(SimulationAuthorityError);
    assertUnchanged();

    expect(() => active.social.setMutationGuard(() => {})).toThrow(/already bound/);
    assertUnchanged();
  });
});
