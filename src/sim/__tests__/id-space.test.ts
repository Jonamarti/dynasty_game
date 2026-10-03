import { describe, expect, it } from 'vitest';
import { ID_KINDS, IdSpace, type IdKind } from '../core/IdSpace.ts';
import { Simulation } from '../core/Simulation.ts';
import { SCENARIOS } from '../../../tools/simcheck.ts';

const config = {
  seed: 'id-space-regression',
  world: { width: 32, height: 32, treeDensity: 0.01 },
  population: { bands: 1, peoplePerBand: 4 },
  learning: { skillGain: 2 },
};

describe('per-world ID spaces', () => {
  it('keeps two live simulations independent while their steps are interleaved', () => {
    const first = new Simulation(config);
    first.dropAt(8, 8, 'flint', 1);
    const second = new Simulation({ ...config, learning: { skillGain: 4 } });
    first.dropAt(9, 9, 'flint', 1);
    expect(first.piles.map(pile => pile.id)).toEqual([1, 2]);
    expect(second.piles).toHaveLength(0);

    const mother = first.people.find(person => person.sex === 'female' && person.spouseId !== null)!;
    const father = first.peopleById.get(mother.spouseId!)!;
    mother.pregnant = true;
    mother.gestationLeft = 1;
    mother.pregnantBy = father.id;
    first.time.tick = first.config.time.ticksPerDay - 1;
    second.step();
    first.step();

    const newborn = first.people.find(person => person.motherId === mother.id);
    expect(newborn).toBeDefined();
    expect(newborn!.id).toBeGreaterThan(Math.max(...first.people.filter(p => p !== newborn).map(p => p.id)));
    expect(newborn!.skillGain).toBe(2);
    expect(second.people.map(person => person.id)).toEqual([1, 2, 3, 4]);
    expect(second.idSnapshot().next.person).toBe(5);
  });

  it('continues monotonically from JSON snapshots and allows deliberate shared worlds', () => {
    const ids = new IdSpace();
    const prefix = ids.allocate('person');
    const saved = JSON.parse(JSON.stringify(ids.snapshot())) as unknown;
    const resumed = IdSpace.fromSnapshot(saved);
    expect(resumed.allocate('person')).toBe(prefix + 1);
    resumed.restore({ ...resumed.snapshot(), next: { ...resumed.snapshot().next, person: 1 } });
    expect(resumed.allocate('person')).toBe(prefix + 2);

    const detached = ids.snapshot();
    detached.next.person = 99;
    expect(ids.allocate('person')).toBe(prefix + 1);

    const shared = new IdSpace();
    const left = new Simulation(config, shared);
    const right = new Simulation(config, shared);
    expect(Math.min(...right.people.map(person => person.id)))
      .toBeGreaterThan(Math.max(...left.people.map(person => person.id)));
  });

  it('continues every namespace and leaves the allocator intact after an invalid restore', () => {
    const ids = new IdSpace();
    for (const kind of ID_KINDS) ids.allocate(kind);
    ids.allocate('socialEvent');
    const wire = JSON.parse(JSON.stringify(ids.snapshot()));
    const loaded = IdSpace.fromSnapshot(wire);
    wire.next.tree = 99;
    for (const kind of ID_KINDS) {
      expect(loaded.allocate(kind)).toBe(kind === 'socialEvent' ? 3 : 2);
    }
    const before = loaded.snapshot();
    const malformed = loaded.snapshot();
    malformed.next.person = 900;
    malformed.next.socialEvent = 0;
    expect(() => loaded.restore(malformed)).toThrow();
    expect(loaded.snapshot()).toEqual(before);
  });

  it('registers harness granaries without colliding with founded buildings', () => {
    for (const name of ['polity', 'conquest']) {
      const scenario = SCENARIOS[name]!;
      const sim = new Simulation(scenario.config);
      scenario.setup!(sim);
      expect(new Set(sim.buildings.map(building => building.id)).size).toBe(sim.buildings.length);
      for (const building of sim.buildings) expect(sim.buildingsById.get(building.id)).toBe(building);
    }
  });

  it('rejects malformed and unknown ID snapshot data', () => {
    for (const snapshot of [
      undefined,
      null,
      { version: 2, next: {} },
      { version: 1, next: {}, groups: {} }, // v1 is rejected; groups cannot be guessed safely.
      { ...new IdSpace().snapshot(), next: { person: 0 } },
      { ...new IdSpace().snapshot(), next: { person: 1, household: 1, tree: 1, resourceNode: 1,
        building: 1, animal: 1, corpse: 1, inscription: 1, itemPile: 1, socialEvent: 1, extra: 1 } },
      { ...new IdSpace().snapshot(), groups: { band: { occupied: [0, 0], nextCandidate: 1 }, herd: { occupied: [], nextCandidate: 0 } } },
    ]) expect(() => IdSpace.fromSnapshot(snapshot)).toThrow();

    const ids = new IdSpace();
    expect(() => ids.restore({ ...ids.snapshot(), next: { invalid: 4 } })).toThrow();
    expect(ids.allocate('person')).toBe(1); // failed restore was atomic
    expect(() => ids.allocate('unknown' as IdKind)).toThrow();
    const exhausted = IdSpace.fromSnapshot({
      ...new IdSpace().snapshot(),
      next: Object.fromEntries(ID_KINDS.map(kind => [kind, kind === 'person' ? Number.MAX_SAFE_INTEGER : 1])),
    });
    expect(() => exhausted.allocate('person')).toThrow(RangeError);
  });
});
