/** Natural Earth's retained 1:10m river geometry. No simulation RNG or runtime
 * network access. A shared spatial index keeps per-tile sampling local. */
import data from '../../data/earthRivers.json';
import { SpatialHash } from '../core/SpatialHash.ts';

interface Segment {
  x: number; y: number; ax: number; ay: number; bx: number; by: number;
  name: string; rank: number; along: number;
}
export interface EarthRiverSample {
  distance: number; halfWidth: number; along: number; major: boolean;
  flow: { x: number; y: number }; name: string;
}
const WIDTH = 960, HEIGHT = 480;
let index: SpatialHash<Segment> | null = null;
const nearby: Segment[] = [];

function riverIndex(): SpatialHash<Segment> {
  if (index) return index;
  index = new SpatialHash<Segment>(1);
  for (const river of data) for (const part of river.parts) {
    let along = 0;
    for (let i = 2; i < part.length; i += 2) {
      const ax = (part[i - 2]! + 180) / 360 * WIDTH, ay = (90 - part[i - 1]!) / 180 * HEIGHT;
      let bx = (part[i]! + 180) / 360 * WIDTH;
      bx += Math.round((ax - bx) / WIDTH) * WIDTH;
      const by = (90 - part[i + 1]!) / 180 * HEIGHT;
      const length = Math.hypot(bx - ax, by - ay);
      // Bound midpoint distance so a radius query cannot miss a long segment.
      const pieces = Math.max(1, Math.ceil(length / 0.4));
      for (let p = 0; p < pieces; p++) {
        const x0 = ax + (bx - ax) * p / pieces, y0 = ay + (by - ay) * p / pieces;
        const x1 = ax + (bx - ax) * (p + 1) / pieces, y1 = ay + (by - ay) * (p + 1) / pieces;
        for (const shift of [-WIDTH, 0, WIDTH]) {
          const x = (x0 + x1) / 2 + shift;
          if (x < -1 || x > WIDTH + 1) continue;
          index.insert({ x, y: (y0 + y1) / 2, ax: x0 + shift, ay: y0, bx: x1 + shift, by: y1,
            name: river.name, rank: river.rank, along: along + length * p / pieces });
        }
      }
      along += length;
    }
  }
  return index;
}

/** Widths are legible gameplay classes, not surveyed bank widths. Keeping
 * them in global comarca units prevents resolution changes resizing a river. */
export function sampleEarthRiver(x: number, y: number, width = WIDTH, height = HEIGHT): EarthRiverSample | null {
  const gx = ((x / width * WIDTH) % WIDTH + WIDTH) % WIDTH, gy = y / height * HEIGHT;
  let best: EarthRiverSample | null = null;
  for (const segment of riverIndex().queryRadius(gx, gy, 0.5, nearby)) {
    const vx = segment.bx - segment.ax, vy = segment.by - segment.ay;
    const length2 = vx * vx + vy * vy;
    if (length2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((gx - segment.ax) * vx + (gy - segment.ay) * vy) / length2));
    const distance = Math.hypot(gx - segment.ax - t * vx, gy - segment.ay - t * vy);
    const halfWidth = 0.025 + Math.max(0, 10 - segment.rank) * 0.015;
    if (distance > 0.3 || (best && distance / halfWidth >= best.distance / best.halfWidth)) continue;
    // Natural Earth digitization is not a guaranteed directed drainage graph.
    // Geometry supplies tangent/phase, while terrain supplies water surface.
    best = { distance: distance * width / WIDTH, halfWidth: halfWidth * width / WIDTH,
      along: (segment.along + Math.sqrt(length2) * t) * width / WIDTH,
      major: segment.rank <= 3, name: segment.name,
      flow: { x: Math.sign(vx), y: Math.sign(vy) } };
  }
  return best;
}

export function usesEarthRiverGeometry(id: string): boolean {
  return id === 'earth-present' || id === 'earth-12000-bce';
}
