/**
 * What each band knows of the land: which kinds of resource its members have
 * seen, and where. M11 phase 14d.
 *
 * **The first memory of places in this game.** Until now every question about
 * where something is was answered by asking the node hash directly — the world
 * as it is, not as anybody has seen it — which is fine for "the bush in front
 * of me" and wrong for "the flint is in the next valley, on their side". A band
 * cannot raid for something it does not know exists, and the owner's rule is
 * that nothing is known that was not seen or told. So this keeps, per band, a
 * coarse grid of the kinds its members have laid eyes on, written from where
 * each of them stands and what they can see.
 *
 * **This is the seed of M12's world map.** The tile map the owner has described
 * for the Spore-like later stages — bands migrating across it, civilisations
 * trading over it — is a map *somebody knows*, and it starts here: a per-band
 * grid, written by sight, read by decisions. Nothing else is migrated onto it
 * in this phase (the plan says so; every other reader of the node hash stays
 * omniscient for now). Only the raid-for-need motive reads it.
 *
 * Deterministic and draw-free: what is recorded is a pure function of where
 * people stand and what grows there, so it runs on `Simulation`'s sighting
 * cadence without a stream of its own — which matters doubly because
 * `BandSystem`'s `rng` is `forestRng`, and one draw there replants every wood.
 */
import type { ResourceNode, ResourceKind } from '../entities/ResourceNode.ts';
import { RESOURCE_KINDS } from '../entities/ResourceNode.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';

/** Tiles per side of one cell. Coarse on purpose: a band remembers "the flint is over there", not a coordinate. */
export const MAP_CELL = 8;

const BIT: Record<ResourceKind, number> = Object.fromEntries(
  RESOURCE_KINDS.map((kind, i) => [kind, 1 << i])) as Record<ResourceKind, number>;

export class BandMaps {
  private readonly cols: number;
  private readonly rows: number;
  private readonly byBand = new Map<number, Uint8Array>();
  private readonly scratch: ResourceNode[] = [];

  constructor(width: number, height: number) {
    this.cols = Math.ceil(width / MAP_CELL);
    this.rows = Math.ceil(height / MAP_CELL);
  }

  private grid(bandId: number): Uint8Array {
    let grid = this.byBand.get(bandId);
    if (!grid) {
      grid = new Uint8Array(this.cols * this.rows);
      this.byBand.set(bandId, grid);
    }
    return grid;
  }

  /**
   * One member looks around. Cells wholly inside their sight are rewritten
   * from what is there now — a patch picked bare since it was last seen is
   * forgotten — and every node in sight that still has something on it marks
   * its cell.
   */
  observe(bandId: number, x: number, y: number, radius: number, nodes: SpatialHash<ResourceNode>): void {
    const grid = this.grid(bandId);
    const minCx = Math.max(0, Math.floor((x - radius) / MAP_CELL));
    const maxCx = Math.min(this.cols - 1, Math.floor((x + radius) / MAP_CELL));
    const minCy = Math.max(0, Math.floor((y - radius) / MAP_CELL));
    const maxCy = Math.min(this.rows - 1, Math.floor((y + radius) / MAP_CELL));
    const r2 = radius * radius;
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        // Wholly in sight: all four corners inside the radius.
        let inside = true;
        for (const [px, py] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          const dx = (cx + px) * MAP_CELL - x;
          const dy = (cy + py) * MAP_CELL - y;
          if (dx * dx + dy * dy > r2) { inside = false; break; }
        }
        if (inside) grid[cy * this.cols + cx] = 0;
      }
    }
    for (const node of nodes.queryRadius(x, y, radius, this.scratch)) {
      if (node.depleted) continue;
      const cx = Math.floor(node.x / MAP_CELL);
      const cy = Math.floor(node.y / MAP_CELL);
      if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue;
      grid[cy * this.cols + cx] |= BIT[node.kind];
    }
  }

  /**
   * The centres of every cell this band knows to hold `kind`, within `radius`
   * of a point. Row by row, so the order — and whatever a caller picks first
   * from it — is the same on every run.
   */
  known(bandId: number, kind: ResourceKind, x: number, y: number, radius: number): { x: number; y: number }[] {
    const grid = this.byBand.get(bandId);
    if (!grid) return [];
    const found: { x: number; y: number }[] = [];
    const r2 = radius * radius;
    const bit = BIT[kind];
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        if ((grid[cy * this.cols + cx]! & bit) === 0) continue;
        const px = (cx + 0.5) * MAP_CELL;
        const py = (cy + 0.5) * MAP_CELL;
        if ((px - x) ** 2 + (py - y) ** 2 <= r2) found.push({ x: px, y: py });
      }
    }
    return found;
  }
}
