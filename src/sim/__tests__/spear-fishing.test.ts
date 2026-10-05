import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';

function firstFishYield(spear: 'none' | 'spare' | 'fitted'): { amount: number; shallow: boolean } {
  const sim = new Simulation({
    seed: 'm15-harpoon-control',
    world: { waterLevel: 0.38 },
    population: { bands: 1, peoplePerBand: 6, startingTech: ['spear', 'fishing'] },
  });
  const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
  const node = sim.nodes.find(candidate => candidate.kind === 'fish' && !candidate.depleted)!;
  if (!(node instanceof ResourceNode)) throw new Error('fixture needs a fish node');

  for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
  person.equipment = {};
  person.knownTech.add('spear');
  person.knownTech.add('fishing');
  if (spear !== 'none') person.inventory.add('spear', 1);
  if (spear === 'fitted') person.equipment.right = { item: 'spear', count: 1 };
  person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
  // A shoal is walkable. Starting on it isolates harvest yield from travel and
  // guarantees the test sees a catch rather than an unreachable target.
  person.x = node.x;
  person.y = node.y;
  const before = person.inventory.count('fish');
  if (!sim.order(person, 'forage', { nodeId: node.id })) throw new Error('fish order refused');
  for (let tick = 0; tick < 80 && person.inventory.count('fish') === before; tick++) sim.step();
  return { amount: person.inventory.count('fish') - before, shallow: sim.world.isShallow(person.x, person.y) };
}

describe('harpoon fishing', () => {
  it('increases the first shallow-water catch only while the spear is fitted in hand', () => {
    const bare = firstFishYield('none');
    const spare = firstFishYield('spare');
    const fitted = firstFishYield('fitted');

    expect(bare.amount).toBeGreaterThan(0);
    expect(bare.shallow).toBe(true);
    expect(spare.amount).toBe(bare.amount); // Negative control: possession alone is not harpooning.
    expect(fitted.amount).toBeGreaterThan(bare.amount);
    expect(fitted.shallow).toBe(true);
  });
});
