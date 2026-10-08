import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord, fromCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { toExecutionRecord } from '../persistence/ExecutionRecords.ts';
import { fromPersonRecord, toPersonRecord } from '../persistence/EntityRecords.ts';

function fixture(): Simulation {
  const sim = new Simulation({ seed: 'checkpoint-composition', world: { width: 48, height: 48, treeDensity: 0.1 },
    population: { bands: 2, peoplePerBand: 4 } });
  sim.possessFirst();
  return sim;
}
const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('coordinated detached checkpoints', () => {
  it('joins a real evolved world at one tick without consuming IDs or random streams', () => {
    const sim = fixture();
    for (let tick = 0; tick < 245; tick++) sim.step();
    const deceased = sim.people.find(person => !person.isPlayer)!;
    deceased.alive = false;
    sim.step();
    const corpse = sim.corpses.find(body => body.person === deceased)!;
    expect(corpse).toBeDefined();
    sim.dropAt(sim.player!.x, sim.player!.y, 'sticks', 2);
    const beforeExecution = toExecutionRecord(sim);
    const beforeIds = sim.idSnapshot();
    const saved = toCheckpointRecord(sim);
    const restored = fromCheckpointRecord(wire(saved));
    expect(restored.lastAdvancedTick).toBe(sim.time.tick);
    expect(restored.execution.time.tick).toBe(sim.time.tick);
    expect(restored.config).toEqual(sim.config);
    for (const band of restored.roster.bands) expect(restored.ledgers.normsByBand.get(band.id)).toBe(band.norms);
    expect(restored.ids.snapshot()).toEqual(beforeIds);
    expect(toExecutionRecord(sim)).toEqual(beforeExecution);
    expect(sim.idSnapshot()).toEqual(beforeIds);
    const loadedCorpse = restored.objects.corpses.find(body => body.id === corpse.id)!;
    expect(loadedCorpse.person).toBe(restored.roster.peopleById.get(deceased.id));
    expect(loadedCorpse.person).not.toBe(deceased);
    const loadedPlayer = restored.roster.peopleById.get(sim.player!.id)!;
    expect(toPersonRecord(loadedPlayer, sim.time.tick)).toEqual(toPersonRecord(sim.player!, sim.time.tick));
    const sourceAmount = sim.world.grass[0];
    restored.world.grass[0] = 123;
    restored.config.needs.hungerRate = 999;
    loadedPlayer.inventory.add('sticks', 1);
    expect(sim.world.grass[0]).toBe(sourceAmount);
    expect(saved.config.needs.hungerRate).toBe(sim.config.needs.hungerRate);
    expect(loadedPlayer.inventory.count('sticks')).toBe(sim.player!.inventory.count('sticks') + 1);
    expect(restored.ids.allocate('person')).toBe(beforeIds.next.person);
    expect(sim.idSnapshot()).toEqual(beforeIds);
  });

  it('loads a checkpoint saved before otherBandThinkInterval existed with the old rule: nobody slowed', () => {
    const sim = fixture();
    for (let tick = 0; tick < 10; tick++) sim.step();
    const saved = wire(toCheckpointRecord(sim)) as any;
    delete saved.config.otherBandThinkInterval;
    const restored = fromCheckpointRecord(saved);
    expect(restored.config.otherBandThinkInterval).toBe(restored.config.thinkInterval);
  });

  it('round trips an explicit false commitment-source bit in an old-compatible ledger', () => {
    const sim = fixture();
    sim.interruptions.push({ personId: sim.people[0]!.id, action: 'forage', reason: 'injured', recipe: null, autonomousCommitment: false });
    const restored = fromCheckpointRecord(wire(toCheckpointRecord(sim)));
    expect(restored.ledgers.interruptions[0]?.autonomousCommitment).toBe(false);
  });

  it('migrates only a wholly legacy AI config and rejects a partial commitment policy', () => {
    const saved = wire(toCheckpointRecord(fixture())) as any;
    delete saved.config.ai.commitmentEntryPressure;
    delete saved.config.ai.commitmentBreakMargin;
    delete saved.config.ai.commitmentTieMargin;
    const restored = fromCheckpointRecord(saved);
    expect(restored.config.ai.commitmentEntryPressure).toBe(0.16);
    expect(restored.config.ai.commitmentBreakMargin).toBe(0.08);
    expect(restored.config.ai.commitmentTieMargin).toBe(0.02);
    const partial = wire(toCheckpointRecord(fixture())) as any;
    delete partial.config.ai.commitmentTieMargin;
    expect(() => fromCheckpointRecord(partial)).toThrow();
  });

  it('round trips commitments, migrates an absent legacy field, and rejects malformed present state', () => {
    const sim = fixture();
    const person = sim.people.find(candidate => !candidate.isPlayer)!;
    person.commitment = { action: 'forage', drive: 'hunger', baselinePressure: 0.22, goal: '[\"forage\"]' };
    const record = wire(toPersonRecord(person, sim.time.tick)) as any;
    expect(fromPersonRecord(record).commitment).toEqual(person.commitment);
    const legacy = wire(record);
    const root = legacy.graph.nodes[legacy.graph.root.ref];
    root.fields = root.fields.filter(([key]: [string, unknown]) => key !== 'commitment');
    expect(fromPersonRecord(legacy).commitment).toBeNull();
    const malformed = wire(record);
    const commitmentRef = malformed.graph.nodes[malformed.graph.root.ref].fields.find(([key]: [string, unknown]) => key === 'commitment')[1].ref;
    malformed.graph.nodes[commitmentRef].fields.find(([key]: [string, unknown]) => key === 'baselinePressure')[1] = -1;
    expect(() => fromPersonRecord(malformed)).toThrow(/commitment is malformed/);
  });

  it('rejects mixed ticks, changed rules, unknown fields and allocators that would reissue identities', () => {
    const saved = toCheckpointRecord(fixture());
    const corruptions: ((copy: any) => void)[] = [
      copy => { copy.extra = true; },
      copy => { copy.version = 2; },
      copy => { copy.roster.lastAdvancedTick++; },
      copy => { copy.objects.lastAdvancedTick++; },
      copy => { copy.ledgers.lastAdvancedTick++; },
      copy => { copy.ledgers.lastAdvancedDay++; },
      copy => { copy.execution.lastAdvancedTick++; },
      copy => { copy.config.world.regrowthRate += 1; },
      copy => { copy.config.time.tickRate += 1; },
      copy => { delete copy.config.carry; },
      copy => { copy.config.needs.workLimits.extra = 10; },
      copy => { copy.config.thinkInterval = 0; },
      copy => { copy.config.population.startingTech = ['unknown']; },
      copy => { copy.ids.next.person = 1; },
      copy => { copy.ids.next.resourceNode = 1; },
      copy => { copy.ids.groups.band = { occupied: [], nextCandidate: 0 }; },
      copy => { copy.ids.groups.herd = { occupied: [], nextCandidate: 0 }; },
      copy => { copy.ledgers.feudEvents.push(copy.ids.next.socialEvent); },
      copy => { copy.ledgers.normsByBand[0][1].theft += 0.1; },
      copy => { copy.ledgers.bandSystem.chiefByBand = [[0, 999999]]; },
    ];
    for (const corrupt of corruptions) {
      const copy = wire(saved);
      corrupt(copy);
      expect(() => fromCheckpointRecord(copy)).toThrow();
    }
    const sparse = wire(saved);
    sparse.config.population.startingTech = new Array(1);
    expect(() => fromCheckpointRecord(sparse)).toThrow();
  });

  it('checks source rules as well as saved rules, retaining no aliases into the input', () => {
    const sim = fixture();
    const saved = toCheckpointRecord(sim);
    const restored = fromCheckpointRecord(saved);
    saved.config.carry.equipTicks++;
    saved.ids.next.person++;
    expect(restored.config.carry.equipTicks).toBe(sim.config.carry.equipTicks);
    expect(restored.ids.snapshot()).toEqual(sim.idSnapshot());
    const sourceNorms = (sim as unknown as { normsByBand: Map<number, unknown> }).normsByBand;
    const band = sim.bands[0]!;
    sourceNorms.set(band.id, { ...band.norms });
    expect(() => toCheckpointRecord(sim)).toThrow(/source culture aliases disagree/);
    sourceNorms.set(band.id, band.norms);
    sim.config.world = { ...sim.config.world, regrowthRate: sim.config.world.regrowthRate + 1 };
    // Generation owns a different world-config object; writing a mismatched
    // checkpoint is rejected before it can become a confusing load failure.
    expect(() => toCheckpointRecord(sim)).toThrow(/terrain config mismatch/);
  });
});
