import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { warmthFrom } from '../knowledge/Tech.ts';
import { wornGarmentsOf } from '../../render/Renderer.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { availableActions } from '../ai/ActionCatalog.ts';

function fixture() {
  const sim = new Simulation({ seed: 'hide-loincloth', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 2 } });
  sim.possessFirst(); const person = sim.player!;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  return { sim, person };
}

describe('hide loincloth', () => {
  it('uses the clothing gate, a physical cutting tool and one hide in the ordinary craft executor', () => {
    const { sim, person } = fixture();
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.knownTech.add('clothing'); person.inventory.add('hide', 1); person.inventory.add('handaxe', 1);
    expect(sim.order(person, 'craft', { recipeId: 'hide_loincloth' })).toBe(true);
    for (let tick = 0; tick < 220 && person.inventory.count('hide_loincloth') === 0; tick++) sim.step();
    expect(person.inventory.count('hide_loincloth')).toBe(1);
    expect(person.inventory.count('hide')).toBe(0);
    expect(person.inventory.count('handaxe')).toBe(1);
  });

  it('hides the unknown recipe, explains its missing tool, and accepts the flint alternative', () => {
    const { sim, person } = fixture();
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('hide', 1);
    const target = { kind: 'ground' as const, x: person.x, y: person.y };
    const options = () => availableActions(person, target, { world: sim.world, nearWater: false });
    expect(options().some(option => option.recipeId === 'hide_loincloth')).toBe(false);

    person.knownTech.add('clothing');
    let option = options().find(candidate => candidate.recipeId === 'hide_loincloth');
    expect(option).toMatchObject({ enabled: false, reason: expect.stringContaining('tool') });
    expect(person.inventory.count('hide')).toBe(1);

    person.inventory.add('flint', 1);
    option = options().find(candidate => candidate.recipeId === 'hide_loincloth');
    expect(option?.enabled).toBe(true);
    expect(sim.order(person, 'craft', { recipeId: 'hide_loincloth' })).toBe(true);
    for (let tick = 0; tick < 220 && person.inventory.count('hide_loincloth') === 0; tick++) sim.step();
    expect(person.inventory.count('hide_loincloth')).toBe(1);
    expect(person.inventory.count('flint')).toBe(1);
  });

  it('warms only in the hip slot, composes with other body slots and restores through JSON', () => {
    const { sim, person } = fixture();
    person.inventory.add('hide_loincloth', 1); person.inventory.add('sewn_tunic', 1); person.inventory.add('foot_wraps', 1);
    expect(changeGarment(person, 'hide_loincloth', 'wear_garment')).toBeNull();
    expect(changeGarment(person, 'sewn_tunic', 'wear_garment')).toBeNull();
    expect(changeGarment(person, 'foot_wraps', 'wear_garment')).toBeNull();
    expect(warmthFrom(person)).toBeCloseTo(1 - 0.98 * 0.7 * 0.92);
    expect(wornGarmentsOf(person)).toMatchObject({ hips: 'hide_loincloth', torso: 'tunic', feet: 'wraps' });

    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(person.id)!;
    expect(restored.equipment.hips?.item).toBe('hide_loincloth');
    expect(wornGarmentsOf(restored).hips).toBe('hide_loincloth');
    expect(warmthFrom(restored)).toBeCloseTo(1 - 0.98 * 0.7 * 0.92);
    expect(changeGarment(restored, 'hide_loincloth', 'take_off_garment')).toBeNull();
    expect(restored.inventory.count('hide_loincloth')).toBe(1);
    expect(warmthFrom(restored)).toBeCloseTo(1 - 0.7 * 0.92);
  });

  it('does not warm or draw a stale hip reference whose item is not owned', () => {
    const { person } = fixture();
    person.equipment.hips = { item: 'hide_loincloth', count: 1 };
    expect(warmthFrom(person)).toBe(0);
    expect(wornGarmentsOf(person).hips).toBeUndefined();
  });
});
