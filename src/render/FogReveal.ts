import { PLACE_CELL_SIZE } from '../sim/social/PlaceMemory.ts';
import type { FogRevealRecord } from '../sim/persistence/SaveFile.ts';

/**
 * What the fog of war lets through after the player changes character (M15
 * step 0 D, owner 2026-10-08): only what the new character can see from where
 * they stand; everything else black, "as if they had never moved further".
 *
 * **Presentation only.** The character's own `PlaceMemory` is untouched, so in
 * automatic mode their brain still knows the river, the berries and the herds
 * it has walked past. (Clearing the memory instead would have a character you
 * swap to and leave running die of thirst beside a river it had known all
 * its life.) The brain reads `PlaceMemory`; this reads nothing but its own
 * grid, and is reset when the character on screen changes. It is saved as
 * presentation state so loading keeps the same observer and explored cells.
 *
 * The character the game began with has no reveal at all (`active` is false):
 * their map is what they have explored. Only a *change* of observer starts one.
 */
export class FogReveal {
  private observerId: number | null = null;
  private cells = new Uint8Array(0);
  private cols = 0;
  private rows = 0;
  /** True once the observer has changed at least once since the world began. */
  active = false;
  /** Bumped whenever a cell is revealed or the grid is reset, for renderer caches. */
  revision = 0;

  /** A remembered or currently explored cell is dim; a never-seen cell is black. */
  static cellAppearance(remembered: boolean, revealed: boolean): 'dimmed' | 'black' {
    return remembered || revealed ? 'dimmed' : 'black';
  }

  /** A new world: forget the observer and every cell. */
  reset(): void {
    this.observerId = null; this.active = false; this.cells = new Uint8Array(0);
    this.cols = 0; this.rows = 0; this.revision++;
  }

  /**
   * Note who the screen is drawn for. A different person than before starts a
   * fresh reveal; `null` (nobody between a death and the heir) changes nothing.
   */
  follow(observerId: number | null): void {
    if (observerId === null || observerId === this.observerId) return;
    if (this.observerId !== null) {
      this.active = true;
      this.cells.fill(0);
      this.revision++;
    }
    this.observerId = observerId;
  }

  /** Reveal each cell touched by `radius` around `(x, y)`, including the rim. */
  observe(x: number, y: number, radius: number, width: number, height: number): void {
    if (!this.active) return;
    const cols = Math.ceil(width / PLACE_CELL_SIZE);
    const rows = Math.ceil(height / PLACE_CELL_SIZE);
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols; this.rows = rows;
      this.cells = new Uint8Array(cols * rows);
      this.revision++;
    }
    const minX = Math.max(0, Math.floor((x - radius) / PLACE_CELL_SIZE));
    const maxX = Math.min(cols - 1, Math.floor((x + radius) / PLACE_CELL_SIZE));
    const minY = Math.max(0, Math.floor((y - radius) / PLACE_CELL_SIZE));
    const maxY = Math.min(rows - 1, Math.floor((y + radius) / PLACE_CELL_SIZE));
    let changed = false;
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const left = cx * PLACE_CELL_SIZE;
        const top = cy * PLACE_CELL_SIZE;
        const right = Math.min(width, left + PLACE_CELL_SIZE);
        const bottom = Math.min(height, top + PLACE_CELL_SIZE);
        const dx = Math.max(left - x, 0, x - right);
        const dy = Math.max(top - y, 0, y - bottom);
        if (dx * dx + dy * dy > radius * radius) continue;
        const index = cy * cols + cx;
        if (this.cells[index] === 0) { this.cells[index] = 1; changed = true; }
      }
    }
    if (changed) this.revision++;
  }

  /** Whether the fog may show what is remembered at this point. */
  shows(x: number, y: number): boolean {
    if (!this.active) return true;
    const cx = Math.floor(x / PLACE_CELL_SIZE);
    const cy = Math.floor(y / PLACE_CELL_SIZE);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return false;
    return this.cells[cy * this.cols + cx] === 1;
  }

  /** Save the presentation-only reveal separately from simulation memory. */
  snapshot(): FogRevealRecord {
    return { observerId: this.observerId, active: this.active, cols: this.cols, rows: this.rows,
      cells: Array.from(this.cells) };
  }

  /** Restore the exact revealed grid before the renderer draws the loaded world. */
  restore(record: FogRevealRecord, width: number, height: number): void {
    const expectedCols = Math.ceil(width / PLACE_CELL_SIZE);
    const expectedRows = Math.ceil(height / PLACE_CELL_SIZE);
    if ((record.cols === 0 && record.rows === 0 && record.cells.length === 0 && !record.active) ||
        (record.cols === expectedCols && record.rows === expectedRows && record.cells.length === expectedCols * expectedRows)) {
      this.observerId = record.observerId;
      this.active = record.active;
      this.cols = record.cols;
      this.rows = record.rows;
      this.cells = Uint8Array.from(record.cells);
      this.revision++;
      return;
    }
    throw new TypeError('Invalid saved fog dimensions');
  }
}
