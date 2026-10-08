import { PLACE_CELL_SIZE } from '../sim/social/PlaceMemory.ts';

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
 * grid, and is reset when the character on screen changes. It is not saved: a
 * reloaded game shows the whole remembered map of whoever it reloads as.
 *
 * The character the game began with has no reveal at all (`active` is false):
 * their map is what they have explored. Only a *change* of observer starts one.
 */
export class FogReveal {
  private observerId: number | null = null;
  private cells = new Uint8Array(0);
  private cols = 0;
  private rows = 0;
  private lastCell = -1;
  /** True once the observer has changed at least once since the world began. */
  active = false;
  /** Bumped whenever a cell is revealed or the grid is reset, for renderer caches. */
  revision = 0;

  /** A new world: forget the observer and every cell. */
  reset(): void {
    this.observerId = null; this.active = false; this.cells = new Uint8Array(0);
    this.cols = 0; this.rows = 0; this.lastCell = -1; this.revision++;
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
      this.lastCell = -1;
      this.revision++;
    }
    this.observerId = observerId;
  }

  /** Reveal the cells whose centres lie within `radius` of `(x, y)`. */
  observe(x: number, y: number, radius: number, width: number, height: number): void {
    if (!this.active) return;
    const cols = Math.ceil(width / PLACE_CELL_SIZE);
    const rows = Math.ceil(height / PLACE_CELL_SIZE);
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols; this.rows = rows;
      this.cells = new Uint8Array(cols * rows);
      this.lastCell = -1;
      this.revision++;
    }
    const here = Math.floor(y / PLACE_CELL_SIZE) * cols + Math.floor(x / PLACE_CELL_SIZE);
    if (here === this.lastCell) return;
    this.lastCell = here;
    const minX = Math.max(0, Math.floor((x - radius) / PLACE_CELL_SIZE));
    const maxX = Math.min(cols - 1, Math.floor((x + radius) / PLACE_CELL_SIZE));
    const minY = Math.max(0, Math.floor((y - radius) / PLACE_CELL_SIZE));
    const maxY = Math.min(rows - 1, Math.floor((y + radius) / PLACE_CELL_SIZE));
    let changed = false;
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const dx = cx * PLACE_CELL_SIZE + PLACE_CELL_SIZE / 2 - x;
        const dy = cy * PLACE_CELL_SIZE + PLACE_CELL_SIZE / 2 - y;
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
}
