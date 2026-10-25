import { describe, expect, it } from 'vitest';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { World } from '../core/World.ts';
import { RNG } from '../core/RNG.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { Person } from '../entities/Person.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { NeedsSystem } from '../systems/NeedsSystem.ts';
import { Simulation } from '../core/Simulation.ts';
import { toWorldObjectRecord, fromWorldObjectRecord } from '../persistence/WorldObjectRecords.ts';
import { applyHouseWalls, houseDoor, houseInteriorContains, houseInteriorTiles } from '../world/HouseInterior.ts';

describe('m16-shelter-ladder-order', () => {
  it('ranks all five early roofs in strictly increasing warmth', () => {
    const ids = ['windbreak', 'lean_to', 'mud_hut', 'wattle_hut', 'longhouse'];
    expect(ids.map(id => BUILDINGS[id]!.shelter)).toEqual([0.4, 0.6, 0.75, 0.88, 0.95]);
  });
  it('sets the mud hut to the new capacity, costs, footprint and work duration', () => {
    expect(BUILDINGS.mud_hut).toMatchObject({
      width: 3, height: 3, places: 3, shelter: 0.75, workTicks: 420,
      materials: { sticks: 12, thatch: 10, mud: 8 },
      interior: { door: 'toward_camp' },
    });
    expect(Object.keys(BUILDINGS.mud_hut!.materials)).not.toContain('wood');
  });
  it('ranks measured winter cold response in the real NeedsSystem', () => {
    const ids = ['windbreak', 'lean_to', 'mud_hut', 'wattle_hut', 'longhouse'];
    const cfg = DEFAULT_CONFIG.time;
    const winter = new TimeManager(cfg);
    winter.tick = Math.max(0, (3 * cfg.daysPerSeason +
      Math.floor(cfg.daysPerSeason / 2) - cfg.startDay) * cfg.ticksPerDay);
    expect(winter.temperature).toBeLessThan(0);
    const coldAfterTick = (id: string): number => {
      const roof = new Building(BUILDINGS[id]!, 20, 20, 1);
      roof.complete = true;
      roof.durability = roof.def.workTicks;
      const person = new Person('Cold ' + id, roof.centerX, roof.centerY, 1, new RNG('cold-' + id));
      person.action = 'rest';
      person.needs.cold = 50;
      person.shelterArrivalBuildingId = roof.id;
      person.shelterArrivalTick = 0;
      const nearby = new SpatialHash<Person>(8);
      nearby.insert(person);
      new NeedsSystem(DEFAULT_CONFIG.needs).update([person], winter, [roof], undefined,
        { peopleHash: nearby });
      return person.needs.cold;
    };
    const readings = ids.map(coldAfterTick);
    for (let i = 1; i < readings.length; i++) {
      expect(readings[i]!, ids[i] + ' must warm better than ' + ids[i - 1])
        .toBeLessThan(readings[i - 1]!);
    }
  });

  it('loads old 4x4 mud-hut records without changing the stored footprint', () => {
    const sim = new Simulation({
      seed: 'm16-mud-hut-legacy-world',
      world: { width: 48, height: 48, predators: 0, gameHerds: 0 },
      population: { bands: 1, peoplePerBand: 2 },
    });
    const legacyDef = {
      ...BUILDINGS.mud_hut!, width: 4, height: 4,
      materials: { sticks: 14, thatch: 10, mud: 14 },
      workTicks: 520, shelter: 0.85, places: 4,
    };
    const hut = new Building(legacyDef, 10, 10, sim.bands[0]!.id, sim.ids);
    hut.complete = true;
    hut.durability = 520;
    sim.buildings.push(hut);
    sim.buildingsById.set(hut.id, hut);
    sim.buildingHash.insert(hut);
    const snapshot = JSON.parse(JSON.stringify(toWorldObjectRecord(sim)));
    const restored = fromWorldObjectRecord(snapshot).buildingsById.get(hut.id)!;
    expect(restored.def).toMatchObject({
      id: 'mud_hut', width: 4, height: 4, shelter: 0.85, places: 4,
      materials: { sticks: 14, thatch: 10, mud: 14 },
    });
    expect(BUILDINGS.mud_hut).toMatchObject({ width: 3, height: 3, shelter: 0.75, places: 3 });
  });

  it('keeps the 3x3 room reachable through every cardinal doorway', () => {
    const world = new World({ ...DEFAULT_CONFIG.world, width: 64, height: 64 }, new RNG('m16-mud-hut-3x3'));
    for (const [side, anchor] of Object.entries({
      north: { homeX: 12, homeY: 0 }, south: { homeX: 12, homeY: 40 },
      west: { homeX: 0, homeY: 12 }, east: { homeX: 40, homeY: 12 },
    })) {
      const hut = new Building(BUILDINGS.mud_hut!, 11, 11, 1);
      expect(houseInteriorTiles(hut)).toHaveLength(1);
      const door = houseDoor(hut, anchor);
      expect(door.side).toBe(side);
      expect(houseInteriorContains(hut, hut.centerX, hut.centerY)).toBe(true);
      const people = new SpatialHash<Person>(8);
      applyHouseWalls(world, hut, anchor, people, true);
      expect(world.isWalkable(door.x, door.y)).toBe(true);
      expect(world.isWalkable(12, 12)).toBe(true);
      applyHouseWalls(world, hut, anchor, people, false);
    }
  });
});
