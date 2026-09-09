/**
 * M8.1, mechanism 3: the passive traps.
 *
 * These are unit tests rather than `simcheck` checks, and the reason is the one
 * that matters most in this project: a check has to fail on the broken build or
 * it is worse than no check at all. Whether anybody in a *world* walks out to a
 * trap depends on whether that world is hungry — measured against the version of
 * `Brain` that had no collection route, the collection counts overlapped (6
 * items of 59 caught on the broken build, 6 of 42 on the fixed one) while the
 * mechanism was plainly failing. What separates the two builds is not an
 * outcome; it is whether the scorer will walk to a full trap at all, and that is
 * a property of `Brain`.
 *
 * `simcheck` keeps the two questions a world *can* answer: does a band ever plan
 * a trap, and does a standing trap catch anything.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { accrueUnits } from '../core/Progress.ts';
import { lastScores } from '../ai/Brain.ts';
import { BUILDINGS, isTrap } from '../entities/Building.ts';
import type { Building } from '../entities/Building.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'traps-test',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: {
    bands: 1, peoplePerBand: 6,
    startingTech: ['cordage', 'tracking', 'snares'],
  },
};

/**
 * A world one day old.
 *
 * `knownTech` is derived from the living rather than stored, and the recount runs
 * in the daily block — so on tick zero the world officially knows nothing and
 * `place` refuses every gated design.
 */
function aDayIn(sim: Simulation): void {
  for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
}

/** A finished trap standing `away` tiles from `person`, wherever will take it. */
function trapNear(sim: Simulation, person: Person, id: string, away: number): Building {
  let placed = null;
  for (let ring = away; ring <= away + 6 && !placed; ring++) {
    for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring]]) {
      placed = sim.place(id, Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
      if (placed) break;
    }
  }
  expect(placed, 'nowhere to site a ' + id + ' for the test').not.toBeNull();
  // Finished by fiat: these are tests about what a trap does, not about whether
  // anybody can be bothered to weave one.
  placed!.complete = true;
  return placed!;
}

/** Somebody with nothing pressing, so a test measures what it means to. */
function settle(person: Person): void {
  person.needs.thirst = 0;
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  for (const [itemId, count] of person.inventory.entries()) person.inventory.remove(itemId, count);
}

/** What this person currently feels like doing, as the HUD would read it. */
function scoresFor(sim: Simulation, person: Person): { id: string; score: number }[] {
  sim.possess(person);
  lastScores.delete(person.id);
  for (let i = 0; i < 60 && !lastScores.has(person.id); i++) {
    settle(person);
    sim.step();
  }
  return lastScores.get(person.id) ?? [];
}

describe('the fractional carry', () => {
  it('turns a rate below one a day into whole items eventually', () => {
    // The failure this exists to prevent: floored at the point of use, a trap
    // catching half a hare a day catches nothing at all, for ever.
    let carry = 0;
    let total = 0;
    for (let day = 0; day < 10; day++) {
      const step = accrueUnits(carry, 0.5);
      carry = step.carry;
      total += step.units;
    }
    expect(total).toBe(5);
  });

  it('keeps back only what it has not handed over', () => {
    const first = accrueUnits(0, 1.4);
    expect(first.units).toBe(1);
    expect(first.carry).toBeCloseTo(0.4);
    const second = accrueUnits(first.carry, 1.4);
    expect(second.units).toBe(1);
    expect(second.carry).toBeCloseTo(0.8);
  });

  it('ignores a rate of zero rather than banking it', () => {
    expect(accrueUnits(0.6, 0)).toEqual({ units: 0, carry: 0.6 });
  });
});

