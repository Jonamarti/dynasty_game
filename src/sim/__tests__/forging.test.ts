/** M15 phase 40c: a bloom becomes wrought iron at a stone anvil. */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Person } from '../entities/Person.ts';
import { Building, BUILDINGS, isStation } from '../entities/Building.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { TECH, ageIndex } from '../knowledge/Tech.ts';

const SMALL = {
  seed: 'forging',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};

function settled(person: Person): void {
  person.needs.thirst = person.needs.hunger = person.needs.cold = 0;
  person.workedTicks = 0;
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
}

function worldKnowing(techs: string[], seed = 'forging'): Simulation {
  const sim = new Simulation({ ...SMALL, seed, population: { ...SMALL.population, startingTech: techs as never } });
  for (let i = 0; i < 300; i++) sim.step();
  return sim;
}

function anvilNear(sim: Simulation, person: Person): Building {
  let anvil: Building | null = null;
  for (const [dx, dy] of [[6, 6], [-6, 6], [6, -6], [-6, -6], [8, 0], [0, 8], [4, 0], [0, 4]]) {
    anvil = sim.place('anvil', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
    if (anvil) break;
  }
  expect(anvil, 'somewhere to put the anvil').not.toBeNull();
  anvil!.complete = true;
  return anvil!;
}

/** Insert only a completed station so this test isolates the recipe's own gate. */
function anvilNearWithFixture(sim: Simulation, person: Person): Building {
  const def = BUILDINGS['anvil']!;
  const building = new Building(def, Math.round(person.x) + 8, Math.round(person.y) + 8, person.bandId, sim.ids);
  building.complete = true;
  sim.buildings.push(building);
  sim.buildingsById.set(building.id, building);
  sim.buildingHash.insert(building);
  return building;
}

describe('forging', () => {
  it('is a Metal Iron Age node gated by bloomery, with a stone anvil as its station', () => {
    const def = TECH['forging' as keyof typeof TECH];
    expect(def.requires).toEqual(['bloomery']);
    expect(def.domain).toBe('metal');
    expect(def.web).toBe('metal');
    expect(ageIndex(def.age)).toBeGreaterThanOrEqual(ageIndex(TECH.bloomery.age));

    const anvil = BUILDINGS['anvil'];
    expect(anvil.requiresTech).toBe('forging');
    expect(isStation(anvil)).toBe(true);
    expect(anvil.materials).toEqual({ flint: 8, sticks: 4 });
    expect(anvil.workTicks).toBe(160);
    expect(RECIPES['forge_iron']?.station).toBe('anvil');
  });

  it('turns one bloom into wrought iron only with the forge recipe', () => {
    expect(ITEMS['wrought_iron']?.label).toBe('Wrought iron');
    const recipe = RECIPES['forge_iron']!;
    expect(recipe.tech).toBe('forging');
    expect(recipe.skill).toBe('smith');
    expect(recipe.ingredients).toEqual({ iron_bloom: 1 });
    expect(recipe.output).toEqual({ wrought_iron: 1 });
    expect(recipe.station).toBe('anvil');
    expect(recipe.keep).toBeGreaterThanOrEqual(0);
  });

  it('forges a supplied bloom at the anvil and reports missing inputs or the station', () => {
    const sim = worldKnowing(['bog_iron', 'bellows', 'bloomery', 'forging']);
    const smith = sim.livingPeople()[0]!;
    settled(smith);
    smith.inventory.add('iron_bloom', 1);
    const anvil = anvilNear(sim, smith);

    expect(sim.order(smith, 'craft', { recipeId: 'forge_iron', buildingId: anvil.id })).toBe(true);
    for (let i = 0; i < 2500 && smith.inventory.count('wrought_iron') === 0; i++) {
      smith.needs.thirst = smith.needs.hunger = 0;
      sim.step();
    }
    expect(smith.inventory.count('wrought_iron')).toBe(1);
    expect(smith.inventory.count('iron_bloom')).toBe(0);

    const noStation = worldKnowing(['bog_iron', 'bellows', 'bloomery', 'forging'], 'forging-no-station');
    const otherSmith = noStation.livingPeople()[0]!;
    settled(otherSmith);
    otherSmith.inventory.add('iron_bloom', 1);
    expect(noStation.order(otherSmith, 'craft', { recipeId: 'forge_iron' })).toBe(false);
    expect(noStation.lastRefusal).toContain('anvil');

    const short = worldKnowing(['bog_iron', 'bellows', 'bloomery', 'forging'], 'forging-short');
    const worker = short.livingPeople()[0]!;
    settled(worker);
    const secondAnvil = anvilNear(short, worker);
    expect(short.order(worker, 'craft', { recipeId: 'forge_iron', buildingId: secondAnvil.id })).toBe(true);
    short.interruptions.length = 0;
    for (let i = 0; i < 20 && short.interruptions.length === 0; i++) short.step();
    expect(short.interruptions.map(n => n.reason)).toContain('lack_materials');
    expect(worker.inventory.count('wrought_iron')).toBe(0);
  });

  it('banks forging work through urgent thirst and resumes the same bloom', () => {
    const sim = worldKnowing(['bog_iron', 'bellows', 'bloomery', 'forging'], 'forging-thirst');
    const smith = sim.livingPeople()[0]!;
    settled(smith);
    smith.inventory.add('iron_bloom', 1);
    const anvil = anvilNear(sim, smith);
    expect(sim.order(smith, 'craft', { recipeId: 'forge_iron', buildingId: anvil.id })).toBe(true);

    for (let i = 0; i < 1000 && smith.bankedFor('craft:forge_iron') < 12; i++) {
      smith.needs.thirst = 0;
      smith.needs.hunger = 0;
      sim.step();
    }
    const beforeBreak = smith.bankedFor('craft:forge_iron');
    expect(beforeBreak).toBeGreaterThanOrEqual(12);

    sim.interruptions.length = 0;
    smith.needs.thirst = 100;
    for (let i = 0; i < 20 && !sim.interruptions.some(n => n.personId === smith.id && n.reason === 'thirsty'); i++) sim.step();
    expect(sim.interruptions.some(n => n.personId === smith.id && n.reason === 'thirsty')).toBe(true);
    expect(smith.bankedFor('craft:forge_iron')).toBeGreaterThanOrEqual(beforeBreak);
    expect(smith.resume?.recipe).toBe('forge_iron');
    expect(smith.inventory.count('iron_bloom')).toBe(1);
    expect(smith.inventory.count('wrought_iron')).toBe(0);

    for (let i = 0; i < 3000 && smith.inventory.count('wrought_iron') === 0; i++) {
      smith.needs.thirst = 0;
      smith.needs.hunger = 0;
      sim.step();
    }
    expect(smith.inventory.count('wrought_iron')).toBe(1);
    expect(smith.inventory.count('iron_bloom')).toBe(0);
    expect(smith.bankedFor('craft:forge_iron')).toBe(0);
  });
  it('does not place an anvil or finish a forge without the forging knowledge', () => {
    const sim = worldKnowing(['bog_iron', 'bellows', 'bloomery'], 'forging-gate');
    const smith = sim.livingPeople()[0]!;
    settled(smith);
    expect(sim.place('anvil', Math.round(smith.x) + 8, Math.round(smith.y) + 8, smith.bandId)).toBeNull();

    const anvil = anvilNearWithFixture(sim, smith);
    smith.inventory.add('iron_bloom', 1);
    expect(sim.order(smith, 'craft', { recipeId: 'forge_iron', buildingId: anvil.id })).toBe(true);
    sim.interruptions.length = 0;
    for (let i = 0; i < 20 && sim.interruptions.length === 0; i++) sim.step();
    expect(sim.interruptions.map(n => n.reason)).toContain('dont_know_how');
    expect(smith.inventory.count('wrought_iron')).toBe(0);
    expect(smith.inventory.count('iron_bloom')).toBe(1);
  });
});
