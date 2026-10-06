import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { createFrontier } from '../../../tools/frontierFixture.ts';

const config = { seed: 'milk-mode', world: { width: 64, height: 48 },
  population: { bands: 1, peoplePerBand: 4 } };

function meal(sim: Simulation) {
  const person = sim.livingPeople().find(p => !p.isChild)!;
  person.inventory.add('milk', 1);
  person.needs.hunger = 40; person.needs.thirst = 30;
  return person;
}

describe('food hydration through live world consumers', () => {
  it('keeps classic milk nutrition unchanged and hydrates continental milk through the UI consumer', () => {
    const classic = new Simulation(config), continental = createFrontier(config);
    const old = meal(classic), fresh = meal(continental);
    expect(classic.eatItem(old, 'milk')).toBe(true);
    expect(continental.eatItem(fresh, 'milk')).toBe(true);
    expect(old.needs.thirst).toBe(30); expect(fresh.needs.thirst).toBe(25);
    expect(old.needs.hunger).toBe(20); expect(fresh.needs.hunger).toBe(20);
  });

  it('retains the continental food policy across a JSON checkpoint and an actual eat order', () => {
    const original = createFrontier(config);
    const person = meal(original);
    const restored = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(original))));
    const eater = restored.peopleById.get(person.id)!;
    expect(original.order(person, 'eat')).toBe(true);
    expect(restored.order(eater, 'eat')).toBe(true);
    for (let tick = 0; tick < 10 && person.inventory.has('milk'); tick++) { original.step(); restored.step(); }
    expect(person.inventory.has('milk')).toBe(false);
    expect(person.needs.thirst).toBeLessThan(30);
    // JSON normalizes negative zero; compare the actual persisted states.
    expect(JSON.parse(JSON.stringify(toCheckpointRecord(restored))))
      .toEqual(JSON.parse(JSON.stringify(toCheckpointRecord(original))));
  });
});
