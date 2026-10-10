import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { warmthFrom } from '../knowledge/Tech.ts';
import { wornGarmentsOf } from '../../render/Renderer.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { RECIPES, hasIngredients } from '../entities/Recipe.ts';

function fixture() {
  const sim = new Simulation({ seed: 'leggings', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 2 } });
  sim.possessFirst(); const person = sim.player!;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  return { sim, person };
}
describe('leggings', () => {
  it('requires a needle without consuming it as an ingredient', () => {
    const { person } = fixture();
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('hide', 2); person.inventory.add('sinew', 1);
    expect(hasIngredients(person.inventory, RECIPES.leggings!)).toBe(false);
    person.inventory.add('needle', 1);
    expect(hasIngredients(person.inventory, RECIPES.leggings!)).toBe(true);
    expect(RECIPES.leggings!.ingredients).not.toHaveProperty('needle');
  });
  it('crafts through the normal executor with individual knowledge and exact material cost', () => {
    const { sim, person } = fixture();
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('hide', 2); person.inventory.add('sinew', 1); person.inventory.add('needle', 1);
    // Orders can be accepted before executor preflight; the first real step
    // refuses unknown techniques without consuming the supplied materials.
    expect(sim.order(person, 'craft', { recipeId: 'leggings' })).toBe(true);
    sim.step();
    expect(person.inventory.count('leggings')).toBe(0);
    expect(person.inventory.count('hide')).toBe(2); expect(person.inventory.count('sinew')).toBe(1);
    expect(person.action).not.toBe('craft');
    person.knownTech.add('leggings');
    expect(sim.order(person, 'craft', { recipeId: 'leggings' })).toBe(true);
    // Isolate the sewing executor from a novice's need-driven interruptions.
    for (let tick = 0; tick < 1000 && !person.inventory.count('leggings'); tick++) {
      person.needs.hunger = person.needs.thirst = person.needs.fatigue = 0;
      sim.step();
    }
    expect(person.inventory.count('leggings')).toBe(1); expect(person.inventory.count('needle')).toBe(1);
    expect(person.inventory.count('hide')).toBe(0); expect(person.inventory.count('sinew')).toBe(0);
    expect(warmthFrom(person)).toBe(0);
  });
  it('uses an independent legs slot for warmth and appearance; spare or stale references do neither', () => {
    const { person } = fixture();
    person.inventory.add('leggings', 1); person.inventory.add('sewn_tunic', 1);
    expect(warmthFrom(person)).toBe(0); expect(wornGarmentsOf(person).legs).toBeUndefined();
    expect(changeGarment(person, 'sewn_tunic', 'wear_garment')).toBeNull();
    expect(changeGarment(person, 'leggings', 'wear_garment')).toBeNull();
    expect(warmthFrom(person)).toBeCloseTo(1 - 0.7 * 0.85);
    expect(wornGarmentsOf(person)).toMatchObject({ torso: 'tunic', legs: 'trousers' });
    person.inventory.remove('leggings', 1);
    expect(warmthFrom(person)).toBeCloseTo(0.30); expect(wornGarmentsOf(person).legs).toBeUndefined();
  });
  it('preserves the equipped legs and individual knowledge through JSON, then takes them off', () => {
    const { sim, person } = fixture();
    person.inventory.add('leggings', 1); person.knownTech.add('leggings');
    changeGarment(person, 'leggings', 'wear_garment');
    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(person.id)!;
    expect(restored.knownTech.has('leggings')).toBe(true);
    expect(warmthFrom(restored)).toBeCloseTo(0.15); expect(wornGarmentsOf(restored).legs).toBe('trousers');
    expect(changeGarment(restored, 'leggings', 'take_off_garment')).toBeNull();
    expect(restored.inventory.count('leggings')).toBe(1); expect(warmthFrom(restored)).toBe(0);
  });
});
