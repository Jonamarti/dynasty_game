/**
 * Movement toward a target tile.
 *
 * A person walks a route from `Pathfinder`, one waypoint at a time, via the
 * same greedy `moveToward` primitive direct control always used — routing
 * decides *where* to aim, not *how* a step lands, so animals (which never
 * route) and people cannot disagree about what a legal step is. A stuck
 * detector is still the backstop underneath all of it: a route can go stale
 * under a walker in ways `needsRoute` cannot see coming (a wall goes up), and
 * greedy steering along a good waypoint can still slide on real terrain.
 *
 * What that detector absolutely must have is an honest measure of progress,
 * and getting that wrong cost a whole population once already. The first
 * version asked "did any of my fallback moves succeed?" — and when a person
 * was walking almost due south into a shoreline, the east-west fallback moved
 * them four ten-thousandths of a tile, which counted as success. They slid
 * sideways forever and starved standing up with food six tiles away. So the
 * detector measures *actual displacement*: a step that goes nowhere is a step
 * that failed, whatever produced it.
 *
 * The second thing it must have, learned the same way: giving up must be
 * *visible* to the caller. `advance` returns a tri-state rather than a
 * boolean because two of its callers, before M7, threw a boolean answer away
 * — which on a concave shoreline meant a person under a player's order stood
 * still until they starved, "thinking" the whole time. *Deciding what a stuck
 * walk means* is deliberately not this file's job either: `ActionSystem.travel`
 * is the one place that already knows the difference between an action
 * somebody ordered and a wander nobody did.
 */
import type { World } from '../core/World.ts';
import type { RNG } from '../core/RNG.ts';
import type { Person } from '../entities/Person.ts';
import { telemetry } from '../core/Telemetry.ts';
import { Pathfinder, PathStatus } from '../core/Pathfinder.ts';

/** A person is considered to have arrived within this many tiles of a target. */
export const ARRIVAL_RADIUS = 0.6;

/**
 * Deliberately not a boolean: `step` returned one and two of its fifteen
 * callers threw the answer away, which is how a person under orders came to
 * stand still until they starved.
 */
export const enum Arrival { Moving = 0, Arrived = 1, Blocked = 2 }

/**
 * Tiles per tick. At 240 ticks per day this is roughly 75 tiles a day, which is
 * the right order of magnitude for people who forage on foot over a home range.
 * It was 0.11 at first, and the health report showed why that was wrong: a walk
 * to the river took 650 ticks, thirst outran the round trip, and whole bands
 * died of dehydration surrounded by water.
 */
const BASE_SPEED = 0.32;

/** A step covering less than this fraction of the intended distance is stuck. */
const PROGRESS_THRESHOLD = 0.25;

/** Consecutive stuck steps before a person gives up on where they were going. */
export const PATIENCE = 25;

/**
 * How far a target has to move from the goal a route was computed for before
 * the route counts as stale. Not zero: `doHunt` rewrites `targetX/Y` every
 * tick chasing a moving animal, and a tolerance is what lets the walker
 * follow one route for more than a single tick instead of invalidating it
 * every time the quarry so much as twitches.
 */
const GOAL_TOLERANCE = 2;

/**
 * Ticks between route searches for one person. Bounds the worst case at
 * `population / REPATH_COOLDOWN` searches per tick, and stops a person with a
 * genuinely unroutable target searching every tick for nothing — fifteen
 * ticks of greedy steering between attempts is exactly what a person with no
 * route at all already does, so the fallback while waiting out the cooldown
 * does not regress on today's behaviour.
 */
const REPATH_COOLDOWN = 15;

/**
 * Route searches allowed across the whole population in one tick. Reset
 * lazily inside `requestRoute` when the tick changes, rather than from
 * `Simulation.step` — a budget nobody outside this file has to remember to
 * reset is a budget that cannot be reset in the wrong order relative to
 * whichever person happens to ask first.
 */
const MAX_PATHS_PER_TICK = 3;

/**
 * One step of greedy steering, for anything with a position.
 *
 * Extracted so that animals and people cannot disagree about what walkable
 * means. A second steerer written for wildlife would drift from this one, and
 * the first symptom would be deer standing in lakes — which is exactly the
 * class of bug the shared `World.isWalkable` chokepoint exists to prevent.
 *
 * Returns how far the entity actually moved, so the caller can run its own
 * stuck detection. Measuring displacement rather than trusting a branch to have
 * succeeded is the lesson at the top of this file, and it applies to anything
 * that walks.
 */
