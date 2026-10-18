import { Simulation } from '../core/Simulation.ts';
import { ItemPile } from '../entities/ItemPile.ts';
import type { Person } from '../entities/Person.ts';
import { equipContainer } from '../core/Carry.ts';

export function pickupFixture(seed: string) {
  const sim = new Simulation({
    seed,
    world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 2 },
  });
  sim.possessFirst();
  const person = sim.player!;
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
  person.equipment = {};
  person.carryContainerCapacity = 0;
  person.armsTaken = 0;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  return { sim, person };
}

export function pileAt(sim: Simulation, x: number, y: number, entries: readonly [string, number][]) {
  const pile = new ItemPile(x, y, null, sim.time.tick);
  for (const [id, count] of entries) pile.contents.add(id, count);
  sim.piles.push(pile);
  sim.pilesById.set(pile.id, pile);
  sim.pileHash.rebuild(sim.piles);
  return pile;
}

export function wearContainer(person: Person, itemId: string) {
  person.inventory.add(itemId, 1);
  equipContainer(person, itemId);
}
