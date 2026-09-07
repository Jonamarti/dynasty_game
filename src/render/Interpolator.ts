/**
 * Where to draw a moving thing between two simulation steps.
 *
 * The simulation runs at `tickRate` — five steps a second by default — and the
 * renderer runs at whatever the display gives it, usually sixty frames. Every
 * drawable read its position straight off the simulation, so each position was
 * painted for twelve identical frames and then jumped. At zoom 2 a person's
 * step is about ten pixels, so the whole world moved in five visible lurches a
 * second while the machine had capacity to spare. The frames were never the
 * problem; the missing fraction of a step was.
 *
 * The fix is the standard one: keep where a thing was, and draw it at
 * `previous + (current - previous) * alpha`. What is not standard here is the
 * *window*, and it is the part that matters.
 *
 * ## Why a per-entity window, and not one alpha for everybody
 *
 * `WildlifeSystem` moves each animal one tick in five, at five times the speed,
 * on a stagger keyed to its id — a deliberate optimisation, since wildlife is
 * the largest population in the world and the least interesting per tick. At
 * five steps a second that means **an animal moves once per real second**.
 * Interpolating it against the immediately preceding step would slide it across
 * its whole jump in a fifth of a second and then hold it still for four fifths:
 * a 1 Hz twitch, and visibly worse than not interpolating at all.
 *
 * So each entity carries its own span — how many steps its current move was
 * spread over — measured by watching when its position actually changes. A
 * person, who moves every step, gets a span of 1 and therefore exactly the
 * textbook formula. An animal gets a span of 5 and glides. One rule covers
 * both, and it will keep covering them if either stagger is ever retuned.
 *
 * ## What this is not
 *
 * Purely presentational, like `Floaters`. Nothing here is simulation state,
 * nothing here is read back by `src/sim/`, and the headless harness never
 * constructs one — which is why interpolation could not affect determinism even
 * if it wanted to.
 *
 * ## Kinds are kept apart
 *
 * `Person` and `Animal` number themselves from separate counters, so person 5
 * and animal 5 both exist and are different creatures. Keyed on the bare id,
 * they overwrite each other's track, and what is drawn is a person interpolated
 * across the gap to wherever an unrelated deer happens to be — measured at
 * sixty-five tiles before an e2e spec caught it. Every entry is therefore keyed
 * by kind as well, and the caller names the kind at both ends.
 *
 * Hit-testing deliberately still asks the simulation's spatial hashes rather
 * than these positions, so what is drawn and what is clickable can differ by up
 * to one step of movement — 0.32 tiles at `BASE_SPEED`. `GRAB_MARGIN` and the
 * hit radii absorb it comfortably. Chasing the drawn position into the picker
 * would mean the renderer answering questions about where things are, which is
 * the wrong direction for this dependency.
 */

interface Track {
  prevX: number;
  prevY: number;
  curX: number;
  curY: number;
  /** Steps the current move was spread over. Never below 1. */
  span: number;
  /** Steps completed since `cur` was set. */
  age: number;
  /** Capture number this was last seen on, for sweeping the dead out. */
  seen: number;
}

export interface Moving {
  id: number;
  x: number;
  y: number;
}

export interface Placed {
  x: number;
  y: number;
}

export class Interpolator {
  private tracks = new Map<string, Track>();
  private captures = new Map<string, number>();

  /**
   * Records where one kind of thing is, once per completed simulation step.
   *
   * Must be called *inside* the fixed-step loop rather than once a frame: with
   * the speed slider at 120 steps a second the loop runs several steps per
   * frame, and the previous position worth drawing from is the one before the
   * last step, not the one before the first.
   */
  capture(kind: string, entities: Iterable<Moving>): void {
    const captures = (this.captures.get(kind) ?? 0) + 1;
    this.captures.set(kind, captures);

    for (const entity of entities) {
      const key = kind + ':' + entity.id;
      const track = this.tracks.get(key);
      if (!track) {
        // Anything seen for the first time appears where it is rather than
        // sliding in. A newborn interpolated from a missing previous position
        // would fly in from the top-left corner of the world.
        this.tracks.set(key, {
          prevX: entity.x, prevY: entity.y,
          curX: entity.x, curY: entity.y,
          span: 1, age: 0, seen: captures,
        });
        continue;
      }
      track.seen = captures;
      if (entity.x === track.curX && entity.y === track.curY) {
        // Standing still, or between moves on a staggered cycle. Either way the
        // span of the *next* move is at least this long.
        track.age++;
        continue;
      }
      track.prevX = track.curX;
      track.prevY = track.curY;
      track.curX = entity.x;
      track.curY = entity.y;
      // How long the move that just happened took to arrive. `age` counts the
      // steps since the last change, so the move spanned that many steps plus
      // the one it landed on.
      track.span = Math.max(1, track.age + 1);
      track.age = 0;
    }

    // Sweep whatever was not seen. Without this the map keeps every person and
    // animal that ever lived, and a century run kills a great many of both.
    if (captures % 64 !== 0) return;
    const prefix = kind + ':';
    for (const [key, track] of this.tracks) {
      if (key.startsWith(prefix) && track.seen !== captures) this.tracks.delete(key);
    }
  }

  /**
   * Where to draw `entity` this frame.
   *
   * `alpha` is the fraction of a step elapsed since the last one. An entity
   * nobody has captured yet is drawn where it says it is, which is the right
   * answer for the frame something is born on.
   */
  at(kind: string, entity: Moving, alpha: number): Placed {
    const track = this.tracks.get(kind + ':' + entity.id);
    if (!track) return { x: entity.x, y: entity.y };
    // Where this entity is through *its own* move, which for anything on a
    // stagger is a good deal slower than the step clock.
    const t = Math.min(1, (track.age + alpha) / track.span);
    return {
      x: track.prevX + (track.curX - track.prevX) * t,
      y: track.prevY + (track.curY - track.prevY) * t,
    };
  }

  /** Drops everything. Used when the world underneath is replaced. */
  clear(): void {
    this.tracks.clear();
    this.captures.clear();
  }
}
