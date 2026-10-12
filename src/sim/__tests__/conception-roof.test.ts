import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { LifeSystem, type LifeContext } from '../systems/LifeSystem.ts';
import { RNG } from '../core/RNG.ts';
import type { Person } from '../entities/Person.ts';
import { telemetry } from '../core/Telemetry.ts';

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
    telemetry.reset();
    telemetry.enable();
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
    const counts = telemetry.snapshot();
    telemetry.disable();
    telemetry.reset();
    return { conceived, mother, father, counts };
  };

  it('conceives under one roof', () => {
    const { mother, father } = couple();
    const result = attempt(new Map([[mother.id, 7], [father.id, 7]]));
    expect(result.conceived).toBe(true);
    expect(result.counts.conception_opportunity).toBeGreaterThan(0);
    expect(result.counts.conception_attempt).toBe(result.counts.conception_opportunity);
    expect(result.counts.conception_expected_rolls).toBeGreaterThan(0);
    expect(result.counts.conception).toBe(1);
    expect(result.counts.conception_no_roof).toBeUndefined();
  });

  it('does not conceive in the open, or under two different roofs', () => {
    const { mother, father } = couple();
    const open = attempt(new Map());
    expect(open.conceived).toBe(false);
    expect(open.counts.conception_opportunity).toBe(40);
    expect(open.counts.conception_attempt).toBe(40);
    expect((open.counts.conception_no_roof ?? 0) + (open.counts.conception_roll_miss ?? 0))
      .toBe(open.counts.conception_attempt);
    expect(open.counts.conception).toBeUndefined();
    expect(attempt(new Map([[mother.id, 7]])).conceived).toBe(false);
    expect(attempt(new Map([[mother.id, 7], [father.id, 8]])).conceived).toBe(false);
  });

  it('measures pre-draw barriers without rolling the conception stream', () => {
    const { sim, mother, father } = couple();
    telemetry.reset();
    telemetry.enable();
    const ctx = {
      rng: new RNG('funnel-barriers'), population: { ...sim.config.population, conceptionChance: 1 },
      tick: 0, day: 0, peopleById: sim.peopleById, householdsById: sim.householdsById,
      roofTonight: new Map([[mother.id, 7], [father.id, 7]]),
      makeChild: () => { throw new Error('no birth expected'); }, onBirth: () => {}, onDeath: () => {},
    } as unknown as LifeContext;
    mother.lastBirthDay = 0;
    new LifeSystem().daily([mother], ctx);
    mother.lastBirthDay = -100000;
    mother.spouseId = null;
    new LifeSystem().daily([mother], ctx);
    mother.spouseId = father.id;
    mother.needs.hunger = 140;
    new LifeSystem().daily([mother], ctx);
    const counts = telemetry.snapshot();
    telemetry.disable();
    telemetry.reset();
    expect(counts.conception_opportunity).toBe(3);
    expect(counts.conception_block_spacing).toBe(1);
    expect(counts.conception_block_partner).toBe(1);
    expect(counts.conception_block_hunger).toBe(1);
    expect(counts.conception_attempt).toBeUndefined();
  });
});
