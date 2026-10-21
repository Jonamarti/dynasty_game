import { describe, expect, it } from 'vitest';
import { availableActions } from '../ai/ActionCatalog.ts';
import { Simulation } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { telemetry } from '../core/Telemetry.ts';

function homeWithBedding() {
  const sim = new Simulation({ seed: 'm16-bedding-player-use',
    world: { width: 64, height: 64, predators: 0, gameHerds: 0 },
    population: { bands: 1, peoplePerBand: 4 } });
  const person = sim.livingPeople().find(actor => !actor.isChild)!;
  let house: Building | null = null;
  for (let y = 4; y < sim.world.height - 8 && !house; y++) for (let x = 4; x < sim.world.width - 8; x++) {
    if (!sim.canPlace(BUILDINGS.mud_hut!, x, y)) continue;
    house = sim.place('mud_hut', x, y, person.bandId);
    if (house) break;
  }
  if (!house || person.householdId === null) throw new Error('fixture needs a household home');
  house.complete = true; house.durability = house.def.workTicks;
  sim.householdsById.get(person.householdId)!.homeBuildingId = house.id;
  sim.peopleHash.remove(person);
  person.x = house.centerX; person.y = house.centerY;
  person.targetX = person.x; person.targetY = person.y;
  sim.peopleHash.insert(person);
  person.inventory.add('sticks', 1);
  person.inventory.add('bedding', 1);
  expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'bedding' })).toBe(true);
  for (let i = 0; i < 5 && person.inventory.count('bedding') > 0; i++) sim.step();
  const bedding = sim.buildings.find(piece => piece.def.id === 'bedding' && piece.hostId === house!.id);
  if (!bedding) throw new Error('fixture failed to place bedding');
  return { sim, person, house, bedding };
}

describe('m16-bedding-player-use', () => {
  it('lets the player sleep on household bedding and take it back with a reason for refusals', () => {
    const { sim, person, house, bedding } = homeWithBedding();
    person.isPlayer = true;
    person.inventory.remove('sticks', person.inventory.count('sticks'));
    const options = availableActions(person, { kind: 'building', x: bedding.x, y: bedding.y, building: bedding }, {
      world: sim.world, nearWater: false, buildings: sim.buildings, homeBuildingId: house.id,
    });
    const sleep = options.find(option => option.id === 'sleep');
    const take = options.find(option => option.id === 'take_furniture');
    expect(sleep).toMatchObject({ enabled: true, buildingId: house.id });
    expect(take).toMatchObject({ enabled: true, buildingId: bedding.id });

    person.needs.fatigue = 80;
    person.needs.hunger = 0; person.needs.thirst = 0;
    sim.peopleHash.remove(person);
    person.x = bedding.centerX; person.y = bedding.centerY;
    person.targetX = person.x; person.targetY = person.y;
    sim.peopleHash.insert(person);
    expect(sim.order(person, 'sleep', { buildingId: sleep!.buildingId })).toBe(true);
    telemetry.enable(); telemetry.reset();
    try {
      sim.step();
      expect(person.needs.fatigue).toBeLessThan(80);
      expect(telemetry.get('sleeping_furniture')).toBe(1);
    } finally { telemetry.disable(); telemetry.reset(); }

    expect(sim.order(person, 'take_furniture', { buildingId: bedding.id })).toBe(true);
    sim.step();
    expect(sim.buildingsById.has(bedding.id)).toBe(false);
    expect(person.inventory.count('bedding')).toBe(1);
  });

  it('explains when bedding is occupied or belongs to another household', () => {
    const { sim, person, house, bedding } = homeWithBedding();
    const other = sim.livingPeople().find(candidate => candidate.id !== person.id)!;
    sim.peopleHash.remove(other);
    other.x = bedding.centerX; other.y = bedding.centerY;
    sim.peopleHash.insert(other);
    expect(sim.furnitureRemovalRefusal(person, bedding)).toBe('Someone is using that furniture');
    sim.peopleHash.remove(other);
    other.x = house.centerX + 3; other.y = house.centerY;
    sim.peopleHash.insert(other);
    sim.householdsById.get(person.householdId!)!.homeBuildingId = null;
    expect(sim.furnitureRemovalRefusal(person, bedding)).toBe('That is not your household’s home');
  });
});
