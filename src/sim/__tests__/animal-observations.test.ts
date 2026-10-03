/** Simulation-side event stamps consumed later by presentation code. */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import type { Animal } from '../entities/Animal.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'animal-observations',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6, startingTech: ['tracking', 'taming'] },
};

function quiet(person: Person): void {
  person.needs.hunger = 0;
  person.needs.thirst = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
}

function silenceWildlife(sim: Simulation, except: Animal): void {
  for (const animal of sim.animals) if (animal !== except) animal.alive = false;
}

describe('animal event timestamps', () => {
  it('records actual grazing even when the animal is already fed', () => {
    const sim = new Simulation(SMALL);
    const deer = sim.animals.find(animal => animal.species === 'deer')!;
    silenceWildlife(sim, deer);

    const tile = sim.world.findWalkableNear(24, 24)!;
    const index = tile.y * sim.world.width + tile.x;
    sim.world.grass.fill(0);
    sim.world.grassCap.fill(0);
    sim.world.grass[index] = 1;
    sim.world.grassCap[index] = 1;
    deer.x = tile.x + 0.5;
    deer.y = tile.y + 0.5;
    deer.fed = 1;
    const grassBefore = sim.world.grass[index]!;

    for (let i = 0; i < 10 && deer.lastMealAt === -Infinity; i++) sim.step();

    expect(sim.world.grass[index]).toBeLessThan(grassBefore);
    expect(deer.lastMealAt).toBe(sim.time.tick);
  });

  it('records a real offered meal on the tick food is delivered', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
    const animal = sim.animals.find(candidate => candidate.species === 'deer')!;
    quiet(person);
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('berries', 1);
    animal.x = person.x + 0.5;
    animal.y = person.y;
    // Feeding somebody once makes it safe to approach on the wildlife pass.
    animal.fedBy.add(person.id);
    expect(sim.order(person, 'tame', { animalId: animal.id })).toBe(true);

    for (let i = 0; i < 5 && animal.lastMealAt === -Infinity; i++) sim.step();

    expect(animal.meals).toBe(1);
    expect(animal.lastMealAt).toBe(sim.time.tick);
  });

  it('stamps a predator run and attack attempt before bite success is known', () => {
    const sim = new Simulation(SMALL);
    const bear = sim.animals.find(animal => animal.species === 'bear')!;
    const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
    silenceWildlife(sim, bear);
    quiet(person);
    const tile = sim.world.findWalkableNear(Math.round(person.x), Math.round(person.y))!;
    bear.x = tile.x + 0.5;
    bear.y = tile.y + 0.5;
    person.x = bear.x;
    person.y = bear.y;
    sim['rebuildHashes']();

    for (let i = 0; i < 20 && bear.lastAttackAt === -Infinity; i++) sim.step();

    expect(bear.lastRunAt).toBeGreaterThanOrEqual(0);
    expect(bear.lastAttackAt).toBe(sim.time.tick);
  });

  it('stamps a quarry only when its effective doHunt counterattack succeeds', () => {
    let counterattacked: Animal | null = null;
    let didNotCounterattack = false;
    // Find a reproducible stream whose first attack misses and whose quarry
    // succeeds on the separate counterattack roll, before another hunt roll.
    for (let seed = 0; seed < 40 && (counterattacked === null || !didNotCounterattack); seed++) {
      const sim = new Simulation({ ...SMALL, seed: `animal-observations-counter-${seed}` });
      const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
      const deer = sim.animals.find(candidate => !candidate.def.predator && candidate.def.defends)!;
      silenceWildlife(sim, deer);
      quiet(person);
      person.skills.hunt = 0;
      deer.fedBy.add(person.id);
      const tile = sim.world.findWalkableNear(Math.round(person.x), Math.round(person.y))!;
      deer.x = tile.x + 0.5;
      deer.y = tile.y + 0.5;
      person.x = deer.x;
      person.y = deer.y;
      expect(sim.order(person, 'hunt', { animalId: deer.id })).toBe(true);
      sim.step();
      // The grudge is set by the real defence branch, independently of the
      // presentation hook. This catches stamping a human's ordinary hunt as
      // an animal attack, including a human miss with no counterattack.
      expect(deer.lastAttackAt >= 0).toBe(deer.hurtBy === person.id);
      if (deer.lastAttackAt === -Infinity) didNotCounterattack = true;
      if (deer.alive && deer.lastAttackAt >= 0) counterattacked = deer;
    }

    // A human miss alone is not an animal attack. The timestamp is written
    // only after the defending prey wins its counterattack chance roll.
    expect(counterattacked).not.toBeNull();
    expect(didNotCounterattack).toBe(true);
  }, 60000);
});
