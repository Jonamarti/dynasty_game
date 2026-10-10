import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { makeConfig, DEFAULT_CONFIG } from '../core/Config.ts';
import { changeGarment, manualEquipRefusal, manualGarmentRefusal } from '../core/ToolEquipment.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { protectionOf, warmthFrom } from '../knowledge/Tech.ts';
import { lastScores } from '../ai/Brain.ts';
import { wornGarmentsOf } from '../../render/Renderer.ts';
import { itemActions } from '../ai/ActionCatalog.ts';

function person(): Person {
  const result = new Person('Clothes wearer', 8, 8, 0, new RNG('clothes-wearer'));
  result.age = 30 * 80;
  return result;
}

describe('M15 phase 14a: wearable garments', () => {
  it('clears a worn layer immediately when its last copy is given away', () => {
    const sim = new Simulation({ seed: 'give-worn-coat', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
    const [giver, receiver] = sim.livingPeople();
    giver!.inventory.add('fur_coat', 1);
    expect(changeGarment(giver!, 'fur_coat', 'wear_garment')).toBeNull();
    expect(sim.handOver(giver!, receiver!, 'fur_coat', 1)).toBe(1);
    expect(giver!.equipment.torso).toBeUndefined();
    expect(receiver!.inventory.count('fur_coat')).toBe(1);
    expect(receiver!.equipment.torso).toBeUndefined();
  });
  it('does not count a coat in the wrong body slot as warmth', () => {
    const wearer = person();
    wearer.inventory.add('fur_coat', 1);
    wearer.equipment.feet = { item: 'fur_coat', count: 1 };
    expect(warmthFrom(wearer)).toBe(0);
  });
  it('keeps garments in inventory while moving them between body slots', () => {
    const wearer = person();
    wearer.inventory.add('fur_coat', 1);
    wearer.inventory.add('hide_armour', 1);

    expect(changeGarment(wearer, 'fur_coat', 'wear_garment')).toBeNull();
    expect(wearer.equipment.torso).toMatchObject({ item: 'fur_coat' });
    expect(wearer.inventory.count('fur_coat')).toBe(1);

    expect(changeGarment(wearer, 'hide_armour', 'wear_garment')).toBeNull();
    expect(wearer.equipment.torso?.item).toBe('hide_armour');
    expect(wearer.inventory.count('fur_coat')).toBe(1);
    expect(wearer.inventory.count('hide_armour')).toBe(1);
    expect(changeGarment(wearer, 'hide_armour', 'take_off_garment')).toBeNull();
    expect(wearer.equipment.torso).toBeUndefined();
    expect(wearer.inventory.count('hide_armour')).toBe(1);
  });

  it('refuses missing, mismatched, duplicate and baby clothing atomically', () => {
    const wearer = person();
    expect(manualGarmentRefusal(wearer, 'fur_coat', 'wear_garment')).toBe('garment_not_owned');
    wearer.inventory.add('fur_coat', 1);
    expect(manualGarmentRefusal(wearer, 'fur_coat', 'take_off_garment')).toBe('garment_not_worn');
    expect(changeGarment(wearer, 'fur_coat', 'wear_garment')).toBeNull();
    expect(manualGarmentRefusal(wearer, 'fur_coat', 'wear_garment')).toBe('garment_already_worn');
    const baby = person();
    baby.age = 0;
    baby.inventory.add('fur_coat', 1);
    expect(manualGarmentRefusal(baby, 'fur_coat', 'wear_garment')).toBe('too_young_to_wear');
    expect(baby.equipment.torso).toBeUndefined();
  });

  it('shows Wear or Take off from the same live Kit state', () => {
    const wearer = person();
    wearer.inventory.add('fur_coat', 1);
    const optionsBefore = itemActions(wearer, 'fur_coat', 0, null, null);
    expect(optionsBefore.find(option => option.id === 'wear_garment')?.enabled).toBe(true);
    expect(optionsBefore.find(option => option.id === 'equip_left')?.enabled).toBe(false);
    changeGarment(wearer, 'fur_coat', 'wear_garment');
    const optionsAfter = itemActions(wearer, 'fur_coat', 0, null, null);
    expect(optionsAfter.find(option => option.id === 'take_off_garment')?.enabled).toBe(true);
    expect(optionsAfter.find(option => option.id === 'wear_garment')).toBeUndefined();
    expect(manualEquipRefusal(wearer, 'fur_coat', 'left')).toBe('wrong_slot');
    expect(manualEquipRefusal(wearer, 'fur_coat', 'back')).toBe('wrong_slot');
  });

  it('warms only from fitted layers, never from cloth or knowledge alone', () => {
    const bare = person();
    const knowing = person();
    knowing.knownTech.add('clothing');
    knowing.knownTech.add('tailoring');
    const carrying = person();
    carrying.inventory.add('fur_coat', 1);
    carrying.inventory.add('cloth', 2);
    carrying.inventory.add('wool_cloth', 1);
    const wearing = person();
    wearing.inventory.add('fur_coat', 1);
    wearing.equipment.torso = { item: 'fur_coat', count: 1 };

    expect(warmthFrom(knowing)).toBe(warmthFrom(bare));
    expect(warmthFrom(carrying)).toBe(warmthFrom(bare));
    expect(warmthFrom(wearing)).toBeCloseTo(0.4);
    wearing.equipment.torso = undefined;
    expect(warmthFrom(wearing)).toBe(warmthFrom(bare));
  });

  it('counts garment armour only while its owned layer is worn', () => {
    const wearer = person();
    wearer.inventory.add('hide_armour', 1);
    expect(protectionOf(wearer, 'torso')).toBe(0);
    wearer.equipment.torso = { item: 'hide_armour', count: 1 };
    expect(protectionOf(wearer, 'torso')).toBe(0.5);
    wearer.equipment.torso = undefined;
    expect(protectionOf(wearer, 'torso')).toBe(0);
  });

  it('clears warmth, armour and visible clothing when the last copy is dropped', () => {
    const sim = new Simulation({
      seed: 'drop-clothing',
      world: { width: 48, height: 48, berryBushes: 12, flintOutcrops: 4, deadwood: 8, gameHerds: 2 },
      population: { bands: 1, peoplePerBand: 4 },
    });
    const wearer = sim.livingPeople()[0]!;
    const warmthWithoutCoat = warmthFrom(wearer);
    const armourWithoutCoat = protectionOf(wearer, 'torso');
    wearer.inventory.add('hide_armour', 1);
    wearer.equipment.torso = { item: 'hide_armour', count: 1 };
    expect(protectionOf(wearer, 'torso')).toBeGreaterThan(armourWithoutCoat);
    expect(warmthFrom(wearer)).toBeGreaterThan(warmthWithoutCoat);
    sim.drop(wearer, 'hide_armour', 1);
    expect(wearer.equipment.torso).toBeUndefined();
    expect(protectionOf(wearer, 'torso')).toBe(armourWithoutCoat);
    expect(warmthFrom(wearer)).toBe(warmthWithoutCoat);
    expect(wornGarmentsOf(wearer).torso).toBeUndefined();
    expect(sim.piles.some(pile => pile.contents.count('hide_armour') === 1)).toBe(true);
  });

  it('draws only a garment slot as visible clothing, never a packed coat', () => {
    const wearer = person();
    wearer.inventory.add('fur_coat', 1);
    expect(wornGarmentsOf(wearer).torso).toBeUndefined();
    wearer.equipment.torso = { item: 'fur_coat', count: 1 };
    expect(wornGarmentsOf(wearer).torso).toBe('fur_coat');
    wearer.inventory.remove('fur_coat', 1);
    expect(wornGarmentsOf(wearer).torso).toBeUndefined();
    wearer.equipment.torso = { item: 'handaxe', count: 1 };
    expect(wornGarmentsOf(wearer).torso).toBeUndefined();
  });

  it('uses the Kit order timer and leaves a removed garment in inventory', () => {
    const sim = new Simulation({
      seed: 'manual-clothing',
      world: { width: 48, height: 48, berryBushes: 12, flintOutcrops: 4, deadwood: 8, gameHerds: 2 },
      population: { bands: 1, peoplePerBand: 4 },
    });
    const wearer = sim.livingPeople()[0]!;
    wearer.isPlayer = true;
    wearer.inventory.add('fur_coat', 1);
    expect(sim.order(wearer, 'wear_garment', { itemId: 'fur_coat' })).toBe(true);
    for (let i = 0; i < DEFAULT_CONFIG.carry.equipTicks - 1; i++) {
      sim.step();
      expect(wearer.equipment.torso).toBeUndefined();
    }
    sim.step();
    expect(wearer.equipment.torso?.item).toBe('fur_coat');
    expect(wearer.inventory.count('fur_coat')).toBe(1);

    expect(sim.order(wearer, 'take_off_garment', { itemId: 'fur_coat' })).toBe(true);
    for (let i = 0; i < DEFAULT_CONFIG.carry.equipTicks; i++) sim.step();
    expect(wearer.equipment.torso).toBeUndefined();
    expect(wearer.inventory.count('fur_coat')).toBe(1);
  });

  it('lets the autonomous scorer wear a carried coat for cold without an order', () => {
    const sim = new Simulation(makeConfig({
      seed: 'npc-clothing',
      world: { width: 48, height: 48, berryBushes: 0, flintOutcrops: 0, deadwood: 0, gameHerds: 0 },
      population: { bands: 1, peoplePerBand: 2 },
    }));
    const wearer = sim.livingPeople().find(candidate => !candidate.isPlayer)!;
    wearer.age = 30 * wearer.daysPerYear;
    wearer.inventory.add('fur_coat', 1);
    wearer.needs = { hunger: 0, thirst: 0, fatigue: 0, cold: 95, company: 0 };
    wearer.action = 'idle';
    wearer.order = null;
    for (let i = 0; i < 40 && wearer.equipment.torso?.item !== 'fur_coat'; i++) sim.step();
    expect(wearer.order).toBeNull();
    expect(lastScores.get(wearer.id)?.some(row => row.id === 'wear_garment')).toBe(true);
    expect(wearer.equipment.torso?.item).toBe('fur_coat');
    expect(wearer.inventory.count('fur_coat')).toBe(1);
  });
});
