import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { makeConfig } from '../core/Config.ts';
import { ItemPile } from '../entities/ItemPile.ts';
import { telemetry } from '../core/Telemetry.ts';
import { lastScores } from '../ai/Brain.ts';

describe('NPC pickup', () => {
  it('scores dropped food for a hungry NPC and executes the pickup action', () => {
    telemetry.reset();
    telemetry.enable();
    const sim = new Simulation(makeConfig({
      seed: 'npc-pickup',
      world: { width: 64, height: 64 },
      population: { bands: 1, peoplePerBand: 2 },
    }));
    const person = sim.people.find(candidate => candidate.alive && !candidate.isPlayer)!;
    person.x = 30;
    person.y = 30;
    person.needs.hunger = 80;
    person.needs.thirst = 0;
    person.needs.fatigue = 0;
    person.order = null;
    person.action = 'idle';
    sim.nodes.length = 0;
    sim.nodesById.clear();
    sim.nodeHash.rebuild(sim.nodes);
    for (const tree of sim.trees) { tree.standing = false; tree.fruit = 0; }
    for (const animal of sim.animals) animal.alive = false;
    const pile = new ItemPile(30, 30, null, sim.time.tick);
    pile.contents.add('meat', 8);
    sim.piles.push(pile);
    sim.pilesById.set(pile.id, pile);
    sim.pileHash.rebuild(sim.piles);

    for (let i = 0; i < 10; i++) sim.step();

    expect(lastScores.get(person.id)?.some(row => row.id === 'pickup' && row.score > 0)).toBe(true);
    // A chief's current order can outrank the newly scored route, so exercise
    // the ordinary action executor directly after proving the scorer offers it.
    person.x = pile.x;
    person.y = pile.y;
    person.order = null;
    person.action = 'pickup';
    person.targetPileId = pile.id;
    person.targetItemId = 'meat';
    person.targetItemCount = 1;
    person.targetX = pile.x;
    person.targetY = pile.y;
    sim.step();

    expect(person.inventory.count('meat')).toBeGreaterThan(0);
    expect(telemetry.snapshot().npc_pickup).toBeGreaterThan(0);
    telemetry.disable();
  });
});
