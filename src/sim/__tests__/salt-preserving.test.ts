import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { saltSourceNear } from '../core/Preservation.ts';
import { BIOME_ID } from '../core/World.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { ITEMS } from '../entities/Item.ts';
import { availableActions } from '../ai/ActionCatalog.ts';

function fixture(geographic = true) {
  const sim = new Simulation({ seed: 'salt-pan', world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 4 } });
  sim.possessFirst(); const person = sim.player!;
  sim.buildings.length = 0; sim.buildingsById.clear(); sim.buildingHash.clear();
  for (let y = 7; y < 16; y++) for (let x = 7; x < 16; x++) {
    sim.world.biome[sim.world.index(x, y)] = BIOME_ID.grass; sim.world.setWalkable(x, y, true);
  }
  const source = sim.world.index(9, 10); sim.world.biome[source] = BIOME_ID.water;
  sim.world.setWalkable(9, 10, false);
  const kinds = new Uint8Array(sim.world.width * sim.world.height); kinds[source] = 2;
  if (geographic) Object.defineProperty(sim.world, 'waterKind', { value: kinds });
  person.x = 10; person.y = 10; sim.peopleHash.rebuild(sim.livingPeople());
  person.skills.cook = 100;
  for (const tech of ['saltmaking', 'salting'] as const) person.knownTech.add(tech);
  for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  const add = (kind: string, x: number, y: number) => {
    const building = new Building(BUILDINGS[kind]!, x, y, person.bandId, sim.ids);
    building.complete = true; building.durability = building.def.workTicks;
    sim.buildings.push(building); sim.buildingsById.set(building.id, building); sim.buildingHash.insert(building);
    return building;
  };
  return { sim, person, kinds, source, add };
}

describe('salt comes from a real coastal station and preserves real food', () => {
  it('allows a saltwater edge and explains freshwater or inland placement', () => {
    const { sim, kinds, source } = fixture(); const def = BUILDINGS.salt_pan!;
    expect(sim.placementRefusal(def, 10, 10)).toBeNull();
    kinds[source] = 1;
    expect(sim.placementRefusal(def, 10, 10)).toBe('You need salt water nearby');
    expect(sim.placementRefusal(def, 13, 13)).toBe('You need salt water nearby');
  });

  it('treats the classic island sea as salt for production without changing drinking', () => {
    const { sim } = fixture(false);
    expect(sim.world.isFreshWater(9, 10)).toBe(true);
    expect(saltSourceNear(sim.world, 10, 10, 2, 2)).toBe(true);
  });

  it('requires a physical fire and retains the pottery while boiling two salt units', () => {
    const { sim, person, add } = fixture(); const pan = add('salt_pan', 10, 10);
    person.inventory.add('sticks', 2); person.inventory.add('pottery', 1);
    expect(sim.order(person, 'craft', { recipeId: 'salt', buildingId: pan.id })).toBe(false);
    expect(sim.lastRefusal).toBe('You need a lit hearth nearby');
    add('hearth', 12, 10);
    expect(sim.order(person, 'craft', { recipeId: 'salt', buildingId: pan.id })).toBe(true);
    for (let tick = 0; tick < 1000 && person.inventory.count('salt') < 2; tick++) {
      person.needs.hunger = person.needs.thirst = 0; sim.step();
    }
    expect(person.inventory.count('salt')).toBe(2); expect(person.inventory.count('sticks')).toBe(0);
    expect(person.inventory.count('pottery')).toBe(1);
    expect(ITEMS.salt!.baseValue).toBeGreaterThan(ITEMS.pemmican!.baseValue);
  });

  it('refuses fresh brine in the menu and order, then stops if the source disappears during work', () => {
    const { sim, person, kinds, source, add } = fixture(); const pan = add('salt_pan', 10, 10);
    add('hearth', 12, 10); person.inventory.add('sticks', 2); person.inventory.add('pottery', 1);
    kinds[source] = 1;
    const option = availableActions(person, { kind: 'building', x: 10, y: 10, building: pan },
      { world: sim.world, nearWater: false, hearthNear: (x, y, r) => sim.hearthNear(x, y, r) })
      .find(action => action.recipeId === 'salt');
    expect(option).toMatchObject({ enabled: false, reason: 'You need salt water nearby' });
    expect(sim.order(person, 'craft', { recipeId: 'salt', buildingId: pan.id })).toBe(false);
    kinds[source] = 2;
    expect(sim.order(person, 'craft', { recipeId: 'salt', buildingId: pan.id })).toBe(true);
    sim.step(); sim.step(); kinds[source] = 0; sim.step();
    expect(person.inventory.count('sticks')).toBe(2); expect(person.inventory.count('salt')).toBe(0);
    expect(sim.interruptions.some(notice => notice.personId === person.id && notice.reason === 'no_salt_water')).toBe(true);
  });

  it('salts meat and fish without fire, consumes salt and makes the longest-lived food', () => {
    const { sim, person } = fixture();
    for (const kind of ['meat', 'fish']) {
      person.inventory.add(kind, 2); person.inventory.add('salt', 1);
      const output = 'salted_' + kind;
      expect(sim.order(person, 'craft', { recipeId: output })).toBe(true);
      for (let tick = 0; tick < 1000 && person.inventory.count(output) < 2; tick++) {
        person.needs.hunger = person.needs.thirst = 0; sim.step();
      }
      expect(person.inventory.count(output)).toBe(2); expect(person.inventory.count(kind)).toBe(0);
      expect(person.inventory.count('salt')).toBe(0);
      expect(ITEMS[output]!.nutrition).toBe(ITEMS[kind]!.nutrition);
      expect(ITEMS[output]!.spoilTicks).toBeGreaterThan(ITEMS.pemmican!.spoilTicks);
    }
  });
});
