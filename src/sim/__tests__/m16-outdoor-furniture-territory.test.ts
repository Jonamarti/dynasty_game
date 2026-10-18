import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { BUILDINGS } from '../entities/Building.ts';
import { MAP_CELL } from '../social/BandMaps.ts';

function simulation(seed: string) {
  return new Simulation({
    seed,
    world: { width: 64, height: 64, berryBushes: 12, flintOutcrops: 4, deadwood: 8, gameHerds: 0, predators: 0 },
    population: { bands: 2, peoplePerBand: 2 },
  });
}

function clearSite(sim: Simulation, predicate: (x: number, y: number) => boolean = () => true) {
  const def = BUILDINGS.quern!;
  for (let y = 1; y < sim.world.height - def.height; y++) for (let x = 1; x < sim.world.width - def.width; x++) {
    if (!predicate(x, y)) continue;
    let clear = true;
    for (let dy = 0; dy < def.height; dy++) for (let dx = 0; dx < def.width; dx++) {
      if (!sim.world.isWalkable(x + dx, y + dy) || sim.world.isWater(x + dx, y + dy)) clear = false;
    }
    if (!clear || sim.buildingHash.queryRadius(x + 1.5, y + 1.5, 4).some(building =>
      x < building.x + building.def.width && x + def.width > building.x &&
      y < building.y + building.def.height && y + def.height > building.y)) continue;
    return { x, y };
  }
  throw new Error('fixture could not find a clear station footprint');
}

function cellAt(x: number, y: number) {
  return `${Math.floor(x / MAP_CELL)},${Math.floor(y / MAP_CELL)}`;
}

describe('m16-outdoor-furniture-territory', () => {
  it('refuses a station in another band’s territory and accepts one in its own', () => {
    const sim = simulation('m16-outdoor-station-territory');
    const own = sim.bands[0]!;
    const other = sim.bands[1]!;
    const site = clearSite(sim);
    const key = cellAt(site.x, site.y);
    own.claimedCells = new Set([cellAt(1, 1)]);
    other.claimedCells = new Set([key]);

    expect(sim.placementRefusal(BUILDINGS.quern!, site.x, site.y, own.id)).toBeTruthy();

    own.claimedCells = new Set([key]);
    expect(sim.placementRefusal(BUILDINGS.quern!, site.x, site.y, own.id)).toBeNull();
  });

  it('lets a band with no territory place beside its finished building, but refuses a distant site', () => {
    const sim = simulation('m16-outdoor-station-nearby');
    const band = sim.bands[0]!;
    band.claimedCells = new Set();
    const houseSite = clearSite(sim);
    const house = sim.place('mud_hut', houseSite.x, houseSite.y, band.id);
    expect(house).not.toBeNull();
    house!.complete = true;

    const near = clearSite(sim, (x, y) => Math.hypot(x + 1.5 - house!.centerX, y + 1.5 - house!.centerY) <= 8);
    expect(sim.placementRefusal(BUILDINGS.quern!, near.x, near.y, band.id)).toBeNull();

    const far = clearSite(sim, (x, y) => Math.hypot(x + 1.5 - house!.centerX, y + 1.5 - house!.centerY) > 8);
    expect(sim.placementRefusal(BUILDINGS.quern!, far.x, far.y, band.id)).toBeTruthy();
  });
});
