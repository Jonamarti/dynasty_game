/**
 * M11 phase 10, third commit: `herding`, the one node in the widened
 * Neolithic that needed a real mechanism.
 *
 * A pen deliberately reuses `Building.store` and `doTake` rather than
 * inventing a verb — see the header comment on `BuildingDef.herd`. What is
 * actually new is `Simulation.workHerds`'s growth rule: proportional to what
 * a pen already holds, which is what makes it breeding rather than a slower
 * trap, and which means a pen culled to nothing stays at nothing. That last
 * part is the one behaviour a flat `matures`/`yields` rate cannot produce, so
 * it is what this file spends the most care on.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { lastScores } from '../ai/Brain.ts';
import { BUILDINGS, isHerd } from '../entities/Building.ts';
import type { Building } from '../entities/Building.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'herding-test',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: {
    bands: 1, peoplePerBand: 6,
    startingTech: ['tracking', 'taming', 'herding'],
  },
};

/** A world one day old. See `traps.test.ts` for why this matters on tick zero. */
function aDayIn(sim: Simulation): void {
  for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
}

/** A finished pen standing `away` tiles from `person`, wherever will take it. */
function penNear(sim: Simulation, person: Person, away: number): Building {
  let placed = null;
  for (let ring = away; ring <= away + 6 && !placed; ring++) {
    for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring]]) {
      placed = sim.place('pen', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
      if (placed) break;
    }
  }
  expect(placed, 'nowhere to site a pen for the test').not.toBeNull();
  // Finished by fiat, the same way `traps.test.ts` does it — these are tests
  // about what a pen does, not about whether anybody finishes weaving one.
  // `doBuild`'s seeding never runs this way, so the tests that need a founding
  // stock add it themselves.
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

