import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { houseDoor, houseInteriorContains } from '../world/HouseInterior.ts';
import { BUILDINGS } from '../entities/Building.ts';
import type { Person } from '../entities/Person.ts';
import type { Building } from '../entities/Building.ts';

function moveTo(sim: Simulation, person: Person, x: number, y: number): void {
  sim.peopleHash.remove(person);
  person.x = x;
  person.y = y;
  person.targetX = x;
  person.targetY = y;
  sim.peopleHash.insert(person);
}

function siteFor(sim: Simulation, defId: string, bandId: number): Building {
  const def = BUILDINGS[defId]!;
  for (let y = 4; y < sim.world.height - def.height - 4; y++) {
    for (let x = 4; x < sim.world.width - def.width - 4; x++) {
      if (!sim.canPlace(def, x, y)) continue;
      const exits = [
        [x + Math.floor(def.width / 2), y - 1],
        [x + def.width, y + Math.floor(def.height / 2)],
        [x + Math.floor(def.width / 2), y + def.height],
        [x - 1, y + Math.floor(def.height / 2)],
      ];
      if (!exits.every(([ex, ey]) => sim.world.isWalkable(ex!, ey!))) continue;
      return sim.place(defId, x, y, bandId)!;
    }
  }
  throw new Error(`No ${defId} site with walkable approaches`);
}

function outsideDoor(door: ReturnType<typeof houseDoor>): { x: number; y: number } {
  if (door.side === 'north') return { x: door.x + 0.5, y: door.y - 0.5 };
  if (door.side === 'south') return { x: door.x + 0.5, y: door.y + 1.5 };
  if (door.side === 'east') return { x: door.x + 1.5, y: door.y + 0.5 };
  return { x: door.x - 0.5, y: door.y + 0.5 };
}

describe('house lifecycle integration', () => {
  it('builds walls, reloads them from JSON, walks through the door to sleep, ruins and repairs', () => {
    const sim = new Simulation({
      seed: 'house-lifecycle',
      world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
      population: { bands: 2, peoplePerBand: 4 },
    });
    const owner = sim.livingPeople().find(person => person.bandId === 1)!;
    const site = siteFor(sim, 'mud_hut', owner.bandId);
    for (const [itemId, amount] of Object.entries(site.def.materials)) site.delivered.add(itemId, amount);
    site.progress = site.def.workTicks - 1;
    moveTo(sim, owner, site.centerX, site.centerY);
    owner.needs.hunger = owner.needs.thirst = owner.needs.cold = owner.needs.fatigue = 0;
    expect(sim.order(owner, 'build', { buildingId: site.id })).toBe(true);
    for (let tick = 0; tick < 20 && !site.complete; tick++) sim.step();
    expect(site.complete).toBe(true);
    expect(site.wallsApplied).toBe(true);
    const anchor = sim.bands.find(band => band.id === owner.bandId)!;
    const door = houseDoor(site, anchor);
    expect(site.interiorDoorSide).toBe(door.side);
    expect(sim.world.isHouseWallBlocked(site.x, site.y)).toBe(true);
    expect(sim.world.isWalkable(door.x, door.y)).toBe(true);

    const checkpoint = JSON.parse(JSON.stringify(toCheckpointRecord(sim)));
    const loaded = Simulation.fromCheckpointRecord(checkpoint);
    const loadedSite = loaded.buildingsById.get(site.id)!;
    const loadedOwner = loaded.peopleById.get(owner.id)!;
    expect(loadedSite.wallsApplied).toBe(true);
    expect(loadedSite.interiorDoorSide).toBe(door.side);
    expect(loaded.world.isHouseWallBlocked(site.x, site.y)).toBe(true);
    expect(loaded.world.isWalkable(door.x, door.y)).toBe(true);

    const loadedAnchor = loaded.bands.find(band => band.id === loadedOwner.bandId)!;
    const savedDoor = houseDoor(loadedSite, loadedAnchor);
    const outside = outsideDoor(savedDoor);
    moveTo(loaded, loadedOwner, outside.x, outside.y);
    loadedOwner.needs.fatigue = 80;
    expect(loaded.order(loadedOwner, 'sleep', { buildingId: loadedSite.id })).toBe(true);
    for (let tick = 0; tick < 100 && !houseInteriorContains(loadedSite, loadedOwner.x, loadedOwner.y); tick++) loaded.step();
    expect(houseInteriorContains(loadedSite, loadedOwner.x, loadedOwner.y)).toBe(true);

    const attacker = loaded.livingPeople().find(person => person.bandId === 0)!;
    moveTo(loaded, attacker, outside.x, outside.y);
    attacker.needs.hunger = attacker.needs.thirst = attacker.needs.cold = attacker.needs.fatigue = 0;
    loadedSite.durability = 0.001;
    expect(loaded.order(attacker, 'sabotage', { buildingId: loadedSite.id })).toBe(true);
    for (let tick = 0; tick < 200 && !loadedSite.ruined; tick++) loaded.step();
    expect(loadedSite.ruined).toBe(true);
    expect(loadedSite.wallsApplied).toBe(false);
    expect(loaded.world.isHouseWallBlocked(site.x, site.y)).toBe(false);

    loadedSite.durability = loadedSite.def.workTicks - 0.001;
    moveTo(loaded, loadedOwner, loadedSite.centerX, loadedSite.centerY);
    loadedOwner.needs.hunger = loadedOwner.needs.thirst = loadedOwner.needs.cold = loadedOwner.needs.fatigue = 0;
    expect(loaded.order(loadedOwner, 'build', { buildingId: loadedSite.id })).toBe(true);
    loaded.step();
    expect(loadedSite.soundness).toBe(1);
    expect(loadedSite.wallsApplied).toBe(true);
    expect(loaded.world.isHouseWallBlocked(site.x, site.y)).toBe(true);
    expect(loaded.world.isWalkable(door.x, door.y)).toBe(true);
  });
});
