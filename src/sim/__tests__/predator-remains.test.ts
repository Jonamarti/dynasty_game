import { describe, it, expect, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

function gatheredGoods(sim: Simulation, item: string): number {
  return sim.piles.reduce((sum, pile) => sum + pile.contents.count(item), 0);
}

describe('physical remains from predator deaths', () => {
  it('leaves the existing meat yield and one hide when a predator starves', () => {
    const sim = new Simulation({ seed: 'predator-remains-starvation' });
    const wolf = sim.animals.find(animal => animal.species === 'wolf')!;
    const meatBefore = gatheredGoods(sim, 'meat');
    const hideBefore = gatheredGoods(sim, 'hide');
    wolf.fed = 0;
    wolf.health = 0.001;

    for (let i = 0; i < 10 && sim.animalsById.has(wolf.id); i++) sim.step();

    expect(sim.animalsById.has(wolf.id)).toBe(false);
    expect(gatheredGoods(sim, 'meat') - meatBefore).toBe(wolf.def.meat);
    expect(gatheredGoods(sim, 'hide') - hideBefore).toBe(1);
  });

  it('leaves the same human-gatherable goods when a predator is predated', () => {
    const sim = new Simulation({ seed: 'predator-remains-predation' });
    const wolf = sim.animals.find(animal => animal.species === 'wolf')!;
    const meatBefore = gatheredGoods(sim, 'meat');
    const hideBefore = gatheredGoods(sim, 'hide');
    wolf.alive = false;

    // Predator-on-predator prey is not currently in the species table. Invoke
    // the real callback from inside a simulation step to cover its removal
    // cause without widening that ecology graph or adding RNG.
    vi.spyOn(sim['wildlifeSystem'], 'update').mockImplementation((_animals, context) => {
      context.onPredated?.(wolf);
    });
    sim.step();

    expect(sim.animalsById.has(wolf.id)).toBe(false);
    expect(gatheredGoods(sim, 'meat') - meatBefore).toBe(wolf.def.meat);
    expect(gatheredGoods(sim, 'hide') - hideBefore).toBe(1);
  });

  it.each([
    ['human hunting', undefined],
    ['leaving by the map edge', 'animal_left_by_edge'],
  ] as const)('does not leave remains for %s removal', (_cause, counter) => {
    const sim = new Simulation({ seed: `predator-remains-excluded-${_cause}` });
    const wolf = sim.animals.find(animal => animal.species === 'wolf')!;
    const meatBefore = gatheredGoods(sim, 'meat');
    const hideBefore = gatheredGoods(sim, 'hide');

    if (counter) sim['removeAnimal'](wolf, counter);
    else sim['removeAnimal'](wolf);

    expect(gatheredGoods(sim, 'meat')).toBe(meatBefore);
    expect(gatheredGoods(sim, 'hide')).toBe(hideBefore);
  });
});
