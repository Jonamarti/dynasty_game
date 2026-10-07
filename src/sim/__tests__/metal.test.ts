/**
 * The metal tier (M15 phase 37, M8.3).
 *
 * One block per node, added in the commit that adds the node. Each asserts the
 * three things "no node ships inert" asks for: the node is declared the way the
 * plan says, something in the world reads it, and the thing it unlocks works
 * end to end where a person can reach it. The end-to-end cases are
 * deterministic unit tests rather than `simcheck` rows for the reason
 * `orders.test.ts` gives: a scenario run is chaotic, and a check that can only
 * report n/a is worse than none.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { Person, DAYS_PER_YEAR } from '../entities/Person.ts';
import { TECH, TECHS, TECH_EFFECTS, ageIndex, warmthFrom, techPower } from '../knowledge/Tech.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { BUILDINGS, isStation, type Building } from '../entities/Building.ts';

const SMALL = {
  seed: 'metal',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};

/** A quiet person with an empty pack, so a test measures what it means to. */
function settle(person: Person): void {
  person.needs.thirst = 0;
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.workedTicks = 0;
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
}

function adult(name: string): Person {
  const person = new Person(name, 4, 4, 0, new RNG('metal-' + name));
  person.age = 30 * DAYS_PER_YEAR;
  return person;
}

/** Knows `tech` outright, at its base power. */
function teach(person: Person, ...techs: (typeof TECHS)[number][]): void {
  for (const tech of techs) person.knownTech.add(tech);
}

/** A world whose founders already know `techs`, run past the first daily pass. */
function worldKnowing(techs: string[], seed = 'metal'): Simulation {
  const sim = new Simulation({ ...SMALL, seed, population: { ...SMALL.population, startingTech: techs } });
  // `Simulation.knownTech` is rebuilt in the daily block, and `place` gates on it.
  for (let i = 0; i < 300; i++) sim.step();
  return sim;
}

/** A finished `stationId` a few steps away from `person`, on open ground. */
function stationNear(sim: Simulation, person: Person, stationId: string): Building {
  let station: Building | null = null;
  for (const [dx, dy] of [[6, 6], [-6, 6], [6, -6], [-6, -6], [8, 0], [0, 8], [4, 0], [0, 4]]) {
    station = sim.place(stationId, Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
    if (station) break;
  }
  expect(station, 'somewhere to put the ' + stationId).not.toBeNull();
  station!.complete = true;
  return station!;
}

describe('charcoal and the pit', () => {
  it('needs firemaking and carpentry, and is a device of the Chalcolithic', () => {
    const def = TECH.charcoal;
    expect(def.requires).toEqual(['firemaking', 'carpentry']);
    expect(def.kind).toBe('device');
    expect(def.domain).toBe('fire');
    expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH.carpentry.age));
    expect(def.firstKnown.length).toBeGreaterThan(0);
  });

  it('makes the pit a station that only the knowing may raise', () => {
    const pit = BUILDINGS.charcoal_pit!;
    expect(isStation(pit)).toBe(true);
    expect(pit.requiresTech).toBe('charcoal');
    expect(pit.storage).toBe(0);
    // Everything it is built of is something a band can fetch for a site.
    for (const id of Object.keys(pit.materials)) expect(['sticks', 'mud', 'flint']).toContain(id);
  });

  it('turns deadwood into charcoal at the pit and nowhere else', () => {
    const recipe = RECIPES.charcoal!;
    expect(recipe.station).toBe('charcoal_pit');
    expect(recipe.tech).toBe('charcoal');
    // Sticks, not timber: nothing in the pack-filling scorers fells a tree for a recipe.
    expect(Object.keys(recipe.ingredients)).toEqual(['sticks']);
    expect(recipe.output).toEqual({ charcoal: 3 });
    expect(recipe.keep).toBeGreaterThan(0);
  });

  it('is a fuel and not a food, a weapon or a garment', () => {
    const item = ITEMS.charcoal!;
    expect(item.nutrition).toBe(0);
    expect(item.weapon).toBeUndefined();
    expect(item.protects).toBeUndefined();
  });

  it('warms only somebody who both knows how it is made and carries some', () => {
    const bare = adult('bare');
    const knower = adult('knower');
    const carrier = adult('carrier');
    const both = adult('both');
    teach(knower, 'charcoal');
    teach(both, 'charcoal');
    carrier.inventory.add('charcoal', 2);
    both.inventory.add('charcoal', 2);
    expect(warmthFrom(knower)).toBe(warmthFrom(bare));
    expect(warmthFrom(carrier)).toBe(warmthFrom(bare));
    expect(warmthFrom(both)).toBeGreaterThan(warmthFrom(bare));
    // Diminishing returns: never total warmth.
    teach(both, 'firemaking', 'clothing');
    expect(warmthFrom(both)).toBeLessThan(1);
  });

  it('declares what it does', () => {
    expect(TECH_EFFECTS.charcoal.site).toContain('charcoal_pit');
  });

  it('is made at the pit end to end', () => {
    const sim = worldKnowing(['firemaking', 'carpentry', 'charcoal']);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('sticks', 6);
    expect(techPower(person, 'charcoal')).toBeGreaterThan(0);
    const pit = stationNear(sim, person, 'charcoal_pit');

    expect(sim.order(person, 'craft', { recipeId: 'charcoal', buildingId: pit.id })).toBe(true);
    for (let i = 0; i < 1500 && person.inventory.count('charcoal') === 0; i++) {
      person.needs.thirst = 0;
      person.needs.hunger = 0;
      sim.step();
    }
    expect(person.inventory.count('charcoal')).toBe(3);
    expect(person.inventory.count('sticks')).toBe(0);
    expect(pit.contains(person.x, person.y)).toBe(true);
  });

  it('is refused away from the pit, and the reason names it', () => {
    const sim = worldKnowing(['firemaking', 'carpentry', 'charcoal']);
    const person = sim.livingPeople()[0]!;
    settle(person);
    person.inventory.add('sticks', 6);
    expect(sim.order(person, 'craft', { recipeId: 'charcoal' })).toBe(false);
    expect(sim.lastRefusal).toContain('pit');
  });
});
