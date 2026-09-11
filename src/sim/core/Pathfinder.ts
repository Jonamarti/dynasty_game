/**
 * A* over the world's own tile arrays.
 *
 * A world query, like `World.sameRegion` and `World.findWalkableNear` — not a
 * system, so it can be used by `MovementSystem`, the harness checks, and later
 * `Brain` without any of them importing a system. `Simulation` constructs
 * exactly one and exposes it `readonly`, so the checks measure the same
 * instance the simulation actually walks people with.
 *
 * **8-connected, not 4.** Travel time is load-bearing here: `MovementSystem`'s
 * base speed already once killed whole bands on the walk to the river, and a
 * 4-connected route is up to 41% longer than the diagonal it replaces — a
 * change to the food economy dressed as a pathfinding decision. Greedy
 * steering already moves along an arbitrary float vector, so a diagonal leg
 * needs no new machinery in `MovementSystem`.
 *
 * **The corner rule** — a diagonal step by `(dx, dy)` is legal only if
 * `isWalkable(x + dx, y)` *and* `isWalkable(x, y + dy)` — earns its keep three
 * times over: it stops the route clipping the corner of a rock or a lagoon; it
 * keeps 8-connected reachability *identical* to `World.region`'s 4-connected
 * flood fill (any legal diagonal implies a two-step orthogonal detour through
 * a tile the rule just tested), so `sameRegion` stays a sound precondition and
 * the oracle `Brain` trusts keeps its promise; and it guarantees the tiles
 * either side of a compressed diagonal run are walkable under floating-point
 * error.
 *
 * **No RNG.** The constructor takes none — the type system enforces it. Every
 * tie-break in the search is positional (`f`, then `h`, then tile index), so
 * this class never touches a draw the simulation shares. The `h` tie-break is
 * not cosmetic: exact-`h` A* ordered by `f` alone expands the whole
 * equal-`f` plateau — roughly 2,000 expansions on a 25-tile errand instead of
 * roughly 100.
 *
 * **Zero allocation per query.** All scratch is sized once, at construction,
 * to `n = width * height`. A `gen` counter stamps `seen`/`closed` instead of
 * clearing them, so a query touching 200 tiles costs 200 writes, not `n`. See
 * `newGeneration` for what happens when that counter would wrap a `Uint32`.
 *
 * **Region pre-check before the heap is touched.** "Explore the whole
 * landmass and then fail" — the only search shape big enough to break
 * `perf-budget` — is structurally impossible: `find` refuses a cross-region
 * query before expanding a single node. `NoRoute` is therefore a statement
 * about the world, never about the search.
 *
 * **Goal snapping** via `World.findWalkableNear` when the goal tile itself is
 * unwalkable. Unused today — every building footprint is already walkable —
 * but it is the cheap half of the machinery a fishing spot standing over water
 * will need later.
 *
 * **Tiles are truncated, never rounded** (`x | 0`), because `World.isWalkable`
 * truncates too. Disagreeing at a tile edge is exactly how a walker used to
 * end up aiming into a rock.
 *
 * **One tile can be asked to be avoided**, as a penalty rather than a wall —
 * see `AVOID_PENALTY`. `MovementSystem` uses it when a walker has been stuck
 * long enough to want a route that is *different*, which a deterministic
 * search over an unchanged world will otherwise never give it.
 *
 * **Reconstruction compresses collinear runs only.** A forty-tile route
 * becomes four to eight waypoints. No string-pulling or any-angle smoothing —
 * a line-of-sight shortcut between distant waypoints is how a walker would
 * cross the corner of a river, and the corner rule only protects steps
 * between *adjacent* tiles. The start and goal tiles are never waypoints
 * themselves: the caller already knows where it started, and the final leg
 * aims at the real float target it was asked for, not at the goal's tile
 * centre — which is what keeps `MovementSystem`'s 0.6-tile arrival radius
 * exact.
 *
 * **Not reentrant.** One shared scratch set per instance; a caller that wants
 * the result of `find` has to read `route`/`routeLength` before calling it
 * again.
 */
import type { World } from './World.ts';
import { telemetry } from './Telemetry.ts';

export const enum PathStatus { Found = 0, AlreadyThere = 1, NoRoute = 2, GaveUp = 3 }

