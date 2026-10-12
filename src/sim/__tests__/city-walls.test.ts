import { describe, expect, it } from 'vitest';
import { World, BIOME_ID } from '../core/World.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { EARTH_UNIT } from '../core/Earth.ts';
import { BUILDINGS } from '../entities/Building.ts';
import { earthworkTiles, type EarthworkSpec } from '../entities/Earthwork.ts';
import { Simulation } from '../core/Simulation.ts';
import { prerequisitesMet, TECH, TECH_EFFECTS } from '../knowledge/Tech.ts';

function flatWorld(): World {
  const world = new World({ ...DEFAULT_CONFIG.world, width: 64, height: 64 }, new RNG('city-wall-ring'));
  world.elevation.fill(.5); world.offset.fill(0); world.walkable.fill(1); world.biome.fill(BIOME_ID.grass);
  world.refreshProminence(0, 0, world.width - 1, world.height - 1);
  return world;
}

function digRing(world: World, x: number, y: number, spec: EarthworkSpec): void {
  for (const tile of earthworkTiles(spec, x, y, 7, 7, world)) {
    world.dig(tile.x, tile.y, tile.goal * EARTH_UNIT * 1.05);
  }
}

describe('city walls build on earthworks', () => {
  it('requires earthworks and opens the State wall from the existing earthwork designs', () => {
    const known = new Set(['chiefdom', 'masonry']);
    expect(TECH.city_walls.requires).toEqual(['chiefdom', 'masonry', 'earthworks']);
    expect(prerequisitesMet('city_walls', known)).toBe(false);
    known.add('earthworks');
    expect(prerequisitesMet('city_walls', known)).toBe(true);
    expect(TECH_EFFECTS.city_walls.site).toContain('EarthworkSpec');
    expect(BUILDINGS.city_wall).toMatchObject({ requiresTech: 'city_walls', width: 7, height: 7 });
    expect(BUILDINGS.city_wall!.earthwork).toMatchObject({ layout: 'ring', kind: 'dig', depth: 16, gate: true });
    expect(BUILDINGS.ditch?.requiresTech).toBe('earthworks');
    expect(BUILDINGS.embankment?.requiresTech).toBe('earthworks');

    const sim = new Simulation({ seed: 'city-wall-tech-gate' });
    const designs = () => sim.availableDesigns().map(def => def.id);
    expect(designs()).not.toContain('city_wall');
    sim.knownTech.add('city_walls');
    expect(designs()).toContain('city_wall');
  });

  it('leaves one passable gate in the completed wall and preserves region connectivity', () => {
    const world = flatWorld(), x = 24, y = 24, spec = BUILDINGS.city_wall!.earthwork!;
    const planned = earthworkTiles(spec, x, y, 7, 7, world);
    expect(planned).toHaveLength(23);
    expect(BUILDINGS.city_wall!.workTicks).toBe(23 * spec.depth);
    digRing(world, x, y, spec);

    for (const tile of planned) expect(world.isWalkable(tile.x, tile.y)).toBe(false);
    expect(world.isWalkable(x + 3, y)).toBe(true);
    expect(world.sameRegion(x + 3, y + 3, x + 3, y - 1)).toBe(true);
  });

  it('fails the access control if the wall ring has no gate', () => {
    const world = flatWorld(), x = 24, y = 24;
    const solidRing: EarthworkSpec = { layout: 'ring', kind: 'dig', depth: 16 };
    digRing(world, x, y, solidRing);
    expect(world.sameRegion(x + 3, y + 3, x + 3, y - 1)).toBe(false);
  });

  it('exposes completed city-wall tiles to the spatial raid-detour reader', () => {
    const sim = new Simulation({ seed: 'city-wall-raid-reader', world: { width: 64, height: 64 } });
    sim.knownTech.add('city_walls');
    const bandId = sim.bands[0]!.id;
    let wall = null;
    for (let y = 2; y < 56 && !wall; y++) for (let x = 2; x < 56 && !wall; x++) {
      wall = sim.place('city_wall', x, y, bandId);
    }
    expect(wall).not.toBeNull();
    const tile = wall!.earth![0]!;
    const readsAsDefensiveGround =
      (sim as unknown as { isFinishedDitchTile(x: number, y: number): boolean }).isFinishedDitchTile.bind(sim);
    expect(readsAsDefensiveGround(tile.x, tile.y)).toBe(false);
    wall!.complete = true;
    expect(readsAsDefensiveGround(tile.x, tile.y)).toBe(true);
  });
});
