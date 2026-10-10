import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { warmthFrom, TECH } from '../knowledge/Tech.ts';
import { wornGarmentsOf } from '../../render/Renderer.ts';
import { RECIPES, hasIngredients } from '../entities/Recipe.ts';
import { ITEMS } from '../entities/Item.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

function fixture() {
  const sim = new Simulation({ seed: 'toggled_coat', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 2 } });
  sim.possessFirst(); const person = sim.player!;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
  return { sim, person };
}

describe('toggled_coat', () => {
  it('is gated on tailoring and bone working and costs one coat plus two bones', () => {
    expect(TECH.toggles!.requires).toEqual(['tailoring', 'bone_working']);
    expect(TECH.toggles!.tier).toBe('craft');
    expect(RECIPES.toggled_coat!.ingredients).toEqual({ fur_coat: 1, bone: 2 });
    expect(ITEMS.toggled_coat!.garment).toEqual({ slot: 'torso', warmth: 0.48 });
    const { person } = fixture();
    person.inventory.add('fur_coat', 1); person.inventory.add('bone', 2);
    expect(hasIngredients(person.inventory, RECIPES.toggled_coat!)).toBe(true);
    person.inventory.remove('bone', 1);
    expect(hasIngredients(person.inventory, RECIPES.toggled_coat!)).toBe(false);
  });

  it('crafts the toggled coat through the ordinary executor and spends exactly the listed materials', () => {
    const { sim, person } = fixture();
    person.inventory.add('fur_coat', 1); person.inventory.add('bone', 2);
    person.knownTech.add('tailoring'); person.knownTech.add('bone_working');
    expect(sim.order(person, 'craft', { recipeId: 'toggled_coat' })).toBe(true);
    sim.step();
    expect(person.inventory.count('fur_coat')).toBe(1);
    expect(person.inventory.count('bone')).toBe(2);
    expect(person.action).not.toBe('craft');
    person.knownTech.add('toggles');
    expect(sim.order(person, 'craft', { recipeId: 'toggled_coat' })).toBe(true);
    for (let tick = 0; tick < 500 && !person.inventory.count('toggled_coat'); tick++) {
      person.needs.hunger = person.needs.thirst = person.needs.fatigue = 0;
      sim.step();
    }
    expect(person.inventory.count('toggled_coat')).toBe(1);
    expect(person.inventory.count('fur_coat')).toBe(0);
    expect(person.inventory.count('bone')).toBe(0);
  });

  it('warms only in the torso slot while owned and worn', () => {
    const { person } = fixture();
    person.inventory.add('toggled_coat', 1);
    expect(warmthFrom(person)).toBe(0);
    expect(changeGarment(person, 'toggled_coat', 'wear_garment')).toBeNull();
    expect(warmthFrom(person)).toBeCloseTo(0.48);
    expect(wornGarmentsOf(person).torso).toBe('toggled_coat');
    person.inventory.remove('toggled_coat', 1);
    expect(warmthFrom(person)).toBe(0);
    expect(wornGarmentsOf(person).torso).toBeUndefined();
  });

  it('preserves the worn coat and technology through checkpoint JSON', () => {
    const { sim, person } = fixture();
    person.inventory.add('toggled_coat', 1); person.knownTech.add('toggles');
    expect(changeGarment(person, 'toggled_coat', 'wear_garment')).toBeNull();
    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(person.id)!;
    expect(restored.knownTech.has('toggles')).toBe(true);
    expect(wornGarmentsOf(restored).torso).toBe('toggled_coat');
    expect(warmthFrom(restored)).toBeCloseTo(0.48);
  });
});
