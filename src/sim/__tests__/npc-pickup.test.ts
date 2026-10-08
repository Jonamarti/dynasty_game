import { afterEach, describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { makeConfig } from '../core/Config.ts';
import { ItemPile } from '../entities/ItemPile.ts';
import { telemetry } from '../core/Telemetry.ts';
import { lastScores } from '../ai/Brain.ts';
import { mayTakeFromPile } from '../social/Property.ts';

describe('NPC pickup', () => {
  afterEach(() => telemetry.disable());
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

    let sawPickupScore = false;
    for (let i = 0; i < 10; i++) {
      sim.step();
      sawPickupScore ||= lastScores.get(person.id)?.some(row => row.id === 'pickup' && row.score > 0) ?? false;
    }

    // The route can finish and become eating before the final think in the
    // window; retain the score observation across ticks and verify the haul.
    expect(sawPickupScore).toBe(true);
    expect(person.inventory.count('meat')).toBeGreaterThan(0);
    expect(telemetry.snapshot().npc_pickup).toBeGreaterThan(0);

  });

  it("plans on a stranger's heap only while nobody of their band is watching it", () => {
    const sim = new Simulation(makeConfig({
      seed: 'npc-pickup-owner',
      world: { width: 64, height: 64 },
      population: { bands: 2, peoplePerBand: 2 },
    }));
    const person = sim.people.find(p => !p.isPlayer)!;
    const stranger = sim.people.find(p => p.bandId !== person.bandId)!;
    const witness = sim.people.find(p => p.bandId === stranger.bandId && p !== stranger)!;
    const bandmate = sim.people.find(p => p.bandId === person.bandId && p !== person)!;
    for (const p of sim.people) { p.x = 2; p.y = 2; }
    person.x = 30; person.y = 30;
    sim.peopleHash.rebuild(sim.people);
    const ctx = { peopleHash: sim.peopleHash, sightRadius: sim.config.sightRadius, bandRelations: sim.bandRelations };
    const heap = (ownerId: number | null) => ({ x: 30, y: 30, ownerId });

    expect(mayTakeFromPile(person, heap(null), sim.peopleById, ctx)).toBe(true);
    expect(mayTakeFromPile(person, heap(bandmate.id), sim.peopleById, ctx)).toBe(true);
    // Unwatched: the owner and their band are all far away.
    expect(mayTakeFromPile(person, heap(stranger.id), sim.peopleById, ctx)).toBe(true);
    // Watched: one of the owner's band stands beside the heap.
    witness.x = 32; witness.y = 30;
    sim.peopleHash.rebuild(sim.people);
    expect(mayTakeFromPile(person, heap(stranger.id), sim.peopleById, ctx)).toBe(false);
    // With no way to look the owner up, the same watched heap reads as fair
    // game. That is what the scorer saw until `BrainContext.peopleById` became
    // required, and why the watched assertion above is driven through this
    // function directly rather than through the scorer's top six.
    expect(mayTakeFromPile(person, heap(stranger.id), new Map(), ctx)).toBe(true);
  });
});
