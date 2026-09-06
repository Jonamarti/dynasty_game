/**
 * Herds that drift, graze and bolt.
 *
 * The point of this system is that game is no longer something you walk up to.
 * A deer notices you, runs faster than you can, and takes the rest of its herd
 * with it — so hunting becomes a matter of approach and timing rather than of
 * standing next to a bush for twenty-four ticks. It is also the first thing the
 * `track` skill has ever done: tracking shrinks the radius at which an animal
 * notices you, which is the whole difference between a stalk and a stampede.
 *
 * Movement goes through the shared `moveToward` rather than a second steerer,
 * so animals and people agree about what walkable means. Two implementations of
 * that would drift, and the first symptom would be deer standing in lakes.
 */
import type { Animal } from '../entities/Animal.ts';
import type { Person } from '../entities/Person.ts';
import type { World } from '../core/World.ts';
import type { RNG } from '../core/RNG.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import { moveToward } from './MovementSystem.ts';
import { telemetry } from '../core/Telemetry.ts';
import { stealthFactor } from '../knowledge/Tech.ts';

/** Ticks an animal keeps running after it stops seeing what spooked it. */
const ALARM_TICKS = 90;

/** How far a bolting animal aims for at full stamina. A real loss. */
const FLIGHT_DISTANCE = 16;

/** Stamina spent per move tick of bolting, and regained per move tick grazing. */
const STAMINA_DRAIN = 0.055;
const STAMINA_RECOVERY = 0.006;

/**
 * Bearings tried when bolting, in radians off "directly away".
 *
 * Straight back first, then widening. A cornered animal breaks sideways along
 * the obstacle rather than pressing into it, which is both what animals do and
 * what greedy steering needs in order to get anywhere at all.
 */
const FLIGHT_BEARINGS = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6];

/** How far from the herd's centre an animal will drift before coming back. */
const HERD_SPREAD = 3.5;

/**
 * Animals move on a stagger, like people think on one.
 *
 * Wildlife is the largest population in the world and the least interesting per
 * tick. Moving a fifth of them each step costs a fifth as much and is
 * indistinguishable at the speeds anything actually travels.
 */
const MOVE_INTERVAL = 5;

export interface WildlifeContext {
  world: World;
  rng: RNG;
  tick: number;
  peopleHash: SpatialHash<Person>;
}

export class WildlifeSystem {
  update(animals: Animal[], ctx: WildlifeContext): void {
    if (animals.length === 0) return;

    // Herd centroids, recomputed once per step rather than per animal: this is
    // the only O(n) pass here, and doing it per animal would make it O(n²).
    const centroids = new Map<number, { x: number; y: number; n: number }>();
    for (const animal of animals) {
      if (!animal.alive) continue;
      const c = centroids.get(animal.herdId);
      if (c) {
        c.x += animal.x;
        c.y += animal.y;
        c.n++;
      } else {
        centroids.set(animal.herdId, { x: animal.x, y: animal.y, n: 1 });
      }
    }
    for (const c of centroids.values()) {
      c.x /= c.n;
      c.y /= c.n;
    }

    for (const animal of animals) {
      if (!animal.alive) continue;
      if ((ctx.tick + animal.id) % MOVE_INTERVAL !== 0) continue;

      const threat = this.threatNear(animal, ctx);
      if (threat) this.alarm(animal, threat, ctx, animals);

      if (animal.alarmedUntil > ctx.tick) this.bolt(animal, ctx);
      else this.graze(animal, centroids.get(animal.herdId), ctx);
    }
  }

  /**
   * The nearest person close enough to have been noticed.
   *
   * `track` is what shrinks this. A skilled tracker gets close; a novice
   * blunders into the treeline and watches the herd leave.
   */
  private threatNear(animal: Animal, ctx: WildlifeContext): Person | null {
    return ctx.peopleHash.findNearest(
      animal.x, animal.y, animal.def.awareness,
      person => person.alive &&
        person.distanceTo(animal) <= noticeRadius(animal, person)
    );
  }

  /** Spooks an animal and everything in its herd standing nearby. */
  private alarm(
    animal: Animal,
    threat: Person,
    ctx: WildlifeContext,
    animals: Animal[]
  ): void {
    const wasCalm = animal.alarmedUntil <= ctx.tick;
    this.setFlight(animal, threat.x, threat.y, ctx);

    if (!wasCalm) return;
    telemetry.count('animal_alarmed');

    // A herd bolts together. One deer running while its neighbours graze is
    // both wrong to look at and removes the cost of a failed stalk.
    for (const other of animals) {
      if (other.herdId !== animal.herdId || other.id === animal.id) continue;
      if (!other.alive) continue;
      if (Math.hypot(other.x - animal.x, other.y - animal.y) > 9) continue;
      this.setFlight(other, threat.x, threat.y, ctx);
    }
  }

