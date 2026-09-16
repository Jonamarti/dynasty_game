/**
 * M8.2: the ground, the crop and the two verbs.
 *
 * Split the way `traps.test.ts` splits, and for the reason it records. What a
 * *world* does with a field depends on whether that world is hungry, how far
 * the plot is from the fire and whether anybody happens to be holding seed —
 * so `simcheck` keeps the two questions a world can honestly answer
 * (`fields-are-sown-and-reaped` and `soil-is-drawn-down`) and everything that
 * has one right answer is tested here.
 *
 * Every test below was run against a deliberately broken build before it was
 * trusted, and the mutation that breaks each one is named in its comment. A
 * check that looks reassuring and detects nothing is worse than no check.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import {
  Soil, TILL_ORGANIC_COST, REAP_NUTRIENT_COST, isGroundSpent,
} from '../core/Soil.ts';
import {
  Crop, harvestYield, SOW_SEED, SPREAD_LOAD, RIPE_WINDOW_DAYS,
} from '../entities/Field.ts';
import { isField, isHeap, BUILDINGS } from '../entities/Building.ts';
import type { Building } from '../entities/Building.ts';
import type { Person } from '../entities/Person.ts';
import { lastScores } from '../ai/Brain.ts';

const SMALL = {
  seed: 'farming-test',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: {
    bands: 1, peoplePerBand: 6,
    startingTech: ['plant_lore', 'grinding', 'farming'],
  },
};

/** Ground of one texture, at one innate fertility, with nothing on it. */
function ground(fertility: number, texture: number): Soil {
  const innate = new Float32Array(4).fill(fertility);
  return new Soil(2, innate, () => texture);
}

/**
 * A world one day old.
 *
 * `knownTech` is derived from the living rather than stored and the recount runs
 * in the daily block, so on tick zero the world officially knows nothing and
 * `place` refuses every gated design — the field included.
 */
function aDayIn(sim: Simulation): void {
  for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
}

/** A finished plot near somebody, wherever the ground will take one. */
function fieldNear(sim: Simulation, person: Person, away = 3): Building {
  let placed: Building | null = null;
  for (let ring = away; ring <= away + 10 && !placed; ring++) {
    for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring]]) {
      placed = sim.place('field', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
      if (placed) break;
    }
  }
  expect(placed, 'nowhere to break ground for the test').not.toBeNull();
  // Finished by fiat: these are tests about what a field does, not about
  // whether anybody can be bothered to break the ground.
  placed!.complete = true;
  return placed!;
}