/**
 * A bail-out, not a working limit — roughly half a 128x128 map.
 *
 * It was 2,000, and that was below the *known* requirement: `paths-are-found`
 * samples tile pairs on `century`'s largest region and reports a worst case of
 * 4,218 expansions, so the cap sat under the legitimate worst search the
 * harness itself measures. Real play hit it on about 1% of searches for the
 * whole of M7, and the consequence was not a slightly worse route — it was no
 * route at all, a walker greedy-steering into a shoreline, and eventually an
 * abandoned errand. The bail-out was manufacturing the stuck walkers this pass
 * exists to fix.
 *
 * Raising it is also *free*, which took measuring to believe: on `century`,
 * 2,000 -> 4,000 took `path_gave_up` from 2,011 to zero and steps/s from 2,634
 * *up* to 2,848, because a search that runs to the cap is by definition the
 * most expensive kind and does no useful work at the end of it. 4,000, 6,000
 * and 10,000 produce byte-identical worlds, so nothing in play needs more than
 * 4,000 and this is genuine headroom rather than a tuned number.
 */
export const DEFAULT_MAX_EXPANSIONS = 8000;

/**
 * Extra cost, in tiles, for entering the one tile a caller asked `find` to
 * avoid.
 *
 * Additive, never a hard block, and the distinction is load-bearing. Removing
 * a tile from the graph would break the equivalence between this graph's
 * reachability and `World.region`'s that the whole region pre-check rests on:
 * on a one-tile isthmus the search would expand the entire landmass and fall
 * through to `NoRoute` — the single search shape `perf-budget` cannot survive
 * — and it would do it in the recovery path, which by definition only runs
 * when something has already gone wrong. As a penalty it routes around the
 * tile whenever any local detour exists, still routes through when that tile
 * is the only way, and needs no fallback second search.
 *
 * Eight tiles because a detour worth taking to get unstuck is a short one; a
 * walker who would have to go eight tiles out of their way to avoid the tile
 * they are pressed against is better off pressing.
 */
export const AVOID_PENALTY = 8;

const SQRT2 = Math.SQRT2;

/**
 * The eight neighbour offsets, orthogonal and diagonal alternating, and their
 * step costs in the same order. Module-level rather than rebuilt per query or
 * per node — nothing about a query needs to allocate one.
 */
const NEIGHBOR_DX = [1, 1, 0, -1, -1, -1, 0, 1];
const NEIGHBOR_DY = [0, 1, 1, 1, 0, -1, -1, -1];
const NEIGHBOR_COST = [1, SQRT2, 1, SQRT2, 1, SQRT2, 1, SQRT2];

/** Octile distance: exact for 8-connected uniform-cost movement. */
function octile(x1: number, y1: number, x2: number, y2: number): number {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
}

export class Pathfinder {
  /** Flattened waypoints, `[x0, y0, x1, y1, …]`. Valid for `routeLength` entries. */
  readonly route: Int16Array;
  /** Waypoints in `route`, not elements — so the element count is `routeLength * 2`. */
  routeLength = 0;
  /** Nodes expanded by the most recent `find` call. */
  lastExpanded = 0;

  private readonly n: number;
  private readonly width: number;

  // One generation stamp per tile, compared against `gen` rather than cleared
  // between queries — see `newGeneration`.
  private gen = 1;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;

  private readonly gScore: Float32Array;
  private readonly hScore: Float32Array;
  private readonly fScore: Float32Array;
  private readonly cameFrom: Int32Array;

  // A binary min-heap of tile indices, ordered by `less`. Lazy deletion: a
  // tile can be pushed more than once when a cheaper route to it is found: no
  // decrease-key on a plain array heap without a position index, and simpler
  // to skip a stale pop than to maintain one. `heap` grows (doubling from
  // 1,024) rather than being fixed, because lazy deletion means the heap can
  // briefly hold more entries than there are tiles seen.
  private heap: Int32Array;
  private heapSize = 0;

  // Scratch for `reconstruct`'s backward walk over `cameFrom`, before it is
  // reversed and compressed into `route`. Not in the plan's own inventory of
  // scratch arrays, but the same one-allocation-per-instance rule applies to
  // it: sized to the one case that matters, a route touching every tile.
  private readonly rawPath: Int32Array;

  constructor(private readonly world: World) {
    this.width = world.width;
    this.n = world.width * world.height;

    this.seen = new Uint32Array(this.n);
    this.closed = new Uint32Array(this.n);
    this.gScore = new Float32Array(this.n);
    this.hScore = new Float32Array(this.n);
    this.fScore = new Float32Array(this.n);
    this.cameFrom = new Int32Array(this.n);
    this.rawPath = new Int32Array(this.n);
    this.heap = new Int32Array(1024);
    this.route = new Int16Array(this.n * 2);
  }

  /**
   * Whether two points sit on the same walkable landmass, snapping the goal
   * off unwalkable ground first exactly as `find` does.
   *
   * O(1): the corner rule keeps 8-connected reachability identical to
   * `World.region`'s 4-connected flood fill, so `sameRegion` already answers
   * this without a search. For the health checks, which ask it hundreds of
   * times a run.
   */
  reachable(fromX: number, fromY: number, toX: number, toY: number): boolean {
    const fx = fromX | 0;
    const fy = fromY | 0;
    if (!this.world.isWalkable(fx, fy)) return false;
    const goal = this.snapGoal(toX, toY);
    if (!goal) return false;
    return this.world.sameRegion(fx, fy, goal.x, goal.y);
  }

