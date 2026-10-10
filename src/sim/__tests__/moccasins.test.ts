import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { warmthFrom } from '../knowledge/Tech.ts';
import { wornGarmentsOf } from '../../render/Renderer.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { RECIPES, hasIngredients } from '../entities/Recipe.ts';

function fixture() {
  const sim = new Simulation({ seed: 'moccasins', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 2 } });
  sim.possessFirst(); const person = sim.player!;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  return { sim, person };
}
describe('moccasins', () => {
  it('replaces wraps in the same slot without stacking their warmth or consuming them', () => {
    const { person } = fixture();
    person.inventory.add('foot_wraps', 1); person.inventory.add('moccasins', 1);
    expect(changeGarment(person, 'foot_wraps', 'wear_garment')).toBeNull();
    expect(warmthFrom(person)).toBeCloseTo(0.08);
    expect(changeGarment(person, 'moccasins', 'wear_garment')).toBeNull();
    expect(person.equipment.feet?.item).toBe('moccasins');
    expect(warmthFrom(person)).toBeCloseTo(0.12);
    expect(person.inventory.count('foot_wraps')).toBe(1);
    expect(wornGarmentsOf(person).feet).toBe('boots');
  });
  it('requires a needle without consuming it as an ingredient', () => {
    const { person } = fixture();
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('hide', 1); person.inventory.add('sinew', 1);
    expect(hasIngredients(person.inventory, RECIPES.moccasins!)).toBe(false);
    person.inventory.add('needle', 1);
    expect(hasIngredients(person.inventory, RECIPES.moccasins!)).toBe(true);
    expect(RECIPES.moccasins!.ingredients).not.toHaveProperty('needle');
  });
  it('crafts through the normal executor with individual knowledge and exact material cost', () => {
    const { sim, person } = fixture();
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('hide', 1); person.inventory.add('sinew', 1); person.inventory.add('needle', 1);
    // Orders can be accepted before executor preflight; the first real step
    // refuses unknown techniques without consuming the supplied materials.
    expect(sim.order(person, 'craft', { recipeId: 'moccasins' })).toBe(true);
    sim.step();
    expect(person.inventory.count('moccasins')).toBe(0);
    expect(person.inventory.count('hide')).toBe(1); expect(person.inventory.count('sinew')).toBe(1);
    expect(person.action).not.toBe('craft');
    person.knownTech.add('moccasins');
    expect(sim.order(person, 'craft', { recipeId: 'moccasins' })).toBe(true);
    // Isolate the sewing executor from a novice's need-driven interruptions.
    for (let tick = 0; tick < 1000 && !person.inventory.count('moccasins'); tick++) {
      person.needs.hunger = person.needs.thirst = person.needs.fatigue = 0;
      sim.step();
    }
    expect(person.inventory.count('moccasins')).toBe(1); expect(person.inventory.count('needle')).toBe(1);
    expect(person.inventory.count('hide')).toBe(0); expect(person.inventory.count('sinew')).toBe(0);
    expect(warmthFrom(person)).toBe(0);
  });
  it('uses an independent feet slot for warmth and appearance; spare or stale references do neither', () => {
    const { person } = fixture();
    person.inventory.add('moccasins', 1); person.inventory.add('sewn_tunic', 1);
    expect(warmthFrom(person)).toBe(0); expect(wornGarmentsOf(person).feet).toBeUndefined();
    expect(changeGarment(person, 'sewn_tunic', 'wear_garment')).toBeNull();
    expect(changeGarment(person, 'moccasins', 'wear_garment')).toBeNull();
    expect(warmthFrom(person)).toBeCloseTo(1 - 0.7 * 0.88);
    expect(wornGarmentsOf(person)).toMatchObject({ torso: 'tunic', feet: 'boots' });
    person.inventory.remove('moccasins', 1);
    expect(warmthFrom(person)).toBeCloseTo(0.30); expect(wornGarmentsOf(person).feet).toBeUndefined();
  });
  it('preserves the equipped feet and individual knowledge through JSON, then takes them off', () => {
    const { sim, person } = fixture();
    person.inventory.add('moccasins', 1); person.knownTech.add('moccasins');
    changeGarment(person, 'moccasins', 'wear_garment');
    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(person.id)!;
    expect(restored.knownTech.has('moccasins')).toBe(true);
    expect(warmthFrom(restored)).toBeCloseTo(0.12); expect(wornGarmentsOf(restored).feet).toBe('boots');
    expect(changeGarment(restored, 'moccasins', 'take_off_garment')).toBeNull();
    expect(restored.inventory.count('moccasins')).toBe(1); expect(warmthFrom(restored)).toBe(0);
  });
});
