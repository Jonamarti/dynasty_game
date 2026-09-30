import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { makeConfig } from '../core/Config.ts';
import { NURSING_HUNGER } from '../ai/Nursing.ts';
import { capacityFor, itemCapacityFor } from '../core/Carry.ts';
import type { Person } from '../entities/Person.ts';

/**
 * M15 phase 20, the owner's rule of 2026-09-30: a mother carries a baby that
 * cannot walk in one arm, gathers with the other, and nurses it wherever she
 * is. A baby that walks is put down.
 */
function family(seed: string, overrides = {}) {
  const sim = new Simulation(makeConfig({ seed, world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 4 }, ...overrides }));
  const mother = sim.people[0]! as Person;
  const baby = sim.people[1]! as Person;
  mother.sex = 'female';
  mother.age = 25 * mother.daysPerYear;
  mother.childIds = [baby.id];
  mother.needs.hunger = 0;
  mother.needs.thirst = 0;
  baby.age = 1;
  baby.bandId = mother.bandId;
  baby.motherId = mother.id;
  baby.needs.hunger = 0;
  baby.needs.thirst = 0;
  return { sim, mother, baby };
}

describe('carrying the baby', () => {
  it('picks up a baby that cannot walk and keeps it with her', () => {
    const { sim, mother, baby } = family('carry-pickup');
    baby.x = mother.x + 3;
    baby.y = mother.y;
    for (let i = 0; i < 80 && baby.carriedBy !== mother.id; i++) sim.step();
    expect(baby.carriedBy).toBe(mother.id);
    expect(mother.armsTaken).toBe(1);
    for (let i = 0; i < 40; i++) sim.step();
    expect(Math.hypot(baby.x - mother.x, baby.y - mother.y)).toBeLessThan(0.01);
  });

  it('halves bare-handed room and limits each thing to a handful', () => {
    const { sim, mother } = family('carry-hands');
    const free = capacityFor(mother, sim.config.carry);
    const armful = itemCapacityFor(mother, sim.config.carry, 'berries');
    mother.armsTaken = 1;
    expect(capacityFor(mother, sim.config.carry)).toBe(Math.floor(free / 2));
    expect(mother.carryCapacity).toBe(Math.max(1, Math.floor(10 * mother.vigour / 2)));
    expect(itemCapacityFor(mother, sim.config.carry, 'berries')).toBeLessThan(armful);
    mother.armsTaken = 2;
    expect(itemCapacityFor(mother, sim.config.carry, 'berries')).toBe(0);
  });

  it('nurses the baby where she stands, without a trip home', () => {
    const { sim, mother, baby } = family('carry-nurse');
    for (let i = 0; i < 80 && baby.carriedBy !== mother.id; i++) sim.step();
    expect(baby.carriedBy).toBe(mother.id);
    const where = { x: mother.x, y: mother.y };
    baby.needs.hunger = 90;
    for (let i = 0; i < 40 && baby.needs.hunger >= NURSING_HUNGER; i++) sim.step();
    expect(baby.needs.hunger).toBeLessThan(NURSING_HUNGER);
    expect(Math.hypot(mother.x - where.x, mother.y - where.y)).toBeLessThan(2);
  });

  it('keeps a carried baby as warm as the one carrying it', () => {
    const { sim, mother, baby } = family('carry-warm');
    for (let i = 0; i < 80 && baby.carriedBy !== mother.id; i++) sim.step();
    mother.needs.cold = 5;
    baby.needs.cold = 60;
    sim.step();
    expect(baby.needs.cold).toBeLessThanOrEqual(mother.needs.cold + 1);
  });

  it('puts the baby down once it walks', () => {
    const { sim, mother, baby } = family('carry-walk');
    for (let i = 0; i < 80 && baby.carriedBy !== mother.id; i++) sim.step();
    expect(baby.carriedBy).toBe(mother.id);
    baby.age = sim.config.childhood.walkYears * baby.daysPerYear;
    sim.step();
    expect(baby.carriedBy).toBeNull();
    expect(mother.armsTaken).toBe(0);
  });
});
