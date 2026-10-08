import { describe, expect, it } from 'vitest';
import { edgeOfTile, neighbourComarca } from '../world/ComarcaNeighbour';
import type { WorldFrame } from '../core/Simulation';

describe('neighbourComarca', () => {
  const frame: WorldFrame = {
    originX: 10,
    originY: 5,
    comarcasWide: 1,
    comarcasHigh: 1,
    mapWidth: 20,
    mapHeight: 12,
  };

  it('wraps east across the seam, same as comarcaAtTile', () => {
    expect(neighbourComarca(frame, 19, 5, 'e')).toEqual({ cx: 0, cy: 5 });
  });

  it('wraps west across the seam', () => {
    expect(neighbourComarca(frame, 0, 5, 'w')).toEqual({ cx: 19, cy: 5 });
  });

  it('steps north and south within bounds', () => {
    expect(neighbourComarca(frame, 10, 5, 'n')).toEqual({ cx: 10, cy: 4 });
    expect(neighbourComarca(frame, 10, 5, 's')).toEqual({ cx: 10, cy: 6 });
  });

  it('has no comarca north of row 0, or south of the last row', () => {
    expect(neighbourComarca(frame, 10, 0, 'n')).toBeNull();
    expect(neighbourComarca(frame, 10, frame.mapHeight - 1, 's')).toBeNull();
  });

  it('does not wrap latitude even at the map edges', () => {
    // A bug here would wrap cy the same way cx wraps; the globe has poles.
    expect(neighbourComarca(frame, 19, 0, 'n')).toBeNull();
    expect(neighbourComarca(frame, 0, frame.mapHeight - 1, 's')).toBeNull();
  });
});

describe('edgeOfTile', () => {
  const map = { width: 10, height: 8, inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < 10 && y < 8 };

  it('reports north and south on the first and last row', () => {
    expect(edgeOfTile(map, 5, 0)).toBe('n');
    expect(edgeOfTile(map, 5, 7)).toBe('s');
  });

  it('reports east and west on the first and last column', () => {
    expect(edgeOfTile(map, 0, 4)).toBe('w');
    expect(edgeOfTile(map, 9, 4)).toBe('e');
  });

  it('prefers north/south over east/west in a corner', () => {
    expect(edgeOfTile(map, 0, 0)).toBe('n');
    expect(edgeOfTile(map, 9, 7)).toBe('s');
  });

  it('is null away from any edge, and off the map', () => {
    expect(edgeOfTile(map, 5, 4)).toBeNull();
    expect(edgeOfTile(map, -1, 4)).toBeNull();
    expect(edgeOfTile(map, 5, 8)).toBeNull();
  });
});
