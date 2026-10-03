import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { PlaceMemory } from '../social/PlaceMemory.ts';
import { lastScores } from '../ai/Brain.ts';

describe('children and adults see the same distance', () => {
  it('does not offer food beyond sight to either age, but offers it once visible', () => {
    const sim = new Simulation({ seed: 'child-vision', sightRadius: 4,
      world: { width: 48, height: 48, heightSight: 0, regrowthRate: 0, predators: 0 },
      population: { bands: 1, peoplePerBand: 4 },
      motivation: { homePressure: false, reachFilter: false }, ai: { choiceSpread: 0 } });
    const person = sim.livingPeople()[0]!;
    const food = sim.nodes.find(n => n.kind === 'berries')!;
    for (const node of sim.nodes) node.amount = node === food ? node.def.maxAmount : 0;
    for (const tree of sim.trees) { tree.standing = false; tree.fruit = 0; }
    for (const animal of sim.animals) animal.alive = false;
    for (const other of sim.people) if (other !== person) sim.order(other, 'rest');
    const far = [...Array(sim.world.width * sim.world.height).keys()]
      .map(i => ({ x: i % sim.world.width, y: Math.floor(i / sim.world.width) }))
      .find(p => sim.world.isWalkable(p.x, p.y) && sim.world.sameRegion(person.x, person.y, p.x, p.y) &&
        person.distanceTo(p) > 5 && person.distanceTo(p) < 7)!;
    expect(far).toBeDefined();
    const scoreFood = (years: number, visible: boolean) => {
      person.age = years * person.daysPerYear;
      person.placeMemory = new PlaceMemory(sim.world.width, sim.world.height);
      person.placeMemoryStaticCell = -1; person.placeMemoryStaticDay = -1;
      food.x = visible ? person.x : far.x; food.y = visible ? person.y : far.y;
      food.amount = food.def.maxAmount;
      sim.nodeHash.rebuild(sim.nodes);
      person.forgetPlans();
      person.action = 'idle'; person.actionTimer = 0; person.clearTarget();
      for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
      person.needs.hunger = 80; person.needs.thirst = 0; person.needs.cold = 0;
      person.needs.fatigue = 0; person.needs.company = 0;
      lastScores.delete(person.id);
      sim.step(); // Idle forces a think; observation precedes that think.
      return lastScores.get(person.id)?.some(row => row.id === 'forage') ?? false;
    };
    expect(scoreFood(10, false)).toBe(false);
    expect(scoreFood(20, false)).toBe(false);
    expect(scoreFood(10, true)).toBe(true);
    expect(scoreFood(20, true)).toBe(true);
  });
});
