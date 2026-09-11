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
import { Pathfinder, PathStatus, DEFAULT_MAX_EXPANSIONS } from '../core/Pathfinder.ts';

/** A person is considered to have arrived within this many tiles of a target. */
export const ARRIVAL_RADIUS = 0.6;

/**
 * How far inside its own tile a waypoint is aimed at: the centre.
 *
 * `World.index` truncates, so tile `(tx, ty)` owns `[tx, tx+1) x [ty, ty+1)`
 * and the float point `(tx, ty)` is its *north-west corner* — the meeting
 * point of four tiles, only one of which anything ever checked. `Pathfinder`
 * emits waypoints as integer tile indices, and this file used to aim straight
 * at them, which put a systematic half-tile north-west bias on every routed
 * aim point in the game. Wherever the coast lay north or west of the leg, the
 * last fraction of every step landed in the water.
 *
 * Aiming at the centre restores the guarantee the corner rule already earns
 * for the route: a compressed run is a straight sequence of *adjacent* tile
 * centres, and every lattice point that line crosses truncates into a tile
 * the corner rule (`Pathfinder.ts`) has already proved walkable.
 */
export const WAYPOINT_AIM = 0.5;

/**
 * How far inside its own tile a real target is aimed at.
 *
 * The same defect reaches the final leg from the other end: `World.shoreTiles`
 * holds integer coordinates and `Brain.setup` assigns them straight to
 * `person.targetX` for a `drink` — so the one errand that by construction ends
 * at the boundary between land and water aimed at a point *on* that boundary.
 *
 * Smaller than `WAYPOINT_AIM` because the arrival test must stay exact. The
 * invariant is `TARGET_AIM_MARGIN * Math.SQRT2 < ARRIVAL_RADIUS` (0.283 <
 * 0.6): the clamp moves the aim by at most that much, so standing on the
 * clamped aim implies standing inside `ARRIVAL_RADIUS` of the real target and
 * the check at the top of `advance` needs no adjustment. Raise this past the
 * invariant and a walker parks short of where it was sent, for ever.
 */
const TARGET_AIM_MARGIN = 0.2;

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
 * Ticks of no progress between recovery re-paths, inside `PATIENCE`.
 *
 * Eight gives three genuinely different attempts before a walk is abandoned,
 * where the old "one free re-route at `PATIENCE`" gave one identical one: the
 * search has no RNG, `World.walkable` never changes, and a walker who has not
 * moved is searching from the same tile, so it returned the same route it was
 * already failing to follow. It only *appeared* to work at all because the
 * stuck threshold allows about 0.08 tiles a tick, so twenty-five stuck ticks
 * can still drift somebody onto a different start tile — which is worse than
 * never working, and is why this read as intermittent.
 */
export const STUCK_REPATH = 8;

/**
 * Recovery searches allowed across the whole population in one tick, separate
 * from `MAX_PATHS_PER_TICK` so that routine re-planning and getting somebody
 * unstuck cannot starve each other. A stuck walker should not have to win a
 * race against everybody's ordinary errands, and a pathological mass-stall
 * should not be able to blow the frame budget either.
 */
const MAX_RECOVERY_PATHS_PER_TICK = 2;

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
/**
 * Pulls a coordinate `margin` inside the tile it falls in — the other half of
 * "never aim at a point you could not stand on".
 *
 * Truncates rather than rounds, because `World.index` truncates and this file
 * has already learned once what disagreeing at a tile edge costs.
 */
function clampIntoTile(value: number, margin: number): number {
  const tile = value | 0;
  return Math.min(tile + 1 - margin, Math.max(tile + margin, value));
}

