/**
 * Earthwork designs (M15 phase 26c): marked out like a field, worked with the
 * earth verbs, progress banked on the tile, and every refusal worded.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { World } from '../core/World.ts';
import { BUILDINGS, Building, isEarthwork, isStructure } from '../entities/Building.ts';
import { EARTH_UNIT } from '../core/Earth.ts';
import { earthworkTiles, earthworkTotal, designTotal } from '../entities/Earthwork.ts';
import type { Person } from '../entities/Person.ts';

/** A walkable open rectangle of at least w by h, as near as can be found to the first adult. */
function openGround(sim: Simulation, w: number, h: number): { x: number; y: number } {
  const person = sim.people.find(p => p.alive && !p.isChild)!;
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.floor(person.x) + dx;
        const y = Math.floor(person.y) + dy;
        if (fits(sim, x, y, w, h)) return { x, y };
      }
    }
  }
  throw new Error('no open ground');
}

function fits(sim: Simulation, x: number, y: number, w: number, h: number): boolean {
  const world = sim.world;
  for (let j = -2; j < h + 2; j++) {
    for (let i = -2; i < w + 2; i++) {
      if (!world.inBounds(x + i, y + j) || !world.isWalkable(x + i, y + j)) return false;
      const b = world.biomeAt(x + i, y + j);
      if (b === 'rock' || b === 'water') return false;
      if (world.isShore(x + i, y + j)) return false;
      if (sim.buildingAt(x + i, y + j)) return false;
    }
  }
  return true;
}

function worker(sim: Simulation): Person {
  const person = sim.people.find(p => p.alive && !p.isChild)!;
  person.inventory.add('sticks', 1);
  return person;
}

function run(sim: Simulation, person: Person, site: Building, maxTicks = 20000): number {
  let ticks = 0;
  while (!site.complete && ticks < maxTicks && person.alive) {
    // A person under an order keeps it until it ends; reissue it when a need
    // has set it aside, as the player would.
    person.needs.hunger = 0; person.needs.thirst = 0; person.needs.fatigue = 0; person.needs.cold = 0;
    if (person.action === 'idle' || person.order === null) {
      sim.order(person, site.def.earthwork!.kind, { buildingId: site.id });
    }
    sim.step();
    ticks++;
  }
  return ticks;
}

