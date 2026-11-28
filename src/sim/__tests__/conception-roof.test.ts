import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { LifeSystem, type LifeContext } from '../systems/LifeSystem.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
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

  it('counts private rest under a furnished roof without changing furniture selection or privacy', () => {
    const { sim, mother, father } = couple();
    const hut = sim.buildings.find(b => b.def.id === 'mud_hut' && b.ownerBandId === mother.bandId)!;
    expect(hut).toBeDefined();
    hut.complete = true;
    hut.durability = hut.def.workTicks;
    const bench = new Building(BUILDINGS.bench!, hut.x + 1, hut.y + 1, mother.bandId, sim.ids);
    bench.hostId = hut.id;
    bench.complete = true;
    sim.buildings.push(bench);
    sim.buildingsById.set(bench.id, bench);
    sim.buildingHash.rebuild(sim.buildings);
    for (const p of sim.people) {
      p.action = 'idle';
      p.x = hut.x - 6;
      p.y = hut.y - 6;
    }
    mother.action = 'rest'; father.action = 'rest';
    mother.targetBuildingId = bench.id; father.targetBuildingId = hut.id;
    mother.x = bench.x + 0.1; mother.y = bench.y + 0.1;
    father.x = hut.x + 2.25; father.y = hut.y + 1.25;
    sim.peopleHash.rebuild(sim.people);
    expect(sim.buildingAt(mother.x, mother.y)).toBe(bench);
    const midnight = sim as unknown as {
      shareTheHearth(): void;
      roofTonight: Map<number, number>;
    };
    midnight.shareTheHearth();
    expect(midnight.roofTonight.get(mother.id)).toBe(hut.id);
    expect(midnight.roofTonight.get(father.id)).toBe(hut.id);

    // A third awake occupant still prevents private rest from qualifying.
    const intruder = sim.people.find(p => p !== mother && p !== father && p.alive)!;
    intruder.x = hut.x + 1.25; intruder.y = hut.y + 2.25;
    sim.peopleHash.rebuild(sim.people);
    midnight.shareTheHearth();
    expect(midnight.roofTonight.has(mother.id)).toBe(false);
    expect(midnight.roofTonight.has(father.id)).toBe(false);
    intruder.x = hut.x - 6; intruder.y = hut.y - 6;
    // Being in the wall/door ring is not being inside a room.
    father.x = hut.x; father.y = hut.y + 1.25;
    sim.peopleHash.rebuild(sim.people);
    midnight.shareTheHearth();
    expect(midnight.roofTonight.has(father.id)).toBe(false);
    hut.durability = 0;
    midnight.shareTheHearth();
    expect(midnight.roofTonight.has(mother.id)).toBe(false);
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
