import { describe, expect, it } from 'vitest';
import { lastScores } from '../ai/Brain.ts';
import { stallReason } from '../ai/Autonomy.ts';
import { telemetry } from '../core/Telemetry.ts';
import { Simulation } from '../core/Simulation.ts';
import { PlaceMemory } from '../social/PlaceMemory.ts';

function emptyWorld(seed: string) {
  const sim = new Simulation({ seed,
    world: { width: 64, height: 64, berryBushes: 0, gameHerds: 0, predators: 0, treeDensity: 0 },
    population: { bands: 1, peoplePerBand: 4 }, sightRadius: 4 });
  const person = sim.possessFirst()!;
  sim.autonomy = 'urgent';
  for (const node of sim.nodes) node.amount = 0;
  for (const tree of sim.trees) tree.fruit = 0;
  for (const actor of sim.livingPeople()) {
    actor.needs.hunger = actor.needs.thirst = actor.needs.cold = actor.needs.fatigue = 0;
    for (const [item, count] of actor.inventory.entries()) actor.inventory.remove(item, count);
  }
  person.action = 'idle'; person.actionTimer = 0; person.order = null;
  person.commitment = null; person.clearTarget();
  return { sim, person };
}

describe('M16 2.17 need search capability', () => {
  it('m16-hungry-searches-farther', () => {
    const { sim, person } = emptyWorld('m16-hungry-searches-farther');
    person.needs.hunger = 100;
    lastScores.delete(person.id); telemetry.reset(); telemetry.enable();
    const start = { x: person.x, y: person.y };
    try {
      for (let i = 0; i < 48; i++) sim.step();
    } finally { telemetry.disable(); }
    expect(lastScores.get(person.id)?.some(score => score.id === 'explore')).toBe(true);
    expect(telemetry.get('food_exploration_offered')).toBeGreaterThan(0);
    expect(person.distanceTo(start)).toBeGreaterThan(0.1);
  });

  it('m16-water-between-lakes', () => {
    const { sim, person } = emptyWorld('m16-water-between-lakes');
    // No source is known or reachable by the scorer, and the whole walkable
    // patch has already been explored.
    sim.freshShoreHash.rebuild([]);
    sim.shoreHash.rebuild([]);
    sim.saltShoreHash.rebuild([]);
    person.placeMemory = new PlaceMemory(sim.world.width, sim.world.height);
    person.placeMemory.observe(person.x, person.y, 100, sim.time.day);
    person.needs.thirst = 100;
    for (let i = 0; i < 4; i++) sim.step();
    expect(sim.autonomyStall).toBe(stallReason('thirst'));
  });

  it('m16-eat-before-home', () => {
    const { sim, person } = emptyWorld('m16-eat-before-home');
    person.inventory.add('berries', 2);
    person.needs.hunger = 95;
    person.action = 'go_home'; person.actionTimer = 0;
    person.targetX = person.x + 20; person.targetY = person.y + 20;
    for (let i = 0; i < 20 && person.action !== 'eat'; i++) sim.step();
    expect(person.action).toBe('eat');
  });

  it('m16-known-water-keeps-route', () => {
    const sim = new Simulation({ seed: 'm16-known-water-keeps-route',
      world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
      population: { bands: 1, peoplePerBand: 6 } });
    const person = sim.possessFirst()!;
    sim.autonomy = 'auto';
    person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = person.needs.company = 0;
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.action = 'idle'; person.clearTarget(); person.order = null;
    const shore = sim.shoreHash.findNearest(person.x, person.y, 60);
    expect(shore).not.toBeNull();
    person.x = shore!.x; person.y = shore!.y;
    person.needs.thirst = sim.config.needs.workLimits.thirst + 1;
    person.action = 'go_home'; person.actionTimer = 0;
    person.targetX = person.x + 4; person.targetY = person.y;
    for (let i = 0; i < 12; i++) {
      sim.step();
      person.needs.thirst = sim.config.needs.workLimits.thirst + 1;
    }
    expect(['drink', 'ask_water', 'explore']).toContain(person.action);
  });
});
