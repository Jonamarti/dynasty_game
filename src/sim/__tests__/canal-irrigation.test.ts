import { describe, expect, it, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { BUILDINGS, Building } from '../entities/Building.ts';
import { Crop } from '../entities/Field.ts';
import {
  CANAL_IRRIGATION_RADIUS, fieldSeasonGrowth, IRRIGATED_GROWTH_FACTOR,
} from '../entities/Irrigation.ts';

function fixture() {
  const sim = new Simulation({
    seed: 'canal-irrigation',
    world: { width: 48, height: 48, berryBushes: 30, flintOutcrops: 8, deadwood: 15, gameHerds: 3 },
    population: { bands: 1, peoplePerBand: 4, startingTech: ['farming'] },
  });
  const field = new Building(BUILDINGS.field!, 20, 20, 0);
  field.complete = true;
  const canal = new Building(BUILDINGS.canal!, 13, 20, 0);
  canal.complete = true;
  const water = { x: 17, y: 20 };
  canal.earth = [{ ...water, kind: 'dig', goal: 4, progress: 4 }];
  const hash = new SpatialHash<Building>();
  hash.insert(field);
  hash.insert(canal);
  const fresh = vi.spyOn(sim.world, 'isFreshWater').mockImplementation(
    (x, y) => x === water.x && y === water.y
  );
  return { sim, field, canal, water, hash, fresh };
}

describe('canal irrigation (M15 phase 26e)', () => {
  it('speeds growth only when a completed canal carries nearby freshwater', () => {
    const { sim, field, canal, hash, fresh } = fixture();
    const crop = new Crop();
    crop.sow(0);

    const irrigated = fieldSeasonGrowth(field, 0.2, sim.world, hash);
    expect(irrigated).toBe(0.2 * IRRIGATED_GROWTH_FACTOR);
    crop.advance(1, irrigated);
    expect(crop.growth).toBeCloseTo(0.2 * 0.2 * IRRIGATED_GROWTH_FACTOR);

    fresh.mockReturnValue(false);
    expect(fieldSeasonGrowth(field, 0.2, sim.world, hash)).toBe(0.2);
    fresh.mockImplementation((x, y) => x === 17 && y === 20);
    canal.complete = false;
    expect(fieldSeasonGrowth(field, 0.2, sim.world, hash)).toBe(0.2);
  });

  it('uses the three-tile radius from the plot and rejects saltwater or distant canals', () => {
    const { sim, field, canal, hash, fresh } = fixture();
    fresh.mockImplementation((x, y) => x === 17 && y === 20);
    // The nearest field tile is three tiles from the water, inclusive.
    expect(fieldSeasonGrowth(field, 0.4, sim.world, hash)).toBe(0.4 * IRRIGATED_GROWTH_FACTOR);

    canal.earth = [{ x: 16, y: 20, kind: 'dig', goal: 4, progress: 4 }];
    fresh.mockReturnValue(false); // salt water and dry ground both fail the freshwater predicate
    expect(fieldSeasonGrowth(field, 0.4, sim.world, hash)).toBe(0.4);

    fresh.mockImplementation((x, y) => x === 11 && y === 20);
    canal.earth = [{ x: 11, y: 20, kind: 'dig', goal: 4, progress: 4 }];
    expect(fieldSeasonGrowth(field, 0.4, sim.world, hash)).toBe(0.4);
    expect(CANAL_IRRIGATION_RADIUS).toBe(3);
  });
});
