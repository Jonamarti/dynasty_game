/**
 * The gift — M11 phase 17a. Declared in `EVENT_TYPES` since phase 5b and
 * emitted by nothing until this: whatever is handed over that is not food is
 * a gift, a deed that raises the giver's household's renown.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';

const SMALL = {
  seed: 'gift-test',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 5 },
};

describe('a gift', () => {
  it('is a deed when it is not food, and raises the giver’s renown', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 5; i++) sim.step();
    const [giver, receiver] = sim.livingPeople().filter(p => !p.isChild);
    receiver!.x = giver!.x + 1;
    receiver!.y = giver!.y;
    giver!.inventory.add('spear', 1);
    const household = sim.householdsById.get(giver!.householdId!)!;
    const before = household.renown;

    expect(sim.handOver(giver!, receiver!, 'spear', 1)).toBe(1);
    expect(receiver!.memory.all().some(m => m.type === 'gift' && m.actorId === giver!.id)).toBe(true);
    expect(household.renown).toBeGreaterThan(before);
  });
});
