import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { equipContainer } from '../core/Carry.ts';
import { reachableFrom, TECH, warmthFrom } from '../knowledge/Tech.ts';
import { wornGarmentsOf } from '../../render/Renderer.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { RECIPES, hasIngredients } from '../entities/Recipe.ts';

function fixture() {
  const sim = new Simulation({ seed: 'wool_cloak', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 2 } });
  sim.possessFirst(); const person = sim.player!;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  return { sim, person };
}

function resetCraftingInventory(person: ReturnType<typeof fixture>['person']) {
  for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
  delete person.equipment.left; delete person.equipment.right;
  delete person.equipment.back; delete person.equipment.belt; delete person.equipment.shoulder;
  person.carryContainerCapacity = 0;
  person.inventory.add('hide_bag', 1);
  expect(equipContainer(person, 'hide_bag')).toBe(true);
}

describe('wool_cloak', () => {
  it('makes two wool cloth the recipe cost', () => {
    const { person } = fixture();
    resetCraftingInventory(person);
    person.inventory.add('wool_cloth', 1);
    expect(hasIngredients(person.inventory, RECIPES.wool_cloak!)).toBe(false);
    person.inventory.add('wool_cloth', 1);
    expect(hasIngredients(person.inventory, RECIPES.wool_cloak!)).toBe(true);
    expect(RECIPES.wool_cloak!.ingredients).toEqual({ wool_cloth: 2 });
  });

  it('requires its own knowledge and crafts for exactly two wool cloth', () => {
    expect(TECH.wool_cloak!.requires).toContain('wool');
    expect(reachableFrom(new Set())).not.toContain('wool_cloak');
    expect(reachableFrom(new Set(['wool']))).toContain('wool_cloak');
    const { sim, person } = fixture();
    resetCraftingInventory(person);
    person.knownTech.delete('wool_cloak');
    person.inventory.add('wool_cloth', 2);
    expect(sim.order(person, 'craft', { recipeId: 'wool_cloak' })).toBe(true);
    sim.step();
    expect(person.inventory.count('wool_cloak')).toBe(0);
    expect(person.inventory.count('wool_cloth')).toBe(2);
    expect(person.action).not.toBe('craft');
    person.knownTech.add('wool_cloak');
    expect(sim.order(person, 'craft', { recipeId: 'wool_cloak' })).toBe(true);
    for (let tick = 0; tick < 1200 && !person.inventory.count('wool_cloak'); tick++) {
      person.needs.hunger = person.needs.thirst = person.needs.fatigue = 0;
      sim.step();
    }
    expect(person.inventory.count('wool_cloak')).toBe(1);
    expect(person.inventory.count('wool_cloth')).toBe(0);
    expect(warmthFrom(person)).toBe(0);
  });

  it('replaces a hide cape in the cloak slot without stacking warmth', () => {
    const { person } = fixture();
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('hide_cape', 1); person.inventory.add('wool_cloak', 1);
    expect(changeGarment(person, 'hide_cape', 'wear_garment')).toBeNull();
    expect(warmthFrom(person)).toBeCloseTo(0.25);
    expect(changeGarment(person, 'wool_cloak', 'wear_garment')).toBeNull();
    expect(person.equipment.cloak?.item).toBe('wool_cloak');
    expect(person.inventory.count('hide_cape')).toBe(1);
    expect(warmthFrom(person)).toBeCloseTo(0.35);
    expect(wornGarmentsOf(person).cloak).toBe('wool_cloak');
  });

  it('does not warm from a packed cloak or a stale equipment reference', () => {
    const { person } = fixture();
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('wool_cloak', 1);
    expect(warmthFrom(person)).toBe(0);
    changeGarment(person, 'wool_cloak', 'wear_garment');
    person.inventory.remove('wool_cloak', 1);
    expect(warmthFrom(person)).toBe(0);
    expect(wornGarmentsOf(person).cloak).toBeUndefined();
  });

  it('preserves the equipped cloak and individual knowledge through JSON', () => {
    const { sim, person } = fixture();
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('wool_cloak', 1); person.knownTech.add('wool_cloak');
    changeGarment(person, 'wool_cloak', 'wear_garment');
    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(person.id)!;
    expect(restored.knownTech.has('wool_cloak')).toBe(true);
    expect(warmthFrom(restored)).toBeCloseTo(0.35);
    expect(wornGarmentsOf(restored).cloak).toBe('wool_cloak');
    expect(changeGarment(restored, 'wool_cloak', 'take_off_garment')).toBeNull();
    expect(restored.inventory.count('wool_cloak')).toBe(1);
    expect(warmthFrom(restored)).toBe(0);
  });
});
