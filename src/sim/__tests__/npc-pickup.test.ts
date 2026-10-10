import { afterEach, describe, expect, it, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { makeConfig } from '../core/Config.ts';
import { ItemPile } from '../entities/ItemPile.ts';
import { telemetry } from '../core/Telemetry.ts';
import { lastScores, toolOpportunityScore } from '../ai/Brain.ts';
import { mayTakeFromPile } from '../social/Property.ts';
import { Animal } from '../entities/Animal.ts';
import { RNG } from '../core/RNG.ts';
import { Brain, type BrainContext } from '../ai/Brain.ts';

describe('NPC pickup', () => {
  afterEach(() => telemetry.disable());
  it('prices a ground tool only against the matching work opportunity', () => {
    expect(toolOpportunityScore('handaxe', false, true, 8, 2, 2)).toBe(0);
    expect(toolOpportunityScore('spear', true, false, 8, 2, 2)).toBe(0);
    expect(toolOpportunityScore('handaxe', true, true, 1, 20, 2)).toBe(1);
    expect(toolOpportunityScore('spear', true, true, 20, 2, 2)).toBe(2);
    expect(toolOpportunityScore('bow', true, true, 20, 2, 1)).toBe(0);
  });
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

  it('collects a known hunting tool from a nearby heap before starting the hunt', () => {
    telemetry.reset();
    telemetry.enable();
    const sim = new Simulation(makeConfig({
      seed: 'npc-pickup-hunting-tool', world: { width: 64, height: 64 },
      population: { bands: 1, peoplePerBand: 2 }, ai: { commitmentEntryPressure: 0.99 },
    }));
    const person = sim.people.find(candidate => candidate.alive && !candidate.isPlayer)!;
    person.age = 30 * person.daysPerYear;
    person.armsTaken = 0;
    person.x = 30; person.y = 30;
    person.needs.hunger = 75; person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
    person.order = null; person.action = 'idle'; person.knownTech.add('spear');
    person.commitment = null;
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    sim.nodes.length = 0; sim.nodesById.clear(); sim.nodeHash.rebuild(sim.nodes);
    for (const tree of sim.trees) { tree.standing = false; tree.fruit = 0; }
    for (const animal of sim.animals) animal.alive = false;
    const quarry = new Animal('deer', person.x, person.y, 0, new RNG('npc-pickup-quarry'), sim.ids);
    quarry.tamedBy = person.id;
    sim.animals.push(quarry); sim.animalsById.set(quarry.id, quarry); sim.animalHash.rebuild(sim.animals);
    const pile = new ItemPile(person.x, person.y, null, sim.time.tick);
    pile.contents.add('spear', 1);
    sim.piles.push(pile); sim.pilesById.set(pile.id, pile); sim.pileHash.rebuild(sim.piles);

    const brain = (sim as unknown as { brain: Brain }).brain;
    const realScore = brain.score.bind(brain);
    const captured: { value: ReturnType<Brain['score']> | null } = { value: null };
    vi.spyOn(brain, 'score').mockImplementation((candidate, ctx: BrainContext) => {
      const result = realScore(candidate, ctx);
      if (candidate === person && result.found.pickupItem === 'spear') captured.value = result;
      return result;
    });
    for (let i = 0; i < 60 &&
      person.equipment.left?.item !== 'spear' && person.equipment.right?.item !== 'spear'; i++) sim.step();

    const scored = captured.value;
    expect(scored).not.toBeNull();
    if (!scored) throw new Error('NPC was not scored');
    expect(scored.scores.find(row => row.id === 'pickup')?.score)
      .toBeGreaterThan(scored.scores.find(row => row.id === 'hunt')?.score ?? 0);
    expect(scored.scores.filter(row => row.id === 'pickup')).toHaveLength(1);
    expect(scored.found.pickupPile).toBe(pile);
    expect(scored.found.pickupItem).toBe('spear');
    expect(person.inventory.count('spear')).toBe(1);
    expect(pile.contents.count('spear')).toBe(0);
    expect(telemetry.snapshot().npc_pickup).toBe(1);
    expect(person.equipment.left?.item === 'spear' || person.equipment.right?.item === 'spear').toBe(true);
    expect(person.action).toBe('hunt');
  });

  it('does not collect an unfamiliar tool without knowing its use', () => {
    const sim = new Simulation(makeConfig({
      seed: 'npc-pickup-unknown-tool', world: { width: 64, height: 64 },
      population: { bands: 1, peoplePerBand: 2 },
    }));
    const person = sim.people.find(candidate => candidate.alive && !candidate.isPlayer)!;
    person.age = 30 * person.daysPerYear;
    person.armsTaken = 0;
    person.needs.hunger = 75; person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
    person.order = null; person.action = 'idle';
    sim.nodes.length = 0; sim.nodesById.clear(); sim.nodeHash.rebuild(sim.nodes);
    for (const tree of sim.trees) { tree.standing = false; tree.fruit = 0; }
    for (const animal of sim.animals) animal.alive = false;
    const quarry = new Animal('deer', person.x, person.y, 0, new RNG('npc-pickup-unknown-quarry'), sim.ids);
    quarry.tamedBy = person.id;
    sim.animals.push(quarry); sim.animalsById.set(quarry.id, quarry); sim.animalHash.rebuild(sim.animals);
    const pile = new ItemPile(person.x, person.y, null, sim.time.tick);
    pile.contents.add('spear', 1);
    sim.piles.push(pile); sim.pilesById.set(pile.id, pile); sim.pileHash.rebuild(sim.piles);

    const brain = (sim as unknown as { brain: Brain }).brain;
    const realScore = brain.score.bind(brain);
    let sawToolPickup = false;
    vi.spyOn(brain, 'score').mockImplementation((candidate, ctx: BrainContext) => {
      const result = realScore(candidate, ctx);
      if (candidate === person) sawToolPickup ||= result.scores.some(row => row.id === 'pickup') &&
        result.found.pickupPile === pile && result.found.pickupItem === 'spear';
      return result;
    });
    sim.step();

    expect(sawToolPickup).toBe(false);
    expect(person.inventory.count('spear')).toBe(0);
    expect(pile.contents.count('spear')).toBe(1);
  });
});
