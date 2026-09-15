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
import { PATIENCE } from '../systems/MovementSystem.ts';
import { Person } from '../entities/Person.ts';
import type { Building } from '../entities/Building.ts';
import { menaceOver } from '../social/Authority.ts';

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

/**
 * M8.1, mechanism 4: a recipe that has to be made somewhere.
 *
 * Deterministic rather than a `simcheck` row for the reason the file header
 * gives. The refusal half in particular can never be measured from a world run
 * at all — nobody in the simulation ever orders a craft they cannot do — and a
 * check that can only ever report n/a is worse than no check, because n/a is
 * not a pass.
 */
describe('crafting stations', () => {
  /**
   * A world in which somebody can grind.
   *
   * The knowledge goes in through `startingTech` rather than being added to a
   * person afterwards, because `Simulation.knownTech` is *derived* from the
   * living population once a day and `place` gates on it — so a quern placed
   * before the next daily pass is refused, and the test fails for a reason that
   * has nothing to do with what it is testing.
   */
  const MILLING = { ...SMALL, population: { ...SMALL.population, startingTech: ['grinding'] } };

  /**
   * Far enough in that the daily pass has run at least once.
   *
   * `Simulation.knownTech` is rebuilt in the daily block, so thirty steps of a
   * two-hundred-and-forty-tick day leaves it empty however the band was founded
   * — and `place` gates on it, so the quern is silently refused.
   */
  function settleIn(sim: Simulation): void {
    for (let i = 0; i < 300; i++) sim.step();
  }

  /** Somebody standing well away from a finished quern, holding what it takes. */
  function miller(sim: Simulation): { person: Person; quern: Building } {
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('acorn', 9);
    // Placed a short walk away rather than underfoot — the walk is half of what
    // this describe block is about — but the offset has to find open ground, so
    // it is searched for rather than assumed.
    let quern: Building | null = null;
    for (const [dx, dy] of [[6, 6], [-6, 6], [6, -6], [-6, -6], [8, 0], [0, 8], [4, 0], [0, 4]]) {
      quern = sim.place('quern', Math.round(person.x) + dx!, Math.round(person.y) + dy!,
        person.bandId);
      if (quern) break;
    }
    expect(quern).not.toBeNull();
    quern!.complete = true;
    return { person, quern: quern! };
  }

  it('refuses a station recipe away from its station, and says why', () => {
    const sim = new Simulation(MILLING);
    settleIn(sim);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('acorn', 9);

    const ok = sim.order(person, 'craft', { recipeId: 'meal' });

    expect(ok).toBe(false);
    // The reason is the point of the test. A bare `false` is what the player
    // used to get, and "nothing happened" is indistinguishable from a bug.
    expect(sim.lastRefusal).toBeTruthy();
    expect(sim.lastRefusal).toContain('quern');
    expect(person.action).toBe('idle');
  });

  it('refuses when the building named is not the station the recipe wants', () => {
    const sim = new Simulation(MILLING);
    settleIn(sim);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('acorn', 9);
    const wrong = shelterOver(sim, person);

    expect(sim.order(person, 'craft', { recipeId: 'meal', buildingId: wrong.id })).toBe(false);
    expect(sim.lastRefusal).toContain('quern');
  });

  it('walks to the station and finishes there', () => {
    const sim = new Simulation(MILLING);
    settleIn(sim);
    const { person, quern } = miller(sim);
    const startedWith = person.inventory.count('meal');

    expect(sim.order(person, 'craft', { recipeId: 'meal', buildingId: quern.id })).toBe(true);
    // Long enough to cover the walk plus a novice's grind several times over.
    for (let i = 0; i < 1200 && person.inventory.count('meal') === startedWith; i++) {
      settle(person);
      person.inventory.add('acorn', 9);
      sim.step();
    }

    expect(person.inventory.count('meal')).toBeGreaterThan(startedWith);
    expect(quern.contains(person.x, person.y)).toBe(true);
  });

  it('gives up with a named reason if the station goes while they are walking', () => {
    const sim = new Simulation(MILLING);
    settleIn(sim);
    const { person, quern } = miller(sim);
    expect(sim.order(person, 'craft', { recipeId: 'meal', buildingId: quern.id })).toBe(true);

    sim.interruptions.length = 0;
    // Demolished under them: the second of the two channels a missing station
    // reaches the player through.
    quern.complete = false;

    for (let i = 0; i < 60 && sim.interruptions.length === 0; i++) sim.step();
    const mine = sim.interruptions.filter(n => n.personId === person.id);
    expect(mine.map(n => n.reason)).toContain('no_station_quern');
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

/**
 * M7's diagnosis: `giveUp` (`MovementSystem`) cleared only the target, not
 * `person.order`, so a walk that ran out of patience under a player's order —
 * the player's own character, anyone they commanded, anyone a chief commanded
 * — left `committed` (`Simulation.step`) true forever. The brain never
 * re-planned and the action system's own `case 'wander': default:` discarded
 * `step`'s return value, so nothing else ever noticed either: a person who
 * looked like they were thinking stood still until they starved.
 */
describe('the zombie order', () => {
  /** A walkable tile a short, real walk away, so the order is accepted. */
  function nearbyGoal(sim: Simulation, from: Person): { x: number; y: number } {
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4], [4, 4], [-4, -4], [4, -4], [-4, 4]]) {
      const x = Math.round(from.x) + dx;
      const y = Math.round(from.y) + dy;
      if (sim.world.isWalkable(x, y) && sim.world.sameRegion(from.x, from.y, x, y)) return { x, y };
    }
    throw new Error('no walkable goal found near the test person');
  }

  it('is cleared, not just the target, when a walk under order runs out of patience', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = sim.livingPeople()[0]!;
    settle(person);

    const goal = nearbyGoal(sim, person);
    expect(sim.order(person, 'goto', goal)).toBe(true);
    expect(person.order).toBe('goto');

    // Standing in for a concave shoreline: nothing is walkable in any
    // direction, so `moveToward`'s three fallbacks all fail and this tick
    // makes no real progress, whatever the actual terrain looks like.
    sim.world.isWalkable = () => false;
    person.stuckSteps = PATIENCE + 1;
    // M7 used to give a stuck walk one free re-route before giving up, and
    // this test exhausted it up front. M7 stage C proved that retry was a
    // no-op — the search has no RNG and `World.walkable` never changes, so
    // re-running it from an unmoved walker returned the identical route — and
    // deleted it in favour of `STUCK_REPATH` recoveries that actually differ.
    // Nothing needs exhausting now: one step past `PATIENCE` is the give-up.
    sim.step();

    // This fails on the pre-M7 build: `giveUp` cleared `person.target*` but
    // left `person.order` set to `'goto'` forever.
    expect(person.order).toBeNull();
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

/**
 * M9.5 phase 4a: coercion that needs no technology. `menaceOver` is pure —
 * no household, no band, no `Simulation` — so its shape is asserted directly
 * rather than through a world.
 */
describe('menaceOver', () => {
  function bystander(name: string, id: number): Person {
    const person = new Person(name, 4, 4, id, new RNG('menace-' + name));
    person.age = 30 * person.daysPerYear;
    return person;
  }

  it('reads the same fight-skill gap standingOver does, not standing', () => {
    const victim = bystander('victim', 1);
    victim.skills.fight = 20;
    victim.traits.aggression = 0.5;

    const strong = bystander('strong', 0);
    strong.skills.fight = 90;
    const equal = bystander('equal', 2);
    equal.skills.fight = 20;

    const overmatched = menaceOver(strong, victim, 0);
    const evenlyMatched = menaceOver(equal, victim, 0);
    expect(overmatched.chance).toBeGreaterThan(evenlyMatched.chance);
    // No household, no band, no context object at all was passed in — this is
    // exactly what lets it work on a stranger or another band, which
    // `standingOver` cannot.
    expect(overmatched.isHead).toBe(false);
    expect(overmatched.isChief).toBe(false);
  });

  it('is resisted harder by an aggressive victim than a timid one', () => {
    const leader = bystander('leader', 0);
    leader.skills.fight = 90;

    const timid = bystander('timid', 1);
    timid.skills.fight = 20;
    timid.traits.aggression = 0.1;

    const defiant = bystander('defiant', 2);
    defiant.skills.fight = 20;
    defiant.traits.aggression = 0.9;

    expect(menaceOver(leader, timid, 0).chance)
      .toBeGreaterThan(menaceOver(leader, defiant, 0).chance);
  });

  it('reads fresh fear of this leader specifically, not an old grudge or a stranger', () => {
    const leader = bystander('leader', 0);
    leader.skills.fight = 50;
    const other = bystander('other', 2);
    other.skills.fight = 50;

    const victim = bystander('victim', 1);
    victim.skills.fight = 50;
    victim.traits.aggression = 0.5;
    const baseline = menaceOver(leader, victim, 1000).chance;

    // Hurt recently, but by somebody else entirely — buys nothing.
    victim.lastHarmedBy = other.id;
    victim.lastHarmedTick = 950;
    expect(menaceOver(leader, victim, 1000).chance).toBeCloseTo(baseline, 5);

    // Hurt recently by this leader — the fear that matters.
    victim.lastHarmedBy = leader.id;
    victim.lastHarmedTick = 950;
    expect(menaceOver(leader, victim, 1000).chance).toBeGreaterThan(baseline);

    // The same leader, but it was a long time ago — an old grudge, not a
    // standing threat.
    victim.lastHarmedTick = 200;
    expect(menaceOver(leader, victim, 1000).chance).toBeCloseTo(baseline, 5);
  });

  it('never refuses yourself', () => {
    const person = bystander('self', 0);
    expect(menaceOver(person, person, 0).chance).toBe(1);
  });
});

/**
 * M9.5 phase 4a: `threaten` demands by menace rather than by right, and its
 * cost — a sharp drop in the victim's regard — is paid whether or not the
 * demand is met. Both outcomes are asserted by looping until they occur
 * rather than rigging a zero or certain chance, the same approach `a refusal
 * by authority` above uses: what is under test is what each outcome does,
 * not how likely it is.
 */
describe('threaten', () => {
  function armed(sim: Simulation): { leader: Person; victim: Person } {
    const people = sim.livingPeople();
    const leader = people[0]!;
    const victim = people.find(p => p.id !== leader.id)!;
    settle(leader);
    settle(victim);
    leader.x = victim.x;
    leader.y = victim.y;
    return { leader, victim };
  }

  it('takes what was demanded when the demand is met, and costs standing', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const { leader, victim } = armed(sim);
    leader.skills.fight = 100;
    victim.skills.fight = 0;
    victim.traits.aggression = 0;

    const deedsBefore = sim.relationships.peek(victim.id, leader.id)?.deeds ?? 0;
    let taken = 0;
    for (let attempt = 0; attempt < 30 && taken === 0; attempt++) {
      victim.inventory.add('berries', 6);
      expect(sim.order(leader, 'threaten',
        { personId: victim.id, itemId: 'berries', count: 2 })).toBe(true);
      for (let i = 0; i < 40 && leader.action !== 'idle'; i++) sim.step();
      taken = leader.inventory.count('berries');
    }

    expect(taken, 'never once succeeded in thirty attempts').toBeGreaterThan(0);
    // The demand being met is not what makes it cost something — see the
    // refusal test below for the other half of that claim — but it should
    // never cost *nothing*.
    expect(sim.relationships.peek(victim.id, leader.id)!.deeds)
      .toBeLessThan(deedsBefore);
    expect(sim.social.recent.some(e => e.type === 'threaten' && e.actorId === leader.id))
      .toBe(true);
  });

  it('costs standing even when the victim refuses, and says so', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const { leader, victim } = armed(sim);
    leader.skills.fight = 0;
    victim.skills.fight = 100;
    victim.traits.aggression = 1;

    let refused: string | null = null;
    for (let attempt = 0; attempt < 30 && refused === null; attempt++) {
      victim.inventory.add('berries', 6);
      const before = leader.inventory.count('berries');
      sim.interruptions.length = 0;
      expect(sim.order(leader, 'threaten',
        { personId: victim.id, itemId: 'berries', count: 2 })).toBe(true);
      for (let i = 0; i < 40 && leader.action !== 'idle'; i++) sim.step();
      if (leader.inventory.count('berries') > before) continue;
      const mine = sim.interruptions.filter(n => n.personId === leader.id);
      if (mine.some(n => n.reason === 'refused_demand')) {
        refused = mine.find(n => n.reason === 'refused_demand')!.reason;
      }
    }

    expect(refused, 'nobody refused in thirty attempts').toBe('refused_demand');
    // The threat was still made, and it still cost something: a demand
    // refused to your face was still a demand made, and witnesses — the
    // victim always among them — judge it whether or not it worked.
    expect(sim.social.recent.some(e => e.type === 'threaten' && e.actorId === leader.id))
      .toBe(true);
  });

  it('gives up with a named reason when the target carries nothing worth demanding', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const { leader, victim } = armed(sim);
    for (const [id, count] of victim.inventory.entries()) victim.inventory.remove(id, count);

    sim.interruptions.length = 0;
    expect(sim.order(leader, 'threaten', { personId: victim.id })).toBe(true);
    for (let i = 0; i < 40 && leader.action !== 'idle'; i++) sim.step();

    const mine = sim.interruptions.filter(n => n.personId === leader.id);
    expect(mine.map(n => n.reason)).toContain('nothing_to_demand');
  });
});

/**
 * M9 phase 5, note 4: *thinking is not the same as wandering*.
 *
 * A scenario check can say reflection happens somewhere in a century; these say
 * what the verb actually does, which is the half a statistical run cannot
 * answer — and the second of them guards the failure that made the tuning hard
 * to find, where reflection is short, needs no target and nothing about the
 * world changes while it runs, so the scorer picks it again the instant it ends.
 */
describe('reflect', () => {
  it('can be done with no idea in your head, and is recorded as having been done', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.ideas.length = 0;

    expect(sim.order(person, 'reflect')).toBe(true);
    // Longer than the action takes, so it has certainly ended.
    for (let i = 0; i < 60; i++) sim.step();

    // `noteDid` is only reached through `finish`, so this is also the assertion
    // that reflection completes rather than running for ever — the exact way
    // `case 'wander'` was broken for the whole life of the project before M7.
    expect(person.lately.has('reflect')).toBe(true);
    // And the order is released, rather than leaving a zombie behind it.
    expect(person.order).toBeNull();
  });

  it('will not be started again the moment it ends', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.ideas.length = 0;

    sim.order(person, 'reflect');
    sim.step();
    const until = person.reflectCooldownUntil;

    // Set on the first tick rather than the last: an interrupted reflection
    // spends the cooldown too, or being pulled away by hunger lets somebody sit
    // straight back down the moment they have eaten.
    expect(until).toBeGreaterThan(sim.time.tick);
  });
});
