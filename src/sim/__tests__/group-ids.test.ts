import { describe, expect, it } from 'vitest';
import { IdSpace } from '../core/IdSpace.ts';
import { Simulation, type Band } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { Animal } from '../entities/Animal.ts';
import { WildlifeSystem } from '../systems/WildlifeSystem.ts';

const sharedConfig = {
  seed: 'shared-group-identities',
  world: { width: 64, height: 64, treeDensity: 0.01, gameHerds: 3, predators: 1 },
  population: { bands: 2, peoplePerBand: 4,
    startingTechByBand: [['cooking'], ['bone_working']] },
};

describe('shared band and herd identities', () => {
  it('preserves a single world’s legacy group IDs and separates shared-world bands and herds', () => {
    const legacy = new IdSpace();
    expect([0, 1, 2].map(h => legacy.claimGroupId('herd', h))).toEqual([0, 1, 2]);
    expect([1001, 1003, 1004].map(id => legacy.claimGroupId('herd', id))).toEqual([1001, 1003, 1004]);
    expect(legacy.claimGroupAtOrAfter('herd', 5000)).toBe(5000);
    const ids = new IdSpace();
    const first = new Simulation(sharedConfig, ids);
    const second = new Simulation(sharedConfig, ids);
    expect(first.bands.map(band => band.id)).toEqual([0, 1]);
    expect(new Set(second.bands.map(band => band.id).concat(first.bands.map(band => band.id))).size)
      .toBe(first.bands.length + second.bands.length);

    const secondOnly = new IdSpace();
    const left = new Simulation(sharedConfig, secondOnly);
    const leftHerdIds = secondOnly.snapshot().groups.herd.occupied;
    const right = new Simulation(sharedConfig, secondOnly);
    const rightHerdIds = secondOnly.snapshot().groups.herd.occupied.filter(id => !leftHerdIds.includes(id));
    expect(leftHerdIds.length).toBeGreaterThan(0);
    expect(rightHerdIds.length).toBeGreaterThan(0);
    expect(new Set(left.animals.map(a => a.herdId)).size).toBeGreaterThan(0);
    expect(rightHerdIds.some(id => leftHerdIds.includes(id))).toBe(false);
    expect(right.animals.some(a => left.animals.some(b => b.herdId === a.herdId))).toBe(false);
    expect(right.bands.map(b => b.id).some(id => left.bands.some(b => b.id === id))).toBe(false);
  });

  it('keeps ordinal starting technologies and outcast ownership local to each band ID', () => {
    const ids = new IdSpace();
    const first = new Simulation(sharedConfig, ids);
    const second = new Simulation(sharedConfig, ids);
    for (const sim of [first, second]) {
      for (let ordinal = 0; ordinal < 2; ordinal++) {
        const band = sim.bands[ordinal]!;
        const expected = ordinal === 0 ? 'cooking' : 'bone_working';
        const founders = sim.people.filter(person => person.bandId === band.id && !person.isChild);
        expect(founders.length).toBeGreaterThan(0);
        expect(founders.every(person => person.knownTech.has(expected))).toBe(true);
      }
    }
    const createOutcast = (sim: Simulation) => (sim as unknown as { outcastBand(): Band }).outcastBand();
    const outcasts = [createOutcast(first), createOutcast(second)];
    expect(outcasts[0]!.id).not.toBe(outcasts[1]!.id);
    for (const [index, sim] of [first, second].entries()) {
      const outcast = outcasts[index]!;
      const norms = (sim as unknown as { normsByBand: Map<number, unknown> }).normsByBand;
      expect(outcast.outcast).toBe(true);
      expect(norms.has(outcast.id)).toBe(true);
      sim.bandRelations.setStance(sim.bands[0]!.id, outcast.id, 'peace', 0);
      expect(sim.bandRelations.stance(sim.bands[0]!.id, outcast.id)).toBe('peace');
    }
    expect(first.bandRelations.stance(first.bands[0]!.id, outcasts[1]!.id)).toBeNull();
  });

  it('keeps calf membership and edge herd ranges distinct through an allocator snapshot', () => {
    const ids = new IdSpace();
    const sim = new Simulation(sharedConfig, ids);
    const herdId = ids.claimGroupId('herd', 9000);
    const adults = [
      new Animal('wolf', 10, 10, herdId, new RNG('wolf-a'), ids),
      new Animal('wolf', 11, 10, herdId, new RNG('wolf-b'), ids),
    ];
    for (const adult of adults) adult.fed = 1;
    const wildlife = new WildlifeSystem();
    (wildlife as unknown as { owed: Map<number, number> }).owed.set(herdId, 1);
    const calves = wildlife.daily(adults, {
      world: sim.world, rng: new RNG('calf'), tick: 1,
      peopleHash: sim.peopleHash, season: 'spring', ids,
    });
    expect(calves.length).toBe(1);
    expect(calves[0]!.herdId).toBe(herdId);

    const edgeA = ids.claimGroupAtOrAfter('herd', 5000);
    const saved = JSON.parse(JSON.stringify(ids.snapshot())) as unknown;
    const resumed = IdSpace.fromSnapshot(saved);
    const edgeB = resumed.claimGroupAtOrAfter('herd', 5000);
    expect([edgeA, edgeB]).toEqual([5000, 5001]);
    expect(resumed.claimGroupId('herd', herdId)).not.toBe(herdId);
  });

  it('allocates edge herds through the live Simulation allocator and resumes after a snapshot', () => {
    const sim = new Simulation({
      ...sharedConfig,
      world: { ...sharedConfig.world, edgeEntryChance: 1, edgeReserve: 50 },
    });
    const deer = sim.animals.filter(animal => animal.species === 'deer');
    expect(deer.length).toBeGreaterThan(0);
    sim.foundingFauna.deer = deer.length;
    for (const animal of deer) {
      sim.animalsById.delete(animal.id);
      sim.animals.splice(sim.animals.indexOf(animal), 1);
    }
    sim.edgeReserve.deer = 50;
    (sim as unknown as { edgeEntry(): { x: number; y: number } | null }).edgeEntry = () => ({ x: 20, y: 20 });
    (sim as unknown as { edgeTraffic(): void }).edgeTraffic();
    const entered = sim.animals.filter(animal => animal.species === 'deer');
    expect(entered.length).toBeGreaterThan(0);
    expect(entered.every(animal => animal.herdId >= 5000)).toBe(true);
    const resumed = IdSpace.fromSnapshot(JSON.parse(JSON.stringify(sim.idSnapshot())) as unknown);
    const nextEdgeId = resumed.claimGroupAtOrAfter('herd', 5000);
    expect(nextEdgeId).toBeGreaterThan(Math.max(...entered.map(animal => animal.herdId)));
  });

  it('merges future group checkpoints monotonically, including disjoint occupied sets', () => {
    const olderSpace = new IdSpace();
    olderSpace.claimGroupId('band', 0);
    olderSpace.claimGroupId('herd', 100);
    const older = olderSpace.snapshot();
    const futureSpace = new IdSpace();
    futureSpace.claimGroupId('band', 2);
    futureSpace.claimGroupId('herd', 5000);
    const future = futureSpace.snapshot();

    const restored = IdSpace.fromSnapshot(older);
    restored.restore(future);
    expect(restored.snapshot().groups.band.occupied).toEqual([0, 2]);
    expect(restored.snapshot().groups.herd.occupied).toEqual([100, 5000]);
    expect(restored.claimGroupId('band', 2)).toBe(1);
    restored.restore(older);
    expect(restored.snapshot().groups.band.occupied).toEqual([0, 1, 2]);
    expect(restored.snapshot().groups.band.nextCandidate).toBe(3);
    expect(IdSpace.fromSnapshot(restored.snapshot()).snapshot()).toEqual(restored.snapshot());
  });

  it('rejects v1, duplicate, unordered and cursor-inconsistent group snapshots atomically', () => {
    const ids = new IdSpace();
    const baseline = ids.snapshot();
    const malformed = [
      { version: 1, next: baseline.next },
      { ...baseline, groups: { ...baseline.groups, band: { occupied: [2, 1], nextCandidate: 0 } } },
      { ...baseline, groups: { ...baseline.groups, herd: { occupied: [0, 0], nextCandidate: 1 } } },
      { ...baseline, groups: { ...baseline.groups, band: { occupied: [0], nextCandidate: 0 } } },
      { ...baseline, groups: { ...baseline.groups, band: Object.assign(
        Object.create({ occupied: [] }), { nextCandidate: 0, unexpected: true }) } },
    ];
    for (const snapshot of malformed) {
      expect(() => ids.restore(snapshot)).toThrow();
      expect(ids.snapshot()).toEqual(baseline);
      expect(() => IdSpace.fromSnapshot(snapshot)).toThrow();
    }
  });
});
