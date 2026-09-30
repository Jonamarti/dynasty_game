import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { makeConfig } from '../core/Config.ts';
import { NURSING_HUNGER } from '../ai/Nursing.ts';
import { capacityFor, itemCapacityFor } from '../core/Carry.ts';
import type { Person } from '../entities/Person.ts';
import { availableActions, type CatalogContext } from '../ai/ActionCatalog.ts';

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

  it('never tires a baby, and lets it be lonely only when nobody holds it', () => {
    const { sim, mother, baby } = family('carry-company');
    baby.x = mother.x + 3;
    baby.y = mother.y;
    for (let i = 0; i < 80 && baby.carriedBy !== mother.id; i++) sim.step();
    expect(baby.carriedBy).toBe(mother.id);
    baby.needs.company = 40;
    baby.needs.fatigue = 30;
    for (let i = 0; i < 20; i++) sim.step();
    expect(baby.needs.fatigue).toBe(0);
    expect(baby.needs.company).toBeLessThan(40);

    // Laid down on purpose, out of arms: the loneliness climbs again.
    baby.carriedBy = null;
    baby.laidDownBy = mother.id;
    baby.laidDownTick = sim.time.tick;
    const before = baby.needs.company;
    for (let i = 0; i < 20; i++) sim.step();
    expect(baby.carriedBy).toBeNull();
    expect(baby.needs.company).toBeGreaterThan(before);
    expect(baby.needs.fatigue).toBe(0);
  });
});

/**
 * M15 phase 20, the owner's report of 2026-09-30: playing a mother, the baby
 * was nowhere to be seen, its menu was an adult's, it could not be put down or
 * picked up, and she could spar with it in her arms.
 */
describe("a baby's menu and a parent's orders", () => {
  function held(seed: string) {
    const f = family(seed);
    f.baby.x = f.mother.x;
    f.baby.y = f.mother.y;
    for (let i = 0; i < 40 && f.baby.carriedBy !== f.mother.id; i++) f.sim.step();
    expect(f.baby.carriedBy).toBe(f.mother.id);
    return f;
  }
  const ctxOf = (sim: Simulation, subject: Person): CatalogContext => ({
    world: sim.world, nearWater: false, childhood: sim.config.childhood, peopleById: sim.peopleById,
    carriedBabies: sim.people.filter(p => p.alive && p.carriedBy === subject.id),
  });
  const ids = (options: { id: string; children?: { id: string }[] }[]): string[] =>
    options.flatMap(o => [o.id, ...(o.children ?? []).map(c => c.id)]);

  it('offers a baby its own verbs, not an adult conversation', () => {
    const { sim, mother, baby } = held('menu-baby');
    const options = availableActions(mother, { kind: 'person', x: baby.x, y: baby.y, person: baby }, ctxOf(sim, mother));
    const got = ids(options);
    expect(got).toContain('put_down_baby');
    expect(got).toContain('nurse');
    expect(got).toContain('play_with_baby');
    expect(got).not.toContain('talk');
    expect(got).not.toContain('spar');
    expect(options.find(o => o.id === 'nurse')!.enabled).toBe(true);
  });

  it('offers to lay the baby down on the ground clicked, and refuses sparring while holding it', () => {
    const { sim, mother } = held('menu-ground');
    const ground = availableActions(mother, { kind: 'ground', x: Math.round(mother.x), y: Math.round(mother.y) }, ctxOf(sim, mother));
    expect(ground.find(o => o.id === 'put_down_baby')?.enabled).toBe(true);
    const other = sim.people[2]! as Person;
    other.age = 25 * other.daysPerYear;
    const menu = availableActions(mother, { kind: 'person', x: other.x, y: other.y, person: other }, ctxOf(sim, mother));
    const spar = ids(menu).includes('spar')
      ? menu.flatMap(o => [o, ...(o.children ?? [])]).find(o => o.id === 'spar')! : null;
    expect(spar?.enabled).toBe(false);
  });

  it('puts the baby down where told, and the mother leaves it there', () => {
    const { sim, mother, baby } = held('order-down');
    mother.isPlayer = true;
    const x = Math.round(mother.x) + 2;
    const y = Math.round(mother.y);
    expect(sim.order(mother, 'put_down_baby', { personId: baby.id, x, y })).toBe(true);
    for (let i = 0; i < 60 && baby.carriedBy !== null; i++) sim.step();
    expect(baby.carriedBy).toBeNull();
    expect(baby.laidDownBy).toBe(mother.id);
    for (let i = 0; i < 60; i++) sim.step();
    expect(baby.carriedBy).toBeNull();

    // And picked up again from wherever it lies, on an order.
    expect(sim.order(mother, 'carry_baby', { personId: baby.id })).toBe(true);
    for (let i = 0; i < 60 && baby.carriedBy !== mother.id; i++) sim.step();
    expect(baby.carriedBy).toBe(mother.id);
  });

  it('lets anybody of the band pick a baby up on an order, and refuses milk to a man', () => {
    const { sim, baby } = family('order-father');
    const father = sim.people[2]! as Person;
    father.sex = 'male';
    father.age = 25 * father.daysPerYear;
    father.bandId = baby.bandId;
    father.needs.hunger = 0;
    father.needs.thirst = 0;
    baby.x = father.x + 1;
    baby.y = father.y;
    expect(sim.order(father, 'nurse', { personId: baby.id })).toBe(false);
    expect(sim.order(father, 'carry_baby', { personId: baby.id })).toBe(true);
    for (let i = 0; i < 60 && baby.carriedBy !== father.id; i++) sim.step();
    expect(baby.carriedBy).toBe(father.id);
  });
});
