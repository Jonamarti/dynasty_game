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

  /**
   * Thirst far enough over the line to stop work, whatever the line currently is.
   *
   * These tests used to write `40` by hand, which cleared the old flat limit of
   * 35 and stopped clearing it the moment the limits became contextual and
   * configurable — the base rose to 42 and ordered work gets a further six
   * points of rope, so 40 no longer interrupts anything. The tests are about the
   * *set-aside and resume* machinery and never cared about the number, so they
   * ask for it now instead of restating it.
   */
  function thirstyEnough(sim: Simulation): number {
    return sim.config.needs.workLimits.thirst + 20;
  }

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
    person.needs.thirst = thirstyEnough(sim);
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
    person.needs.thirst = thirstyEnough(sim);
    for (let i = 0; i < 30 && person.order !== null; i++) sim.step();
    expect(person.resume).not.toBeNull();

    person.forgetPlans();
    expect(person.resume).toBeNull();
  });
});

describe('crafting', () => {
  /** Somebody who knows a recipe and is holding what it takes. */
  function knapper(sim: Simulation): Person {
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.knownTech.add('hafting');
    person.inventory.add('flint', 1);
    person.inventory.add('sticks', 1);
    return person;
  }

  it('finishes and leaves the made thing in the pack', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = knapper(sim);

    sim.order(person, 'craft', { recipeId: 'handaxe' });
    for (let i = 0; i < 400 && person.order !== null; i++) {
      // Kept comfortable, or the interruption below would fire instead.
      settle(person);
      person.inventory.add('flint', 1);
      person.inventory.add('sticks', 1);
      sim.step();
    }

    expect(person.inventory.count('handaxe')).toBeGreaterThan(0);
  });

  it('banks its hours so an interrupted craft is not begun again', () => {
    // The escape hatch `AGENTS.md` demands for a long job, and the thing
    // `tech.test.ts` stopped asserting when the recipe ceiling stopped binding.
    //
    // A novice's hand axe is 258 ticks against roughly 400 of thirst, and less
    // than 200 after a resume, so before this the craft restarted from nothing
    // every time it was broken off. Building and felling bank on the site and
    // the trunk; a craft has nothing to bank on until the item appears, so it
    // banks on the crafter.
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = knapper(sim);

    sim.order(person, 'craft', { recipeId: 'handaxe' });
    for (let i = 0; i < 20; i++) sim.step();
    const banked = person.bankedFor('craft:handaxe');
    expect(banked, 'no hours were banked at all').toBeGreaterThan(0);

    // Break it off the way thirst would, and the hours survive it.
    person.needs.thirst = sim.config.needs.workLimits.thirst + 20;
    for (let i = 0; i < 40 && person.order !== null; i++) sim.step();
    expect(person.order, 'the craft was never interrupted').toBeNull();
    expect(person.bankedFor('craft:handaxe'),
      'the interruption threw away the work').toBeGreaterThanOrEqual(banked);

    // Starting a different job discards them, or pot-shaping hours would be
    // credited to an axe.
    person.bankWork('craft:pot');
    expect(person.bankedFor('craft:handaxe')).toBe(0);
  });

  it('is interrupted by thirst, and says so, and is picked back up', () => {
    // The regression this whole pass turns on. `doCraft` had no interruption
    // check at all, so for the 258 ticks a novice takes over a hand axe the
    // knapper was unreachable: `committed` stops the brain re-planning, and
    // nothing inside the action could stop them. Thirst, hunger, cold and being
    // attacked all bounced off. It is the omission `AGENTS.md` blames for the
    // two worst bugs this project has had.
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = knapper(sim);

    sim.order(person, 'craft', { recipeId: 'handaxe' });
    sim.interruptions.length = 0;
    // Over the threshold `interruption` uses for work, and nowhere near lethal.
    person.needs.thirst = sim.config.needs.workLimits.thirst + 20;

    for (let i = 0; i < 60 && person.order !== null; i++) sim.step();

    expect(person.order, 'the craft was never interrupted').toBeNull();
    const mine = sim.interruptions.filter(n => n.personId === person.id);
    expect(mine.length, 'it stopped without telling anybody').toBeGreaterThan(0);
    expect(mine[0]!.reason).toBe('thirsty');
    // The recipe travels with the notice, or the report would read "making
    // something stopped" — `finish` has already cleared it off the person.
    expect(mine[0]!.recipe).toBe('handaxe');

    // Nothing was consumed: materials are taken at the last tick, so an
    // interrupted craft costs the player nothing but the time.
    expect(person.inventory.count('flint')).toBe(1);
    expect(person.resume?.action).toBe('craft');
    expect(person.resume?.recipe).toBe('handaxe');

    person.needs.thirst = 0;
    for (let i = 0; i < 5 && person.order === null; i++) sim.step();
    expect(person.order).toBe('craft');
    expect(person.targetRecipe).toBe('handaxe');
  });

  it('gives up with a reason when the recipe is unknown', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = knapper(sim);
    person.knownTech.delete('hafting');

    sim.order(person, 'craft', { recipeId: 'handaxe' });
    sim.interruptions.length = 0;
    for (let i = 0; i < 5 && person.order !== null; i++) sim.step();

    const mine = sim.interruptions.filter(n => n.personId === person.id);
    expect(mine.map(n => n.reason)).toContain('dont_know_how');
  });
});

describe('a refusal by authority', () => {
  it('carries the reason the standing calculation already worked out', () => {
    // `standing.because` is computed one line above the refusal and was thrown
    // away, so the player read a bare "X refuses" — while the Ties tab showed
    // this very sentence right up until the moment it mattered.
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const people = sim.livingPeople();
    const leader = people[0]!;
    const subordinate = people.find(p => p.id !== leader.id)!;

    // Asked repeatedly rather than rigged to a zero chance: whether these two
    // are kin depends on the seed, and the thing under test is what happens on
    // a failed roll, not how likely one is. `attack` is the costliest order
    // there is, so a refusal comes quickly.
    let refused: string | null = null;
    for (let attempt = 0; attempt < 60 && refused === null; attempt++) {
      const standing = sim.standing(leader, subordinate, 'attack');
      sim.lastRefusal = null;
      if (sim.command(leader, subordinate, 'attack', { personId: leader.id })) continue;
      refused = sim.lastRefusal;
      expect(refused, 'the refusal said nothing').toBe(standing.because);
    }

    expect(refused, 'nobody refused in sixty attempts').not.toBeNull();
    expect(refused!.length).toBeGreaterThan(0);
  });
});