describe('a pen', () => {
  it('grows what it holds, given a founding stock', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const pen = penNear(sim, person, 4);
    expect(isHerd(pen.def)).toBe(true);
    pen.store.add(pen.def.herd!.item, pen.def.herd!.seed);

    for (let i = 0; i < sim.config.time.ticksPerDay * 20; i++) sim.step();
    expect(pen.store.count(pen.def.herd!.item)).toBeGreaterThan(pen.def.herd!.seed);
  });

  it('never grows from nothing, and a fully culled pen stays empty', () => {
    // The behaviour a flat `yields`/`matures` rate cannot produce: growth is
    // `stock * rate`, which is zero at zero. Over-culling a herd to extinction
    // is meant to be a real, permanent failure here.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const pen = penNear(sim, person, 4);
    expect(pen.store.total).toBe(0);

    for (let i = 0; i < sim.config.time.ticksPerDay * 10; i++) sim.step();
    expect(pen.store.total).toBe(0);
  });

  it('stops growing for a band that has forgotten how to keep it, but does not forget the herd itself', () => {
    // The tech pillar applied to a structure's output, on the same terms as a
    // trap — with the one deliberate difference the header comment names: a
    // trap's part-caught hare is discarded when the knowledge is lost, but a
    // herd standing in a pen is a physical fact rather than an accrued
    // fraction, so it is not.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const pen = penNear(sim, person, 4);
    pen.store.add(pen.def.herd!.item, pen.def.herd!.seed);
    for (const member of sim.people) member.knownTech.delete('herding');

    const before = pen.store.count(pen.def.herd!.item);
    for (let i = 0; i < sim.config.time.ticksPerDay * 5; i++) sim.step();
    expect(pen.store.count(pen.def.herd!.item)).toBe(before);
  });

  it('stops growing once it is full, and never overfills in one sweep', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const pen = penNear(sim, person, 6);
    pen.store.add(pen.def.herd!.item, pen.def.storage);

    for (let i = 0; i < sim.config.time.ticksPerDay + 2; i++) sim.step();
    expect(pen.store.total).toBeLessThanOrEqual(pen.def.storage);
  });

  it('is not somewhere to put things', () => {
    // The same refusal a trap gets, for the same reason: filling a pen with
    // berries stops nothing from breeding, but it is still not what a pen is
    // for, and the player is told why rather than watching the order vanish.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const pen = penNear(sim, person, 2);
    settle(person);
    person.inventory.add('berries', 6);

    expect(sim.order(person, 'store', { buildingId: pen.id })).toBe(true);
    for (let i = 0; i < 400 && person.order !== null; i++) sim.step();
    expect(pen.store.count('berries')).toBe(0);
    expect(sim.interruptions.some(stop => stop.reason === 'not_a_store')).toBe(true);
  });

  it('is worth a walk to somebody hungry once it holds food', () => {
    // A pen gets no special "round" bonus the way a full trap does — see the
    // header comment — so the only route that scores `take` here is the
    // ordinary hungry-larder one, which needs hunger to actually be up. That
    // is why this does not use the shared `scoresFor` helper: it resets every
    // need to zero on every tick, which is exactly right for the trap test it
    // was written for and exactly wrong for this one.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const pen = penNear(sim, person, 2);
    pen.store.add(pen.def.herd!.item, pen.def.storage);
    for (const [itemId, count] of person.inventory.entries()) person.inventory.remove(itemId, count);
    person.needs.hunger = 60;
    person.needs.thirst = 0;
    person.needs.cold = 0;
    person.needs.fatigue = 0;

    sim.possess(person);
    lastScores.delete(person.id);
    for (let i = 0; i < 10 && !lastScores.has(person.id); i++) sim.step();
    const take = (lastScores.get(person.id) ?? []).find(entry => entry.id === 'take');
    expect(take, 'nobody would walk to a stocked pen while hungry').toBeDefined();
    expect(take!.score).toBeGreaterThan(0);
  });

  it('is founded with a stock the moment it is finished, not before', () => {
    // `doBuild`'s completion hook, exercised end to end rather than by fiat —
    // this is the one test in the file that does not call `penNear` and
    // complete the site by hand, because it is testing the seeding itself.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    let placed = null;
    for (let ring = 3; ring <= 9 && !placed; ring++) {
      for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring]]) {
        placed = sim.place('pen', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
        if (placed) break;
      }
    }
    expect(placed, 'nowhere to site a pen for the test').not.toBeNull();
    const pen = placed!;
    expect(pen.store.total).toBe(0);

    // Materials delivered directly, so the test is about the completion hook
    // rather than about the separate haul-then-build pipeline `orders.test.ts`
    // already owns.
    for (const [itemId, count] of Object.entries(pen.def.materials)) {
      pen.delivered.add(itemId, count);
    }
    expect(pen.materialsReady).toBe(true);
    settle(person);
    person.knownTech.add('herding');
    expect(sim.order(person, 'build', { buildingId: pen.id })).toBe(true);
    for (let i = 0; i < 4000 && !pen.complete; i++) sim.step();
    expect(pen.complete).toBe(true);
    expect(pen.store.count(pen.def.herd!.item)).toBe(pen.def.herd!.seed);
  });
});

describe('pen designs', () => {
  it('are never one tile across', () => {
    for (const def of Object.values(BUILDINGS)) {
      if (!isHerd(def)) continue;
      expect(def.width, def.id + ' is too small to arrive at').toBeGreaterThan(1);
      expect(def.height, def.id + ' is too small to arrive at').toBeGreaterThan(1);
    }
  });

  it('breed something real, hold a real cap, and are gated on knowing how', () => {
    for (const def of Object.values(BUILDINGS)) {
      if (!isHerd(def)) continue;
      expect(def.herd!.seed).toBeGreaterThan(0);
      expect(def.herd!.growthPerDay).toBeGreaterThan(0);
      expect(def.storage, def.id + ' has nowhere to put a herd').toBeGreaterThan(def.herd!.seed);
      expect(def.requiresTech, def.id + ' is a pen anybody can build').not.toBeNull();
    }
  });
});
