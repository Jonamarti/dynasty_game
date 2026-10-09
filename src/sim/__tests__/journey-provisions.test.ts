import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

function fixture() {
  const sim = new Simulation({ seed: 'journey-provisions', world: { width: 32, height: 32 }, population: { bands: 1, peoplePerBand: 4 }, time: { ticksPerDay: 600 }, needs: { hungerRate: 0, thirstRate: 0, spoilRate: 0 } });
  const person = sim.possessFirst()!;
  for (const [item, count] of [...person.inventory.entries()]) person.inventory.remove(item, count);
  person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
  return { sim, person };
}

describe('physical journey provisions', () => {
  it('debits a real meal and retains the ordinary macro and hydration effects', () => {
    const { sim, person } = fixture();
    person.inventory.add('berries', 2); person.needs.hunger = 60; person.needs.thirst = 60;
    sim.advanceJourneyTick([person.id], 1);
    expect(person.inventory.count('berries')).toBe(1);
    expect(person.needs.hunger).toBeLessThan(60);
    expect(person.needs.thirst).toBeLessThan(60);
    expect(person.macroBalance.carb).toBeGreaterThan(0);
  });

  it('does not spend dry provisions to try to relieve thirst alone', () => {
    const { sim, person } = fixture();
    person.inventory.add('hazelnut', 8); person.needs.thirst = 60;
    for (let tick = 1; tick <= 10; tick++) sim.advanceJourneyTick([person.id], tick);
    expect(person.inventory.count('hazelnut')).toBe(8);
    expect(person.needs.thirst).toBeGreaterThanOrEqual(60);
  });

  it('ages fresh provisions in transit while shelf-stable food keeps, without enabling ordinary-world spoilage', () => {
    const { sim, person } = fixture();
    person.inventory.add('berries', 8); person.inventory.add('hazelnut', 8);
    for (let tick = 1; tick <= 1200; tick++) sim.advanceJourneyTick([person.id], tick);
    expect(person.inventory.count('berries')).toBe(5);
    expect(person.inventory.count('hazelnut')).toBe(8);
    expect(sim.config.needs.spoilRate).toBe(0);
  });

  it('preserves fractional spoilage across a JSON checkpoint between midnights', () => {
    const { sim, person } = fixture();
    person.inventory.add('berries', 7); person.inventory.add('hazelnut', 4);
    for (let tick = 1; tick <= 750; tick++) sim.advanceJourneyTick([person.id], tick);
    const resumed = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    for (let tick = 751; tick <= 1200; tick++) { sim.advanceJourneyTick([person.id], tick); resumed.advanceJourneyTick([person.id], tick); }
    // Compare the persisted form: JSON normalizes terrain fauna positions -0 to 0.
    expect(JSON.stringify(toCheckpointRecord(resumed))).toBe(JSON.stringify(toCheckpointRecord(sim)));
  });
});
