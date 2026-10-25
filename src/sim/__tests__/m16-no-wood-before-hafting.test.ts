import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { Tree } from '../entities/Tree.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { BUILDINGS } from '../entities/Building.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { TECH, type Tech } from '../knowledge/Tech.ts';
import { hasFellingAxe } from '../knowledge/Felling.ts';

function dependsOnHafting(tech: Tech, seen = new Set<Tech>()): boolean {
  if (tech === 'hafting') return true;
  if (seen.has(tech)) return false;
  seen.add(tech);
  return TECH[tech].requires.some(prerequisite => dependsOnHafting(prerequisite, seen));
}

function session(seed: string) {
  const sim = new Simulation({
    seed, world: { width: 48, height: 48, predators: 0, gameHerds: 0 },
    population: { bands: 1, peoplePerBand: 4 },
  });
  const person = sim.possessFirst()!;
  for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
  for (const tech of ['hafting', 'ground_stone', 'casting', 'bronze_tools', 'iron_tools']) {
    person.knownTech.delete(tech);
  }
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  return { sim, person };
}

describe('m16-no-wood-before-hafting', () => {
  it('gates every wood-requiring building, recipe and technology prototype behind hafting', () => {
    const offenders: string[] = [];
    for (const building of Object.values(BUILDINGS)) {
      if ((building.materials.wood ?? 0) > 0 &&
        (!building.requiresTech || !dependsOnHafting(building.requiresTech as Tech))) {
        offenders.push('building:' + building.id);
      }
    }
    for (const recipe of Object.values(RECIPES)) {
      if ([recipe.ingredients, ...(recipe.ingredientOptions ?? [])]
        .some(ingredients => (ingredients.wood ?? 0) > 0) &&
        !dependsOnHafting(recipe.tech)) offenders.push('recipe:' + recipe.id);
    }
    for (const tech of Object.keys(TECH) as Tech[]) {
      if ((TECH[tech].prototype.wood ?? 0) > 0 && !dependsOnHafting(tech)) {
        offenders.push('prototype:' + tech);
      }
    }
    expect(offenders).toEqual([]);
    expect(BUILDINGS.mud_hut!.materials).toEqual({ sticks: 12, thatch: 10, mud: 8 });
  });

  it('refuses a tree without a real usable axe and reports why immediately', () => {
    const { sim, person } = session('m16-no-wood-no-axe');
    const tree = new Tree('pine', person.x, person.y, 40 * person.daysPerYear, person.daysPerYear, sim.ids);
    sim.trees.push(tree); sim.treesById.set(tree.id, tree); sim.treeHash.insert(tree);
    expect(hasFellingAxe(person)).toBe(false);
    expect(sim.order(person, 'chop', { treeId: tree.id })).toBe(false);
    expect(sim.lastRefusal).toBe('You need an axe to fell a tree');
    expect(tree.chopProgress).toBe(0);

    person.inventory.add('handaxe', 1);
    expect(sim.order(person, 'chop', { treeId: tree.id })).toBe(false);
    person.knownTech.add('hafting');
    expect(hasFellingAxe(person)).toBe(true);
    expect(sim.order(person, 'chop', { treeId: tree.id })).toBe(true);

    for (let i = 0; i < 90 && tree.chopProgress === 0; i++) {
      person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
      sim.step();
    }
    expect(tree.chopProgress).toBeGreaterThan(0);
    const before = tree.chopProgress;
    person.inventory.remove('handaxe', 1);
    sim.step();
    expect(tree.chopProgress).toBe(before);
    expect(sim.interruptions.some(item => item.reason === 'no_felling_axe')).toBe(true);
  });

  it('still gathers loose sticks without knowing hafting or carrying an axe', () => {
    const { sim, person } = session('m16-sticks-no-axe');
    const node = new ResourceNode('sticks', person.x, person.y, new RNG('m16-sticks-node'), sim.ids);
    node.amount = 20;
    sim.nodes.push(node); sim.nodesById.set(node.id, node); sim.nodeHash.insert(node);
    expect(hasFellingAxe(person)).toBe(false);
    expect(sim.order(person, 'gather', { nodeId: node.id })).toBe(true);
    for (let i = 0; i < 150 && person.inventory.count('sticks') === 0; i++) {
      person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
      sim.step();
    }
    expect(person.inventory.count('sticks')).toBeGreaterThan(0);
  });
});
