import { describe, it, expect, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { weaponAmmoItem, weaponItemOf } from '../knowledge/Tech.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { stopReasonLabel } from '../../render/Floaters.ts';
import type { Animal } from '../entities/Animal.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'sling-ammo',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6, startingTech: ['spear', 'cordage', 'sling', 'bow', 'atlatl'] },
};

function ready(sim: Simulation, animal: Animal, weapon = 'sling'): Person {
  const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
  person.needs.hunger = 0;
  person.needs.thirst = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  person.skills.hunt = 100;
  for (const [itemId, item] of Object.entries(ITEMS)) {
    if (item.weapon) person.inventory.remove(itemId, person.inventory.count(itemId));
  }
  for (const item of ['flint', 'arrow', 'atlatl_dart']) {
    person.inventory.remove(item, person.inventory.count(item));
  }
  person.inventory.add(weapon, 1);
  const tile = sim.world.findWalkableNear(Math.round(person.x), Math.round(person.y))!;
  animal.x = tile.x + 0.5;
  animal.y = tile.y + 0.5;
  person.x = animal.x;
  person.y = animal.y;
  sim['rebuildHashes']();
  return person;
}

function quietWildlife(sim: Simulation, target: Animal): void {
  for (const animal of sim.animals) if (animal !== target) animal.alive = false;
}

describe('sling ammunition', () => {
  it('declares separate crafted arrows and atlatl darts from existing materials', () => {
    expect(ITEMS.bow!.weapon!.ammo).toBe('arrow');
    expect(ITEMS.atlatl!.weapon!.ammo).toBe('atlatl_dart');
    expect(weaponAmmoItem('sling')).toBe('flint');
    expect(RECIPES.arrows!.ingredients).toEqual({ sticks: 2, flint: 1, thatch: 1 });
    expect(RECIPES.arrows!.output).toEqual({ arrow: 4 });
    expect(RECIPES.atlatl_darts!.ingredients).toEqual({ sticks: 2, flint: 1, thatch: 1 });
    expect(RECIPES.atlatl_darts!.output).toEqual({ atlatl_dart: 2 });
  });

  it('spends one carried flint only when the hare is successfully hit', () => {
    const sim = new Simulation(SMALL);
    const hare = sim.animals.find(animal => animal.species === 'hare')!;
    quietWildlife(sim, hare);
    const person = ready(sim, hare);
    person.inventory.add('flint', 2);
    expect(sim.order(person, 'hunt', { animalId: hare.id })).toBe(true);

    vi.spyOn(sim['actionRng'], 'chance').mockReturnValue(true);
    for (let i = 0; i < 4 && hare.health === hare.def.health; i++) sim.step();

    expect(hare.alive).toBe(true);
    expect(hare.health).toBeLessThan(hare.def.health);
    expect(person.inventory.count('flint')).toBe(1);
  });

  it('stops a hare hunt before the shot when the sling has no stone', () => {
    const sim = new Simulation(SMALL);
    const hare = sim.animals.find(animal => animal.species === 'hare')!;
    quietWildlife(sim, hare);
    const person = ready(sim, hare);
    expect(person.inventory.count('flint')).toBe(0);
    expect(sim.order(person, 'hunt', { animalId: hare.id })).toBe(true);
    const chance = vi.spyOn(sim['actionRng'], 'chance');

    sim.step();

    expect(hare.alive).toBe(true);
    expect(person.action).toBe('idle');
    expect(chance).not.toHaveBeenCalled();
    expect(stopReasonLabel('projectile_ammo_missing')).toBe('they had no ammunition for their weapon');
  });

  it('keeps the stone when the shot misses', () => {
    const sim = new Simulation(SMALL);
    const hare = sim.animals.find(animal => animal.species === 'hare')!;
    quietWildlife(sim, hare);
    const person = ready(sim, hare);
    person.inventory.add('flint', 1);
    expect(sim.order(person, 'hunt', { animalId: hare.id })).toBe(true);

    const shot = vi.spyOn(sim['actionRng'], 'chance').mockReturnValue(false);
    for (let i = 0; i < 10 && shot.mock.calls.length === 0; i++) sim.step();

    expect(hare.alive).toBe(true);
    expect(person.inventory.count('flint')).toBe(1);
  });

  it('does not select the sling for deer or boar', () => {
    const sim = new Simulation(SMALL);
    const hare = sim.animals.find(animal => animal.species === 'hare')!;
    const person = ready(sim, hare);
    person.inventory.add('flint', 1);

    expect(weaponItemOf(person, true, false, 2, 'hare')).toBe('sling');
    expect(weaponItemOf(person, true, false, 2, 'deer')).toBeNull();
    expect(weaponItemOf(person, true, false, 2, 'boar')).toBeNull();
  });

  it.each([
    ['bow', 'arrow'],
    ['atlatl', 'atlatl_dart'],
  ])('uses one carried %s projectile on a successful hit', (weapon, ammo) => {
    const sim = new Simulation(SMALL);
    const hare = sim.animals.find(animal => animal.species === 'hare')!;
    quietWildlife(sim, hare);
    const person = ready(sim, hare, weapon);
    person.inventory.add(ammo, 2);
    expect(sim.order(person, 'hunt', { animalId: hare.id })).toBe(true);

    vi.spyOn(sim['actionRng'], 'chance').mockReturnValue(true);
    for (let i = 0; i < 4 && hare.health === hare.def.health; i++) sim.step();

    expect(hare.alive).toBe(true);
    expect(hare.health).toBeLessThan(hare.def.health);
    expect(person.inventory.count(ammo)).toBe(1);
  });

  it.each([
    ['bow', 'arrow'],
    ['atlatl', 'atlatl_dart'],
  ])('does not spend a %s projectile while the quarry is out of range', (weapon, ammo) => {
    const sim = new Simulation(SMALL);
    const hare = sim.animals.find(animal => animal.species === 'hare')!;
    quietWildlife(sim, hare);
    const person = ready(sim, hare, weapon);
    person.inventory.add(ammo, 2);
    hare.x = person.x + 12;
    hare.y = person.y;
    sim['rebuildHashes']();
    expect(sim.order(person, 'hunt', { animalId: hare.id })).toBe(true);

    for (let i = 0; i < 3; i++) sim.step();

    expect(hare.alive).toBe(true);
    expect(person.inventory.count(ammo)).toBe(2);
  });

  it.each([
    ['bow', 'arrow'],
    ['atlatl', 'atlatl_dart'],
  ])('rejects a %s hunt with no ammunition before movement', (weapon, ammo) => {
    const sim = new Simulation(SMALL);
    const hare = sim.animals.find(animal => animal.species === 'hare')!;
    quietWildlife(sim, hare);
    const person = ready(sim, hare, weapon);
    const x = person.x;
    hare.x = person.x + 12;
    hare.y = person.y;
    sim['rebuildHashes']();
    expect(sim.order(person, 'hunt', { animalId: hare.id })).toBe(true);
    const chance = vi.spyOn(sim['actionRng'], 'chance');

    sim.step();

    expect(hare.alive).toBe(true);
    expect(person.action).toBe('idle');
    expect(person.x).toBe(x);
    expect(person.inventory.count(ammo)).toBe(0);
    expect(chance).not.toHaveBeenCalled();
  });
});
