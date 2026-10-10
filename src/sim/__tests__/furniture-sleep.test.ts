import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Inventory } from '../entities/Item.ts';
import { RECIPES, ingredientsFor, missingIngredients } from '../entities/Recipe.ts';
import { sleepQualityAt } from '../world/HouseInterior.ts';
import { telemetry } from '../core/Telemetry.ts';

function fixture() {
  const sim = new Simulation({ seed: 'furniture-sleep-contract',
    world: { width: 64, height: 64, predators: 0, gameHerds: 0 },
    population: { bands: 1, peoplePerBand: 4 } });
  const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
  let house: Building | null = null;
  for (let y = 4; y < sim.world.height - 8 && !house; y++) {
    for (let x = 4; x < sim.world.width - 8; x++) {
      if (!sim.canPlace(BUILDINGS.mud_hut!, x, y)) continue;
      house = sim.place('mud_hut', x, y, person.bandId);
      if (house) break;
    }
  }
  if (!house) throw new Error('could not site a house');
  house.complete = true;
  house.durability = house.def.workTicks;
  const household = sim.householdsById.get(person.householdId!);
  if (!household) throw new Error('fixture person has no household');
  household.homeBuildingId = house.id;
  sim.peopleHash.remove(person);
  person.x = house.centerX;
  person.y = house.centerY;
  person.targetX = person.x;
  person.targetY = person.y;
  sim.peopleHash.insert(person);
  person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
  for (const [itemId, count] of person.inventory.entries()) person.inventory.remove(itemId, count);
  return { sim, person, house };
}

describe('bedding and beds', () => {
  it('resolves bedding from thatch or hide and explains the alternative', () => {
    const inventory = new Inventory();
    expect(ingredientsFor(RECIPES.bedding!, inventory)).toBeNull();
    expect(missingIngredients(inventory, RECIPES.bedding!)).toBe('You need either 4 thatch or 2 hide');
    inventory.add('hide', 2);
    expect(ingredientsFor(RECIPES.bedding!, inventory)).toEqual({ hide: 2 });
    expect(missingIngredients(inventory, RECIPES.bedding!)).toBe('');
  });

  it('places a carried bed in the home, keeps its host over JSON, and uses it to sleep', () => {
    const { sim, person, house } = fixture();
    person.knownTech.add('carpentry');
    person.inventory.add('bed', 1);
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'bed' })).toBe(true);
    for (let tick = 0; tick < 5 && person.inventory.count('bed') > 0; tick++) sim.step();

    const bed = sim.buildings.find(building => building.def.id === 'bed');
    expect(bed).toBeDefined();
    expect(bed).toMatchObject({ hostId: house.id, complete: true });
    expect(person.inventory.count('bed')).toBe(0);
    expect(sim.world.isWalkable(bed!.x, bed!.y)).toBe(true);
    expect(sleepQualityAt(house, bed!.centerX, bed!.centerY, [bed!])).toBe(1.1);

    const saved = JSON.parse(JSON.stringify(toCheckpointRecord(sim)));
    const loaded = Simulation.fromCheckpointRecord(saved);
    const loadedBed = loaded.buildingsById.get(bed!.id)!;
    const loadedHouse = loaded.buildingsById.get(house.id)!;
    const loadedPerson = loaded.peopleById.get(person.id)!;
    expect(loadedBed.hostId).toBe(loadedHouse.id);
    expect(sleepQualityAt(loadedHouse, loadedBed.centerX, loadedBed.centerY, [loadedBed])).toBe(1.1);

    loaded.peopleHash.remove(loadedPerson);
    loadedPerson.x = loadedBed.centerX;
    loadedPerson.y = loadedBed.centerY;
    loadedPerson.targetX = loadedPerson.x;
    loadedPerson.targetY = loadedPerson.y;
    loaded.peopleHash.insert(loadedPerson);
    loadedPerson.needs.fatigue = 80;
    expect(loaded.order(loadedPerson, 'sleep', { buildingId: loadedHouse.id })).toBe(true);
    telemetry.enable();
    telemetry.reset();
    loaded.step();
    expect(loadedPerson.needs.fatigue).toBeLessThan(80);
    expect(telemetry.snapshot().sleeping_furniture).toBe(1);
    telemetry.disable();
  });

  it('refuses a different household’s home before changing the actor state', () => {
    const { sim, person, house } = fixture();
    person.householdId = null;
    person.inventory.add('bedding', 1);
    person.action = 'idle';
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'bedding' })).toBe(false);
    expect(sim.lastRefusal).toBe('That is not your household’s home');
    expect(person.action).toBe('idle');
  });

  it('uses a different room tile for each piece and refuses a full room', () => {
    const { sim, person, house } = fixture();
    for (let placed = 0; placed < 4; placed++) {
      person.inventory.add('bedding', 1);
      expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'bedding' })).toBe(true);
      sim.step();
    }
    const pieces = sim.buildings.filter(piece => piece.hostId === house.id);
    expect(new Set(pieces.map(piece => `${piece.x},${piece.y}`)).size).toBe(4);
    person.inventory.add('bedding', 1);
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'bedding' })).toBe(false);
    expect(sim.lastRefusal).toBe('There is no room inside the house');
  });
});
