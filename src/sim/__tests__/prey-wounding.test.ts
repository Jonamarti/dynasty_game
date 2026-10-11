import { describe, it, expect, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { ITEMS } from '../entities/Item.ts';
import type { Animal } from '../entities/Animal.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'prey-wounding',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6, startingTech: ['spear', 'cordage', 'sling'] },
};

function setHuntUp(sim: Simulation, hare: Animal): Person {
  const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
  person.needs.hunger = 0;
  person.needs.thirst = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  person.skills.hunt = 100;
  for (const [itemId, item] of Object.entries(ITEMS)) {
    if (item.weapon) person.inventory.remove(itemId, person.inventory.count(itemId));
  }
  person.inventory.add('sling', 1);
  person.inventory.add('flint', 3);
  for (const animal of sim.animals) if (animal !== hare) animal.alive = false;
  const tile = sim.world.findWalkableNear(Math.round(person.x), Math.round(person.y))!;
  person.x = tile.x + 0.5;
  person.y = tile.y + 0.5;
  hare.x = person.x;
  hare.y = person.y;
  sim['rebuildHashes']();
  return person;
}

describe('hunting wounds', () => {
  it('records a landed but nonlethal shot and lets the wounded quarry flee', () => {
    const sim = new Simulation(SMALL);
    const hare = sim.animals.find(animal => animal.species === 'hare')!;
    const person = setHuntUp(sim, hare);
    const startX = hare.x;
    const startY = hare.y;
    expect(sim.order(person, 'hunt', { animalId: hare.id })).toBe(true);
    vi.spyOn(sim['actionRng'], 'chance').mockReturnValue(true);

    for (let i = 0; i < 4 && hare.hurtBy === null; i++) sim.step();

    expect(hare.alive).toBe(true);
    expect(hare.health).toBe(hare.def.health - 1);
    expect(hare.hurtBy).toBe(person.id);
    expect(hare.hurtAt).toBe(sim.time.tick);
    expect(hare.lastAttackAt).toBe(-Infinity);
    expect(hare.alarmedUntil).toBeGreaterThan(sim.time.tick);
    expect(Math.hypot(hare.x - startX, hare.y - startY)).toBeGreaterThan(0);
    expect(person.action).toBe('hunt');
    expect(person.inventory.count('flint')).toBe(2);
  });

  it('does not wound, stamp a grudge or spend ammunition on a miss', () => {
    const sim = new Simulation(SMALL);
    const hare = sim.animals.find(animal => animal.species === 'hare')!;
    const person = setHuntUp(sim, hare);
    expect(sim.order(person, 'hunt', { animalId: hare.id })).toBe(true);
    const shot = vi.spyOn(sim['actionRng'], 'chance').mockReturnValue(false);
    for (let i = 0; i < 4 && shot.mock.calls.length === 0; i++) sim.step();

    expect(hare.alive).toBe(true);
    expect(hare.health).toBe(hare.def.health);
    expect(hare.hurtBy).toBeNull();
    expect(hare.lastAttackAt).toBe(-Infinity);
    expect(person.inventory.count('flint')).toBe(3);
  });

  it('kills an already-wounded quarry on the next landed shot', () => {
    const sim = new Simulation(SMALL);
    const hare = sim.animals.find(animal => animal.species === 'hare')!;
    const person = setHuntUp(sim, hare);
    hare.health -= 1;
    expect(sim.order(person, 'hunt', { animalId: hare.id })).toBe(true);
    vi.spyOn(sim['actionRng'], 'chance').mockReturnValue(true);

    for (let i = 0; i < 4 && hare.alive; i++) sim.step();

    expect(hare.alive).toBe(false);
    expect(hare.health).toBe(0);
    expect(hare.hurtBy).toBeNull();
    expect(hare.hurtAt).toBe(0);
    expect(person.inventory.count('flint')).toBe(2);
  });
});
