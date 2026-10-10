import { describe, expect, it, vi } from 'vitest';
import { Brain } from '../ai/Brain.ts';
import { Inventory } from '../entities/Item.ts';
import { RECIPES, ingredientsFor, hasIngredients, missingIngredients } from '../entities/Recipe.ts';
import { Simulation } from '../core/Simulation.ts';
import { warmthFrom } from '../knowledge/Tech.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { wornGarmentsOf } from '../../render/Renderer.ts';

describe('hide cape and sewn tunic', () => {
  it('crafts a layer for cold and stops demand when its worn slot is already warm enough', () => {
    const sim = new Simulation({ seed: 'cape-demand', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 } });
    const person = sim.livingPeople()[0]!;
    person.action = 'idle'; person.order = null;
    person.knownTech.add('clothing');
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('hide', 2); person.inventory.add('rope', 1); person.inventory.add('handaxe', 1);
    const brain = (sim as unknown as { brain: Brain }).brain, score = brain.score.bind(brain);
    let checked = false;
    const spy = vi.spyOn(brain, 'score').mockImplementation((actor, ctx) => {
      if (actor !== person || checked) return score(actor, ctx);
      checked = true;
      expect(score(actor, ctx).found.recipe).not.toBe('hide_cape');
      person.needs.cold = 20;
      expect(score(actor, ctx).found.recipe).toBe('hide_cape');
      person.inventory.add('hide_cape', 1); person.equipment.cloak = { item: 'hide_cape', count: 1 };
      expect(score(actor, ctx).found.recipe).not.toBe('hide_cape');
      return score(actor, ctx);
    });
    try { for (let tick = 0; tick < 30 && !checked; tick++) sim.step(); expect(checked).toBe(true); }
    finally { spy.mockRestore(); }
  });

  it('requires a cutting tool or needle through the shared recipe preflight', () => {
    const inventory = new Inventory(); inventory.add('hide', 3); inventory.add('rope', 1);
    inventory.add('sinew', 2);
    expect(hasIngredients(inventory, RECIPES.hide_cape!)).toBe(false);
    expect(missingIngredients(inventory, RECIPES.hide_cape!)).toContain('tool');
    inventory.add('handaxe', 1);
    expect(ingredientsFor(RECIPES.hide_cape!, inventory)).toEqual({ hide: 2, rope: 1 });
    expect(hasIngredients(inventory, RECIPES.sewn_tunic!)).toBe(false);
    inventory.add('needle', 1);
    expect(ingredientsFor(RECIPES.sewn_tunic!, inventory)).toEqual({ hide: 3, sinew: 2 });
  });

  it('crafts a tunic while retaining its needle and consumes the material load once', () => {
    const sim = new Simulation({ seed: 'tunic-craft', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 } });
    sim.possessFirst(); const person = sim.player!;
    person.knownTech.add('tailoring'); person.skills.build = 100;
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('hide', 3); person.inventory.add('sinew', 2); person.inventory.add('needle', 1);
    person.needs.cold = person.needs.fatigue = 0;
    expect(sim.order(person, 'craft', { recipeId: 'sewn_tunic' })).toBe(true);
    for (let tick = 0; tick < 1000 && person.inventory.count('sewn_tunic') === 0; tick++) {
      person.needs.hunger = person.needs.thirst = 0; sim.step();
    }
    expect(person.inventory.count('sewn_tunic')).toBe(1);
    expect(person.inventory.count('needle')).toBe(1);
    expect(person.inventory.count('hide')).toBe(0);
    expect(person.inventory.count('sinew')).toBe(0);
  });

  it('combines a cloak and torso layer only when actually worn and draws their layers', () => {
    const person = new Simulation({ seed: 'cape-layers', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 } }).livingPeople()[0]!;
    person.inventory.add('hide_cape', 1); person.inventory.add('sewn_tunic', 1);
    expect(warmthFrom(person)).toBe(0); expect(wornGarmentsOf(person)).toEqual({ torso: undefined, cloak: undefined });
    expect(changeGarment(person, 'hide_cape', 'wear_garment')).toBeNull();
    expect(changeGarment(person, 'sewn_tunic', 'wear_garment')).toBeNull();
    expect(warmthFrom(person)).toBeCloseTo(1 - 0.75 * 0.70);
    expect(wornGarmentsOf(person)).toEqual({ torso: 'tunic', cloak: 'cloak' });
    person.inventory.remove('hide_cape', 1);
    expect(wornGarmentsOf(person).cloak).toBeUndefined();
  });
});