export function moveToward(
  entity: { x: number; y: number },
  targetX: number,
  targetY: number,
  speed: number,
  world: World,
  rng: RNG
): number {
  const dx = targetX - entity.x;
  const dy = targetY - entity.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-6) return 0;

  const startX = entity.x;
  const startY = entity.y;

  const nx = entity.x + (dx / dist) * speed;
  const ny = entity.y + (dy / dist) * speed;

  if (world.isWalkable(nx, ny)) {
    entity.x = nx;
    entity.y = ny;
  } else if (world.isWalkable(nx, entity.y)) {
    entity.x = nx;
  } else if (world.isWalkable(entity.x, ny)) {
    entity.y = ny;
  } else {
    // Slide along the obstacle, perpendicular to the desired heading.
    const jitter = rng.range(-0.5, 0.5);
    const sx = entity.x + (dy / dist) * speed + jitter * speed;
    const sy = entity.y - (dx / dist) * speed + jitter * speed;
    if (world.isWalkable(sx, sy)) {
      entity.x = sx;
      entity.y = sy;
    }
  }

  return Math.sqrt(
    (entity.x - startX) * (entity.x - startX) + (entity.y - startY) * (entity.y - startY)
  );
}

export class MovementSystem {
  /** Route searches already spent this tick, across the whole population. */
  private searchesUsed = 0;
  private budgetTick = -1;

  constructor(
    private readonly world: World,
    private readonly rng: RNG,
    private readonly pathfinder: Pathfinder
  ) {}

  /** Speed for a given person, shared by pathing and direct player control. */
  speedOf(person: Person): number {
    return BASE_SPEED * (1 - person.needs.fatigue / 220) * (0.5 + (person.health / 100) * 0.5);
  }

  /**
   * Move by an explicit direction rather than toward a target. This is how the
   * player's own key presses reach the world: the same speed and the same
   * walkability rules an NPC gets, so direct control is not a privileged path.
   */
  nudge(person: Person, dx: number, dy: number): void {
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return;
    const speed = this.speedOf(person);
    const nx = person.x + (dx / length) * speed;
    const ny = person.y + (dy / length) * speed;
    if (this.world.isWalkable(nx, ny)) {
      person.x = nx;
      person.y = ny;
    } else if (this.world.isWalkable(nx, person.y)) {
      person.x = nx;
    } else if (this.world.isWalkable(person.x, ny)) {
      person.y = ny;
    }
  }

  /**
   * One tick of travel toward `person.targetX/Y`, along `person.path` when
   * there is one.
   *
   * In order: the arrival check (unchanged by routing — it has always been
   * about the real target, never about a waypoint); `needsRoute` and
   * `requestRoute`, which between them decide whether this is the tick to ask
   * `Pathfinder` for a fresh route; skipping past any waypoints already
   * behind the walker; `moveToward` aimed at the next waypoint, or at the
   * real target on the final leg when the route is exhausted or there never
   * was one; the same displacement-based stuck detector as always, as the
   * backstop for everything routing cannot see coming.
   *
   * Deciding what `Blocked` *means* — abandon the order, or just try again —
   * is deliberately not this method's job. `ActionSystem.travel` is the one
   * place that already knows the difference between an action somebody
   * ordered and a wander nobody did.
   */
  advance(person: Person, tick: number): Arrival {
    if (person.targetX === null || person.targetY === null) return Arrival.Arrived;

    const dx = person.targetX - person.x;
    const dy = person.targetY - person.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ARRIVAL_RADIUS) {
      person.stuckSteps = 0;
      telemetry.count('walk_arrived');
      // Separate from `walk_arrived`, which counts every arrival: this one
      // counts only arrivals that involved following at least one waypoint
      // from `Pathfinder`, so the report can say what share of walks actually
      // needed routing rather than a straight line.
      if (person.pathCount > 0) telemetry.count('route_arrived');
      person.pathCount = 0;
      return Arrival.Arrived;
    }

    if (this.needsRoute(person)) this.requestRoute(person, tick);

    // Skip waypoints already behind us. Speed-relative, and not the arrival
    // radius: a fixed 0.3 against a 0.32 step is stepped over every tick, and
    // the walker would orbit the waypoint forever while `moveToward` reports
    // full progress every time — invisible to a displacement-based detector.
    const skipRadius = Math.max(0.5, this.speedOf(person) * 1.1);
    while (person.pathAt < person.pathCount) {
      const wx = person.path![person.pathAt * 2]!;
      const wy = person.path![person.pathAt * 2 + 1]!;
      const wdx = wx - person.x;
      const wdy = wy - person.y;
      if (Math.sqrt(wdx * wdx + wdy * wdy) > skipRadius) break;
      person.pathAt++;
    }

