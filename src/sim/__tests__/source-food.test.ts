import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

const WORLD = {
  seed: 'source-meal',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 5, deadwood: 10, gameHerds: 0 },
  population: { bands: 1, peoplePerBand: 6 },
};

describe('eating a harvest where it grows', () => {
  it('relieves hunger with a full non-food load rather than destroying the berries', () => {
    const sim = new Simulation(WORLD);
    const person = sim.possessFirst()!;
    const bush = sim.nodes.find(node => node.kind === 'berries' && node.amount >= 3)!;
    for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
    person.inventory.add('sticks', person.carryCapacity);
    person.x = bush.x;
    person.y = bush.y;
    person.needs.hunger = 80;
    person.needs.thirst = 0;
    person.needs.fatigue = 0;
    person.needs.cold = 0;
    const before = bush.amount;
    expect(sim.order(person, 'forage', { nodeId: bush.id })).toBe(true);

    for (let i = 0; i < 60 && bush.amount === before; i++) sim.step();

    expect(bush.amount).toBeLessThan(before);
    expect(person.needs.hunger).toBeLessThan(80);
    expect(person.inventory.count('berries')).toBe(0);
  });

  it('gets nourishment from fruit just picked off a tree', () => {
    const sim = new Simulation(WORLD);
    const person = sim.possessFirst()!;
    const tree = sim.trees.find(candidate => candidate.def.fruitItem === 'apple')!;
    for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
    tree.fruit = 8;
    person.x = tree.x;
    person.y = tree.y;
    person.needs.hunger = 80;
    person.needs.thirst = 0;
    person.needs.fatigue = 0;
    person.needs.cold = 0;
    expect(sim.order(person, 'pick', { treeId: tree.id })).toBe(true);

    for (let i = 0; i < 60 && tree.fruit === 8; i++) sim.step();

    expect(tree.fruit).toBeLessThan(8);
    expect(person.needs.hunger).toBeLessThan(80);
    expect(person.inventory.count('apple')).toBe(0);
  });
});
