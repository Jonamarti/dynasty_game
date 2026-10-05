import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { LifeSystem, type LifeContext } from '../systems/LifeSystem.ts';
import { RNG } from '../core/RNG.ts';
import type { Person } from '../entities/Person.ts';

/** M15 phase 18: a couple conceive only after a night under one roof. */
describe('conception needs a shared roof', () => {
  const couple = () => {
    const sim = new Simulation({ seed: 'roof', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 6 } });
    const adults = sim.people.filter(p => !p.isChild) as Person[];
    const mother = adults.find(p => p.canBearChildren)!;
    const father = adults.find(p => p !== mother && !p.canBearChildren)!;
    mother.spouseId = father.id; father.spouseId = mother.id;
    mother.pregnant = false;
    mother.lastBirthDay = -100000;
    mother.needs.hunger = 0; mother.health = 100;
    return { sim, mother, father };
  };
  const attempt = (roof: Map<number, number>, rolls = 40) => {
    const { sim, mother, father } = couple();
    const ctx = {
      rng: new RNG('roof-rolls'),
      population: { ...sim.config.population, conceptionChance: 1 },
      tick: 0, day: 0, peopleById: sim.peopleById, householdsById: sim.householdsById,
      roofTonight: roof,
      makeChild: () => { throw new Error('no birth expected'); },
      onBirth: () => {}, onDeath: () => {},
    } as unknown as LifeContext;
    const life = new LifeSystem();
    let conceived = false;
    for (let i = 0; i < rolls && !conceived; i++) {
      life.daily([mother], ctx);
      conceived = mother.pregnant;
    }
    return { conceived, mother, father };
  };

  it('conceives under one roof', () => {
    const { mother, father } = couple();
    expect(attempt(new Map([[mother.id, 7], [father.id, 7]])).conceived).toBe(true);
  });

  it('does not conceive in the open, or under two different roofs', () => {
    const { mother, father } = couple();
    expect(attempt(new Map()).conceived).toBe(false);
    expect(attempt(new Map([[mother.id, 7]])).conceived).toBe(false);
    expect(attempt(new Map([[mother.id, 7], [father.id, 8]])).conceived).toBe(false);
  });
});
