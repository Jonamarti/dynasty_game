/** M15 phase 40b: one useful product for the bloomery. */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { type Building } from '../entities/Building.ts';
import { TECH, ageIndex, techPower, type Tech } from '../knowledge/Tech.ts';
import { wantedOreKinds } from '../knowledge/Ore.ts';
import { sparkFires, type Notice } from '../knowledge/Synthesis.ts';

const SMALL = {
  seed: 'bloomery',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};

function settled(person: Person): void {
  person.needs.thirst = 0;
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.workedTicks = 0;
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
}

function worldKnowing(techs: string[], seed = 'bloomery'): Simulation {
  const sim = new Simulation({ ...SMALL, seed, population: { ...SMALL.population, startingTech: techs } });
  for (let i = 0; i < 300; i++) sim.step();
  return sim;
}

function furnaceNear(sim: Simulation, person: Person): Building {
  let furnace: Building | null = null;
  for (const [dx, dy] of [[6, 6], [-6, 6], [6, -6], [-6, -6], [8, 0], [0, 8], [4, 0], [0, 4]]) {
    furnace = sim.place('furnace', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
    if (furnace) break;
  }
  expect(furnace, 'somewhere to put the furnace').not.toBeNull();
  furnace!.complete = true;
  return furnace!;
}

describe('bloomery', () => {
  it('requires both iron ore and bellows in the Iron Age', () => {
    const def = TECH.bloomery;
    expect(def.requires).toEqual(['bog_iron', 'bellows']);
    expect(def.domain).toBe('metal');
    expect(def.web).toBe('metal');
    expect(def.kind).toBe('device');
    for (const required of def.requires) {
      expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH[required].age));
    }
  });

  it('has separate work and gathered-charge routes into the idea', () => {
    const notice: Notice = {
      knows: new Set(['bog_iron', 'bellows']), holding: new Set(['iron_ore']),
      lately: new Set(['craft']), feeling: new Set(), wanting: new Set(),
      place: 'grass', saw: new Set(), season: 'summer',
    };
    const workRoute = TECH.bloomery.sparks[0]!;
    const chargeRoute = TECH.bloomery.sparks[1]!;
    expect(sparkFires(workRoute, notice)).toBe(true);
    expect(sparkFires(chargeRoute, notice)).toBe(false);
    expect(sparkFires(workRoute, { ...notice, lately: new Set() })).toBe(false);
    expect(sparkFires(chargeRoute, {
      ...notice, lately: new Set(), holding: new Set(['iron_ore', 'charcoal']),
    })).toBe(true);
  });
  it('turns iron ore and charcoal into a bloom at the existing furnace', () => {
    expect(ITEMS.iron_bloom?.label).toBe('Iron bloom');
    const recipe = RECIPES.smelt_iron!;
    expect(recipe.tech).toBe('bloomery');
    expect(recipe.station).toBe('furnace');
    expect(recipe.skill).toBe('smith');
    expect(recipe.ingredients).toEqual({ iron_ore: 2, charcoal: 1 });
    expect(recipe.output).toEqual({ iron_bloom: 1 });
    expect(recipe.keep).toBe(2);
  });

  it('sends a bloomery smith to iron and, recursively, to the charcoal source', () => {
    const smith = new Person('smith', 4, 4, 0, new RNG('bloomery-ore-want'));
    for (const tech of ['bog_iron', 'bellows', 'bloomery', 'mining', 'smelting', 'charcoal', 'firemaking', 'carpentry'] as Tech[]) {
      smith.knownTech.add(tech);
    }
    smith.inventory.add('copper', 4); // Satisfy the separate copper-smelting stock target.
    expect(wantedOreKinds(smith)).toEqual(['iron_ore', 'sticks']);
    smith.inventory.add('iron_ore', 2);
    expect(wantedOreKinds(smith)).not.toContain('iron_ore');
  });

  it('makes the bloom end to end, and stops if knowledge or inputs are missing', () => {
    const sim = worldKnowing(['bog_iron', 'bellows', 'bloomery', 'mining', 'smelting', 'charcoal', 'firemaking', 'carpentry']);
    const smith = sim.livingPeople()[0]!;
    settled(smith);
    smith.inventory.add('iron_ore', 2);
    smith.inventory.add('charcoal', 1);
    const furnace = furnaceNear(sim, smith);

    expect(techPower(smith, 'bloomery')).toBeGreaterThan(0);
    expect(sim.order(smith, 'craft', { recipeId: 'smelt_iron', buildingId: furnace.id })).toBe(true);
    for (let i = 0; i < 2500 && smith.inventory.count('iron_bloom') === 0; i++) {
      smith.needs.thirst = 0;
      smith.needs.hunger = 0;
      sim.step();
    }
    expect(smith.inventory.count('iron_bloom')).toBe(1);
    expect(smith.inventory.count('iron_ore')).toBe(0);
    expect(smith.inventory.count('charcoal')).toBe(0);

    const unlearned = worldKnowing(['mining', 'smelting', 'charcoal', 'firemaking', 'carpentry'], 'bloomery-unlearned');
    const heir = unlearned.livingPeople()[0]!;
    settled(heir);
    heir.inventory.add('iron_ore', 2);
    heir.inventory.add('charcoal', 1);
    const otherFurnace = furnaceNear(unlearned, heir);
    expect(unlearned.order(heir, 'craft', { recipeId: 'smelt_iron', buildingId: otherFurnace.id })).toBe(true);
    unlearned.interruptions.length = 0;
    for (let i = 0; i < 20 && unlearned.interruptions.length === 0; i++) unlearned.step();
    expect(unlearned.interruptions.map(n => n.reason)).toContain('dont_know_how');
    expect(heir.inventory.count('iron_bloom')).toBe(0);

    const short = worldKnowing(['bog_iron', 'bellows', 'bloomery', 'mining', 'smelting', 'charcoal', 'firemaking', 'carpentry'], 'bloomery-short');
    const worker = short.livingPeople()[0]!;
    settled(worker);
    worker.inventory.add('iron_ore', 2);
    const thirdFurnace = furnaceNear(short, worker);
    expect(short.order(worker, 'craft', { recipeId: 'smelt_iron', buildingId: thirdFurnace.id })).toBe(true);
    short.interruptions.length = 0;
    for (let i = 0; i < 20 && short.interruptions.length === 0; i++) short.step();
    expect(short.interruptions.map(n => n.reason)).toContain('lack_materials');
    expect(worker.inventory.count('iron_bloom')).toBe(0);
  });

  it('banks furnace work across thirst and resumes the same bloom', () => {
    const sim = worldKnowing(['bog_iron', 'bellows', 'bloomery', 'mining', 'smelting', 'charcoal', 'firemaking', 'carpentry'], 'bloomery-thirst');
    const smith = sim.livingPeople()[0]!;
    settled(smith);
    smith.inventory.add('iron_ore', 2);
    smith.inventory.add('charcoal', 1);
    const furnace = furnaceNear(sim, smith);
    expect(sim.order(smith, 'craft', { recipeId: 'smelt_iron', buildingId: furnace.id })).toBe(true);

    for (let i = 0; i < 1000 && smith.bankedFor('craft:smelt_iron') < 12; i++) {
      smith.needs.thirst = 0;
      smith.needs.hunger = 0;
      sim.step();
    }
    const beforeBreak = smith.bankedFor('craft:smelt_iron');
    expect(beforeBreak).toBeGreaterThanOrEqual(12);

    smith.needs.thirst = 100;
    for (let i = 0; i < 20 && !sim.interruptions.some(n => n.personId === smith.id && n.reason === 'thirsty'); i++) sim.step();
    expect(sim.interruptions.some(n => n.personId === smith.id && n.reason === 'thirsty')).toBe(true);
    const banked = smith.bankedFor('craft:smelt_iron');
    expect(banked).toBeGreaterThanOrEqual(beforeBreak);
    expect(smith.resume?.recipe).toBe('smelt_iron');

    for (let i = 0; i < 3000 && smith.inventory.count('iron_bloom') === 0; i++) {
      smith.needs.thirst = 0;
      smith.needs.hunger = 0;
      sim.step();
    }
    expect(smith.inventory.count('iron_bloom')).toBe(1);
    expect(smith.inventory.count('iron_ore')).toBe(0);
    expect(smith.inventory.count('charcoal')).toBe(0);
    expect(smith.bankedFor('craft:smelt_iron')).toBe(0);
  });

  it('abandons a bloomery craft if the smith loses its knowledge mid-work', () => {
    const sim = worldKnowing(['bog_iron', 'bellows', 'bloomery', 'mining', 'smelting', 'charcoal', 'firemaking', 'carpentry'], 'bloomery-forgotten');
    const smith = sim.livingPeople()[0]!;
    settled(smith);
    smith.inventory.add('iron_ore', 2);
    smith.inventory.add('charcoal', 1);
    const furnace = furnaceNear(sim, smith);
    expect(sim.order(smith, 'craft', { recipeId: 'smelt_iron', buildingId: furnace.id })).toBe(true);
    for (let i = 0; i < 1000 && smith.bankedFor('craft:smelt_iron') < 12; i++) {
      smith.needs.thirst = 0;
      smith.needs.hunger = 0;
      sim.step();
    }
    expect(smith.bankedFor('craft:smelt_iron')).toBeGreaterThanOrEqual(12);

    smith.knownTech.delete('bloomery');
    sim.interruptions.length = 0;
    sim.step();
    expect(sim.interruptions.map(n => n.reason)).toContain('dont_know_how');
    expect(smith.inventory.count('iron_bloom')).toBe(0);
    expect(smith.inventory.count('iron_ore')).toBe(2);
    expect(smith.inventory.count('charcoal')).toBe(1);
  });
});
