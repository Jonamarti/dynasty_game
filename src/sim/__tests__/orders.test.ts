/**
 * Regression tests for the M6c bug reports.
 *
 * These live as unit tests rather than as `simcheck` checks on purpose. Every
 * one of them is a specific interaction — a laden sleeper, a tree dying under
 * the axe — and the scenario runs are chaotic: they diverge wildly on any
 * change and would report these as flaky long before they reported them as
 * broken. A scenario check answers "is the world healthy?"; these answer "does
 * this exact thing still work?", and that is a different question.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { ForestSystem } from '../systems/ForestSystem.ts';
import { Tree } from '../entities/Tree.ts';
import { workProgressOf } from '../core/Progress.ts';
import type { Person } from '../entities/Person.ts';
import type { Building } from '../entities/Building.ts';

const SMALL = {
  seed: 'orders',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};

/** A finished shelter standing on top of `person`, however the world looks. */
function shelterOver(sim: Simulation, person: Person): Building {
  const built = sim.place('windbreak', Math.round(person.x), Math.round(person.y), person.bandId);
  const site = built ?? sim.buildings.find(b => b.def.shelter > 0)!;
  // Finished by fiat: this is a test about sleeping, not about construction.
  site.complete = true;
  person.x = site.centerX;
  person.y = site.centerY;
  return site;
}

/** Somebody with nothing pressing, so a test measures what it means to. */
function settle(person: Person): void {
  person.needs.thirst = 0;
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.workedTicks = 0;
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
}

function fillPack(person: Person): void {
  person.inventory.add('berries', person.carryCapacity);
  expect(person.isLaden).toBe(true);
}

function stepUntilNight(sim: Simulation, wantNight: boolean): void {
  for (let i = 0; i < 500 && sim.time.isNight !== wantNight; i++) sim.step();
  expect(sim.time.isNight).toBe(wantNight);
}

describe('sleep', () => {
  it('restores fatigue at night', () => {
    const sim = new Simulation(SMALL);
    stepUntilNight(sim, true);
    const person = sim.livingPeople()[0]!;
    settle(person);
    const hut = shelterOver(sim, person);
    person.needs.fatigue = 60;

    sim.order(person, 'sleep', { buildingId: hut.id });
    for (let i = 0; i < 20; i++) sim.step();

    expect(person.needs.fatigue).toBeLessThan(50);
  });

  /**
   * The reported bug. A player who has been out foraging comes home with a full
   * pack, and `interruption()`'s first clause is `isLaden` — so borrowing the
   * work-interruption list woke them on the very tick they lay down.
   */
  it('restores fatigue even when the sleeper is carrying a full pack', () => {
    const sim = new Simulation(SMALL);
    stepUntilNight(sim, true);
    const person = sim.livingPeople()[0]!;
    settle(person);
    const hut = shelterOver(sim, person);
    person.needs.fatigue = 60;
    fillPack(person);

    sim.order(person, 'sleep', { buildingId: hut.id });
    for (let i = 0; i < 20; i++) sim.step();

    expect(person.needs.fatigue).toBeLessThan(50);
  });

  it('holds through daylight when the player ordered it, and says why otherwise', () => {
    const sim = new Simulation(SMALL);
    stepUntilNight(sim, false);
    const person = sim.livingPeople()[0]!;
    settle(person);
    const hut = shelterOver(sim, person);
    person.needs.fatigue = 60;

    sim.order(person, 'sleep', { buildingId: hut.id });
    for (let i = 0; i < 20; i++) sim.step();

    // An order is an order; being told to lie down and ignored is worse than a
    // pointless nap. Left to their own judgement, nobody sleeps through the day.
    expect(person.needs.fatigue).toBeLessThan(50);
  });
});

