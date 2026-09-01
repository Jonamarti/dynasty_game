/**
 * Movement toward a target tile.
 *
 * Greedy steering with a sidestep, not A*. On open terrain this reaches the
 * target the overwhelming majority of the time at a fraction of the cost, and
 * pathfinding is only worth adding once walls and buildings make dead ends
 * common.
 *
 * What greedy steering absolutely must have is an honest stuck detector, and
 * getting that wrong cost a whole population. The first version asked "did any
 * of my fallback moves succeed?" — and when a person was walking almost due
 * south into a shoreline, the east-west fallback moved them four ten-thousandths
 * of a tile, which counted as success. They slid sideways forever, never
 * triggered the give-up, and starved standing up with food six tiles away. So
 * the detector now measures *actual displacement*: a step that goes nowhere is
 * a step that failed, whatever branch produced it.
 */
import type { World } from '../core/World.ts';
import type { RNG } from '../core/RNG.ts';
import type { Person } from '../entities/Person.ts';
import { telemetry } from '../core/Telemetry.ts';

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
const PATIENCE = 25;

const stuckTicks = new Map<number, number>();

export function resetMovementState(): void {
  stuckTicks.clear();
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

  /** Returns true when the person is standing on (or adjacent to) their target. */
  step(person: Person): boolean {
    if (person.targetX === null || person.targetY === null) return true;

    const dx = person.targetX - person.x;
    const dy = person.targetY - person.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.6) {
      stuckTicks.delete(person.id);
      return true;
    }

    // Fatigue and poor health slow people down; this is what makes an exhausted
    // forager fail to get home before dark.
    const speed = this.speedOf(person);
    const startX = person.x;
    const startY = person.y;

    const nx = person.x + (dx / dist) * speed;
    const ny = person.y + (dy / dist) * speed;

    if (this.world.isWalkable(nx, ny)) {
      person.x = nx;
      person.y = ny;
    } else if (this.world.isWalkable(nx, person.y)) {
      person.x = nx;
    } else if (this.world.isWalkable(person.x, ny)) {
      person.y = ny;
    } else {
      // Slide along the obstacle, perpendicular to the desired heading.
      const jitter = this.rng.range(-0.5, 0.5);
      const sx = person.x + (dy / dist) * speed + jitter * speed;
      const sy = person.y - (dx / dist) * speed + jitter * speed;
      if (this.world.isWalkable(sx, sy)) {
        person.x = sx;
        person.y = sy;
      }
    }

    // The honest test: did we actually get anywhere?
    const progress = Math.sqrt(
      (person.x - startX) * (person.x - startX) + (person.y - startY) * (person.y - startY)
    );
    if (progress >= speed * PROGRESS_THRESHOLD) {
      stuckTicks.delete(person.id);
      return false;
    }

    const stuck = (stuckTicks.get(person.id) ?? 0) + 1;
    stuckTicks.set(person.id, stuck);
    if (stuck > PATIENCE) {
      stuckTicks.delete(person.id);
      this.giveUp(person);
    }
    return false;
  }

  /**
   * Abandons an unreachable target and steps away from it.
   *
   * Simply going idle is not enough: the brain re-scores, picks the same
   * nearest bush, and walks straight back into the same rock. Moving somewhere
   * else first means the next attempt approaches from a different angle, which
   * is usually all a greedy walker needs.
   */
  private giveUp(person: Person): void {
    telemetry.count('gave_up_walking');
    person.clearTarget();
    person.action = 'wander';

    for (let attempt = 0; attempt < 10; attempt++) {
      const tx = Math.round(person.x + this.rng.range(-7, 7));
      const ty = Math.round(person.y + this.rng.range(-7, 7));
      if (this.world.isWalkable(tx, ty)) {
        person.targetX = tx;
        person.targetY = ty;
        return;
      }
    }
    person.action = 'idle';
  }
}