export function moveToward(
  entity: { x: number; y: number },
  targetX: number,
  targetY: number,
  speed: number,
  world: World,
  rng: RNG,
  refused?: { x: number; y: number }
): number {
  const dx = targetX - entity.x;
  const dy = targetY - entity.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-6) return 0;

  const startX = entity.x;
  const startY = entity.y;

  const nx = entity.x + (dx / dist) * speed;
  const ny = entity.y + (dy / dist) * speed;

  // Which branch below actually ran: 0 the step the walker wanted, 1 one of
  // the two axis fallbacks, 2 the perpendicular slide. Recorded rather than
  // inferred because the counters at the bottom are the only way the health
  // report can tell a walk along a shoreline from a walk across a meadow.
  let outcome = 0;

  // A fallback that does not move is not a fallback.
  //
  // For a heading that is almost due east, `ny` stays inside the walker's own
  // row, so `isWalkable(entity.x, ny)` tests the tile they are already
  // standing in, succeeds unconditionally, displaces about nothing — and
  // returns *before* the slide below ever runs. A walker pressed perpendicular
  // into a shoreline therefore did not slide, did not jitter and did not move:
  // it vibrated sub-threshold until it ran out of patience, and the slide, the
  // only branch that can carry somebody *along* an obstacle, was unreachable
  // for every axis-aligned heading in the game.
  //
  // Each axis fallback is now gated on the heading actually having enough of
  // itself on that axis to produce a step the stuck detector would accept.
  // Reusing `PROGRESS_THRESHOLD` is the point: "a fallback counts as a move"
  // and "a step counts as progress" become one definition instead of two that
  // disagreed.
  const alongX = Math.abs(dx) / dist >= PROGRESS_THRESHOLD;
  const alongY = Math.abs(dy) / dist >= PROGRESS_THRESHOLD;

  if (world.isWalkable(nx, ny)) {
    entity.x = nx;
    entity.y = ny;
  } else {
    // The tile the walker actually wanted, for a caller that wants to route
    // around it rather than merely cope with it. Recorded here, before any
    // fallback runs: the fallbacks are about coping, and this is about what
    // blocked them. Written into a scratch object the caller owns, so a step
    // still allocates nothing.
    if (refused) {
      refused.x = nx | 0;
      refused.y = ny | 0;
    }

    if (alongX && world.isWalkable(nx, entity.y)) {
      entity.x = nx;
      outcome = 1;
    } else if (alongY && world.isWalkable(entity.x, ny)) {
      entity.y = ny;
      outcome = 1;
    } else {
      outcome = 2;
      // Slide along the obstacle, perpendicular to the desired heading — and
      // try *both* hands, not one. There is no reason to prefer a fixed
      // rotation, and a walker pressed into a concave corner whose first
      // perpendicular happens to be blocked used to stand still with an open
      // side next to it. The second try costs one lookup and no extra draw.
      const jitter = rng.range(-0.5, 0.5) * speed;
      const px = (dy / dist) * speed;
      const py = -(dx / dist) * speed;
      if (world.isWalkable(entity.x + px + jitter, entity.y + py + jitter)) {
        entity.x += px + jitter;
        entity.y += py + jitter;
      } else if (world.isWalkable(entity.x - px + jitter, entity.y - py + jitter)) {
        entity.x += -px + jitter;
        entity.y += -py + jitter;
      }
    }
  }

  const moved = Math.sqrt(
    (entity.x - startX) * (entity.x - startX) + (entity.y - startY) * (entity.y - startY)
  );

  if (outcome !== 0) {
    telemetry.count('step_blocked');
    if (outcome === 2) {
      telemetry.count('step_slide');
    } else if (moved < speed * PROGRESS_THRESHOLD) {
      // An axis fallback that reported success while displacing nothing the
      // stuck detector would accept. This is the same lie the file header
      // records costing a whole population — "did a branch succeed?" instead
      // of "did we get anywhere?" — surviving inside the branch itself, and
      // this counter is the only thing that can say how often it happens.
      telemetry.count('step_axis_null');
    }
  }

  return moved;
}

export class MovementSystem {
  /** Route searches already spent this tick, across the whole population. */
  private searchesUsed = 0;
  /** Recovery searches already spent this tick; see `MAX_RECOVERY_PATHS_PER_TICK`. */
  private recoveriesUsed = 0;
  private budgetTick = -1;

  /**
   * Where the last `moveToward` call was refused, reused every step rather
   * than allocated. `x < 0` means the step was not refused at all.
   */
  private readonly refused = { x: -1, y: -1 };

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
    // Measured to the same point the walker is actually steered at, below. A
    // skip ball half a tile north-west of the thing being walked to would let
    // somebody count a waypoint as spent while still walking toward it.
    const skipRadius = Math.max(0.5, this.speedOf(person) * 1.1);
    while (person.pathAt < person.pathCount) {
      const wx = person.path![person.pathAt * 2]! + WAYPOINT_AIM;
      const wy = person.path![person.pathAt * 2 + 1]! + WAYPOINT_AIM;
      const wdx = wx - person.x;
      const wdy = wy - person.y;
      if (Math.sqrt(wdx * wdx + wdy * wdy) > skipRadius) break;
      person.pathAt++;
    }

    let aimX: number;
    let aimY: number;
    if (person.pathAt < person.pathCount) {
      aimX = person.path![person.pathAt * 2]! + WAYPOINT_AIM;
      aimY = person.path![person.pathAt * 2 + 1]! + WAYPOINT_AIM;
    } else if (this.world.isWalkable(person.targetX, person.targetY)) {
      aimX = clampIntoTile(person.targetX, TARGET_AIM_MARGIN);
      aimY = clampIntoTile(person.targetY, TARGET_AIM_MARGIN);
    } else {
      // A target standing on ground nobody can walk on — a fishing spot out
      // over water, once those exist — keeps the old behaviour rather than
      // being pulled into the middle of a tile it was never in.
      aimX = person.targetX;
      aimY = person.targetY;
    }

