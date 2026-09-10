/**
 * World, clock and inventory invariants.
 *
 * The season test in particular is a regression guard: the temperature curve
 * was originally half a year out of phase with the season *names*, so the world
 * opened on the coldest day of "spring" and every band froze from the first
 * tick. Nothing crashed; the health report just showed an unexplained decline.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../core/World.ts';
import { RNG } from '../core/RNG.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { Inventory, ITEMS } from '../entities/Item.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';

function makeWorld(seed = 'world') {
  return new World({ ...DEFAULT_CONFIG.world, width: 96, height: 96 }, new RNG(seed));
}

describe('World', () => {
  it('produces a mix of land and water', () => {
    const counts = makeWorld().countBiomes();
    const total = 96 * 96;
    expect(counts.water).toBeGreaterThan(total * 0.05);
    expect(counts.grass + counts.forest).toBeGreaterThan(total * 0.15);
  });

  it('never reports water or rock as walkable', () => {
    const world = makeWorld();
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const biome = world.biomeAt(x, y);
        if (biome === 'water' || biome === 'rock') expect(world.isWalkable(x, y)).toBe(false);
        else expect(world.isWalkable(x, y)).toBe(true);
      }
    }
  });

  it('treats everything outside the map as unwalkable', () => {
    const world = makeWorld();
    expect(world.isWalkable(-1, 5)).toBe(false);
    expect(world.isWalkable(5, -1)).toBe(false);
    expect(world.isWalkable(world.width, 5)).toBe(false);
    expect(world.isWalkable(5, world.height)).toBe(false);
  });

  it('lists shore tiles that are walkable and actually touch water', () => {
    const world = makeWorld();
    expect(world.shoreTiles.length).toBeGreaterThan(0);
    for (const tile of world.shoreTiles) {
      expect(world.isWalkable(tile.x, tile.y)).toBe(true);
      expect(world.isShore(tile.x, tile.y)).toBe(true);
    }
  });

  it('finds a walkable tile near an unwalkable one', () => {
    const world = makeWorld();
    let waterTile: { x: number; y: number } | null = null;
    outer: for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        if (world.isWater(x, y)) { waterTile = { x, y }; break outer; }
      }
    }
    expect(waterTile).not.toBeNull();
    const found = world.findWalkableNear(waterTile!.x, waterTile!.y, 40);
    if (found) expect(world.isWalkable(found.x, found.y)).toBe(true);
  });
});

describe('TimeManager', () => {
  const cfg = { ...DEFAULT_CONFIG.time, startDay: 0, daysPerSeason: 20 };

  function atDay(day: number): TimeManager {
    const time = new TimeManager(cfg);
    time.tick = day * cfg.ticksPerDay;
    return time;
  }

  it('labels the seasons in order across a year', () => {
    expect(atDay(0).season).toBe('spring');
    expect(atDay(20).season).toBe('summer');
    expect(atDay(40).season).toBe('autumn');
    expect(atDay(60).season).toBe('winter');
    expect(atDay(80).season).toBe('spring');
  });

  it('is warmest in summer and coldest in winter', () => {
    // Sampled at midday of the middle day of each season so the diurnal swing
    // does not confuse the comparison.
    const midday = (day: number) => {
      const time = atDay(day);
      time.tick += Math.floor(cfg.ticksPerDay * 0.5);
      return time.temperature;
    };
    const summer = midday(30);
    const winter = midday(70);
    const spring = midday(10);
    const autumn = midday(50);

    expect(summer).toBeGreaterThan(spring);
    expect(summer).toBeGreaterThan(autumn);
    expect(winter).toBeLessThan(spring);
    expect(winter).toBeLessThan(autumn);
    expect(summer).toBeGreaterThan(winter);
  });

  it('is darker at midnight than at midday', () => {
    const time = atDay(30);
    time.tick += Math.floor(cfg.ticksPerDay * 0.5);
    const noon = time.daylight;
    time.tick += Math.floor(cfg.ticksPerDay * 0.5);
    expect(time.daylight).toBeLessThan(noon);
  });

  it('offsets the starting day', () => {
    const time = new TimeManager({ ...cfg, startDay: 33 });
    expect(time.day).toBe(33);
  });
});

/**
 * M8.1, mechanism 1.
 *
 * The mechanism ships with `needs.spoilRate` at 0 — see `Simulation.spoilFood`
 * for the measurements behind that — so these are the only place in the suite
 * where the arithmetic is pinned. That makes them more important rather than
 * less: dormant code with no tests on it is code that will be wrong by the time
 * somebody switches it on.
 */
