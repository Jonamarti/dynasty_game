import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { TECH, warmthFrom } from '../knowledge/Tech.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { wornGarmentsOf } from '../../render/Renderer.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { availableActions } from '../ai/ActionCatalog.ts';

function fixture() {
  const sim = new Simulation({ seed: 'fibre-skirt', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 2 } });
  sim.possessFirst(); const person = sim.player!;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
  return { sim, person };
}

describe('fibre skirt', () => {
  it('is the cordage and clothing craft node for a three-thatch hip garment', () => {
    expect(TECH.fibre_skirt).toMatchObject({ tier: 'craft', web: 'clothing', requires: ['clothing', 'cordage'] });
    expect(RECIPES.fibre_skirt).toMatchObject({ tech: 'fibre_skirt', ingredients: { thatch: 3 }, output: { fibre_skirt: 1 } });
    expect(ITEMS.fibre_skirt.garment).toEqual({ slot: 'hips', warmth: 0.03, wearPerDay: 0.005 });
  });

  it('is gated by its own clothing-web node and crafts three thatch without consuming a tool', () => {
    const { sim, person } = fixture();
    person.inventory.add('thatch', 3);
    const target = { kind: 'ground' as const, x: person.x, y: person.y };
    const options = () => availableActions(person, target, { world: sim.world, nearWater: false });
    expect(options().some(option => option.recipeId === 'fibre_skirt')).toBe(false);

    person.knownTech.add('fibre_skirt');
    expect(options().find(option => option.recipeId === 'fibre_skirt')?.enabled).toBe(true);
    expect(sim.order(person, 'craft', { recipeId: 'fibre_skirt' })).toBe(true);
    for (let tick = 0; tick < 220 && person.inventory.count('fibre_skirt') === 0; tick++) sim.step();
    expect(person.inventory.count('fibre_skirt')).toBe(1);
    expect(person.inventory.count('thatch')).toBe(0);
  });

  it('warms only when worn in hips, replaces the loincloth, and survives JSON restoration', () => {
    const { sim, person } = fixture();
    person.inventory.add('hide_loincloth', 1);
    expect(changeGarment(person, 'hide_loincloth', 'wear_garment')).toBeNull();
    expect(warmthFrom(person)).toBeCloseTo(0.02);
    person.inventory.add('fibre_skirt', 1);
    expect(warmthFrom(person)).toBeCloseTo(0.02);
    expect(changeGarment(person, 'fibre_skirt', 'wear_garment')).toBeNull();
    expect(person.equipment.hips?.item).toBe('fibre_skirt');
    expect(person.inventory.count('hide_loincloth')).toBe(1);
    expect(person.inventory.count('fibre_skirt')).toBe(1);
    expect(warmthFrom(person)).toBeCloseTo(0.03);
    expect(wornGarmentsOf(person).hips).toBe('fibre_skirt');

    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.peopleById.get(person.id)!;
    expect(restored.equipment.hips?.item).toBe('fibre_skirt');
    expect(wornGarmentsOf(restored).hips).toBe('fibre_skirt');
    expect(warmthFrom(restored)).toBeCloseTo(0.03);
    expect(changeGarment(restored, 'fibre_skirt', 'take_off_garment')).toBeNull();
    expect(restored.inventory.count('fibre_skirt')).toBe(1);
    expect(warmthFrom(restored)).toBe(0);
  });

  it('does not warm or draw a stale hip reference without inventory ownership', () => {
    const { person } = fixture();
    person.equipment.hips = { item: 'fibre_skirt', count: 1 };
    expect(warmthFrom(person)).toBe(0);
    expect(wornGarmentsOf(person).hips).toBeUndefined();
  });
});
