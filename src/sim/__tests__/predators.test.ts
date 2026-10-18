/**
 * The hunters (M15 phases 23e and 23f): where they begin, what they take, and
 * what a fire does to them.
 */
import { describe, it, expect, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { placeFixtureStation } from '../../../tools/territoryFixture.ts';
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
    // One person and one bear make the bite counter answer the question this
    // fixture asks. Otherwise another isolated adult outside the hearth's
    // seven-tile circle can be bitten by the same bear and look like a breach.
    for (const other of sim.animals) if (other !== bear && other.species === 'bear') other.alive = false;
    for (const other of sim.people) if (other !== person) other.alive = false;
    sim.knownTech.add('firemaking');
    let hearth: ReturnType<typeof sim.place> = null;
    for (let ring = 2; ring <= 12 && !hearth; ring++) {
      for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring]]) {
        const x = Math.round(person.x) + dx!, y = Math.round(person.y) + dy!;
        hearth = placeFixtureStation(sim, 'hearth', x, y, person.bandId);
        if (hearth) break;
      }
    }
    expect(hearth, 'nowhere to put a hearth for the test').not.toBeNull();
    hearth!.complete = true;
    // The bear has come to the camp, hungry; the hearth is between it and them.
    const spot = sim.world.findWalkableNear(Math.round(hearth!.centerX) + 2, Math.round(hearth!.centerY))!;
    bear.x = spot.x; bear.y = spot.y; bear.fed = 0.1;
    person.x = hearth!.centerX; person.y = hearth!.centerY;
    expect(sim.litNear(person.x, person.y, 7)).toBe(true);
    expect(sim.litNear(bear.x, bear.y, 7)).toBe(true);
    const bites = telemetry.get('animal_bit_person_bear');
    const kept = telemetry.get('predator_kept_off_by_fire');
    steps(sim, 400);
    expect(telemetry.get('animal_bit_person_bear')).toBe(bites);
    expect(person.health).toBe(100);
    expect(telemetry.get('predator_kept_off_by_fire')).toBeGreaterThan(kept);
  });

  it('a patrolling guard keeps a bear off a nearby adult', () => {
    const sim = new Simulation({ seed: 'predator-guard-active' });
    const bear = sim.animals.find(animal => animal.species === 'bear')!;
    const [person, guard] = sim.livingPeople().filter(candidate =>
      candidate.bandId === 0 && !candidate.isChild);
    expect(person).toBeDefined();
    expect(guard).toBeDefined();
    for (const animal of sim.animals) if (animal !== bear) animal.alive = false;
    for (const other of sim.people) if (other !== person && other !== guard) other.alive = false;

    person!.x = Math.round(person!.x) + 0.5;
    person!.y = Math.round(person!.y) + 0.5;
    guard!.x = person!.x + 6;
    guard!.y = person!.y;
    guard!.job = 'guard';
    guard!.action = 'patrol';
    bear.x = person!.x;
    bear.y = person!.y;
    bear.fed = 0;
    sim['rebuildHashes']();
    vi.spyOn(sim['ecologyRng'], 'chance').mockReturnValue(true);

    for (let i = 0; i < 10 && bear.lastAttackAt === -Infinity; i++) {
      guard!.action = 'patrol';
      guard!.targetX = guard!.x;
      guard!.targetY = guard!.y;
      sim.step();
    }

    expect(person!.health).toBe(100);
    expect(bear.lastAttackAt).toBe(-Infinity);
  });

  it('does not mistake an idle guard for an active patrol', () => {
    const sim = new Simulation({ seed: 'predator-guard-idle' });
    const bear = sim.animals.find(animal => animal.species === 'bear')!;
    const [person, guard] = sim.livingPeople().filter(candidate =>
      candidate.bandId === 0 && !candidate.isChild);
    expect(person).toBeDefined();
    expect(guard).toBeDefined();
    for (const animal of sim.animals) if (animal !== bear) animal.alive = false;
    for (const other of sim.people) if (other !== person && other !== guard) other.alive = false;

    person!.x = Math.round(person!.x) + 0.5;
    person!.y = Math.round(person!.y) + 0.5;
    guard!.x = person!.x + 6;
    guard!.y = person!.y;
    guard!.job = 'guard';
    guard!.action = 'idle';
    bear.x = person!.x;
    bear.y = person!.y;
    bear.fed = 0;
    sim['rebuildHashes']();
    vi.spyOn(sim['ecologyRng'], 'chance').mockReturnValue(true);

    for (let i = 0; i < 10 && bear.lastAttackAt === -Infinity; i++) {
      guard!.action = 'rest';
      sim.step();
    }

    expect(person!.health).toBeLessThan(100);
    expect(bear.lastAttackAt).toBe(sim.time.tick);
  });
});
