import { describe, expect, it, vi } from 'vitest';
import { Brain, type BrainContext } from '../ai/Brain.ts';
import { Simulation } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Tree } from '../entities/Tree.ts';

describe('timber discovery', () => {
  it('cannot choose an unseen, unremembered tree for a building site', () => {
    const sim = new Simulation({ seed: 'chop-knowledge', world: { width: 64, height: 64 },
      population: { bands: 1, peoplePerBand: 2 } });
    const person = sim.livingPeople()[0]!;
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = 0;
    person.action = 'idle'; person.order = null;
    for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
    const tree = new Tree('pine', person.x + 5, person.y, 40 * person.daysPerYear, person.daysPerYear, sim.ids);
    sim.treeHash.rebuild([tree]);
    const site = new Building(BUILDINGS.mud_hut!, person.x, person.y, person.bandId, sim.ids);
    site.sponsorId = person.id;
    const brain = (sim as unknown as { brain: Brain }).brain;
    const score = brain.score.bind(brain);
    let checked = false;
    vi.spyOn(brain, 'score').mockImplementation((actor, ctx: BrainContext) => {
      if (actor !== person || checked) return score(actor, ctx);
      checked = true;
      const testCtx = { ...ctx, buildings: [site], sightRadius: 2 };
      vi.spyOn(ctx.world, 'sameRegion').mockReturnValue(true);
      expect(person.placeMemory.hasNear('tree', tree.x, tree.y)).toBe(false);
      expect(score(actor, testCtx).found.fellTree).toBeNull();
      expect(score(actor, { ...testCtx, sightRadius: 6 }).found.fellTree).toBe(tree);
      person.placeMemory.remember('tree', tree.x, tree.y, sim.time.day, 2);
      expect(score(actor, testCtx).found.fellTree).toBe(tree);
      return score(actor, testCtx);
    });
    for (let i = 0; i < 30 && !checked; i++) sim.step();
    expect(checked).toBe(true);
    vi.restoreAllMocks();
  });
});
