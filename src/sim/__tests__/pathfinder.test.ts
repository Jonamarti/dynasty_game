/**
 * `Pathfinder`, in isolation.
 *
 * Built on hand-authored tile layouts rather than a generated `World`, so
 * every case here is exact rather than "true for this seed" — the corner
 * rule in particular needs a grid whose reachability is known by
 * construction, not sampled.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../core/World.ts';
import { RNG } from '../core/RNG.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { Pathfinder, PathStatus, DEFAULT_MAX_EXPANSIONS } from '../core/Pathfinder.ts';
import { Simulation } from '../core/Simulation.ts';
// `strandedPeople` backs `nobody-walled-in` in the health harness. Imported
// from `tools/` rather than duplicated here, so this test exercises the
// exact function the report runs, not a copy of it that could drift.
import { strandedPeople } from '../../../tools/simcheck.ts';

/**
 * A `World` whose `walkable`/`region` are exactly what `rows` describes,
 * rather than generated terrain. `.` is walkable, anything else is not.
 * `region` is recomputed with the same 4-connected flood fill
 * `World.findRegions` uses internally — that method is private, so the
 * closest thing to reusing it is doing the same simple thing again here.
 */
function gridWorld(rows: string[]): World {
  const height = rows.length;
  const width = rows[0]!.length;
  const world = new World({ ...DEFAULT_CONFIG.world, width, height }, new RNG('pathfinder-grid'));

  world.walkable.fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rows[y]![x] === '.') world.walkable[y * width + x] = 1;
    }
  }

  world.region.fill(-1);
  let nextId = 0;
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (world.walkable[start] !== 1 || world.region[start] !== -1) continue;
    const id = nextId++;
    stack.length = 0;
    stack.push(start);
    world.region[start] = id;
    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index - x) / width;
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && world.walkable[n] === 1 && world.region[n] === -1) {
          world.region[n] = id;
          stack.push(n);
        }
      }
    }
  }
  return world;
}

