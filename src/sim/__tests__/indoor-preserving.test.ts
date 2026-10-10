import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { BIOME_ID } from '../core/World.ts';
import { applyHouseWalls } from '../world/HouseInterior.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

function fixture() {
  const sim = new Simulation({ seed: 'indoor-rack', world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 4 } });
  sim.possessFirst(); const person = sim.player!;
  sim.buildings.length = 0; sim.buildingsById.clear(); sim.buildingHash.clear();
  for (let y = 8; y <= 17; y++) for (let x = 8; x <= 17; x++) {
    sim.world.biome[sim.world.index(x, y)] = BIOME_ID.grass; sim.world.setWalkable(x, y, true);
  }
  const house = new Building(BUILDINGS.mud_hut!, 10, 10, person.bandId, sim.ids);
  house.complete = true; house.durability = house.def.workTicks;
  sim.buildings.push(house); sim.buildingsById.set(house.id, house); sim.buildingHash.insert(house);
  person.x = 11; person.y = 12; person.targetX = 11; person.targetY = 12;
  sim.peopleHash.rebuild(sim.livingPeople());
  applyHouseWalls(sim.world, house, sim.bands[0]!, sim.peopleHash, true);
  person.knownTech.add('preserving'); sim.knownTech.add('preserving'); person.skills.cook = 100;
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  return { sim, person, house };
}

describe('a drying rack fits a real house room', () => {
  it('places wholly inside, dries food and persists its host through JSON', () => {
    const { sim, person, house } = fixture();
    const rack = sim.place('drying_rack', 11, 11, person.bandId)!;
    expect(rack).not.toBeNull(); expect(rack.hostId).toBe(house.id);
    rack.complete = true; rack.durability = rack.def.workTicks;
    person.inventory.add('meat', 2);
    expect(sim.order(person, 'craft', { recipeId: 'dried_meat', buildingId: rack.id })).toBe(true);
    for (let tick = 0; tick < 1000 && person.inventory.count('dried_meat') < 2; tick++) {
      person.needs.hunger = person.needs.thirst = 0; sim.step();
    }
    expect(person.inventory.count('dried_meat')).toBe(2);
    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    expect(loaded.buildingsById.get(rack.id)?.hostId).toBe(house.id);
    expect(loaded.peopleById.get(person.id)?.inventory.count('dried_meat')).toBe(2);
  });

  it('keeps exterior placement and rejects walls, overlapping pieces and unfinished rooms', () => {
    const { sim, person, house } = fixture();
    expect(sim.place('drying_rack', 15, 15, person.bandId)?.hostId).toBeNull();
    expect(sim.place('drying_rack', 12, 11, person.bandId)).toBeNull();
    const furniture = new Building(BUILDINGS.bedding!, 12, 11, person.bandId, sim.ids);
    furniture.hostId = house.id; furniture.complete = true;
    sim.buildings.push(furniture); sim.buildingsById.set(furniture.id, furniture); sim.buildingHash.insert(furniture);
    expect(sim.place('drying_rack', 11, 11, person.bandId)).toBeNull();
    house.complete = false;
    expect(sim.place('drying_rack', 11, 12, person.bandId)).toBeNull();
  });

  it('does not let a new station claim another band’s room and explains it', () => {
    const { sim, house } = fixture();
    expect(sim.place('drying_rack', 11, 11, house.ownerBandId + 1)).toBeNull();
    expect(sim.lastRefusal).toBe('That house belongs to another band');
  });

  it('does not place a sleeping surface on either tile of a hosted rack', () => {
    const { sim, person, house } = fixture();
    sim.householdsById.get(person.householdId!)!.homeBuildingId = house.id;
    expect(sim.place('drying_rack', 11, 11, person.bandId)).not.toBeNull();
    person.inventory.add('bedding', 2); person.knownTech.add('cordage');
    for (let piece = 0; piece < 2; piece++) {
      expect(sim.order(person, 'place_furniture', { itemId: 'bedding', buildingId: house.id })).toBe(true);
      for (let tick = 0; tick < 30 && person.inventory.count('bedding') > 1 - piece; tick++) sim.step();
    }
    const beds = sim.buildings.filter(building => building.def.id === 'bedding');
    expect(beds).toHaveLength(2); expect(beds.every(piece => piece.y === 12)).toBe(true);
  });
});
