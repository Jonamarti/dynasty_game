/**
 * Slopes (M15 phase 25b): the ground costs time to climb, in the walk and in
 * the route.
 */
import { describe, it, expect } from 'vitest';
import { BIOME_ID, World } from '../core/World.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { moveToward } from '../systems/MovementSystem.ts';
import { Pathfinder, PathStatus } from '../core/Pathfinder.ts';

function plain(slopeCost = DEFAULT_CONFIG.world.slopeCost): World {
  const w = new World({ ...DEFAULT_CONFIG.world, width: 64, height: 64, slopeCost }, new RNG('slopes'));
  // A flat, all-walkable field to measure on, so nothing but the offset matters.
  for (let i = 0; i < w.width * w.height; i++) {
    w.elevation[i] = 0.5;
    w.walkable[i] = 1;
    // Water is a biome now, not just a walkability value. Keep this synthetic
    // movement fixture genuinely dry so wading costs do not mask slope costs.
    w.biome[i] = BIOME_ID.grass;
    w.offset[i] = 0;
  }
  // The regions were drawn for the island this started as; redraw them for the field.
  w.region.fill(-1);
  w.regionSizes.clear();
  (w as unknown as { findRegions(): void }).findRegions();
  return w;
}

const rng = new RNG('walk');

describe('stepFactor', () => {
  it('is 1 on the flat, below 1 uphill, above 1 downhill, and never under 0.4', () => {
    const w = plain();
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.offset[y * w.width + x] = x * 0.01;
    expect(w.stepFactor(20.5, 20.5, 20.5, 25.5)).toBeCloseTo(1, 6);
    const up = w.stepFactor(20.5, 20.5, 21.5, 20.5);
    const down = w.stepFactor(21.5, 20.5, 20.5, 20.5);
    expect(up).toBeLessThan(0.95);
    expect(down).toBeGreaterThan(1);
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.offset[y * w.width + x] = x * 0.5;
    expect(w.stepFactor(20.5, 20.5, 21.5, 20.5)).toBe(0.4);
  });

  it('is exactly 1 in a flat world, whatever the ground', () => {
    const w = plain(0);
    for (let i = 0; i < w.width * w.height; i++) w.offset[i] = (i % 64) * 0.05;
    expect(w.stepFactor(20.5, 20.5, 21.5, 20.5)).toBe(1);
  });
});

describe('moveToward on a slope', () => {
  it('climbs slower than it walks the flat, and descends faster', () => {
    const w = plain();
    const flat = { x: 10.5, y: 30.5 };
    const dFlat = moveToward(flat, 50.5, 30.5, 0.5, w, rng);
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.offset[y * w.width + x] = x * 0.01;
    const climber = { x: 10.5, y: 30.5 };
    const dUp = moveToward(climber, 50.5, 30.5, 0.5, w, rng);
    const dropper = { x: 50.5, y: 30.5 };
    const dDown = moveToward(dropper, 10.5, 30.5, 0.5, w, rng);
    expect(dFlat).toBeCloseTo(0.5, 6);
    expect(dUp).toBeLessThan(dFlat);
    expect(dDown).toBeGreaterThan(dFlat);
  });
});

describe('Pathfinder on a slope', () => {
  /** The northernmost waypoint of the last route: routes are compressed, so a straight run has only its ends. */
  const northmost = (pf: Pathfinder): number => {
    let best = Infinity;
    for (let i = 0; i < pf.routeLength; i++) best = Math.min(best, pf.route[i * 2 + 1]!);
    return best;
  };

  it('goes round a ridge by a near gap when climbing it costs more than the detour, and straight on when the world is flat', () => {
    const ridge = (w: World) => {
      // A 200 m ridge across the field with a gap three tiles north of the line
      // the walk wants. Climbing it costs about four tiles of time
      // (`slopeCost` 0.02 per metre), the way round about three.
      for (let y = 27; y < 56; y++) for (let x = 30; x <= 33; x++) w.offset[y * w.width + x] = 0.5;
    };
    const hilly = plain();
    ridge(hilly);
    const pf = new Pathfinder(hilly);
    expect(pf.find(10, 30, 50, 30)).toBe(PathStatus.Found);
    expect(northmost(pf)).toBeLessThanOrEqual(27);

    const flat = plain(0);
    ridge(flat);
    const pf0 = new Pathfinder(flat);
    expect(pf0.find(10, 30, 50, 30)).toBe(PathStatus.Found);
    expect(northmost(pf0)).toBe(Infinity); // no turn at all: a straight run
  });
});
