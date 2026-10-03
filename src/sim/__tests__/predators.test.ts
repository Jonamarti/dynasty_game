/**
 * The hunters (M15 phases 23e and 23f): where they begin, what they take, and
 * what a fire does to them.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { telemetry } from '../core/Telemetry.ts';

telemetry.enable();

function steps(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) sim.step();
}

describe('predators', () => {
  it('begin away from the founders, and not at all when there are none', { timeout: 60000 }, () => {
    const sim = new Simulation({ seed: 'pred-1' });
    const hunters = sim.animals.filter(a => a.def.predator);
    expect(hunters.length).toBeGreaterThan(0);
    for (const h of hunters) {
      for (const p of sim.people) expect(Math.hypot(p.x - h.x, p.y - h.y)).toBeGreaterThan(20);
    }
    const bare = new Simulation({ seed: 'pred-1', world: { predators: 0 } });
    expect(bare.animals.some(a => a.def.predator)).toBe(false);
  });

  it('do not move the herbivores or the people', { timeout: 60000 }, () => {
    const a = new Simulation({ seed: 'pred-2' });
    const b = new Simulation({ seed: 'pred-2', world: { predators: 0 } });
    const prey = (s: Simulation) => s.animals.filter(x => !x.def.predator).map(x => `${x.species}${x.x}${x.y}`);
    expect(prey(a)).toEqual(prey(b));
    expect(a.people.map(p => p.x + ',' + p.y)).toEqual(b.people.map(p => p.x + ',' + p.y));
  });

  it('a hungry wolf pulls down a deer beside it', { timeout: 60000 }, () => {
    const sim = new Simulation({ seed: 'pred-3' });
    const wolf = sim.animals.find(a => a.species === 'wolf')!;
    const deer = sim.animals.filter(a => a.species === 'deer').slice(0, 6);
    for (const d of deer) { d.x = wolf.x + 1; d.y = wolf.y; d.herdId = 9999; }
    for (const mate of sim.animals.filter(a => a.herdId === wolf.herdId)) mate.fed = 0.2;
    const before = telemetry.get('prey_killed_by_predator');
    steps(sim, 1200);
    expect(telemetry.get('prey_killed_by_predator')).toBeGreaterThan(before);
    expect(sim.animals.some(animal => animal.def.predator && animal.lastRunAt >= 0)).toBe(true);
    expect(sim.animals.some(animal => animal.def.predator && animal.lastAttackAt >= 0)).toBe(true);
    expect(sim.animals.some(animal => animal.def.predator && animal.lastMealAt >= 0)).toBe(true);
  });

  it('a bear walked in on wounds the person, and the person runs', { timeout: 60000 }, () => {
    const sim = new Simulation({ seed: 'pred-4' });
    const bear = sim.animals.find(a => a.species === 'bear')!;
    const person = sim.people.find(p => p.alive && !p.isChild)!;
    const spot = sim.world.findWalkableNear(Math.round(bear.x) + 1, Math.round(bear.y)) ?? { x: bear.x, y: bear.y };
    person.x = spot.x; person.y = spot.y;
    const bites = telemetry.get('animal_bit_person_bear');
    steps(sim, 400);
    expect(telemetry.get('animal_bit_person_bear')).toBeGreaterThan(bites);
    expect(person.health).toBeLessThan(100);
    expect(bear.lastRunAt).toBeGreaterThanOrEqual(0);
    expect(bear.lastAttackAt).toBeGreaterThanOrEqual(0);
  });

  it("keep out of a fire's circle", { timeout: 60000 }, () => {
    const sim = new Simulation({ seed: 'pred-5' });
    const bear = sim.animals.find(a => a.species === 'bear')!;
    const person = sim.people.find(p => p.alive && !p.isChild)!;
    sim.knownTech.add('firemaking');
    let hearth: ReturnType<typeof sim.place> = null;
    for (let ring = 2; ring <= 12 && !hearth; ring++) {
      for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring]]) {
        hearth = sim.place('hearth', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
        if (hearth) break;
      }
    }
    expect(hearth, 'nowhere to put a hearth for the test').not.toBeNull();
    hearth!.complete = true;
    // The bear has come to the camp, hungry; the hearth is between it and them.
    const spot = sim.world.findWalkableNear(Math.round(hearth!.centerX) + 2, Math.round(hearth!.centerY))!;
    bear.x = spot.x; bear.y = spot.y; bear.fed = 0.1;
    person.x = hearth!.centerX; person.y = hearth!.centerY;
    const bites = telemetry.get('animal_bit_person_bear');
    const kept = telemetry.get('predator_kept_off_by_fire');
    steps(sim, 400);
    expect(telemetry.get('animal_bit_person_bear')).toBe(bites);
    expect(telemetry.get('predator_kept_off_by_fire')).toBeGreaterThan(kept);
  });
});
