/**
 * Can a person actually *walk* to the water's edge?
 *
 * `paths-are-found` proves a route exists between two tiles; `nobody-walled-in`
 * proves everybody has a reachable drink. Neither says anything about whether
 * the walker following that route arrives, and M7 stage C exists because the
 * answer was often no: routing was fine and the aim points it was consumed
 * through were not.
 *
 * This lives in `__tests__` rather than as a `simcheck` check for the reason
 * `orders.test.ts` gives at the top of itself — the scenario runs are chaotic
 * and would report a specific geometric failure as flaky long before they
 * reported it as broken. Every case here is deterministic: a fixed seed, a
 * fixed sample stride, no draw from any stream the simulation shares.
 *
 * The targets are deliberately raw integer tile coordinates, because that is
 * exactly what `World.shoreTiles` holds and what `Brain.setup` assigns to
 * `person.targetX` for a `drink` — the errand that by construction ends at the
 * boundary between land and water.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../core/World.ts';
import { RNG } from '../core/RNG.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { Pathfinder } from '../core/Pathfinder.ts';
import { Person } from '../entities/Person.ts';
import { MovementSystem, Arrival } from '../systems/MovementSystem.ts';

/** Ticks a walker gets to cover a handful of tiles before we call it stuck. */
const TICK_BUDGET = 400;

/** How far inland each probe starts, in tiles. Far enough to need a route. */
const START_DISTANCE = 6;

/**
 * A walker with nothing wrong with them, so `speedOf` returns the full
 * `BASE_SPEED` and a slow arrival means terrain rather than exhaustion.
 */
function walker(x: number, y: number): Person {
  const person = new Person('probe', x, y, 0, new RNG('shorewalk-person'));
  person.needs.fatigue = 0;
  person.health = 100;
  return person;
}

interface Outcome {
  arrived: number;
  blocked: number;
  ranOut: number;
  stuckTicks: number;
  tried: number;
}

/** Walks one person to one target, reporting how it ended. */
function walkTo(
  movement: MovementSystem,
  person: Person,
  tx: number,
  ty: number,
  out: Outcome
): void {
  person.targetX = tx;
  person.targetY = ty;
  out.tried++;
  for (let tick = 0; tick < TICK_BUDGET; tick++) {
    const before = person.stuckSteps;
    const arrival = movement.advance(person, tick);
    if (person.stuckSteps > before) out.stuckTicks++;
    if (arrival === Arrival.Arrived) {
      out.arrived++;
      return;
    }
    if (arrival === Arrival.Blocked) {
      out.blocked++;
      return;
    }
  }
  out.ranOut++;
}

/**
 * A start tile `START_DISTANCE` away from `(sx, sy)` on the same landmass,
 * found by walking the ring outward from the shore tile. Null when the shore
 * tile sits on a scrap of land too small to stand back from, which is a fact
 * about the terrain rather than a failure.
 */
function startNear(world: World, sx: number, sy: number): { x: number; y: number } | null {
  for (let dy = -START_DISTANCE; dy <= START_DISTANCE; dy++) {
    for (let dx = -START_DISTANCE; dx <= START_DISTANCE; dx++) {
      if (Math.abs(dx) !== START_DISTANCE && Math.abs(dy) !== START_DISTANCE) continue;
      const x = sx + dx;
      const y = sy + dy;
      if (!world.isWalkable(x, y)) continue;
      if (!world.sameRegion(x, y, sx, sy)) continue;
      return { x, y };
    }
  }
  return null;
}

describe('walking to the water', () => {
  it('reaches the shore tile it was aimed at, from every direction', () => {
    const world = new World(
      { ...DEFAULT_CONFIG.world, width: 96, height: 96 },
      new RNG('shorewalk')
    );
    const movement = new MovementSystem(world, new RNG('shorewalk-move'), new Pathfinder(world));

    // Deterministic sampling by a stride coprime with the tile count, the same
    // discipline `paths-are-found` uses: a check must not draw from a stream
    // the simulation shares, and a fixed stride is reproducible in a way a
    // seeded shuffle of a changing array is not.
    const shores = world.shoreTiles;
    const stride = 97;
    const out: Outcome = { arrived: 0, blocked: 0, ranOut: 0, stuckTicks: 0, tried: 0 };

    for (let i = 0, taken = 0; taken < 200 && i < shores.length; i++) {
      const tile = shores[(i * stride) % shores.length]!;
      const from = startNear(world, tile.x, tile.y);
      if (!from) continue;
      taken++;
      walkTo(movement, walker(from.x + 0.5, from.y + 0.5), tile.x, tile.y, out);
    }

    // Reported rather than merely asserted: the count is the measurement this
    // whole pass is steered by, and a bare pass/fail would hide a change that
    // halved the grinding without eliminating it.
    // eslint-disable-next-line no-console
    console.log(
      'shore probes: ' + out.tried + ' tried, ' + out.arrived + ' arrived, ' +
      out.blocked + ' blocked, ' + out.ranOut + ' ran out of ticks, ' +
      out.stuckTicks + ' stuck ticks'
    );

    expect(out.tried).toBeGreaterThan(150);
    expect(out.blocked).toBe(0);
    expect(out.ranOut).toBe(0);
    expect(out.arrived).toBe(out.tried);
  });

  it('walks the long way round an inlet without pressing into it', () => {
    // The owner's screenshot, in twelve columns: a walker on the near side of
    // a water inlet that reaches down from the top, with the only way west
    // being round its southern lip — which is a seam the whole way.
    const rows = [
      '............',
      '....#####...',
      '....#####...',
      '....#####...',
      '............',
      '............',
    ];
    const height = rows.length;
    const width = rows[0]!.length;
    const world = new World(
      { ...DEFAULT_CONFIG.world, width, height },
      new RNG('shorewalk-inlet')
    );
    world.walkable.fill(0);
    world.region.fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (rows[y]![x] === '.') continue;
        world.walkable[y * width + x] = 0;
        world.region[y * width + x] = -1;
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (rows[y]![x] === '.') world.walkable[y * width + x] = 1;
      }
    }

    const movement = new MovementSystem(world, new RNG('shorewalk-move'), new Pathfinder(world));
    const out: Outcome = { arrived: 0, blocked: 0, ranOut: 0, stuckTicks: 0, tried: 0 };

    // Both directions, and both rows that hug the inlet, because the half-tile
    // aim bias this pass fixes is directional: it only bites when the obstacle
    // lies north or west of the leg.
    walkTo(movement, walker(10.5, 2.5), 1, 2, out);
    walkTo(movement, walker(1.5, 2.5), 10, 2, out);
    walkTo(movement, walker(10.5, 1.5), 1, 1, out);
    walkTo(movement, walker(1.5, 3.5), 10, 3, out);

    // eslint-disable-next-line no-console
    console.log(
      'inlet probes: ' + out.arrived + '/' + out.tried + ' arrived, ' +
      out.stuckTicks + ' stuck ticks'
    );

    expect(out.arrived).toBe(out.tried);
  });
});
