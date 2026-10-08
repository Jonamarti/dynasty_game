/** M15 phase 40d: carburised steel and its real weapon reader. */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Person } from '../entities/Person.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { TECH, weaponOf, weaponItemOf } from '../knowledge/Tech.ts';

const SMALL = {
  seed: 'carburising',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6 },
};

function settled(person: Person): void {
  person.needs.thirst = person.needs.hunger = person.needs.cold = 0;
  person.workedTicks = 0;
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
}

function worldKnowing(techs: string[], seed = 'carburising'): Simulation {
  const sim = new Simulation({ ...SMALL, seed, population: { ...SMALL.population, startingTech: techs as never } });
  for (let i = 0; i < 300; i++) sim.step();
  return sim;
}

function anvilNear(sim: Simulation, person: Person): Building {
  const def = BUILDINGS.anvil!;
  const building = new Building(def, Math.round(person.x) + 8, Math.round(person.y) + 8, person.bandId, sim.ids);
  building.complete = true;
  sim.buildings.push(building);
  sim.buildingsById.set(building.id, building);
  sim.buildingHash.insert(building);
  return building;
}

describe('carburising', () => {
  it('gates steel and its anvil sword behind forging and charcoal knowledge', () => {
    expect(TECH.carburising!.requires).toEqual(['forging', 'charcoal']);
    expect(TECH.carburising!.domain).toBe('metal');
    expect(TECH.carburising!.web).toBe('metal');
    expect(RECIPES.carburise_steel).toMatchObject({
      tech: 'carburising', skill: 'smith', ingredients: { wrought_iron: 1, charcoal: 1 },
      output: { steel: 1 }, station: 'anvil',
    });
    expect(RECIPES.steel_sword).toMatchObject({
      tech: 'carburising', skill: 'smith', ingredients: { steel: 1 },
      output: { steel_sword: 1 }, station: 'anvil',
    });
    expect(ITEMS.steel_sword!.weapon!.tech).toBe('carburising');
    expect(ITEMS.steel_sword!.weapon!.damage).toBeGreaterThan(ITEMS.bronze_sword!.weapon!.damage);
    expect(ITEMS.steel_sword!.weapon!.reach).toBeGreaterThan(ITEMS.bronze_sword!.weapon!.reach);
    expect(ITEMS.steel_sword!.weapon!.hunt).toBeGreaterThan(ITEMS.bronze_sword!.weapon!.hunt);
  });

  it('real-orders steel, then a sword, and the weapon reader selects the better edge', () => {
    const sim = worldKnowing(['bog_iron', 'bellows', 'bloomery', 'forging', 'bronze_arms', 'carburising']);
    const smith = sim.livingPeople()[0]!;
    settled(smith);
    smith.skills.smith = 70;
    const anvil = anvilNear(sim, smith);
    smith.inventory.add('wrought_iron', 1);
    smith.inventory.add('charcoal', 1);
    expect(sim.order(smith, 'craft', { recipeId: 'carburise_steel', buildingId: anvil.id })).toBe(true);
    for (let i = 0; i < 2500 && smith.inventory.count('steel') === 0; i++) {
      smith.needs.thirst = smith.needs.hunger = 0;
      sim.step();
    }
    expect(smith.inventory.count('steel')).toBe(1);
    expect(smith.inventory.count('wrought_iron')).toBe(0);
    expect(smith.inventory.count('charcoal')).toBe(0);

    expect(sim.order(smith, 'craft', { recipeId: 'steel_sword', buildingId: anvil.id })).toBe(true);
    for (let i = 0; i < 2500 && smith.inventory.count('steel_sword') === 0; i++) {
      smith.needs.thirst = smith.needs.hunger = 0;
      sim.step();
    }
    expect(smith.inventory.count('steel_sword')).toBe(1);
    expect(smith.inventory.count('steel')).toBe(0);
    smith.inventory.add('bronze_sword', 1);
    expect(weaponItemOf(smith, false)).toBe('steel_sword');
    const steel = weaponOf(smith, false)!;
    smith.inventory.remove('steel_sword', 1);
    const bronze = weaponOf(smith, false)!;
    expect(steel.damage * steel.power).toBeGreaterThan(bronze.damage * bronze.power);
  });

  it('does not give a steel sword a free weapon bonus without carburising knowledge', () => {
    const sim = worldKnowing(['bog_iron', 'bellows', 'bloomery', 'forging'], 'carburising-no-bonus');
    const smith = sim.livingPeople()[0]!;
    settled(smith);
    smith.inventory.add('steel_sword', 1);
    expect(weaponOf(smith, false)).toBeNull();
    expect(weaponItemOf(smith, false)).toBeNull();
  });

  it('refuses to finish steel when the smith lacks carburising knowledge', () => {
    const sim = worldKnowing(['bog_iron', 'bellows', 'bloomery', 'forging'], 'carburising-gate');
    const smith = sim.livingPeople()[0]!;
    settled(smith);
    const anvil = anvilNear(sim, smith);
    smith.inventory.add('wrought_iron', 1);
    smith.inventory.add('charcoal', 1);
    expect(sim.order(smith, 'craft', { recipeId: 'carburise_steel', buildingId: anvil.id })).toBe(true);
    sim.interruptions.length = 0;
    for (let i = 0; i < 20 && sim.interruptions.length === 0; i++) sim.step();
    expect(sim.interruptions.map(n => n.reason)).toContain('dont_know_how');
    expect(smith.inventory.count('steel')).toBe(0);
    expect(smith.inventory.count('wrought_iron')).toBe(1);
    expect(smith.inventory.count('charcoal')).toBe(1);
  });
});

