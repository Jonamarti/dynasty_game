/**
 * The storage pit is dug before it is lined (M15 phase 26c, `BuildingDef.dig`):
 * the hollow is the first half of the work, the lining the second, and the
 * building cannot be finished by building alone.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { BUILDINGS } from '../entities/Building.ts';
import { EARTH_UNIT } from '../core/Earth.ts';
import type { Person } from '../entities/Person.ts';

function openGround(sim: Simulation): { x: number; y: number } {
  const person = sim.people.find(p => p.alive && !p.isChild)!;
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.floor(person.x) + dx;
        const y = Math.floor(person.y) + dy;
        let ok = true;
        for (let j = -2; j < 5 && ok; j++) for (let i = -2; i < 5 && ok; i++) {
          if (!sim.world.isWalkable(x + i, y + j) || sim.world.isShore(x + i, y + j) || sim.buildingAt(x + i, y + j)) ok = false;
        }
        if (ok) return { x, y };
      }
    }
  }
  throw new Error('no open ground');
}

function worker(sim: Simulation, tool: boolean): Person {
  const person = sim.people.find(p => p.alive && !p.isChild)!;
  for (const [id] of person.inventory.entries()) person.inventory.remove(id, person.inventory.count(id));
  if (tool) person.inventory.add('sticks', 1);
  return person;
}

describe('a silo is dug, then lined', () => {
  it('is declared with a hollow to dig, a plan on the building, and no way to line it first', () => {
    expect(BUILDINGS['storage_pit']!.dig).toBeDefined();
    const sim = new Simulation({ seed: 'silo' });
    const spot = openGround(sim);
    const site = sim.place('storage_pit', spot.x, spot.y, 0, null, true)!;
    expect(site.earth!.length).toBe(4);
    expect(site.earth!.every(t => t.kind === 'dig' && t.goal === 2)).toBe(true);
    expect(site.earthDone).toBe(false);
    site.delivered.add('sticks', 7);
    site.delivered.add('thatch', 3);
    expect(site.materialsReady).toBe(true);
    // Every tick of work refused until the hollow is there.
    expect(site.addWork(1000)).toBe(false);
    expect(site.progress).toBe(0);
    // An earthwork is complete when dug; a silo is not.
    for (const tile of site.earth!) site.addEarth(tile, tile.goal);
    expect(site.earthDone).toBe(true);
    expect(site.complete).toBe(false);
    expect(site.addWork(1000)).toBe(true);
  });

  it('is dug by whoever is sent to build it, and then built, ending as walkable ground with a store', () => {
    const sim = new Simulation({ seed: 'silo' });
    const spot = openGround(sim);
    const site = sim.place('storage_pit', spot.x, spot.y, 0, null, true)!;
    site.delivered.add('sticks', 7);
    site.delivered.add('thatch', 3);
    const person = worker(sim, true);
    person.x = spot.x + 0.5;
    person.y = spot.y + 2.5;
    expect(sim.order(person, 'build', { buildingId: site.id })).toBe(true);
    for (let i = 0; i < 6000 && !site.complete; i++) {
      person.needs.hunger = 0; person.needs.thirst = 0; person.needs.fatigue = 0; person.needs.cold = 0;
      if (person.order === null) sim.order(person, 'build', { buildingId: site.id });
      sim.step();
    }
    expect(site.complete).toBe(true);
    for (const tile of site.earth!) {
      expect(sim.world.depthDug(tile.x, tile.y)).toBeGreaterThanOrEqual(2 * EARTH_UNIT - 1e-6);
      expect(sim.world.isWalkable(tile.x, tile.y)).toBe(true);
    }
    expect(site.storageFree).toBeGreaterThan(0);
  }, 60000);

  it('says why, when the person sent to build it has nothing to dig with', () => {
    const sim = new Simulation({ seed: 'silo' });
    const spot = openGround(sim);
    const site = sim.place('storage_pit', spot.x, spot.y, 0, null, true)!;
    site.delivered.add('sticks', 7);
    site.delivered.add('thatch', 3);
    const person = worker(sim, false);
    person.x = spot.x + 0.5;
    person.y = spot.y + 0.5;
    expect(sim.order(person, 'build', { buildingId: site.id })).toBe(true);
    for (let i = 0; i < 20 && person.order !== null; i++) sim.step();
    expect(sim.interruptions.some(n => n.personId === person.id && n.reason === 'no_digging_tool')).toBe(true);
    expect(site.complete).toBe(false);
    // And the menu greys the verb with the same reason.
    expect(sim.earthworkOrderRefusal(person, site)).toBe('they have nothing to dig with');
  });

  it('survives a save while half dug, and refuses a record that claims it was built undug', async () => {
    const { toWorldObjectRecord, fromWorldObjectRecord } = await import('../persistence/WorldObjectRecords.ts');
    const sim = new Simulation({ seed: 'silo' });
    const spot = openGround(sim);
    const site = sim.place('storage_pit', spot.x, spot.y, 0, null, true)!;
    site.addEarth(site.earth![0]!, 2);
    const record = JSON.parse(JSON.stringify(toWorldObjectRecord(sim)));
    const back = fromWorldObjectRecord(record);
    expect(back.buildings.find(b => b.id === site.id)!.earth).toEqual(site.earth);
    site.progress = 5;
    expect(() => toWorldObjectRecord(sim)).toThrow(/earthwork plan/);
  });
});
