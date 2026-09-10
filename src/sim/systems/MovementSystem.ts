/**
 * Movement toward a target tile.
 *
 * Greedy steering with a sidestep, not yet A* (M7 adds that in `Pathfinder`).
 * On open terrain this reaches the target the overwhelming majority of the
 * time at a fraction of the cost.
 *
 * What greedy steering absolutely must have is an honest stuck detector, and
 * getting that wrong cost a whole population. The first version asked "did any
 * of my fallback moves succeed?" — and when a person was walking almost due
 * south into a shoreline, the east-west fallback moved them four ten-thousandths
 * of a tile, which counted as success. They slid sideways forever, never
 * triggered the give-up, and starved standing up with food six tiles away. So
 * the detector now measures *actual displacement*: a step that goes nowhere is
 * a step that failed, whatever branch produced it.
 *
 * The second thing it must have, learned the same way: giving up must be
 * *visible* to the caller. `advance` used to be `step`, returning a boolean,
 * and two of its fifteen callers threw the answer away — which on a concave
 * shoreline meant a person under a player's order stood still until they
 * starved, "thinking" the whole time. `Arrival` is a tri-state so the compiler
 * catches every caller that ignores it, and *deciding what a stuck walk means*
 * moved out to `ActionSystem.travel`, which is where the rest of "this action
 * turned out to be impossible" already lived.
 */
import type { World } from '../core/World.ts';
import type { RNG } from '../core/RNG.ts';
import type { Person } from '../entities/Person.ts';
import { telemetry } from '../core/Telemetry.ts';

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
 * No longer has anything to clear.
 *
 * `stuckTicks` used to live here as a module-level `Map<personId, count>`,
 * shared by every `Simulation` in the process, which leaked an entry for
 * everyone who died mid-slide and could carry a stale entry from one world
 * into the next. It is now `Person.stuckSteps` (see that field's own note on
 * why it is not simply cleared by `clearTarget`), bounded by the person's
 * own lifetime. Kept as a no-op rather than removed along with its one call
 * site (`Simulation.ts`) so this commit stays instrumentation-only; both go
 * away together once M7's `MovementSystem` rewrite lands.
 */
export function resetMovementState(): void {}

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
  constructor(private readonly world: World, private readonly rng: RNG) {}

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
   * One tick of travel toward `person.targetX/Y`.
   *
   * `tick` is unused until M7's route-following lands in `Pathfinder`'s wake
   * (it will gate how often a stuck walker is allowed to search for a new
   * route); taken now so every one of `advance`'s callers already threads it
   * through, rather than changing every call site's arity twice.
   *
   * Deciding what `Blocked` *means* — abandon the order, or just try again —
   * is deliberately not this method's job. `ActionSystem.travel` is the one
   * place that already knows the difference between an action somebody
   * ordered and a wander nobody did.
   */
  advance(person: Person, _tick: number): Arrival {
    if (person.targetX === null || person.targetY === null) return Arrival.Arrived;

    const dx = person.targetX - person.x;
    const dy = person.targetY - person.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ARRIVAL_RADIUS) {
      person.stuckSteps = 0;
      telemetry.count('walk_arrived');
      return Arrival.Arrived;
    }

    // Fatigue and poor health slow people down; this is what makes an exhausted
    // forager fail to get home before dark.
    const speed = this.speedOf(person);

    // The honest test: did we actually get anywhere?
    const progress = moveToward(
      person, person.targetX, person.targetY, speed, this.world, this.rng
    );
    if (progress >= speed * PROGRESS_THRESHOLD) {
      person.stuckSteps = 0;
      return Arrival.Moving;
    }

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
    return Arrival.Moving;
  }
}
