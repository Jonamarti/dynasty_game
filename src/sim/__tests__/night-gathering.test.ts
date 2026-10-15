import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { drivePressures } from '../ai/Drives.ts';
import { roofOverPrivateRest } from '../systems/LifeSystem.ts';
import type { Person } from '../entities/Person.ts';

/**
 * M15 close: the dark gathers a band under roofs, and a couple awake alone in
 * a finished house have the privacy to conceive. Neither is a schedule; both
 * are pressures the existing scorer weighs.
 */
function world() {
  const sim = new Simulation({ seed: 'night-gathering', world: { width: 64, height: 64,
    predators: 0, gameHerds: 0 }, population: { bands: 1, peoplePerBand: 6 } });
  const adults = sim.people.filter(p => !p.isChild) as Person[];
  return { sim, adults };
}

/** A pressure context for `drivePressures` at a given daylight and exposure. */
function homeCtx(sim: Simulation, daylight: number, nightExposure: number) {
  return {
    world: sim.world, peopleById: sim.peopleById, buildingsById: sim.buildingsById,
    householdsById: sim.householdsById, homes: new Map([[0, { x: 10, y: 10 }]]),
    motivation: { ...sim.config.motivation, nightExposure },
    time: { daylight, dayFraction: 0 }, needs: sim.config.needs,
  };
}

describe('the dark pulls the tired towards shelter', () => {
  it('raises the home pressure of a tired person far from camp at night, and only at night', () => {
    const { sim, adults } = world();
    const person = adults[0]!;
    person.householdId = null;
    person.x = 10 + 18; person.y = 10;
    person.needs.fatigue = 70;
    const at = (daylight: number, exposure: number) =>
      drivePressures(person, homeCtx(sim, daylight, exposure)).home;
    expect(at(0, 6)).toBeGreaterThan(at(0, 0));
    // Noon: darkness is zero, so the exposure term has nothing to multiply.
    expect(at(1, 6)).toBeCloseTo(at(1, 0), 10);
  });

  it('does not let fatigue talk a person out of going home at night', () => {
    const { sim, adults } = world();
    const person = adults[0]!;
    person.householdId = null;
    person.x = 10 + 18; person.y = 10;
    person.needs.fatigue = 90;
    const night = drivePressures(person, homeCtx(sim, 0, 6)).home;
    const nightOld = drivePressures(person, homeCtx(sim, 0, 0)).home;
    expect(night).toBeGreaterThan(nightOld);
  });

  it('weighs the pull by attachment: the independent feel it less than the loyal', () => {
    const { sim, adults } = world();
    const loyal = adults[0]!, free = adults[1]!;
    for (const p of [loyal, free]) {
      p.householdId = null; p.x = 10 + 18; p.y = 10; p.needs.fatigue = 70;
    }
    loyal.traits.loyalty = 0.95; loyal.traits.curiosity = 0.05;
    free.traits.loyalty = 0.05; free.traits.curiosity = 0.95;
    const ctx = homeCtx(sim, 0, 6);
    expect(drivePressures(loyal, ctx).home).toBeGreaterThan(drivePressures(free, ctx).home);
  });
});

describe('privacy to conceive', () => {
  function house() {
    const { sim, adults } = world();
    const [a, b, c] = adults as [Person, Person, Person];
    a.spouseId = b.id; b.spouseId = a.id;
    let site = null as ReturnType<Simulation['place']>;
    for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6], [10, 10]]) {
      site = sim.place('windbreak', Math.round(a.x) + dx!, Math.round(a.y) + dy!, a.bandId);
      if (site) break;
    }
    expect(site).not.toBeNull();
    site!.complete = true;
    for (const p of [a, b, c]) { p.x = site!.centerX; p.y = site!.centerY; p.action = 'rest'; }
    const occupants = (building: { contains(x: number, y: number, m?: number): boolean }) =>
      sim.people.filter(p => p.alive && building.contains(p.x, p.y, 1));
    const roofOf = (p: Person) =>
      roofOverPrivateRest(p, sim.buildingsById, (x, y) => sim.buildingAt(x, y), occupants as never);
    // Everyone else is somewhere else, so the third wheel is the only one left.
    for (const p of sim.people) if (![a, b, c].includes(p)) { p.x = 0; p.y = 0; }
    return { sim, a, b, c, site: site!, roofOf };
  }

  it('counts a couple resting awake alone in a finished shelter', () => {
    const { a, b, c, site, roofOf } = house();
    c.x = 1; c.y = 1;
    expect(roofOf(a)?.id).toBe(site.id);
    expect(roofOf(b)?.id).toBe(site.id);
  });

  it('refuses when someone else is awake in the same building', () => {
    const { a, roofOf } = house();
    expect(roofOf(a)).toBeNull();
  });

  it('does not count sleepers: a family with a sleeping child still has privacy', () => {
    const { a, c, site, roofOf } = house();
    c.action = 'sleep';
    expect(roofOf(a)?.id).toBe(site.id);
  });

  it('refuses an unfinished shelter and anyone not resting', () => {
    const { a, site, roofOf } = house();
    site.complete = false;
    expect(roofOf(a)).toBeNull();
    site.complete = true;
    a.action = 'idle';
    expect(roofOf(a)).toBeNull();
  });
});
