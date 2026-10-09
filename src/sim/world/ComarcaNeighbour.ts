import type { WorldFrame } from '../core/Simulation';

/** The four directions a local map's edge, or a comarca grid, can be crossed in. */
export type ComarcaEdge = 'n' | 's' | 'e' | 'w';

/**
 * The comarca one step away from (cx, cy) in the global comarca grid, in the
 * direction `dir`. Longitude wraps (`comarcaAtTile` in Simulation.ts does the
 * same for `cx`), because the globe has no eastmost comarca. Latitude does
 * not: `null` north of row 0 or south of the last row, because there is no
 * comarca past the pole to migrate into.
 */
export function neighbourComarca(
  frame: Pick<WorldFrame, 'mapWidth' | 'mapHeight'>,
  cx: number,
  cy: number,
  dir: ComarcaEdge,
): { cx: number; cy: number } | null {
  switch (dir) {
    case 'e':
      return { cx: (cx + 1) % frame.mapWidth, cy };
    case 'w':
      return { cx: (cx - 1 + frame.mapWidth) % frame.mapWidth, cy };
    case 'n':
      return cy > 0 ? { cx, cy: cy - 1 } : null;
    case 's':
      return cy < frame.mapHeight - 1 ? { cx, cy: cy + 1 } : null;
  }
}

/** The slice of `World` that `edgeOfTile` needs: no sim-wide import required. */
export interface EdgeMap {
  readonly width: number;
  readonly height: number;
  inBounds(x: number, y: number): boolean;
}

/**
 * Which edge of the local map a tile sits on, or `null` if it is not on an
 * edge at all. Row 0 is north and the last row is south, matching
 * `comarcaAtTile`'s `originY`-increases-southward convention. A tile in a
 * corner reports north/south over east/west, since that is the side crossed
 * on the usual straight approach to a corner.
 */
export function edgeOfTile(map: EdgeMap, x: number, y: number): ComarcaEdge | null {
  if (!map.inBounds(x, y)) return null;
  if (y === 0) return 'n';
  if (y === map.height - 1) return 's';
  if (x === 0) return 'w';
  if (x === map.width - 1) return 'e';
  return null;
}

