import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { PlaceMemory } from '../social/PlaceMemory.ts';
import { lastScores } from '../ai/Brain.ts';
import { anchorOf, reachOf } from '../ai/Anchor.ts';
import type { Brain } from '../ai/Brain.ts';
import { telemetry } from '../core/Telemetry.ts';

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

  it('lets an adult explore beyond the home radius for food when hunger stops ordinary work', () => {
    const sim = new Simulation({ seed: 'hungry-exploration-beyond-home', sightRadius: 4,
      world: { width: 48, height: 48, heightSight: 0, regrowthRate: 0, predators: 0 },
      population: { bands: 1, peoplePerBand: 4 },
      motivation: { homePressure: false, reachFilter: true, reachAdult: 4 }, ai: { choiceSpread: 0 } });
    const person = sim.livingPeople()[0]!;
    for (const node of sim.nodes) node.amount = 0;
    for (const tree of sim.trees) { tree.standing = false; tree.fruit = 0; }
    for (const animal of sim.animals) animal.alive = false;
    for (const other of sim.people) if (other !== person) sim.order(other, 'rest');
    const context = {
      world: sim.world, peopleById: sim.peopleById, buildingsById: sim.buildingsById,
      householdsById: sim.householdsById,
      homes: new Map([[person.bandId, { x: person.x, y: person.y }]]), motivation: sim.config.motivation,
    };
    const anchor = anchorOf(person, context)!;
    const reach = reachOf(person, context);
    const far = [...Array(sim.world.width * sim.world.height).keys()]
      .map(i => ({ x: i % sim.world.width, y: Math.floor(i / sim.world.width) }))
      .find(p => sim.world.isWalkable(p.x, p.y) && sim.world.sameRegion(person.x, person.y, p.x, p.y) &&
        Math.hypot(p.x - anchor.x, p.y - anchor.y) > reach + 6 && person.distanceTo(p) > 6)!;
    expect(far).toBeDefined();
    const food = sim.nodes.find(n => n.kind === 'berries')!;
    food.x = far.x; food.y = far.y; food.amount = food.def.maxAmount;
    sim.nodeHash.rebuild(sim.nodes);
    person.placeMemory = new PlaceMemory(sim.world.width, sim.world.height);
    // The player knows every plausible frontier inside home reach, so only a
    // genuinely farther food search can produce an explore destination.
    person.placeMemory.observe(anchor.x, anchor.y, reach + 5, sim.time.day);
    person.placeMemoryStaticCell = -1; person.placeMemoryStaticDay = -1;
    person.forgetPlans();
    person.commitment = null;
    person.action = 'idle'; person.actionTimer = 0; person.clearTarget();
    for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
    person.needs.hunger = 95; person.needs.thirst = 0; person.needs.cold = 0;
    person.needs.fatigue = 0; person.needs.company = 0;
    lastScores.delete(person.id);
    const brain = (sim as unknown as { brain: Brain }).brain;
    const think = brain.think.bind(brain);
    let chosen: string | null = null;
    brain.think = (current, context, allowed) => {
      const action = think(current, context, allowed);
      if (current.id === person.id) chosen = action;
      return action;
    };
    telemetry.reset(); telemetry.enable();
    sim.step();
    const beyondHome = telemetry.get('food_exploration_beyond_home_offered');
    telemetry.disable();
    expect(lastScores.get(person.id)?.some(row => row.id === 'explore')).toBe(true);
    expect(beyondHome).toBeGreaterThan(0);
    expect(chosen).toBe('explore');
    expect(person.action).toBe('explore');
  });

  it('chooses a real food target over a no-op rest when hunger is critical', () => {
    const sim = new Simulation({ seed: 'critical-hunger-forage', sightRadius: 5,
      world: { width: 48, height: 48, heightSight: 0, regrowthRate: 0, predators: 0 },
      population: { bands: 1, peoplePerBand: 4 },
      motivation: { homePressure: false, reachFilter: false }, ai: { choiceSpread: 0 } });
    const person = sim.livingPeople()[0]!;
    const food = sim.nodes.find(n => n.kind === 'berries')!;
    for (const node of sim.nodes) node.amount = node === food ? node.def.maxAmount : 0;
    for (const tree of sim.trees) { tree.standing = false; tree.fruit = 0; }
    for (const animal of sim.animals) animal.alive = false;
    for (const other of sim.people) if (other !== person) sim.order(other, 'rest');
    food.x = person.x; food.y = person.y;
    sim.nodeHash.rebuild(sim.nodes);
    person.forgetPlans(); person.commitment = null;
    person.action = 'idle'; person.actionTimer = 0; person.clearTarget();
    for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
    person.needs.hunger = 80; person.needs.thirst = 0; person.needs.cold = 0;
    person.needs.fatigue = 0; person.needs.company = 0;
    lastScores.delete(person.id);
    sim.step();
    expect(lastScores.get(person.id)?.some(row => row.id === 'forage')).toBe(true);
    expect(person.action).toBe('forage');
  });
});