describe('Pathfinder', () => {
  it('reports AlreadyThere without searching when start and goal are the same tile', () => {
    const world = gridWorld(['.....', '.....', '.....']);
    const pf = new Pathfinder(world);
    expect(pf.find(2, 1, 2, 1)).toBe(PathStatus.AlreadyThere);
    expect(pf.routeLength).toBe(0);
    expect(pf.lastExpanded).toBe(0);
  });

  it('finds a straight diagonal with no waypoints at all', () => {
    const world = gridWorld(Array.from({ length: 10 }, () => '.'.repeat(10)));
    const pf = new Pathfinder(world);
    expect(pf.find(0, 0, 9, 9)).toBe(PathStatus.Found);
    // A clear diagonal has no corner to compress toward — the caller walks
    // straight from wherever it started to the real target, no waypoints.
    expect(pf.routeLength).toBe(0);
  });

  it('compresses a diagonal-then-straight route to exactly one waypoint, at the turn', () => {
    const world = gridWorld(Array.from({ length: 10 }, () => '.'.repeat(10)));
    const pf = new Pathfinder(world);
    // Octile-optimal from (0,0) to (9,3): diagonal to (3,3), then straight
    // east. One corner, at (3,3).
    expect(pf.find(0, 0, 9, 3)).toBe(PathStatus.Found);
    expect(pf.routeLength).toBe(1);
    expect(pf.route[0]).toBe(3);
    expect(pf.route[1]).toBe(3);
  });

  it('never lets a diagonal step clip the corner of two unwalkable tiles', () => {
    // (1,1) is walkable but its only two orthogonal neighbours, (1,0) and
    // (0,1), are not — so it is reachable *only* by a diagonal step from
    // (0,0), and only the corner rule stands between "reachable" and not.
    const diamond = gridWorld([
      '.#',
      '#.',
    ]);
    const pf = new Pathfinder(diamond);
    // (0,0) and (1,1) are diagonal neighbours; (1,0) and (0,1) are walls.
    // A route between them exists only by cutting the corner, which the rule
    // forbids — and with no other tiles on the grid to detour through, there
    // is truly no route, matching `sameRegion`'s own verdict for this shape.
    expect(diamond.sameRegion(0, 0, 1, 1)).toBe(false);
    expect(pf.find(0, 0, 1, 1)).toBe(PathStatus.NoRoute);
    expect(pf.reachable(0, 0, 1, 1)).toBe(false);
  });

  it('routes around a corner it cannot cut, when a detour exists', () => {
    const world = gridWorld([
      '......',
      '..#...',
      '.#....',
      '......',
    ]);
    // Same pinch as the diamond case — (1,1)/(2,2) are diagonal neighbours
    // separated by walls at (2,1) and (1,2) — but this grid has open rows
    // above and below to route through instead.
    const pf = new Pathfinder(world);
    expect(pf.find(1, 1, 2, 2)).toBe(PathStatus.Found);
    // A one-step diagonal hop would expand only the start and the goal. A
    // real detour costs more than that.
    expect(pf.lastExpanded).toBeGreaterThan(2);
  });

  it('reports NoRoute, not an empty search, across two regions the corner rule keeps apart', () => {
    const world = gridWorld([
      '...#...',
      '...#...',
      '...#...',
    ]);
    const pf = new Pathfinder(world);
    expect(world.sameRegion(1, 1, 5, 1)).toBe(false);
    expect(pf.find(1, 1, 5, 1)).toBe(PathStatus.NoRoute);
    expect(pf.lastExpanded).toBe(0);
    expect(pf.reachable(1, 1, 5, 1)).toBe(false);
  });

  it('snaps a goal standing on unwalkable ground to the nearest walkable tile', () => {
    const world = gridWorld([
      '.......',
      '...#...',
      '.......',
    ]);
    const pf = new Pathfinder(world);
    // (3,1) is a single unwalkable tile with walkable ground all around it.
    expect(pf.find(0, 0, 3, 1)).toBe(PathStatus.Found);
  });

  it('gives up, rather than searching forever, once maxExpansions is spent', () => {
    const world = gridWorld(Array.from({ length: 20 }, () => '.'.repeat(20)));
    const pf = new Pathfinder(world);
    expect(pf.find(0, 0, 19, 19, 2)).toBe(PathStatus.GaveUp);
    expect(pf.lastExpanded).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic: the same query twice returns the same route', () => {
    const world = gridWorld([
      '..........',
      '...##.....',
      '.....##...',
      '..........',
      '..........',
    ]);
    const pf = new Pathfinder(world);
    const first = pf.find(0, 4, 9, 0);
    const firstRoute = Array.from(pf.route.slice(0, pf.routeLength * 2));
    const firstExpanded = pf.lastExpanded;

    const second = pf.find(0, 4, 9, 0);
    const secondRoute = Array.from(pf.route.slice(0, pf.routeLength * 2));

    expect(second).toBe(first);
    expect(secondRoute).toEqual(firstRoute);
    expect(pf.lastExpanded).toBe(firstExpanded);
  });

  it('defaults maxExpansions to a bail-out that still finds a nearby goal', () => {
    const world = gridWorld(Array.from({ length: 5 }, () => '.'.repeat(5)));
    const pf = new Pathfinder(world);
    expect(pf.find(0, 0, 4, 4)).toBe(PathStatus.Found);
    expect(pf.lastExpanded).toBeLessThan(DEFAULT_MAX_EXPANSIONS);
  });
});

/**
 * `strandedPeople` (`nobody-walled-in`'s own logic), mutation-verified: a
 * person who is genuinely reachable is reported as such, and painting a ring
 * of `walkable = 0` around them — standing in for a wall built after the
 * world was already generated — is reported as stranded.
 *
 * `World.region` is deliberately left stale by the ring: nothing here calls
 * the private flood fill again. That staleness is exactly what this check
 * exists to catch — `sameRegion` alone would still call the walled-in person
 * reachable, and only a live search over the real, current `walkable` array
 * knows otherwise.
 */
describe('strandedPeople', () => {
  const SMALL = {
    seed: 'walled-in',
    world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
    population: { bands: 1, peoplePerBand: 6 },
  };

  it('reports nobody stranded in an unmodified world', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const result = strandedPeople(sim);
    expect(result.checked).toBeGreaterThan(0);
    expect(result.strandedFromWater).toBe(0);
    expect(result.strandedFromFood).toBe(0);
  });

  it('reports a person stranded once a ring of unwalkable tiles closes them in', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i < 50; i++) sim.step();
    const person = sim.livingPeople()[0]!;

    const cx = Math.round(person.x);
    const cy = Math.round(person.y);
    person.x = cx;
    person.y = cy;

    // The full perimeter at Chebyshev distance 2 — every tile any 8-connected
    // step out of the 3x3 core around the person would have to cross.
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (sim.world.inBounds(x, y)) sim.world.walkable[sim.world.index(x, y)] = 0;
      }
    }

    const result = strandedPeople(sim);
    expect(result.strandedFromWater + result.strandedFromFood).toBeGreaterThan(0);
  });
});