  /**
   * Points an animal away from a threat, onto ground it can actually reach.
   *
   * Straight away from the danger first, then progressively wider bearings.
   * The straight line alone is not enough: a herd driven against a shoreline
   * has nothing walkable directly behind it, and an animal that finds no flight
   * point at all used to stay flagged alarmed for the full ninety ticks while
   * standing perfectly still next to the hunter. Over a long run that is most
   * of the map's wildlife, pinned along the coast and no longer fleeing
   * anything.
   */
  private setFlight(animal: Animal, fromX: number, fromY: number, ctx: WildlifeContext): void {
    const dx = animal.x - fromX;
    const dy = animal.y - fromY;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const away = Math.atan2(dy / length, dx / length);

    // A winded animal does not run as far. This is the whole of persistence
    // hunting: each bolt is shorter than the last, so a hunter who keeps the
    // pressure on eventually closes.
    const reach = FLIGHT_DISTANCE * (0.2 + 0.8 * animal.stamina);
    for (const distance of [reach, reach * 0.7, reach * 0.45, reach * 0.25]) {
      for (const spread of FLIGHT_BEARINGS) {
        const angle = away + spread;
        const tx = animal.x + Math.cos(angle) * distance;
        const ty = animal.y + Math.sin(angle) * distance;
        // Sideways is only an escape if it is not *toward* the threat.
        if (Math.hypot(tx - fromX, ty - fromY) <= length) continue;
        if (!ctx.world.isWalkable(tx, ty)) continue;
        animal.alarmedUntil = ctx.tick + ALARM_TICKS;
        animal.fleeX = tx;
        animal.fleeY = ty;
        return;
      }
    }

    // Genuinely cornered. Better to graze than to stand rigid for ninety ticks
    // pretending to run.
    animal.alarmedUntil = 0;
    animal.fleeX = null;
    animal.fleeY = null;
  }

  private bolt(animal: Animal, ctx: WildlifeContext): void {
    if (animal.fleeX === null || animal.fleeY === null) {
      // Nowhere to go. Settling is the honest outcome; staying "alarmed" while
      // motionless is a state nothing can get out of.
      animal.alarmedUntil = 0;
      return;
    }
    animal.stamina = Math.max(0, animal.stamina - STAMINA_DRAIN);
    // A spent animal is barely quicker than the person behind it.
    const speed = animal.def.fleeSpeed * (0.45 + 0.55 * animal.stamina);
    const moved = moveToward(
      animal, animal.fleeX, animal.fleeY, speed * MOVE_INTERVAL, ctx.world, ctx.rng
    );
    // Arrived, or cornered. Either way the run is over and it settles.
    if (moved < 0.01 || Math.hypot(animal.fleeX - animal.x, animal.fleeY - animal.y) < 1) {
      animal.alarmedUntil = 0;
      animal.fleeX = null;
      animal.fleeY = null;
    }
  }

  /** Wanders around the herd's centre, coming back when it strays too far. */
  private graze(
    animal: Animal,
    centre: { x: number; y: number } | undefined,
    ctx: WildlifeContext
  ): void {
    animal.alarmedUntil = 0;
    animal.stamina = Math.min(1, animal.stamina + STAMINA_RECOVERY);
    if (!centre) return;

    const away = Math.hypot(animal.x - centre.x, animal.y - centre.y);
    const tx = away > HERD_SPREAD
      ? centre.x
      : animal.x + ctx.rng.range(-2, 2);
    const ty = away > HERD_SPREAD
      ? centre.y
      : animal.y + ctx.rng.range(-2, 2);

    moveToward(animal, tx, ty, animal.def.speed * MOVE_INTERVAL * 0.35, ctx.world, ctx.rng);
  }
}

/**
 * How close this person can get before this animal notices them.
 *
 * Two terms, and they are different things on purpose. The `track` skill is
 * practice — at skill 0 an animal notices you at its full awareness, at 100 you
 * halve it. `stealthFactor` is knowledge: someone who has been taught to read a
 * trail also knows how to approach one, and shrinks it again.
 */
export function noticeRadius(animal: Animal, person: Person): number {
  const practice = 1 - (person.skills.track / 100) * 0.5;
  return animal.def.awareness * practice * stealthFactor(person);
}