  /**
   * Finds a route from `(fromX, fromY)` to `(toX, toY)`, leaving it in
   * `route`/`routeLength`. The result is only valid until the next call.
   */
  find(
    fromX: number, fromY: number, toX: number, toY: number,
    maxExpansions = DEFAULT_MAX_EXPANSIONS,
    avoidIndex = -1
  ): PathStatus {
    const fx = fromX | 0;
    const fy = fromY | 0;
    this.routeLength = 0;
    this.lastExpanded = 0;

    const goal = this.snapGoal(toX, toY);
    if (!goal) {
      telemetry.count('path_no_route');
      return PathStatus.NoRoute;
    }
    const tx = goal.x;
    const ty = goal.y;

    if (fx === tx && fy === ty) return PathStatus.AlreadyThere;

    if (!this.world.isWalkable(fx, fy) || !this.world.sameRegion(fx, fy, tx, ty)) {
      telemetry.count('path_no_route');
      return PathStatus.NoRoute;
    }

    this.newGeneration();
    this.heapSize = 0;

    const width = this.width;
    const startIndex = fy * width + fx;
    const goalIndex = ty * width + tx;

    this.seen[startIndex] = this.gen;
    this.gScore[startIndex] = 0;
    const h0 = octile(fx, fy, tx, ty);
    this.hScore[startIndex] = h0;
    this.fScore[startIndex] = h0;
    this.cameFrom[startIndex] = -1;
    this.heapPush(startIndex);

    let expanded = 0;

    while (this.heapSize > 0) {
      const current = this.heapPop();
      if (this.closed[current] === this.gen) continue; // stale lazy-deleted entry
      this.closed[current] = this.gen;
      expanded++;

      if (current === goalIndex) {
        this.lastExpanded = expanded;
        telemetry.count('path_expanded', expanded);
        telemetry.max('path_worst_expanded', expanded);
        telemetry.count('path_found');
        this.reconstruct(startIndex, goalIndex);
        return PathStatus.Found;
      }

      if (expanded >= maxExpansions) {
        this.lastExpanded = expanded;
        telemetry.count('path_expanded', expanded);
        telemetry.max('path_worst_expanded', expanded);
        telemetry.count('path_gave_up');
        return PathStatus.GaveUp;
      }

      const cx = current % width;
      const cy = (current - cx) / width;

      for (let i = 0; i < 8; i++) {
        const dx = NEIGHBOR_DX[i]!;
        const dy = NEIGHBOR_DY[i]!;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.world.isWalkable(nx, ny)) continue;
        // Corner rule: a diagonal step may not clip the corner of an
        // unwalkable tile either side of it.
        if (dx !== 0 && dy !== 0 &&
            (!this.world.isWalkable(cx + dx, cy) || !this.world.isWalkable(cx, cy + dy))) {
          continue;
        }

        const neighbor = ny * width + nx;
        if (this.closed[neighbor] === this.gen) continue;

        // The avoid penalty is charged on *entering* the tile, so it is paid
        // once however the route arrives, and it cannot make a reachable goal
        // unreachable. See `AVOID_PENALTY`.
        const tentativeG = this.gScore[current]! + NEIGHBOR_COST[i]! +
          (neighbor === avoidIndex ? AVOID_PENALTY : 0);
        if (this.seen[neighbor] === this.gen && tentativeG >= this.gScore[neighbor]!) continue;

        this.cameFrom[neighbor] = current;
        this.gScore[neighbor] = tentativeG;
        const h = octile(nx, ny, tx, ty);
        this.hScore[neighbor] = h;
        this.fScore[neighbor] = tentativeG + h;
        this.seen[neighbor] = this.gen;
        this.heapPush(neighbor);
      }
    }