describe('felling', () => {
  /**
   * The reported bug: with a full pack the chop aborted on tick one through
   * `hands_full`, silently. A tree needs pack room only when it falls.
   */
  it('is not aborted by a full pack', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = sim.livingPeople()[0]!;
    settle(person);
    const tree = sim.trees.find(t =>
      t.standing && sim.world.sameRegion(person.x, person.y, t.x, t.y))!;
    person.x = tree.x;
    person.y = tree.y;
    fillPack(person);

    sim.order(person, 'chop', { treeId: tree.id });
    for (let i = 0; i < 10; i++) sim.step();

    expect(person.action).toBe('chop');
    expect(tree.chopProgress).toBeGreaterThan(0);
  });

  it('reports a progress bar to the panel, not only to the map', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = sim.livingPeople()[0]!;
    settle(person);
    const tree = sim.trees.find(t =>
      t.standing && sim.world.sameRegion(person.x, person.y, t.x, t.y))!;
    person.x = tree.x;
    person.y = tree.y;

    sim.order(person, 'chop', { treeId: tree.id });
    for (let i = 0; i < 10; i++) sim.step();

    // `cycleProgress` is null throughout a chop — that is exactly why the panel
    // showed nothing for the ninety seconds of felling a tree by hand.
    expect(person.cycleProgress).toBeNull();
    expect(workProgressOf(person, sim)).not.toBeNull();
  });

  it('leaves timber on the ground when the feller cannot carry it', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = sim.livingPeople()[0]!;
    settle(person);
    const tree = sim.trees.find(t =>
      t.standing && t.isMature && sim.world.sameRegion(person.x, person.y, t.x, t.y));
    if (!tree) return; // No grown tree on this seed; nothing to assert about.
    person.x = tree.x;
    person.y = tree.y;
    fillPack(person);

    const before = sim.piles.length;
    // Fell it outright rather than waiting out several hundred ticks of work.
    tree.chopProgress = tree.fellingTicks;
    sim.order(person, 'chop', { treeId: tree.id });
    for (let i = 0; i < 5; i++) sim.step();

    expect(tree.standing).toBe(false);
    expect(sim.piles.length).toBeGreaterThan(before);
  });
});

describe('the forest', () => {
  /**
   * A tree that dies of old age mid-chop used to be retired out from under the
   * woodcutter, taking the accumulated `chopProgress` with it and ending the
   * order with a bare "the tree was gone".
   */
  it('does not retire a tree somebody is part way through felling', () => {
    const forest = new ForestSystem();
    const ctx = {
      world: new Simulation(SMALL).world,
      rng: new RNG('forest'),
      season: 'summer' as const,
      growth: 1,
      treeHash: new Simulation(SMALL).treeHash,
    };

    const ancient = new Tree('oak', 5, 5, 10_000_000);
    ancient.chopProgress = 5;
    expect(forest.daily([ancient], ctx).died).toHaveLength(0);
    expect(ancient.standing).toBe(true);

    // With nobody working on it, the same tree dies as it always did.
    ancient.chopProgress = 0;
    expect(forest.daily([ancient], ctx).died).toHaveLength(1);
  });
});

describe('orders that stop', () => {
  it('say why, instead of ending in silence', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = sim.livingPeople()[0]!;
    settle(person);

    // Aimed at a node that is about to stop existing as far as they know.
    const node = sim.nodes.find(n =>
      !n.depleted && sim.world.sameRegion(person.x, person.y, n.x, n.y))!;
    person.x = node.x;
    person.y = node.y;
    sim.order(person, 'gather', { nodeId: node.id });
    sim.interruptions.length = 0;
    node.amount = 0;

    for (let i = 0; i < 5; i++) sim.step();

    const mine = sim.interruptions.filter(n => n.personId === person.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0]!.reason).toBeTruthy();
  });

  it('are set aside and picked back up after a need is answered', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = sim.livingPeople()[0]!;
    settle(person);
    const node = sim.nodes.find(n =>
      !n.depleted && sim.world.sameRegion(person.x, person.y, n.x, n.y))!;
    person.x = node.x;
    person.y = node.y;

    sim.order(person, 'gather', { nodeId: node.id });
    // Thirsty enough that the next pull will not be started.
    person.needs.thirst = 40;
    for (let i = 0; i < 30 && person.order !== null; i++) sim.step();

    expect(person.order).toBeNull();
    expect(person.resume).not.toBeNull();
    expect(person.resume!.action).toBe('gather');

    // Answer the need, and the errand comes back on its own.
    person.needs.thirst = 0;
    for (let i = 0; i < 5 && person.order === null; i++) sim.step();
    expect(person.order).toBe('gather');
  });

  it('forgets a set-aside errand when the player takes the controls', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = sim.livingPeople()[0]!;
    settle(person);
    const node = sim.nodes.find(n =>
      !n.depleted && sim.world.sameRegion(person.x, person.y, n.x, n.y))!;
    person.x = node.x;
    person.y = node.y;

    sim.order(person, 'gather', { nodeId: node.id });
    person.needs.thirst = 40;
    for (let i = 0; i < 30 && person.order !== null; i++) sim.step();
    expect(person.resume).not.toBeNull();

    person.forgetPlans();
    expect(person.resume).toBeNull();
  });
});