describe('a trap', () => {
  it('catches while nobody is standing over it', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const snare = trapNear(sim, person, 'snare', 4);
    expect(isTrap(snare.def)).toBe(true);

    for (let i = 0; i < sim.config.time.ticksPerDay * 3; i++) sim.step();
    expect(snare.store.count('meat')).toBeGreaterThan(0);
  });

  it('catches nothing for a band that has forgotten how to set it', () => {
    // The tech pillar applied to a structure's output. A snare line outlives the
    // person who set it; their knowledge does not, and this is the first thing in
    // the game where that is visible on the ground.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const snare = trapNear(sim, person, 'snare', 4);
    for (const member of sim.people) member.knownTech.delete('snares');

    for (let i = 0; i < sim.config.time.ticksPerDay * 3; i++) sim.step();
    expect(snare.store.total).toBe(0);
    expect(sim.trapYield(snare)?.perDay).toBe(0);
    // And it says why: a trap that has quietly stopped is indistinguishable from
    // one that is working.
    expect(sim.trapYield(snare)?.reason).toContain('remembers');
  });

  it('stops catching once it is full, and says so', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const snare = trapNear(sim, person, 'snare', 6);
    snare.store.add('meat', snare.def.storage);

    // Asked immediately, and deliberately: leave the world running for a day and
    // somebody walks out and empties it, which is the collection route working
    // rather than this assertion failing.
    expect(sim.trapYield(snare)?.perDay).toBe(0);
    expect(sim.trapYield(snare)?.reason).toContain('full');

    // And the day's sweep never overfills it.
    for (let i = 0; i < sim.config.time.ticksPerDay + 2; i++) sim.step();
    expect(snare.store.total).toBeLessThanOrEqual(snare.def.storage);
  });

  it('is not somewhere to put things', () => {
    // Filling a trap with berries is a person carefully stopping their own snare
    // line from catching anything, since a full trap accrues nothing. The order
    // is allowed and then refused out loud, which is the rule on this project:
    // if the simulation will not do a thing, the player is told why.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const snare = trapNear(sim, person, 'snare', 2);
    settle(person);
    person.inventory.add('berries', 6);

    expect(sim.order(person, 'store', { buildingId: snare.id })).toBe(true);
    for (let i = 0; i < 400 && person.order !== null; i++) sim.step();
    expect(snare.store.count('berries')).toBe(0);
    expect(sim.interruptions.some(stop => stop.reason === 'not_a_store')).toBe(true);
  });

  it('is worth a walk to somebody who is not hungry at all', () => {
    // The one that fails on the broken build. Before the collection route, the
    // only way to `take` was through hunger, so a full trap out at the treeline
    // was never chosen by anybody: it filled, stopped catching, and the whole
    // mechanism read as a trap that does not work.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const snare = trapNear(sim, person, 'snare', 2);
    snare.store.add('meat', snare.def.storage);

    const take = scoresFor(sim, person).find(entry => entry.id === 'take');
    expect(take, 'nobody would walk out to a full trap').toBeDefined();
    expect(take!.score).toBeGreaterThan(0);
  });

  it('is left alone while it holds almost nothing', () => {
    // The other half of the same coefficient: a trap holding one hare is a walk
    // for one hare, and a band that empties every trap every morning spends its
    // day collecting instead of eating better.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const snare = trapNear(sim, person, 'snare', 2);
    snare.store.add('meat', 1);

    const take = scoresFor(sim, person).find(entry => entry.id === 'take');
    expect(take).toBeUndefined();
  });
});

describe('trap designs', () => {
  it('are never one tile across', () => {
    // A 1x1 footprint spans half a tile either side of its centre and movement
    // stops within 0.6 tiles of a target, so `reachBuilding` can never report
    // arrival: an infinite walk with no interruption check in it.
    for (const def of Object.values(BUILDINGS)) {
      if (!isTrap(def)) continue;
      expect(def.width, def.id + ' is too small to arrive at').toBeGreaterThan(1);
      expect(def.height, def.id + ' is too small to arrive at').toBeGreaterThan(1);
    }
  });

  it('hold only a little of what they catch, and are gated on knowing how', () => {
    for (const def of Object.values(BUILDINGS)) {
      if (!isTrap(def)) continue;
      expect(def.yields!.perDay).toBeGreaterThan(0);
      expect(def.storage, def.id + ' has nowhere to put a catch').toBeGreaterThan(0);
      // Emptying it has to stay a decision somebody takes. A trap with a
      // granary's capacity is a food faucet.
      expect(def.storage, def.id + ' holds too much to need emptying').toBeLessThan(40);
      expect(def.requiresTech, def.id + ' is a trap anybody can set').not.toBeNull();
    }
  });
});