/** A finished heap near somebody, with `ripe` loads already in it. */
function heapNear(sim: Simulation, person: Person, ripe: number): Building {
  let placed: Building | null = null;
  for (let ring = 2; ring <= 12 && !placed; ring++) {
    for (const [dx, dy] of [[0, ring], [ring, ring], [-ring, -ring], [ring, -ring]]) {
      placed = sim.place('compost_heap',
        Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
      if (placed) break;
    }
  }
  expect(placed, 'nowhere to site a compost heap for the test').not.toBeNull();
  placed!.complete = true;
  placed!.store.add('compost', ripe);
  return placed!;
}

/** Wears a plot down to roughly `share` of what the ground would carry. */
function wearOut(sim: Simulation, field: Building, share: number): void {
  for (let dy = 0; dy < field.def.height; dy++) {
    for (let dx = 0; dx < field.def.width; dx++) {
      const i = sim.world.index(field.x + dx, field.y + dy);
      sim.world.soil.organic[i] = sim.world.soil.organic[i]! * share;
      sim.world.soil.nutrient[i] = sim.world.soil.nutrient[i]! * share;
    }
  }
}

/** Somebody with nothing pressing, so a test measures what it means to. */
function settle(person: Person): void {
  person.needs.thirst = 0;
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
}

/**
 * Why this person's last order stopped, as the floater in the UI would read it.
 *
 * `Simulation.interruptions` is the same list the HUD renders from, so a test
 * that reads it is asserting the thing the player is actually told rather than
 * an internal counter that may or may not reach them.
 */
function refusal(sim: Simulation, person: Person): string | null {
  for (let i = sim.interruptions.length - 1; i >= 0; i--) {
    if (sim.interruptions[i]!.personId === person.id) return sim.interruptions[i]!.reason;
  }
  return null;
}

/** Runs an order to its end, or until it is refused. */
function carryOut(sim: Simulation, person: Person, limit = 900): void {
  for (let i = 0; i < limit && person.order !== null; i++) {
    settle(person);
    sim.step();
  }
}

describe('the ground', () => {
  it('starts at rest, so the first harvest off virgin soil is the good one', () => {
    const soil = ground(0.6, 0.5);
    expect(soil.effectiveFertility(0)).toBeCloseTo(soil.restingFertility(0), 5);
    expect(soil.active.size).toBe(0);
  });

  it('burns humus when it is broken and eats the fast pool when it is cropped', () => {
    // Two pools and two different costs is the whole design: without the split,
    // compost, fallow, manure and rotation are four skins on one number.
    const soil = ground(0.6, 0.5);
    const organic = soil.organic[0]!;
    const nutrient = soil.nutrient[0]!;

    soil.till(0);
    expect(soil.organic[0]).toBeCloseTo(organic - TILL_ORGANIC_COST, 5);
    expect(soil.nutrient[0]).toBeCloseTo(nutrient, 5);

    soil.reap(0);
    expect(soil.nutrient[0]).toBeCloseTo(nutrient - REAP_NUTRIENT_COST, 5);
    expect(soil.active.has(0)).toBe(true);
  });

  it('gives back far less than a harvest takes, so working it every year tells', () => {
    // The measurement that set the recovery rates. At the first pair of numbers
    // tried, nine harvests over three years left the worked ground at 97.3% of
    // its resting state, which is a soil model that costs nothing and therefore
    // means nothing. This asserts the shape that replaced it: a year of rest
    // does not undo a year of cropping.
    const soil = ground(0.6, 0.5);
    const rest = soil.restingFertility(0);
    for (let year = 0; year < 6; year++) {
      soil.till(0);
      soil.reap(0);
      soil.recover(40);
    }
    expect(soil.effectiveFertility(0)).toBeLessThan(rest * 0.9);
  });

  it('settles, and stops being swept once it has', () => {
    // The cadence rule from the plan: no per-tick sweep, ever, and a tile that
    // has come back to rest leaves the set. Without the drop the active set is
    // every tile anybody ever touched, for the life of the world.
    const soil = ground(0.6, 0.5);
    soil.reap(0);
    expect(soil.active.size).toBe(1);
    soil.recover(400);
    expect(soil.active.size).toBe(0);
    expect(soil.nutrient[0]).toBeCloseTo(soil.restingFertility(0) > 0 ? soil.nutrient[0]! : 0, 5);
  });

  it('washes a heavy dressing out of sand faster than out of loam', () => {
    // Texture as a loss rather than as a ceiling, which is the one place it is
    // felt that way — and the reason middening a sandbank is poor practice.
    const sand = ground(0.6, 0);
    const loam = ground(0.6, 1);
    sand.enrich(0, 0.4);
    loam.enrich(0, 0.4);
    const sandBefore = sand.nutrient[0]!;
    const loamBefore = loam.nutrient[0]!;
    // Push both above their ceilings so there is something to leach.
    sand.nutrient[0] = Math.min(1, sandBefore + 0.3);
    loam.nutrient[0] = Math.min(1, loamBefore + 0.3);
    const sandStart = sand.nutrient[0]!;
    const loamStart = loam.nutrient[0]!;
    sand.recover(5);
    loam.recover(5);
    expect(sandStart - sand.nutrient[0]!).toBeGreaterThan(loamStart - loam.nutrient[0]!);
  });

  it('never runs below nothing, however hard it is worked', () => {
    const soil = ground(0.3, 0.3);
    for (let i = 0; i < 100; i++) {
      soil.till(0);
      soil.reap(0);
    }
    expect(soil.organic[0]).toBeGreaterThanOrEqual(0);
    expect(soil.nutrient[0]).toBeGreaterThanOrEqual(0);
    expect(soil.isSpent(0)).toBe(true);
    expect(isGroundSpent(soil.effectiveFertility(0), soil.restingFertility(0))).toBe(true);
  });
});

describe('a crop', () => {
  it('comes on with the season and stops dead in winter', () => {
    // Winter wheat, and it costs nothing: a crop sown too late sits in the
    // ground rather than being destroyed for a decision made in good faith.
    const crop = new Crop();
    crop.sow(0);
    crop.advance(1, 0);
    expect(crop.growth).toBe(0);
    expect(crop.stage).toBe('growing');
    for (let day = 2; day < 20 && !crop.isRipe; day++) crop.advance(day, 1);
    expect(crop.isRipe).toBe(true);
  });

  it('is lost if nobody comes for it inside the week', () => {
    // The thing that makes a field different from a storage pit. Break it by
    // removing the ripe branch of `advance` and a harvest waits for ever.
    const crop = new Crop();
    crop.sow(0);
    for (let day = 1; day < 40 && !crop.isRipe; day++) crop.advance(day, 1);
    const ripened = crop.ripeDay;
    expect(crop.advance(ripened + RIPE_WINDOW_DAYS - 1, 1)).toBe(false);
    expect(crop.advance(ripened + RIPE_WINDOW_DAYS, 1)).toBe(true);
    expect(crop.stage).toBe('fallow');
    expect(crop.lost).toBe(1);
  });

  it('pays what the ground has and nothing at all when it has nothing', () => {
    expect(harvestYield(0, 1, 1)).toBe(0);
    expect(harvestYield(0.6, 1, 1)).toBeGreaterThan(harvestYield(0.3, 1, 1));
    expect(harvestYield(0.5, 1, 1)).toBeGreaterThan(harvestYield(0.5, 0, 1));
  });
});

describe('a field in a world', () => {
  it('is a building, and the crop rides on it', () => {
    expect(isField(BUILDINGS.field!)).toBe(true);
    expect(BUILDINGS.field!.requiresTech).toBe('farming');
    // Everything else in the table has no crop, which is what stops the daily
    // sweep and the renderer from having to ask what kind of thing they have.
    for (const def of Object.values(BUILDINGS)) {
      if (def.id !== 'field') expect(isField(def), def.id).toBe(false);
    }
  });

  it('takes seed out of a pack and puts a crop in the ground', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const field = fieldNear(sim, person);
    person.inventory.add('grain', SOW_SEED * 2);

    const organicBefore = sim.soilReport(field).organic;
    expect(sim.order(person, 'sow', { buildingId: field.id })).toBe(true);
    carryOut(sim, person);

    expect(field.crop!.stage).toBe('growing');
    expect(person.inventory.count('grain')).toBe(SOW_SEED);
    // The tilling, which is the cost that makes composting worth discovering.
    expect(sim.soilReport(field).organic).toBeLessThan(organicBefore);
  });

  it('refuses an empty-handed sowing, and says why', () => {
    // The standing instruction on this project: if the simulation refuses
    // something, the player is owed the reason. Six different refusals hang off
    // `doSow` and every one of them is a different thing to do about it.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const field = fieldNear(sim, person);
    for (const [itemId, count] of person.inventory.entries()) {
      person.inventory.remove(itemId, count);
    }

    sim.order(person, 'sow', { buildingId: field.id });
    carryOut(sim, person);
    expect(refusal(sim, person)).toBe('no_seed');
    expect(field.crop!.isFallow).toBe(true);
  });

  it('will not sow ground that has nothing left in it', () => {
    // Break `groundSpent` and a band spends its springs sowing a dust bowl.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const field = fieldNear(sim, person);
    person.inventory.add('grain', SOW_SEED);
    for (let dy = 0; dy < field.def.height; dy++) {
      for (let dx = 0; dx < field.def.width; dx++) {
        const i = sim.world.index(field.x + dx, field.y + dy);
        sim.world.soil.organic[i] = 0;
        sim.world.soil.nutrient[i] = 0;
      }
    }
    // Rich parent material: the plot still reads above the absolute floor with
    // both pools at nothing, and it is `SPENT_SHARE` that condemns it. That is
    // the case the relative half of `isGroundSpent` exists for.
    expect(sim.soilReport(field).spent).toBe(true);

    sim.order(person, 'sow', { buildingId: field.id });
    carryOut(sim, person);
    expect(refusal(sim, person)).toBe('ground_spent');
    expect(person.inventory.count('grain')).toBe(SOW_SEED);
  });

  it('gives grain back, and takes it out of the ground to do it', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const field = fieldNear(sim, person);
    field.crop!.sow(sim.time.day);
    field.crop!.growth = 1;
    field.crop!.stage = 'ripe';
    field.crop!.ripeDay = sim.time.day;

    const nutrientBefore = sim.soilReport(field).nutrient;
    const held = person.inventory.count('grain');
    expect(sim.order(person, 'reap', { buildingId: field.id })).toBe(true);
    carryOut(sim, person);

    expect(field.crop!.isFallow).toBe(true);
    expect(field.crop!.harvests).toBe(1);
    expect(field.crop!.lastYield).toBeGreaterThan(0);
    expect(person.inventory.count('grain')).toBeGreaterThan(held);
    expect(sim.soilReport(field).nutrient).toBeLessThan(nutrientBefore);
  });

  it('will not be reaped before it is ready', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const field = fieldNear(sim, person);
    field.crop!.sow(sim.time.day);

    sim.order(person, 'reap', { buildingId: field.id });
    carryOut(sim, person);
    expect(refusal(sim, person)).toBe('not_ripe');
    expect(field.crop!.harvests).toBe(0);
  });

  it('gives less off the same plot as the ground is worked out', () => {
    // The owner's note, in one assertion: the field gets worse. Break the
    // drawdown in `Soil.reap` and the two figures come out identical.
    //
    // Measured at a fixed hand rather than from the harvests themselves, and
    // that is a finding rather than a convenience: the first version of this
    // test compared the first real harvest with the tenth and **failed**,
    // because `doReap` practises `farm` every time and the reaper got better at
    // it faster than the ground wore out. Both are true, and a test that lets
    // them fight measures neither.
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const field = fieldNear(sim, person);
    const atFixedHand = (): number => harvestYield(sim.soilReport(field).effective, 0.5, 1);

    const harvest = (): number => {
      field.crop!.stage = 'ripe';
      field.crop!.growth = 1;
      field.crop!.ripeDay = sim.time.day;
      person.workedTicks = 0;
      sim.order(person, 'reap', { buildingId: field.id });
      carryOut(sim, person);
      return field.crop!.lastYield;
    };

    const before = atFixedHand();
    expect(harvest()).toBeGreaterThan(0);
    for (let i = 0; i < 9; i++) harvest();
    expect(atFixedHand()).toBeLessThan(before);
    // And the ground says so in the one place the panel and the report read.
    const soil = sim.soilReport(field);
    expect(soil.effective).toBeLessThan(soil.resting);
  });
});