    // Fatigue and poor health slow people down; this is what makes an exhausted
    // forager fail to get home before dark.
    const speed = this.speedOf(person);

    // The denominator for `walk_stuck_tick`: every tick somebody spent walking
    // somewhere. A raw stuck count says nothing without it — a thousand stuck
    // ticks is a catastrophe in a scenario with ten thousand walk ticks and a
    // rounding error in one with a million.
    telemetry.count('walk_tick');

    // The honest test: did we actually get anywhere?
    this.refused.x = -1;
    const progress = moveToward(person, aimX, aimY, speed, this.world, this.rng, this.refused);
    if (progress >= speed * PROGRESS_THRESHOLD) {
      person.stuckSteps = 0;
      return Arrival.Moving;
    }

    telemetry.count('walk_stuck_tick');
    person.stuckSteps++;

    if (person.stuckSteps > PATIENCE) {
      person.stuckSteps = 0;
      telemetry.count('gave_up_walking');
      // Counted apart from the general tally because this is the shape of the
      // zombie-order bug M7 exists to fix: a give-up reached under an order
      // used to leave the order standing with nothing left to walk toward.
      if (person.order !== null) telemetry.count('gave_up_under_orders');
      return Arrival.Blocked;
    }

    // A route that is *different*, three times over, before giving up — not
    // the single identical one the old `pathRetried` bought. Run here rather
    // than by clearing `pathCount` and waiting for the next tick, because the
    // refusal scratch is fresh exactly now and waiting spends a tick of the
    // patience this is trying to save.
    if (person.stuckSteps % STUCK_REPATH === 0) this.recoverRoute(person, tick);

    return Arrival.Moving;
  }

  /**
   * The re-path a stuck walker gets, which differs from `requestRoute` in the
   * two ways that matter when somebody is pressed against terrain.
   *
   * It is exempt from `REPATH_COOLDOWN`: that cooldown exists to stop a person
   * with an unroutable target searching every tick for nothing, and somebody
   * who has not moved for eight ticks is a different case entirely.
   *
   * And it asks `Pathfinder` to avoid the tile the walker is actually pressed
   * against, which is the whole point. The search has no RNG and
   * `World.walkable` never changes, so re-running it from an unchanged
   * position returns the identical route — the old retry spent twenty-five
   * ticks to be told the same thing twice. One tile of penalty is enough to
   * make the answer genuinely different wherever a detour exists at all.
   */
  private recoverRoute(person: Person, tick: number): void {
    if (tick !== this.budgetTick) {
      this.budgetTick = tick;
      this.searchesUsed = 0;
      this.recoveriesUsed = 0;
    }
    if (this.recoveriesUsed >= MAX_RECOVERY_PATHS_PER_TICK) return;
    this.recoveriesUsed++;
    telemetry.count('path_recovery');

    const avoid = this.refused.x >= 0
      ? this.world.index(this.refused.x, this.refused.y)
      : -1;

    person.pathTick = tick;
    const status = this.pathfinder.find(
      person.x, person.y, person.targetX!, person.targetY!, DEFAULT_MAX_EXPANSIONS, avoid
    );
    if (this.storeRoute(person, status)) telemetry.count('path_recovery_found');
  }

  /**
   * Copies `Pathfinder`'s result onto the person, or clears their route when
   * there was none. Shared by the routine and recovery searches so the two
   * cannot drift about what a stored route means.
   */
  private storeRoute(person: Person, status: PathStatus): boolean {
    if (status !== PathStatus.Found) {
      // `AlreadyThere` is handled by the arrival check in `advance` in
      // practice; `NoRoute`/`GaveUp` leave nothing to store, so the walker
      // aims straight at the real target until the stuck backstop decides
      // what a route that never arrives means.
      person.pathCount = 0;
      person.pathAt = 0;
      return false;
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
    return true;
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
      // Deliberately *not* offset by `WAYPOINT_AIM`, unlike every other read
      // of this array. The stored value is a tile index and this is the one
      // consumer that legitimately wants the tile rather than a point in it;
      // adding the half tile here would turn a tile test into a point test
      // that happens to agree, which is the sort of accident that survives
      // until the day it does not.
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
      this.recoveriesUsed = 0;
    }
    // Both refusals leave the walker greedy-steering with no route, which is
    // indistinguishable from "no route exists" everywhere downstream. Counted
    // apart so the report can say which of the two gates is actually binding
    // before anybody reaches for the constants.
    if (tick - person.pathTick < REPATH_COOLDOWN) {
      telemetry.count('path_denied_cooldown');
      return;
    }
    if (this.searchesUsed >= MAX_PATHS_PER_TICK) {
      telemetry.count('path_denied_budget');
      return;
    }

    person.pathTick = tick;
    this.searchesUsed++;

    this.storeRoute(
      person,
      this.pathfinder.find(person.x, person.y, person.targetX!, person.targetY!)
    );
  }
}
