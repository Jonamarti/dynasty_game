/**
 * Uniform-grid spatial hash for proximity queries.
 *
 * This exists because the previous project (gods-simulator) scanned every entity
 * for every "nearest X" question, making per-step cost quadratic in population
 * and putting a hard ceiling on the world size. Every proximity question in this
 * game — vision, witnesses, targets, conversation partners, crowding — goes
 * through here instead, which makes them O(k) in the number of nearby entities
 * rather than O(n) in the number of entities that exist.
 *
 * The grid is rebuilt from scratch each tick (`clear` + `insert` per entity).
 * That is cheaper and far less bug-prone than incremental cell updates, and it
 * cannot drift out of sync with the truth the way a stale index can.
 */

export interface HasPosition {
  x: number;
  y: number;
}

export class SpatialHash<T extends HasPosition> {
  private cells = new Map<number, T[]>();
  private readonly invCellSize: number;

  /** `cellSize` should be about the radius of the most common query. */
  constructor(public readonly cellSize = 8) {
    this.invCellSize = 1 / cellSize;
  }

  private key(cx: number, cy: number): number {
    // Pack two signed 16-bit cell coordinates into one integer key. World
    // coordinates never approach +/-32k tiles, so this cannot collide in practice.
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const k = this.key(
      Math.floor(item.x * this.invCellSize),
      Math.floor(item.y * this.invCellSize)
    );
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(item);
    else this.cells.set(k, [item]);
  }

  rebuild(items: Iterable<T>): void {
    this.clear();
    for (const item of items) this.insert(item);
  }

  /**
   * Everything within `radius` of (x, y), unfiltered by exact distance —
   * callers that need a circle rather than the covering square must test
   * distance themselves. `out` is reused to avoid allocating per query.
   */
  queryRadius(x: number, y: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const minCx = Math.floor((x - radius) * this.invCellSize);
    const maxCx = Math.floor((x + radius) * this.invCellSize);
    const minCy = Math.floor((y - radius) * this.invCellSize);
    const maxCy = Math.floor((y + radius) * this.invCellSize);
    const r2 = radius * radius;

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const item of bucket) {
          const dx = item.x - x;
          const dy = item.y - y;
          if (dx * dx + dy * dy <= r2) out.push(item);
        }
      }
    }
    return out;
  }

  /**
   * The closest item to (x, y) within `radius` satisfying `filter`, or null.
   * Searches rings of cells outward and stops as soon as no closer item can
   * exist, so a dense world costs little more than a sparse one.
   */
  findNearest(
    x: number,
    y: number,
    radius: number,
    filter?: (item: T) => boolean
  ): T | null {
    const maxRing = Math.ceil(radius * this.invCellSize);
    const cx0 = Math.floor(x * this.invCellSize);
    const cy0 = Math.floor(y * this.invCellSize);

    let best: T | null = null;
    let bestDist2 = radius * radius;

    for (let ring = 0; ring <= maxRing; ring++) {
      // Once we hold a candidate closer than this ring's nearest possible
      // point, no further ring can improve on it.
      if (best) {
        const ringMinDist = (ring - 1) * this.cellSize;
        if (ringMinDist > 0 && ringMinDist * ringMinDist > bestDist2) break;
      }
      for (let cy = cy0 - ring; cy <= cy0 + ring; cy++) {
        for (let cx = cx0 - ring; cx <= cx0 + ring; cx++) {
          // Only the ring's perimeter is new; the interior was covered already.
          const onPerimeter =
            ring === 0 ||
            cx === cx0 - ring || cx === cx0 + ring ||
            cy === cy0 - ring || cy === cy0 + ring;
          if (!onPerimeter) continue;

          const bucket = this.cells.get(this.key(cx, cy));
          if (!bucket) continue;
          for (const item of bucket) {
            if (filter && !filter(item)) continue;
            const dx = item.x - x;
            const dy = item.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist2) {
              bestDist2 = d2;
              best = item;
            }
          }
        }
      }
    }
    return best;
  }

  /** Diagnostics for the health report: how well the grid is spreading load. */
  stats(): { cells: number; items: number; maxBucket: number } {
    let items = 0;
    let maxBucket = 0;
    for (const bucket of this.cells.values()) {
      items += bucket.length;
      if (bucket.length > maxBucket) maxBucket = bucket.length;
    }
    return { cells: this.cells.size, items, maxBucket };
  }
}
