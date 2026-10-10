import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { warmthFrom } from '../knowledge/Tech.ts';
import { wornGarmentsOf } from '../../render/Renderer.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { RECIPES, hasIngredients } from '../entities/Recipe.ts';
import { equipContainer } from '../core/Carry.ts';

function resetCraftingInventory(person: ReturnType<typeof fixture>['person']) {
  for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
  // Remove stale equipment references left by clearing the fixture inventory,
  // then equip a real hide bag so the material stack fits ordinary carry rules.
  delete person.equipment.left; delete person.equipment.right;
  delete person.equipment.back; delete person.equipment.belt;
  delete person.equipment.shoulder;
  person.carryContainerCapacity = 0;
  person.inventory.add('hide_bag', 1);
  expect(equipContainer(person, 'hide_bag')).toBe(true);
}

function fixture() {
  const sim = new Simulation({ seed: 'linen_tunic', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 2 } });
  sim.possessFirst(); const person = sim.player!;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  return { sim, person };
}

describe('linen_tunic', () => {
  it('follows weaving and requires a retained needle alongside cloth and thread', () => {
    const { person } = fixture();
    resetCraftingInventory(person);
    person.inventory.add('cloth', 2); person.inventory.add('thread', 1);
    expect(hasIngredients(person.inventory, RECIPES.linen_tunic!)).toBe(false);
    person.inventory.add('needle', 1);
    expect(hasIngredients(person.inventory, RECIPES.linen_tunic!)).toBe(true);
    expect(RECIPES.linen_tunic!.ingredients).toEqual({ cloth: 2, thread: 1 });
    expect(RECIPES.linen_tunic!.toolOptions).toContain('needle');
  });

  it('crafts through the normal executor for a person who knows it, retaining the needle', () => {
    const { sim, person } = fixture();
    resetCraftingInventory(person);
    person.inventory.add('cloth', 2); person.inventory.add('thread', 1); person.inventory.add('needle', 1);
    person.knownTech.delete('linen_tunic');
    expect(sim.order(person, 'craft', { recipeId: 'linen_tunic' })).toBe(true);
    sim.step();
    expect(person.inventory.count('linen_tunic')).toBe(0);
    expect(person.action).not.toBe('craft');
    resetCraftingInventory(person);
    person.inventory.add('cloth', 2); person.inventory.add('thread', 1);
    person.knownTech.add('linen_tunic');
    expect(sim.order(person, 'craft', { recipeId: 'linen_tunic' })).toBe(true);
    sim.step();
    expect(person.inventory.count('linen_tunic')).toBe(0);
    expect(person.action).not.toBe('craft');
    person.inventory.add('needle', 1);
    expect(sim.order(person, 'craft', { recipeId: 'linen_tunic' })).toBe(true);
    for (let tick = 0; tick < 1000 && !person.inventory.count('linen_tunic'); tick++) {
      person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
      sim.step();
    }
    expect(person.inventory.count('linen_tunic')).toBe(1);
    expect(person.inventory.count('needle')).toBe(1);
    expect(person.inventory.count('cloth')).toBe(0);
    expect(person.inventory.count('thread')).toBe(0);
  });

  it('warms the torso only while worn and preserves ownership and equipment in a checkpoint', () => {
    const { sim, person } = fixture();
    person.inventory.add('linen_tunic', 1); person.knownTech.add('linen_tunic');
    person.inventory.add('sewn_tunic', 1);
    expect(warmthFrom(person)).toBe(0);
    expect(changeGarment(person, 'sewn_tunic', 'wear_garment')).toBeNull();
    expect(warmthFrom(person)).toBeCloseTo(0.30);
    expect(changeGarment(person, 'linen_tunic', 'wear_garment')).toBeNull();
    expect(warmthFrom(person)).toBeCloseTo(0.20);
    expect(wornGarmentsOf(person).torso).toBe('linen_tunic');
    expect(person.inventory.count('sewn_tunic')).toBe(1);

    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(person.id)!;
    expect(restored.knownTech.has('linen_tunic')).toBe(true);
    expect(wornGarmentsOf(restored).torso).toBe('linen_tunic');
    expect(warmthFrom(restored)).toBeCloseTo(0.20);
    expect(changeGarment(restored, 'linen_tunic', 'take_off_garment')).toBeNull();
    expect(restored.inventory.count('linen_tunic')).toBe(1);
    expect(warmthFrom(restored)).toBe(0);
  });
});
