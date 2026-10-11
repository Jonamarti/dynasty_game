import { describe, it, expect, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { weaponItemOf } from '../knowledge/Tech.ts';
import { stopReasonLabel } from '../../render/Floaters.ts';
import type { Animal } from '../entities/Animal.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'sling-ammo',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6, startingTech: ['spear', 'cordage', 'sling'] },
};

function ready(sim: Simulation, animal: Animal): Person {
  const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
  person.needs.hunger = 0;
  person.needs.thirst = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  person.skills.hunt = 100;
  for (const item of ['flint', 'spear', 'bow', 'atlatl', 'handaxe']) {
    person.inventory.remove(item, person.inventory.count(item));
  }
  person.inventory.add('sling', 1);
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
  it('spends one carried flint only when a hare is successfully hit', () => {
    const sim = new Simulation(SMALL);
    const hare = sim.animals.find(animal => animal.species === 'hare')!;
    quietWildlife(sim, hare);
    const person = ready(sim, hare);
    person.inventory.add('flint', 2);
    expect(sim.order(person, 'hunt', { animalId: hare.id })).toBe(true);

    vi.spyOn(sim['actionRng'], 'chance').mockReturnValue(true);
    for (let i = 0; i < 10 && hare.alive; i++) sim.step();

    expect(hare.alive).toBe(false);
    expect(person.inventory.count('flint')).toBe(1);
  });

  it('stops a hare hunt before the shot when the sling has no stone', () => {
    const sim = new Simulation(SMALL);
    const hare = sim.animals.find(animal => animal.species === 'hare')!;
    quietWildlife(sim, hare);
    const person = ready(sim, hare);
    expect(person.inventory.count('flint')).toBe(0);
    expect(sim.order(person, 'hunt', { animalId: hare.id })).toBe(true);

    sim.step();

    expect(hare.alive).toBe(true);
    expect(person.action).toBe('idle');
    expect(stopReasonLabel('sling_no_ammunition')).toBe('their sling had no stone to throw');
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
});