describe('earthwork designs', () => {
  it('are declared as buildings that are not structures, with a total the plan adds up to', () => {
    const ids = ['pit', 'ditch', 'moat', 'mound', 'embankment', 'canal', 'terrace'];
    for (const id of ids) {
      const def = BUILDINGS[id]!;
      expect(isEarthwork(def), id).toBe(true);
      expect(isStructure(def), id).toBe(false);
      expect(def.workTicks, id).toBe(designTotal(def.earthwork!, def.width, def.height));
    }
    expect(BUILDINGS['ditch_ns']!.width).toBe(1);
    expect(BUILDINGS['ditch_ns']!.height).toBe(6);
    expect(BUILDINGS['ditch_ns']!.earthwork!.turnOf).toBe('ditch');
  });

  it('keeps the turned copies out of the menu, and the plan sum equal to the declared total', () => {
    const sim = new Simulation({ seed: 'earthworks' });
    const menu = sim.availableDesigns().map(d => d.id);
    expect(menu).toContain('ditch');
    expect(menu).not.toContain('ditch_ns');
    const world = sim.world;
    for (const def of Object.values(BUILDINGS).filter(isEarthwork)) {
      const tiles = earthworkTiles(def.earthwork!, 10, 10, def.width, def.height, world);
      expect(earthworkTotal(tiles), def.id).toBe(def.workTicks);
    }
  });

  it('are marked out where the ground allows, and refused with the reason where it does not', () => {
    const sim = new Simulation({ seed: 'earthworks' });
    const spot = openGround(sim, 7, 7);
    const ditch = sim.place('ditch', spot.x, spot.y, 0, null, true);
    expect(ditch).not.toBeNull();
    expect(ditch!.earth!.length).toBe(6);
    // Same ground twice: refused, with who is already there.
    expect(sim.placementRefusal(BUILDINGS['ditch']!, spot.x, spot.y)).toMatch(/already there/);
    // A moat in the middle of dry land has no water to take.
    const dry = openGround(sim, 12, 12);
    const why = sim.placementRefusal(BUILDINGS['moat']!, dry.x + 3, dry.y + 3);
    expect(why).toMatch(/touch the water/);
    expect(sim.place('moat', dry.x + 3, dry.y + 3, 0)).toBeNull();
    // A canal has to start at the water's edge.
    expect(sim.placementRefusal(BUILDINGS['canal']!, dry.x + 3, dry.y + 3)).toMatch(/start at the water/);
  });

  it('a ditch is dug by one person, progress banked on the tiles and the ground lowered', () => {
    const sim = new Simulation({ seed: 'earthworks' });
    const spot = openGround(sim, 8, 8);
    const site = sim.place('ditch', spot.x, spot.y, 0, null, true)!;
    const person = worker(sim);
    person.x = spot.x + 0.5;
    person.y = spot.y + 3;
    const before = site.earth!.map(t => sim.world.depthDug(t.x, t.y));
    expect(sim.order(person, 'dig', { buildingId: site.id })).toBe(true);
    // Part way: the progress is on the tiles, not in the person.
    for (let i = 0; i < 1500 && !site.complete; i++) {
      if (person.order === null) sim.order(person, 'dig', { buildingId: site.id });
      sim.step();
    }
    const banked = site.earth!.reduce((s, t) => s + t.progress, 0);
    expect(banked).toBeGreaterThan(0);
    expect(site.progress).toBe(banked);
    run(sim, person, site);
    expect(site.complete).toBe(true);
    for (const [i, tile] of site.earth!.entries()) {
      expect(tile.progress).toBe(tile.goal);
      expect(sim.world.depthDug(tile.x, tile.y) - before[i]!).toBeGreaterThanOrEqual(tile.goal * EARTH_UNIT - 1e-6);
      expect(sim.world.isWalkable(tile.x, tile.y)).toBe(true);
    }
    // The spoil went somewhere beside the work: a bank, without anybody asking.
    const piled = [...Array(sim.world.height).keys()].some(y =>
      [...Array(sim.world.width).keys()].some(x => sim.world.depthDug(x, y) < -1e-9));
    expect(piled).toBe(true);
  }, 60000);

  it('a mound heaps earth that a digger scrapes up from beside it', () => {
    const sim = new Simulation({ seed: 'earthworks' });
    const spot = openGround(sim, 8, 8);
    const site = sim.place('mound', spot.x, spot.y, 0, null, true)!;
    const person = worker(sim);
    person.x = spot.x + 1.5;
    person.y = spot.y + 1.5;
    expect(sim.order(person, 'pile', { buildingId: site.id })).toBe(true);
    run(sim, person, site, 40000);
    expect(site.complete).toBe(true);
    const centre = site.earth!.find(t => t.goal === 6)!;
    expect(-sim.world.depthDug(centre.x, centre.y)).toBeGreaterThanOrEqual(6 * EARTH_UNIT - 1e-6);
  }, 120000);
});

