import { afterEach, describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import type { Person } from '../entities/Person.ts';
import { telemetry } from '../core/Telemetry.ts';
import type { Brain } from '../ai/Brain.ts';

function fixture(phase: number) {
  telemetry.enable();
  const sim = new Simulation({ seed: 'circadian', world: { width: 48, height: 48,
    predators: 0, gameHerds: 0 }, population: { bands: 1, peoplePerBand: 4 },
    ai: { choiceSpread: 0 }, motivation: { homePressure: false } });
  sim.time.tick = Math.round(phase * sim.config.time.ticksPerDay);
  const person = sim.livingPeople().find(p => !p.isChild)!;
  const roof = sim.place('windbreak', Math.round(person.x), Math.round(person.y), person.bandId)
    ?? sim.buildings.find(b => b.def.shelter > 0)!;
  roof.complete = true;
  person.x = roof.centerX; person.y = roof.centerY;
  for (const p of sim.people) {
    p.needs.hunger = 0; p.needs.thirst = 0; p.needs.cold = 0;
    p.needs.company = 0; p.needs.fatigue = 0;
    for (const [id, count] of p.inventory.entries()) p.inventory.remove(id, count);
    if (p !== person) sim.order(p, 'rest');
  }
  return { sim, person, roof };
}
afterEach(() => telemetry.disable());

function sleepWithoutOrder(person: Person, roofId: number) {
  person.forgetPlans(); person.action = 'sleep'; person.actionTimer = 1;
  person.targetBuildingId = roofId;
}

describe('circadian sleep and nearby shelter', () => {
  it('does not repeatedly wake a comfortable midnight sleeper as soon as debt reaches zero', () => {
    const { sim, person, roof } = fixture(0);
    sleepWithoutOrder(person, roof.id);
    sim.step();
    expect(person.action).toBe('sleep');
    expect(person.needs.fatigue).toBe(0);
  });

  it('allows an exhausted adult to nap in an available roof at noon', () => {
    const { sim, person, roof } = fixture(0.5);
    person.forgetPlans(); person.action = 'idle'; person.actionTimer = 0;
    person.needs.fatigue = 100;
    // Compare the resting alternatives, without an unrelated building proposal
    // competing with the nap. This tests permission and the roof destination.
    const brain = (sim as unknown as { brain: Brain }).brain;
    const think = brain.think.bind(brain);
    brain.think = (p, ctx) => think(p, ctx, new Set(['sleep', 'rest']));
    sim.step();
    expect(person.action).toBe('sleep');
    expect(person.targetBuildingId).toBe(roof.id);
  });

  it('lets an autonomous rest approach its roof instead of recovering outside', () => {
    const { sim, person, roof } = fixture(0.5);
    const ground = [...Array(sim.world.width * sim.world.height).keys()]
      .map(i => ({ x: i % sim.world.width, y: Math.floor(i / sim.world.width) }))
      .find(p => sim.world.isWalkable(p.x, p.y) && !roof.contains(p.x, p.y) &&
        Math.hypot(p.x - roof.centerX, p.y - roof.centerY) < 4 &&
        sim.world.sameRegion(p.x, p.y, roof.centerX, roof.centerY))!;
    expect(ground).toBeDefined();
    person.x = ground.x; person.y = ground.y;
    person.forgetPlans(); person.action = 'rest'; person.actionTimer = 1;
    person.targetBuildingId = roof.id; person.needs.fatigue = 90;
    const start = person.needs.fatigue;
    sim.step();
    expect(person.needs.fatigue).toBeGreaterThanOrEqual(start);
    for (let i = 0; i < 60 && !roof.contains(person.x, person.y); i++) sim.step();
    expect(roof.contains(person.x, person.y)).toBe(true);
  });

  it('still wakes for urgent hunger during the night', () => {
    const { sim, person, roof } = fixture(0);
    sleepWithoutOrder(person, roof.id);
    person.needs.hunger = 80; person.needs.fatigue = 70;
    telemetry.reset();
    sim.step();
    expect(person.action).not.toBe('sleep');
    expect(telemetry.snapshot().woke_hungry).toBe(1);
  });

  it('wakes a rested autonomous sleeper when the clock supplies daytime alertness', () => {
    const { sim, person, roof } = fixture(0.5);
    sleepWithoutOrder(person, roof.id);
    telemetry.reset();
    sim.step();
    expect(person.action).not.toBe('sleep');
    expect(telemetry.snapshot().woke_rested).toBe(1);
  });
});
