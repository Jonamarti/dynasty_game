import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { Simulation } from '../core/Simulation.ts';
import { itemActions } from '../ai/ActionCatalog.ts';
import { ITEMS } from '../entities/Item.ts';
import { ADULT_YEARS } from '../entities/Person.ts';

describe('M16 phase 2.16 capability', () => {
  it('m16-equip-unequip-all', () => {
    const sim = new Simulation({
      seed: 'm16-equip-unequip-all',
      world: { width: 48, height: 48, berryBushes: 8, flintOutcrops: 2, deadwood: 4, gameHerds: 1 },
      population: { bands: 1, peoplePerBand: 2 },
    });
    const person = sim.livingPeople()[0]!;
    person.age = ADULT_YEARS * person.daysPerYear;
    person.isPlayer = true;
    person.needs.hunger = person.needs.thirst = person.needs.cold = 0;

    const candidates = Object.entries(ITEMS).filter(([, def]) =>
      !def.furniture && (def.container || def.garment || def.hand.hands > 0));
    let exercised = 0;
    for (const [itemId, def] of candidates) {
      person.armsTaken = 0;
      person.equipment = {};
      person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
      person.inventory.add(itemId, 1);
      const equipAction = def.garment ? 'wear_garment'
        : def.container ? `equip_${def.container.slot}`
        : 'equip_left';
      const equipOption = itemActions(person, itemId, 0, null, null)
        .find(option => option.id === equipAction);
      expect(equipOption, `${itemId} exposes ${equipAction}`).toMatchObject({ enabled: true });
      expect(sim.order(person, equipAction, { itemId }), `${itemId} accepts ${equipAction}: ${sim.lastRefusal}`).toBe(true);
      for (let tick = 0; tick < DEFAULT_CONFIG.carry.equipTicks; tick++) sim.step();
      const equipSlot = def.garment?.slot ?? def.container?.slot ?? 'left';
      expect(person.equipment[equipSlot]?.item, `${itemId} is equipped in ${equipSlot}`).toBe(itemId);

      const removeAction = def.garment ? 'take_off_garment'
        : `unequip_${def.container?.slot ?? 'left'}`;
      person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
      if (def.garment) {
        const beforeMenu = JSON.stringify(person.equipment);
        expect(itemActions(person, itemId, 0, null, null).find(option => option.id === removeAction))
          .toMatchObject({ enabled: true });
        expect(JSON.stringify(person.equipment), 'the inventory menu is read-only').toBe(beforeMenu);
        expect(sim.order(person, removeAction, { itemId })).toBe(true);
        for (let tick = 0; tick < DEFAULT_CONFIG.carry.equipTicks; tick++) sim.step();
        expect(person.equipment[def.garment.slot]?.item).not.toBe(itemId);
      } else {
        const beforeMenu = JSON.stringify(person.equipment);
        expect(itemActions(person, itemId, 0, null, null).find(option => option.id === removeAction))
          .toMatchObject({ enabled: true });
        expect(JSON.stringify(person.equipment), 'the inventory menu is read-only').toBe(beforeMenu);
        expect(sim.order(person, removeAction, { itemId })).toBe(true);
        for (let tick = 0; tick < DEFAULT_CONFIG.carry.equipTicks; tick++) sim.step();
        expect(Object.values(person.equipment).some(equipped => equipped?.item === itemId)).toBe(false);
      }
      expect(person.inventory.count(itemId), `${itemId} remains owned after removal`).toBe(1);
      person.inventory.remove(itemId, 1);
      exercised++;
    }
    expect(exercised).toBe(candidates.length);
  });

  it('explains when removing a container would leave the load over capacity', () => {
    const sim = new Simulation({
      seed: 'm16-container-unequip-capacity',
      world: { width: 48, height: 48, berryBushes: 8, flintOutcrops: 2, deadwood: 4, gameHerds: 1 },
      population: { bands: 1, peoplePerBand: 2 },
    });
    const person = sim.livingPeople()[0]!;
    person.isPlayer = true;
    person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
    person.inventory.add('basket', 1);
    expect(sim.order(person, 'equip_back', { itemId: 'basket' })).toBe(true);
    for (let tick = 0; tick < DEFAULT_CONFIG.carry.equipTicks; tick++) sim.step();
    person.inventory.add('berries', 20);

    const remove = itemActions(person, 'basket', 0, null, null)
      .find(option => option.id === 'unequip_back');
    expect(remove).toMatchObject({ enabled: false, reason: 'Put down some items before removing that container' });
    expect(sim.order(person, 'unequip_back', { itemId: 'basket' })).toBe(false);
    expect(sim.lastRefusal).toBe('Put down some items before removing that container');
    expect(person.equipment.back?.item).toBe('basket');
    expect(person.inventory.count('basket')).toBe(1);
    expect(person.inventory.count('berries')).toBe(20);
  });

  it('removes only the chosen one-handed axe and leaves the other fitted', () => {
    const sim = new Simulation({
      seed: 'm16-one-handed-axes',
      world: { width: 48, height: 48, berryBushes: 8, flintOutcrops: 2, deadwood: 4, gameHerds: 1 },
      population: { bands: 1, peoplePerBand: 2 },
    });
    const person = sim.livingPeople()[0]!;
    person.age = ADULT_YEARS * person.daysPerYear;
    person.isPlayer = true;
    person.armsTaken = 0;
    person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
    person.inventory.add('handaxe', 1);
    person.inventory.add('stone_axe', 1);
    expect(sim.order(person, 'equip_left', { itemId: 'handaxe' })).toBe(true);
    for (let tick = 0; tick < DEFAULT_CONFIG.carry.equipTicks; tick++) sim.step();
    expect(sim.order(person, 'equip_right', { itemId: 'stone_axe' })).toBe(true);
    for (let tick = 0; tick < DEFAULT_CONFIG.carry.equipTicks; tick++) sim.step();

    expect(sim.order(person, 'unequip_left', { itemId: 'handaxe' })).toBe(true);
    for (let tick = 0; tick < DEFAULT_CONFIG.carry.equipTicks; tick++) sim.step();
    expect(person.equipment.left).toBeUndefined();
    expect(person.equipment.right?.item).toBe('stone_axe');
    expect(person.inventory.count('handaxe')).toBe(1);
    expect(person.inventory.count('stone_axe')).toBe(1);
  });

  it('keeps a lit torch in its hand with its fuel record intact', () => {
    const sim = new Simulation({
      seed: 'm16-lit-torch-unequip',
      world: { width: 48, height: 48, berryBushes: 8, flintOutcrops: 2, deadwood: 4, gameHerds: 1 },
      population: { bands: 1, peoplePerBand: 2 },
    });
    const person = sim.livingPeople()[0]!;
    person.age = ADULT_YEARS * person.daysPerYear;
    person.isPlayer = true;
    person.inventory.add('torch', 1);
    person.equipment.left = { item: 'torch', count: 1, lit: 500 };

    const remove = itemActions(person, 'torch', 0, null, null).find(option => option.id === 'unequip_left');
    expect(remove).toMatchObject({ enabled: false, reason: 'A burning torch must stay in its hand until it burns out' });
    expect(sim.order(person, 'unequip_left', { itemId: 'torch' })).toBe(false);
    expect(sim.lastRefusal).toBe('A burning torch must stay in its hand until it burns out');
    expect(person.equipment.left).toEqual({ item: 'torch', count: 1, lit: 500 });
    expect(person.inventory.count('torch')).toBe(1);
  });
});
