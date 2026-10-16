import { describe, expect, it } from 'vitest';
import { lastScores } from '../ai/Brain.ts';
import { telemetry } from '../core/Telemetry.ts';
import { Simulation } from '../core/Simulation.ts';
import { ADULT_YEARS } from '../entities/Person.ts';

function emptySearch(seed: string) {
  const sim = new Simulation({ seed,
    world: { width: 64, height: 64, berryBushes: 0, gameHerds: 0, predators: 0, treeDensity: 0 },
    population: { bands: 1, peoplePerBand: 4 }, sightRadius: 4 });
  sim.autonomy = 'auto';
  const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
  for (const node of sim.nodes) node.amount = 0;
  for (const tree of sim.trees) tree.fruit = 0;
  for (const actor of sim.livingPeople()) {
    actor.needs.hunger = 0;
    actor.needs.thirst = 0;
    actor.needs.cold = 0;
    actor.needs.fatigue = 0;
    for (const [item, count] of actor.inventory.entries()) actor.inventory.remove(item, count);
  }
  return { sim, person };
}

function executeExplore(sim: Simulation, person: ReturnType<typeof emptySearch>['person']) {
  person.action = 'explore';
  person.actionTimer = 1;
  person.commitment = null;
  person.targetX = person.x + 8;
  person.targetY = person.y;
  const before = { x: person.x, y: person.y };
  sim.step();
  return person.distanceTo(before);
}

describe('urgent food exploration', () => {
  it('makes its first movement when hunger has reached 100 and no edible source is known', () => {
    const { sim, person } = emptySearch('food-search-critical-progress');
    person.needs.hunger = 100;
    person.action = 'idle';
    person.actionTimer = 0;
    person.order = null;
    person.commitment = null;
    const interval = sim.config.thinkInterval;
    (person as any).thinkOffset = (interval - ((sim.time.tick + 1) % interval)) % interval;
    lastScores.delete(person.id);
    telemetry.reset();
    telemetry.enable();
    const before = { x: person.x, y: person.y };

    try { sim.step(); } finally { telemetry.disable(); }

    expect(lastScores.get(person.id)?.some(row => row.id === 'explore')).toBe(true);
    expect(telemetry.get('food_exploration_offered')).toBeGreaterThan(0);
    expect(person.distanceTo(before)).toBeGreaterThan(0.1);
  });

  it('keeps thirst and cold as independent interruptions', () => {
    const thirsty = emptySearch('food-search-thirst-control');
    thirsty.person.needs.hunger = 100;
    thirsty.person.needs.thirst = 100;
    expect(executeExplore(thirsty.sim, thirsty.person)).toBe(0);
    expect(thirsty.person.action).toBe('idle');

    const cold = emptySearch('food-search-cold-control');
    cold.person.needs.hunger = 100;
    cold.person.needs.cold = 100;
    expect(executeExplore(cold.sim, cold.person)).toBe(0);
    expect(cold.person.action).toBe('idle');
  });

  it('keeps danger, carried meals, child status and explicit orders outside the exception', () => {
    const danger = emptySearch('food-search-danger-control');
    danger.person.needs.hunger = 100;
    const assailant = danger.sim.livingPeople().find(actor => actor.id !== danger.person.id)!;
    danger.person.lastHarmedBy = assailant.id;
    danger.person.lastHarmedTick = danger.sim.time.tick;
    expect(executeExplore(danger.sim, danger.person)).toBe(0);
    expect(danger.person.action).toBe('idle');

    const fed = emptySearch('food-search-carried-meal-control');
    fed.person.needs.hunger = 100;
    fed.person.inventory.add('berries', 1);
    expect(executeExplore(fed.sim, fed.person)).toBe(0);
    expect(fed.person.action).toBe('idle');

    const child = emptySearch('food-search-child-control');
    child.person.age = (ADULT_YEARS - 1) * child.person.daysPerYear;
    child.person.needs.hunger = 100;
    expect(executeExplore(child.sim, child.person)).toBe(0);
    expect(child.person.action).toBe('idle');

    const ordered = emptySearch('food-search-manual-order-control');
    ordered.person.needs.hunger = 100;
    ordered.person.order = 'explore';
    expect(executeExplore(ordered.sim, ordered.person)).toBe(0);
    expect(ordered.person.action).toBe('idle');
  });
});
