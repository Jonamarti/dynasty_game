import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { warmthFrom } from '../knowledge/Tech.ts';
import { wornGarmentsOf } from '../../render/Renderer.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { RECIPES, hasIngredients } from '../entities/Recipe.ts';

function fixture() {
  const sim = new Simulation({ seed: 'fur_hat', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 2 } });
  sim.possessFirst(); const person = sim.player!;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  return { sim, person };
}
describe('fur_hat', () => {
  it('requires a needle without consuming it as an ingredient', () => {
    const { person } = fixture();
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('hide', 1);
    expect(hasIngredients(person.inventory, RECIPES.fur_hat!)).toBe(false);
    person.inventory.add('needle', 1);
    expect(hasIngredients(person.inventory, RECIPES.fur_hat!)).toBe(true);
    expect(RECIPES.fur_hat!.ingredients).not.toHaveProperty('needle');
  });
  it('crafts through the normal executor with individual knowledge and exact material cost', () => {
    const { sim, person } = fixture();
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('hide', 1); person.inventory.add('needle', 1);
    // Orders can be accepted before executor preflight; the first real step
    // refuses unknown techniques without consuming the supplied materials.
    expect(sim.order(person, 'craft', { recipeId: 'fur_hat' })).toBe(true);
    sim.step();
    expect(person.inventory.count('fur_hat')).toBe(0);
    expect(person.inventory.count('hide')).toBe(1);
    expect(person.action).not.toBe('craft');
    person.knownTech.add('fur_hat');
    expect(sim.order(person, 'craft', { recipeId: 'fur_hat' })).toBe(true);
    // Isolate the sewing executor from a novice's need-driven interruptions.
    for (let tick = 0; tick < 1000 && !person.inventory.count('fur_hat'); tick++) {
      person.needs.hunger = person.needs.thirst = person.needs.fatigue = 0;
      sim.step();
    }
    expect(person.inventory.count('fur_hat')).toBe(1); expect(person.inventory.count('needle')).toBe(1);
    expect(person.inventory.count('hide')).toBe(0);
    expect(warmthFrom(person)).toBe(0);
  });
  it('uses an independent head slot for warmth and appearance; spare or stale references do neither', () => {
    const { person } = fixture();
    person.inventory.add('fur_hat', 1); person.inventory.add('sewn_tunic', 1);
    expect(warmthFrom(person)).toBe(0); expect(wornGarmentsOf(person).head).toBeUndefined();
    expect(changeGarment(person, 'sewn_tunic', 'wear_garment')).toBeNull();
    expect(changeGarment(person, 'fur_hat', 'wear_garment')).toBeNull();
    expect(warmthFrom(person)).toBeCloseTo(1 - 0.7 * 0.90);
    expect(wornGarmentsOf(person)).toMatchObject({ torso: 'tunic', head: 'cap' });
    person.inventory.remove('fur_hat', 1);
    expect(warmthFrom(person)).toBeCloseTo(0.30); expect(wornGarmentsOf(person).head).toBeUndefined();
  });
  it('preserves the equipped head and individual knowledge through JSON, then takes them off', () => {
    const { sim, person } = fixture();
    person.inventory.add('fur_hat', 1); person.knownTech.add('fur_hat');
    changeGarment(person, 'fur_hat', 'wear_garment');
    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(person.id)!;
    expect(restored.knownTech.has('fur_hat')).toBe(true);
    expect(warmthFrom(restored)).toBeCloseTo(0.10); expect(wornGarmentsOf(restored).head).toBe('cap');
    expect(changeGarment(restored, 'fur_hat', 'take_off_garment')).toBeNull();
    expect(restored.inventory.count('fur_hat')).toBe(1); expect(warmthFrom(restored)).toBe(0);
  });
});