describe('Inventory spoilage', () => {
  /** Berries keep 2400 ticks; hazelnuts and flint keep for ever. */
  function packed(): Inventory {
    const pack = new Inventory();
    pack.add('berries', 100);
    pack.add('hazelnut', 100);
    pack.add('flint', 5);
    return pack;
  }

  it('never spoils something that keeps indefinitely', () => {
    const pack = packed();
    // A year of it. `spoilTicks: 0` means exactly that and not "very fast",
    // which is the reading a naive division would have given.
    pack.spoil(240 * 400, () => 1);
    expect(pack.count('hazelnut')).toBe(100);
    expect(pack.count('flint')).toBe(5);
  });

  it('takes a share of a perishable stack, proportional to how much is held', () => {
    const pack = packed();
    // A tenth of a berry's 2400-tick life.
    pack.spoil(240, () => 1);
    expect(pack.count('berries')).toBe(90);
  });

  it('keeps the fraction between sweeps rather than rounding it away', () => {
    const pack = new Inventory();
    pack.add('berries', 10);
    // A tenth of a berry a day at this size: sweeps that each rounded to zero
    // would lose nothing for ever, which is how a slow rate becomes no rate.
    // The exact sweep the first berry goes on is not asserted, because a tenth
    // is not representable and ten of them come to 0.9999999999999999 — pinning
    // the boundary would be pinning the float rather than the behaviour.
    for (let day = 0; day < 9; day++) pack.spoil(24, () => 1);
    expect(pack.count('berries')).toBe(10);
    for (let day = 0; day < 3; day++) pack.spoil(24, () => 1);
    expect(pack.count('berries')).toBe(9);
  });

  it('keeps food longer where the factor is higher', () => {
    const bare = packed();
    const stored = packed();
    bare.spoil(240, () => 1);
    stored.spoil(240, () => 4);
    expect(stored.count('berries')).toBeGreaterThan(bare.count('berries'));
  });

  it('does not reset the carry when fresh units are added', () => {
    // The deliberate trade, asserted rather than left to be discovered. A pile
    // picked on day three and topped up on day nine rots as one pile, because
    // `stacks` is a plain id-to-count map that nearly everything in this project
    // relies on being one. The upgrade path is an age-cohort list; see the note
    // on `Inventory.spoilage`.
    const pack = new Inventory();
    pack.add('berries', 10);
    for (let day = 0; day < 9; day++) pack.spoil(24, () => 1);
    pack.add('berries', 10);
    pack.spoil(24, () => 1);
    // 20 held, and the ninth day's accumulated fraction still on the books, so
    // the tenth sweep takes more than a fresh stack of twenty would have.
    expect(pack.count('berries')).toBeLessThan(20);
  });

  it('reports what was lost without touching anything on a dry run', () => {
    const pack = packed();
    const would = pack.spoil(240, () => 1, false);
    expect(pack.count('berries')).toBe(100);
    expect(would.get('berries')).toBe(10);
  });

  it('loses the last unit rather than leaving an unspoilable remainder', () => {
    const pack = new Inventory();
    pack.add('fish', 1);
    // Fish keep 800 ticks; four days is far past it.
    pack.spoil(240 * 4, () => 1);
    expect(pack.count('fish')).toBe(0);
    // And the carry does not survive the stack, or the next fish put in this
    // pack would rot the instant it arrived.
    pack.add('fish', 1);
    pack.spoil(1, () => 1);
    expect(pack.count('fish')).toBe(1);
  });
});

describe('Inventory', () => {
  it('adds, counts and removes stacks', () => {
    const inv = new Inventory();
    inv.add('berries', 5);
    inv.add('berries', 3);
    expect(inv.count('berries')).toBe(8);
    expect(inv.remove('berries', 3)).toBe(3);
    expect(inv.count('berries')).toBe(5);
  });

  it('never removes more than it holds, and never goes negative', () => {
    const inv = new Inventory();
    inv.add('flint', 2);
    expect(inv.remove('flint', 10)).toBe(2);
    expect(inv.count('flint')).toBe(0);
    expect(inv.remove('flint', 1)).toBe(0);
    expect(inv.total).toBe(0);
  });

  it('picks the most nourishing food, and ignores inedible things', () => {
    const inv = new Inventory();
    inv.add('wood', 10);
    inv.add('flint', 4);
    expect(inv.bestFood()).toBeNull();

    inv.add('berries', 1);
    expect(inv.bestFood()).toBe('berries');

    inv.add('meat', 1);
    expect(inv.bestFood()).toBe('meat');
    expect(ITEMS.meat!.nutrition).toBeGreaterThan(ITEMS.berries!.nutrition);
  });
});