describe('earthwork orders', () => {
  it('refuse with the tool as the reason, and refuse build and haul altogether', () => {
    const sim = new Simulation({ seed: 'earthworks' });
    const spot = openGround(sim, 7, 7);
    const site = sim.place('ditch', spot.x, spot.y, 0, null, true)!;
    const person = sim.people.find(p => p.alive && !p.isChild)!;
    for (const [id] of person.inventory.entries()) person.inventory.remove(id, person.inventory.count(id));
    expect(sim.order(person, 'dig', { buildingId: site.id })).toBe(false);
    expect(sim.lastRefusal).toBe('they have nothing to dig with');
    person.inventory.add('sticks', 1);
    expect(sim.order(person, 'build', { buildingId: site.id })).toBe(false);
    expect(sim.lastRefusal).toBe('that is dug, not built');
    expect(sim.order(person, 'dig', { buildingId: site.id })).toBe(true);
  });

  it('stop with a reason when the hands are full of earth and there is nowhere to put it', () => {
    const sim = new Simulation({ seed: 'earthworks' });
    const spot = openGround(sim, 7, 7);
    const site = sim.place('ditch', spot.x, spot.y, 0, null, true)!;
    const person = worker(sim);
    person.x = spot.x + 0.5;
    person.y = spot.y + 0.5;
    // Raise the whole neighbourhood to the most a heap will stand, so there is no place.
    for (let y = spot.y - 6; y < spot.y + 8; y++) {
      for (let x = spot.x - 6; x < spot.x + 12; x++) {
        if (site.earth!.some(t => t.x === x && t.y === y)) continue;
        sim.world.pile(x, y, 8 * EARTH_UNIT);
      }
    }
    person.inventory.add('earth', 3);
    expect(sim.order(person, 'dig', { buildingId: site.id })).toBe(true);
    for (let i = 0; i < 3000 && person.order !== null; i++) sim.step();
    expect(sim.interruptions.some(n => n.personId === person.id && n.reason === 'nowhere_to_put_the_earth')).toBe(true);
    void World;
  }, 60000);
});

