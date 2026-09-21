/**
 * M11 phase 10, fifth commit: `well`, the first technology to touch thirst
 * at all.
 *
 * A well is read by distance rather than by `reachBuilding`, since `drink`
 * is not a building action anywhere else in the game — see the header
 * comment on `BuildingDef.providesWater`. These tests find an inland spot by
 * scanning the generated world rather than asserting one exists, so the
 * suite fails honestly (rather than passing vacuously) on an island small
 * enough to have none.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { lastScores } from '../ai/Brain.ts';
import { BUILDINGS, isWell } from '../entities/Building.ts';
import type { Building } from '../entities/Building.ts';
import type { Person } from '../entities/Person.ts';

const SMALL = {
  seed: 'well-test',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: {
    bands: 1, peoplePerBand: 6,
    startingTech: ['stoneworking', 'carpentry', 'masonry', 'well'],
  },
};

/** A world one day old. See `traps.test.ts` for why this matters on tick zero. */
function aDayIn(sim: Simulation): void {
  for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
}

/** Somewhere with no water anywhere near it, or null if the map has none. */
function findInlandSpot(sim: Simulation): { x: number; y: number } | null {
  for (let y = 8; y < sim.world.height - 8; y += 4) {
    for (let x = 8; x < sim.world.width - 8; x += 4) {
      let dry = true;
      for (let dy = -6; dy <= 6 && dry; dy++) {
        for (let dx = -6; dx <= 6 && dry; dx++) {
          if (sim.world.isWater(x + dx, y + dy)) dry = false;
        }
      }
      if (dry) return { x, y };
    }
  }
  return null;
}

/** A finished well standing at exactly (x, y)'s tile. */
function wellAt(sim: Simulation, x: number, y: number, bandId: number): Building {
  const placed = sim.place('well', x, y, bandId);
  expect(placed, 'could not site a well at the chosen inland spot').not.toBeNull();
  placed!.complete = true;
  return placed!;
}

/** Somebody with nothing pressing but thirst, so a test measures that alone. */
function settleButThirsty(person: Person): void {
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  person.needs.thirst = 60;
  for (const [itemId, count] of person.inventory.entries()) person.inventory.remove(itemId, count);
}

describe('a well', () => {
  it('lets somebody drink far from any natural water', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const spot = findInlandSpot(sim);
    expect(spot, 'this map has no inland spot to test with').not.toBeNull();
    const person = sim.livingPeople()[0]!;
    const well = wellAt(sim, spot!.x, spot!.y, person.bandId);
    expect(isWell(well.def)).toBe(true);

    person.x = well.centerX;
    person.y = well.centerY;
    settleButThirsty(person);
    expect(sim.order(person, 'drink')).toBe(true);
    for (let i = 0; i < 200 && person.needs.thirst > 0; i++) sim.step();
    expect(person.needs.thirst).toBe(0);
  });

  it('refuses the same spot with no well there, and says why', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const spot = findInlandSpot(sim);
    expect(spot, 'this map has no inland spot to test with').not.toBeNull();
    const person = sim.livingPeople()[0]!;
    person.x = spot!.x;
    person.y = spot!.y;
    settleButThirsty(person);

    expect(sim.order(person, 'drink')).toBe(true);
    for (let i = 0; i < 200 && person.order !== null; i++) sim.step();
    expect(person.needs.thirst).toBeGreaterThan(0);
    expect(sim.interruptions.some(stop => stop.reason === 'no_water')).toBe(true);
  });

  it('is worth a walk to somebody thirsty, once it is nearer than the shore', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const spot = findInlandSpot(sim);
    expect(spot, 'this map has no inland spot to test with').not.toBeNull();
    const person = sim.livingPeople()[0]!;
    const well = wellAt(sim, spot!.x, spot!.y, person.bandId);
    person.x = well.centerX + 1;
    person.y = well.centerY;
    settleButThirsty(person);

    sim.possess(person);
    lastScores.delete(person.id);
    for (let i = 0; i < 10 && !lastScores.has(person.id); i++) sim.step();
    const drink = (lastScores.get(person.id) ?? []).find(entry => entry.id === 'drink');
    expect(drink, 'nobody would walk to a well while thirsty').toBeDefined();
    expect(drink!.score).toBeGreaterThan(0);
  });
});

describe('well design', () => {
  it('is never one tile across', () => {
    for (const def of Object.values(BUILDINGS)) {
      if (!isWell(def)) continue;
      expect(def.width, def.id + ' is too small to arrive at').toBeGreaterThan(1);
      expect(def.height, def.id + ' is too small to arrive at').toBeGreaterThan(1);
    }
  });

  it('stores nothing and yields nothing on its own — it is read by distance, not by store', () => {
    for (const def of Object.values(BUILDINGS)) {
      if (!isWell(def)) continue;
      expect(def.storage, def.id + ' should not double as a larder').toBe(0);
      expect(def.requiresTech, def.id + ' is a well anybody can sink').not.toBeNull();
    }
  });
});