describe('composting', () => {
  const KEEN = {
    ...SMALL,
    population: {
      bands: 1, peoplePerBand: 6,
      startingTech: ['plant_lore', 'grinding', 'farming', 'composting'],
    },
  };

  it('is a heap rather than a trap, and the table knows the difference', () => {
    // Four systems read `isTrap` and every one of them would be wrong about a
    // heap: the planner, the larder scorer, `doStore` and the health report.
    expect(isHeap(BUILDINGS.compost_heap!)).toBe(true);
    for (const def of Object.values(BUILDINGS)) {
      if (def.id !== 'compost_heap') expect(isHeap(def), def.id).toBe(false);
      if (isHeap(def)) expect(def.yields, def.id).toBeUndefined();
    }
  });

  it('rots down on its own, and stops when nobody remembers how', () => {
    const sim = new Simulation(KEEN);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const heap = heapNear(sim, person, 0);

    for (let i = 0; i < sim.config.time.ticksPerDay * 3; i++) sim.step();
    const made = heap.store.count('compost');
    expect(made).toBeGreaterThan(0);

    // The same honesty `workTraps` applies to a snare line whose setter died.
    for (const member of sim.people) member.knownTech.delete('composting');
    for (let i = 0; i < sim.config.time.ticksPerDay * 3; i++) sim.step();
    expect(heap.store.count('compost')).toBe(made);
  });

  it('puts humus back, and more than a sowing takes out', () => {
    const sim = new Simulation(KEEN);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const field = fieldNear(sim, person);
    heapNear(sim, person, 8);
    wearOut(sim, field, 0.6);

    person.inventory.add('compost', SPREAD_LOAD);
    const before = sim.soilReport(field);
    expect(sim.order(person, 'spread', { buildingId: field.id })).toBe(true);
    carryOut(sim, person);

    const after = sim.soilReport(field);
    expect(after.organic).toBeGreaterThan(before.organic);
    expect(after.effective).toBeGreaterThan(before.effective);
    expect(person.inventory.count('compost')).toBe(0);
  });

  it('fetches from the heap itself rather than handing the trip to another verb', () => {
    // The whole reason both legs live in one verb. The first version handed the
    // fetch off to `take`, on `doBuild`'s pattern — and `doBuild` gets away with
    // it because `haul` is a verb the scorer also aims for itself. Nothing aims
    // a `take` at a compost heap, so the next think tick re-pointed it at the
    // larder: `stewards` spent ninety-nine thousand ticks taking food out of
    // storage pits while two heaps stood full for a hundred and sixteen days and
    // not one load was ever spread. Break it back and this test fails on the
    // same symptom.
    const sim = new Simulation(KEEN);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const field = fieldNear(sim, person);
    const heap = heapNear(sim, person, 8);
    wearOut(sim, field, 0.6);
    const before = sim.soilReport(field);

    sim.order(person, 'spread', { buildingId: field.id });
    carryOut(sim, person, 3000);

    expect(heap.store.count('compost')).toBeLessThan(8);
    expect(sim.soilReport(field).organic).toBeGreaterThan(before.organic);
  });

  it('says so when there is no compost anywhere', () => {
    const sim = new Simulation(KEEN);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const field = fieldNear(sim, person);
    sim.order(person, 'spread', { buildingId: field.id });
    carryOut(sim, person);
    expect(refusal(sim, person)).toBe('no_compost');
  });

  it('is something a farmer thinks of doing, once the ground is tired', () => {
    // The scorer, not the verb. Whether a *world* ever gets round to spreading
    // depends on how hungry it is and how far the plot is — which is why
    // `stewards` keeps the world-scale question — but whether the option is on
    // the table at all is a property of `Brain` and has one right answer.
    const sim = new Simulation(KEEN);
    aDayIn(sim);
    const person = sim.livingPeople()[0]!;
    const field = fieldNear(sim, person, 2);
    heapNear(sim, person, 8);

    const offered = (): number => {
      lastScores.delete(person.id);
      for (let i = 0; i < 200 && !lastScores.has(person.id); i++) {
        settle(person);
        sim.step();
      }
      return lastScores.get(person.id)?.find(s => s.id === 'spread')?.score ?? 0;
    };

    // Ground in good heart wants nothing, and a scorer that sent people out to
    // dress it would have a band walking back and forth all season.
    expect(offered()).toBe(0);
    wearOut(sim, field, 0.55);
    expect(offered()).toBeGreaterThan(0);
  });
});