describe('earthwork results', () => {
  it('a pit is worked from its rim and ends as ground nobody can cross', () => {
    const sim = new Simulation({ seed: 'earthworks' });
    const spot = openGround(sim, 8, 8);
    const site = sim.place('pit', spot.x, spot.y, 0, null, true)!;
    const person = worker(sim);
    person.x = spot.x + 3.5;
    person.y = spot.y + 0.5;
    expect(sim.order(person, 'dig', { buildingId: site.id })).toBe(true);
    run(sim, person, site, 60000);
    expect(site.complete).toBe(true);
    for (const tile of site.earth!) {
      expect(sim.world.isWalkable(tile.x, tile.y), `${tile.x},${tile.y}`).toBe(false);
      expect(sim.world.depthDug(tile.x, tile.y)).toBeGreaterThanOrEqual(16 * EARTH_UNIT - 1e-6);
    }
    // Nobody was standing in it when it stopped being ground.
    expect(sim.world.isWalkable(person.x, person.y)).toBe(true);
    expect(sim.interruptions.some(n => n.personId === person.id && n.reason === 'ground_gave_way')).toBe(false);
  }, 240000);

  it('a moat that touches the water fills as it is dug', () => {
    const sim = new Simulation({ seed: 'earthworks' });
    const w = sim.world;
    // A 6x6 plot on land with a shore tile on its ring, levelled to just above the water.
    let spot: { x: number; y: number } | null = null;
    for (const s of w.shoreTiles) {
      for (const [ox, oy] of [[0, 0], [0, 5], [5, 0], [5, 5]] as const) {
        const x = s.x - ox, y = s.y - oy;
        let ok = true;
        let wetMargin = 0;
        // A margin of land all round: work on a ring is done from outside it.
        for (let j = -2; j < 8 && ok; j++) for (let i = -2; i < 8 && ok; i++) {
          const inside = i >= 0 && i < 6 && j >= 0 && j < 6;
          if (!inside) { if (!w.isWalkable(x + i, y + j) && ++wetMargin > 10) ok = false; continue; }
          if (!w.isWalkable(x + i, y + j) || w.biomeAt(x + i, y + j) === 'rock' || sim.buildingAt(x + i, y + j)) ok = false;
        }
        if (ok) { spot = { x, y }; break; }
      }
      if (spot) break;
    }
    expect(spot).not.toBeNull();
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
      w.elevation[w.index(spot!.x + i, spot!.y + j)] = w.waterLevel + 1 * EARTH_UNIT;
    }
    const site = sim.place('moat', spot!.x, spot!.y, 0, null, true);
    expect(site).not.toBeNull();
    // The real plan is sixteen items deep, which is weeks of one person's work;
    // the mechanism under test is the water, so the cut is shortened to two.
    for (const tile of site!.earth!) tile.goal = 2;
    site!.progress = 0;
    const person = worker(sim);
    const near = w.findWalkableNear(spot!.x + 2, spot!.y + 2)!;
    person.x = near.x + 0.5; person.y = near.y + 0.5;
    expect(sim.order(person, 'dig', { buildingId: site!.id })).toBe(true);
    // The mechanism under test is the water, not the wolves of the edge of the map.
    sim.animals.length = 0;
    sim.animalsById.clear();
    run(sim, person, site!, 12000);
    expect(site!.complete).toBe(true);
    const wet = site!.earth!.filter(t => w.isWater(t.x, t.y)).length;
    expect(wet).toBeGreaterThan(0);
    // Whatever the water took stays water; the person is on land.
    expect(w.isWalkable(person.x, person.y)).toBe(true);
  }, 400000);

  it('a terrace cuts the high edge and builds up the low one', () => {
    const sim = new Simulation({ seed: 'earthworks' });
    const w = sim.world;
    const spot = openGround(sim, 8, 8);
    // Tilt a 5x3 plot: the north row high, the south row low.
    for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) {
      w.elevation[w.index(spot.x + i, spot.y + j)] = w.waterLevel + 0.02 - j * 0.002;
    }
    const site = sim.place('terrace', spot.x, spot.y, 0, null, true);
    expect(site).not.toBeNull();
    const dig = site!.earth!.filter(t => t.kind === 'dig');
    const pile = site!.earth!.filter(t => t.kind === 'pile');
    expect(dig.length).toBe(5);
    expect(pile.length).toBe(5);
    expect(dig.every(t => t.y === spot.y)).toBe(true);
    expect(pile.every(t => t.y === spot.y + 2)).toBe(true);
    // On the flat it is refused.
    for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) w.elevation[w.index(spot.x + i, spot.y + j)] = w.waterLevel + 0.02;
    sim.buildings.pop();
    sim.buildingsById.delete(site!.id);
    expect(sim.placementRefusal(BUILDINGS['terrace']!, spot.x, spot.y)).toMatch(/too level/);
  });
});

describe('earthwork records and replay', () => {
  it('survive a save and load with their banked progress, and two runs agree', async () => {
    const { toWorldObjectRecord, fromWorldObjectRecord } = await import('../persistence/WorldObjectRecords.ts');
    const build = () => {
      const sim = new Simulation({ seed: 'earthworks' });
      const spot = openGround(sim, 8, 8);
      const site = sim.place('ditch', spot.x, spot.y, 0, null, true)!;
      const person = worker(sim);
      person.x = spot.x + 0.5; person.y = spot.y + 3;
      sim.order(person, 'dig', { buildingId: site.id });
      for (let i = 0; i < 600; i++) {
        person.needs.thirst = 0; person.needs.hunger = 0; person.needs.fatigue = 0;
        sim.step();
      }
      return { sim, site };
    };
    const a = build();
    const b = build();
    expect(a.site.earth).toEqual(b.site.earth);
    expect(a.site.earth!.some(t => t.progress > 0)).toBe(true);
    const record = JSON.parse(JSON.stringify(toWorldObjectRecord(a.sim)));
    const back = fromWorldObjectRecord(record);
    const site = back.buildings.find(x => x.id === a.site.id)!;
    expect(site.earth).toEqual(a.site.earth);
    expect(site.progress).toBe(a.site.progress);
    expect(site.def.earthwork).toEqual(a.site.def.earthwork);
  }, 60000);
});