    // Unreachable in practice: the region pre-check above already guarantees
    // a route exists whenever the search actually runs, because the corner
    // rule keeps this graph's reachability identical to `World.region`'s.
    // Kept as a real return rather than an assertion because "never happens"
    // is exactly the kind of claim a terrain edge case likes to disprove.
    this.lastExpanded = expanded;
    telemetry.count('path_expanded', expanded);
    telemetry.max('path_worst_expanded', expanded);
    telemetry.count('path_no_route');
    return PathStatus.NoRoute;
  }

  /** The goal tile, snapped off unwalkable ground via `World.findWalkableNear`. */
  private snapGoal(toX: number, toY: number): { x: number; y: number } | null {
    const tx = toX | 0;
    const ty = toY | 0;
    if (this.world.isWalkable(tx, ty)) return { x: tx, y: ty };
    return this.world.findWalkableNear(tx, ty, 8);
  }

  /**
   * Explicit reset rather than a silent wrap.
   *
   * `seen`/`closed` are `Uint32Array`s compared against `gen` so that a query
   * costs writes proportional to the tiles it touches rather than a clear of
   * the whole map. A `gen` that wrapped past `Uint32` range would truncate on
   * assignment and could collide with an old stamp still sitting in the
   * array, which would mark tiles visited that never were and silently fail
   * every path for the rest of the process — the kind of bug that only shows
   * up after hours of play, in a way no short run reproduces. Reset instead:
   * one `O(n)` clear, astronomically rare (four billion queries between
   * them), and loud in the sense that it is a real, visible branch rather
   * than an invisible wraparound.
   */
  private newGeneration(): void {
    this.gen++;
    if (this.gen >= 0xfffffff0) {
      this.seen.fill(0);
      this.closed.fill(0);
      this.gen = 1;
    }
  }

  /** Heap order: `f`, then `h`, then tile index — the last a pure tie-break. */
  private less(a: number, b: number): boolean {
    const fa = this.fScore[a]!;
    const fb = this.fScore[b]!;
    if (fa !== fb) return fa < fb;
    const ha = this.hScore[a]!;
    const hb = this.hScore[b]!;
    if (ha !== hb) return ha < hb;
    return a < b;
  }

  private heapPush(tileIndex: number): void {
    if (this.heapSize >= this.heap.length) this.growHeap();
    let i = this.heapSize++;
    this.heap[i] = tileIndex;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(this.heap[i]!, this.heap[parent]!)) break;
      this.swapHeap(i, parent);
      i = parent;
    }
  }

  private heapPop(): number {
    const top = this.heap[0]!;
    this.heapSize--;
    this.heap[0] = this.heap[this.heapSize]!;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      const right = i * 2 + 2;
      let smallest = i;
      if (left < this.heapSize && this.less(this.heap[left]!, this.heap[smallest]!)) smallest = left;
      if (right < this.heapSize && this.less(this.heap[right]!, this.heap[smallest]!)) smallest = right;
      if (smallest === i) break;
      this.swapHeap(i, smallest);
      i = smallest;
    }
    return top;
  }

  private swapHeap(i: number, j: number): void {
    const tmp = this.heap[i]!;
    this.heap[i] = this.heap[j]!;
    this.heap[j] = tmp;
  }

  /** Doubling growth. Rare: lazy deletion means the heap can outgrow `n` by a
   *  small factor, but never every tile pushed every neighbour's worth. */
  private growHeap(): void {
    const bigger = new Int32Array(this.heap.length * 2);
    bigger.set(this.heap);
    this.heap = bigger;
  }

  /**
   * Walks `cameFrom` back from the goal to the start, then compresses the
   * result into `route`. See the file header for what "compresses" means and
   * why the start and goal tiles are excluded.
   */
  private reconstruct(startIndex: number, goalIndex: number): void {
    const width = this.width;

    let count = 0;
    let cur = goalIndex;
    while (cur !== startIndex) {
      this.rawPath[count++] = cur;
      cur = this.cameFrom[cur]!;
    }
    // `rawPath[0..count)` is goal..start-adjacent; reverse it in place to get
    // start-adjacent..goal, the order a walker actually travels in.
    for (let i = 0, j = count - 1; i < j; i++, j--) {
      const tmp = this.rawPath[i]!;
      this.rawPath[i] = this.rawPath[j]!;
      this.rawPath[j] = tmp;
    }

    let waypoints = 0;
    // The direction from the start tile to the first step, so the first
    // step itself can be tested for a turn like every other tile.
    let prevDX = (this.rawPath[0]! % width) - (startIndex % width);
    let prevDY = Math.trunc(this.rawPath[0]! / width) - Math.trunc(startIndex / width);

    // Stops one short of `count`: the last raw tile is the goal, which is
    // never a waypoint — the caller's final leg aims at the real float
    // target instead.
    for (let k = 0; k < count - 1; k++) {
      const index = this.rawPath[k]!;
      const nextIndex = this.rawPath[k + 1]!;
      const dx = (nextIndex % width) - (index % width);
      const dy = Math.trunc(nextIndex / width) - Math.trunc(index / width);
      if (dx !== prevDX || dy !== prevDY) {
        this.route[waypoints * 2] = index % width;
        this.route[waypoints * 2 + 1] = Math.trunc(index / width);
        waypoints++;
      }
      prevDX = dx;
      prevDY = dy;
    }

    this.routeLength = waypoints;
  }
}
