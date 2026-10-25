import { describe, expect, it } from 'vitest';
import { BUILDINGS, Building, type BuildingDef } from '../entities/Building.ts';
import { Simulation } from '../core/Simulation.ts';
import { toWorldObjectRecord, fromWorldObjectRecord } from '../persistence/WorldObjectRecords.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { houseDoor, houseInteriorTiles, applyHouseWalls } from '../world/HouseInterior.ts';

/**
 * A genuine pre-M16 14.3 save recorded each BuildingDef before it had a
 * `places` property. The 4x4 mud hut had four occupants' worth of room;
 * loading it after 14.6 must not borrow the new 3x3 hut's three-place limit.
 */
function historicalHut(sim: Simulation): Building {
  const def: BuildingDef = {
    ...BUILDINGS.mud_hut!,
    width: 4, height: 4, shelter: 0.85, workTicks: 520,
    materials: { wood: 8, sticks: 6, thatch: 10, mud: 14 },
    description: 'An old felled-timber frame beneath thatch.',
  };
  expect(Reflect.deleteProperty(def, 'places')).toBe(true);
  expect(Object.hasOwn(def, 'places')).toBe(false);
  const owner = sim.bands[0]!;
  for (let y = 4; y < sim.world.height - 8; y++) {
    for (let x = 4; x < sim.world.width - 8; x++) {
      if (!sim.canPlace(def, x, y)) continue;
      const hut = new Building(def, x, y, owner.id, sim.ids);
      hut.complete = true;
      hut.durability = def.workTicks;
      sim.buildings.push(hut);
      sim.buildingsById.set(hut.id, hut);
      sim.buildingHash.insert(hut);
      applyHouseWalls(sim.world, hut, owner, sim.peopleHash, true);
      return hut;
    }
  }
  throw new Error('No clear 4x4 footprint for historical mud hut');
}

function newWorld(): Simulation {
  return new Simulation({
    seed: 'm16-14-6-historical-hut-without-places',
    world: { width: 64, height: 64, predators: 0, gameHerds: 0 },
    population: { bands: 1, peoplePerBand: 2 },
  });
}

describe('M16 14.6 historical mud hut without places', () => {
  it('restores the four original places from the saved 4x4 dimensions, not the new catalogue', () => {
    const sim = newWorld();
    const hut = historicalHut(sim);
    const record = JSON.parse(JSON.stringify(toWorldObjectRecord(sim)));
    const restored = fromWorldObjectRecord(record).buildingsById.get(hut.id)!;
    expect(restored.def).toMatchObject({
      id: 'mud_hut', width: 4, height: 4, places: 4,
      shelter: 0.85, workTicks: 520,
      materials: { wood: 8, sticks: 6, thatch: 10, mud: 14 },
      description: 'An old felled-timber frame beneath thatch.',
    });
    // The catalogue for NEW constructions must remain independent of old saves.
    expect(BUILDINGS.mud_hut).toMatchObject({
      width: 3, height: 3, places: 3, shelter: 0.75, workTicks: 420,
    });
    expect(houseInteriorTiles(restored)).toHaveLength(4);
  });

  it('preserves explicitly stored 4x4 occupancies instead of rewriting them', () => {
    const sim = newWorld();
    const hut = historicalHut(sim);
    hut.def.places = 2;
    const restored = fromWorldObjectRecord(JSON.parse(JSON.stringify(toWorldObjectRecord(sim))))
      .buildingsById.get(hut.id)!;
    expect(restored.def.places).toBe(2);
    expect(restored.def.width).toBe(4);
  });

  it('restores old wall and door overlays, then continues identically to uninterrupted play', () => {
    const sim = newWorld();
    const hut = historicalHut(sim);
    const band = sim.bands[0]!;
    const door = houseDoor(hut, band);
    const oldCheckpoint = JSON.parse(JSON.stringify(toCheckpointRecord(sim)));
    // The uninterrupted world has the historical capacity after 14.3:
    // normalize only this runtime comparison, never change the saved shape.
    hut.def.places = 4;
    const loaded = Simulation.fromCheckpointRecord(oldCheckpoint);
    const loadedHut = loaded.buildingsById.get(hut.id)!;
    expect(loadedHut.def).toMatchObject({
      id: 'mud_hut', width: 4, height: 4, places: 4,
      shelter: 0.85, workTicks: 520,
    });
    expect(loadedHut.interiorDoorSide).toBe(door.side);
    expect(loadedHut.wallsApplied).toBe(true);
    expect(houseInteriorTiles(loadedHut)).toHaveLength(4);
    expect(loaded.world.isWalkable(door.x, door.y)).toBe(true);
    const corner = { x: hut.x, y: hut.y };
    expect(loaded.world.isHouseWallBlocked(corner.x, corner.y)).toBe(true);
    for (let tick = 0; tick < 5; tick++) {
      sim.step();
      loaded.step();
      expect(loaded.world.isHouseWallBlocked(corner.x, corner.y)).toBe(
        sim.world.isHouseWallBlocked(corner.x, corner.y));
      expect(loaded.world.isWalkable(door.x, door.y)).toBe(sim.world.isWalkable(door.x, door.y));
      expect(JSON.stringify(toCheckpointRecord(loaded)))
        .toBe(JSON.stringify(toCheckpointRecord(sim)));
    }
  });
});