    const aimingAtWaypoint = person.pathAt < person.pathCount;
    const aimX = aimingAtWaypoint ? person.path![person.pathAt * 2]! : person.targetX;
    const aimY = aimingAtWaypoint ? person.path![person.pathAt * 2 + 1]! : person.targetY;

    // Fatigue and poor health slow people down; this is what makes an exhausted
    // forager fail to get home before dark.
    const speed = this.speedOf(person);

    // The honest test: did we actually get anywhere?
    const progress = moveToward(person, aimX, aimY, speed, this.world, this.rng);
    if (progress >= speed * PROGRESS_THRESHOLD) {
      person.stuckSteps = 0;
      person.pathRetried = false;
      return Arrival.Moving;
    }

    person.stuckSteps++;
    if (person.stuckSteps > PATIENCE) {
      // Out of patience buys one free re-route before giving up outright —
      // a route can go stale under a walker (a wall goes up, `walkable`
      // changes) in a way `needsRoute` cannot see coming, and a single bad
      // stretch is not yet evidence the whole route is wrong. `requestRoute`
      // is still subject to its own cooldown and budget, so this is a chance
      // at a fresh route, not a guarantee of one.
      if (!person.pathRetried) {
        person.pathRetried = true;
        person.stuckSteps = 0;
        person.pathCount = 0;
        person.pathAt = 0;
        return Arrival.Moving;
      }

      person.stuckSteps = 0;
      person.pathRetried = false;
      telemetry.count('gave_up_walking');
      // Counted apart from the general tally because this is the shape of the
      // zombie-order bug M7 exists to fix: a give-up reached under an order
      // used to leave the order standing with nothing left to walk toward.
      if (person.order !== null) telemetry.count('gave_up_under_orders');
      return Arrival.Blocked;
    }
    return Arrival.Moving;
  }

  /**
   * Whether `person.path` is missing, aimed at a goal that has since moved,
   * or about to walk into a tile that stopped being walkable under it.
   */
  private needsRoute(person: Person): boolean {
    if (person.pathCount === 0) return true;

    const gdx = person.targetX! - person.pathGoalX;
    const gdy = person.targetY! - person.pathGoalY;
    if (gdx * gdx + gdy * gdy > GOAL_TOLERANCE * GOAL_TOLERANCE) return true;

    // One line for M7's walls and M8.3's mining rather than a live case today
    // — building footprints are always walkable — and the hook that makes
    // incremental region repair an addition later rather than a rewrite now.
    if (person.pathAt < person.pathCount) {
      const nx = person.path![person.pathAt * 2]!;
      const ny = person.path![person.pathAt * 2 + 1]!;
      if (!this.world.isWalkable(nx, ny)) return true;
    }
    return false;
  }

  /**
   * Asks `Pathfinder` for a route, if this person's own cooldown and the
   * whole population's per-tick budget both allow it.
   *
   * Pursuit needs no special case here: `doHunt` rewrites `targetX/Y` every
   * tick, so `needsRoute` sees the goal move past `GOAL_TOLERANCE` and this
   * runs again — but no more than once every `REPATH_COOLDOWN` ticks.
   * Between searches the walker follows the stale route and then aims
   * straight at the animal once it runs out, which is the right shape
   * anyway: routing matters for closing on the herd, and the last few tiles
   * of a chase are open ground.
   */
  private requestRoute(person: Person, tick: number): void {
    if (tick !== this.budgetTick) {
      this.budgetTick = tick;
      this.searchesUsed = 0;
    }
    if (tick - person.pathTick < REPATH_COOLDOWN) return;
    if (this.searchesUsed >= MAX_PATHS_PER_TICK) return;

    person.pathTick = tick;
    this.searchesUsed++;

    const status = this.pathfinder.find(person.x, person.y, person.targetX!, person.targetY!);
    if (status !== PathStatus.Found) {
      // `AlreadyThere` is handled by the arrival check above in practice;
      // `NoRoute`/`GaveUp` leave nothing to store, so the walker aims
      // straight at the real target below until the stuck backstop decides
      // what a route that never arrives means.
      person.pathCount = 0;
      person.pathAt = 0;
      return;
    }

    const routeLength = this.pathfinder.routeLength;
    if (!person.path || person.path.length < routeLength * 2) {
      // Grows rather than reallocating on every route — one buffer per
      // person for life in the overwhelmingly common case, since a route
      // this size has, by definition, never been needed before.
      person.path = new Int16Array(Math.max(routeLength * 2, (person.path?.length ?? 8) * 2));
    }
    person.path.set(this.pathfinder.route.subarray(0, routeLength * 2));
    person.pathCount = routeLength;
    person.pathAt = 0;
    person.pathGoalX = person.targetX!;
    person.pathGoalY = person.targetY!;
  }
}
