import { WORLD_FEATURE } from '../../src/sim/world/WorldFeatureSeeds.ts';

type Point = { x: number; y: number };
interface ShapeRecord { bounds: [number, number, number, number]; parts: Point[][]; }

/** Rasterize the line geometry in a Natural Earth PolyLine .shp file. */
export function rasterizeRivers(shapefile: Uint8Array, width = 96, height = 48): Uint32Array {
  const flags = new Uint32Array(width * height);
  for (const record of readShapes(shapefile, 3)) {
    for (const part of record.parts) {
      for (let i = 1; i < part.length; i++) {
        const a = part[i - 1]!;
        const b = unwrapNear(a.x, part[i]!.x, part[i]!.y);
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x) / (360 / width), Math.abs(b.y - a.y) / (180 / height)) * 3));
        for (let step = 0; step <= steps; step++) {
          const t = step / steps;
          mark(flags, width, height, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, WORLD_FEATURE.river);
        }
      }
    }
  }
  return flags;
}

/** Rasterize Natural Earth Polygon lake outlines by testing region centres. */
export function rasterizeLakes(shapefile: Uint8Array, width = 96, height = 48): Uint32Array {
  const flags = new Uint32Array(width * height);
  for (const record of readShapes(shapefile, 5)) {
    for (let y = 0; y < height; y++) {
      const latitude = 90 - (y + 0.5) / height * 180;
      if (latitude < record.bounds[1] || latitude > record.bounds[3]) continue;
      for (let x = 0; x < width; x++) {
        const longitude = -180 + (x + 0.5) / width * 360;
        if (longitude < record.bounds[0] || longitude > record.bounds[2]) continue;
        if (record.parts.some(ring => containsPoint(ring, longitude, latitude))) {
          flags[y * width + x] |= WORLD_FEATURE.lake;
        }
      }
    }
  }
  return flags;
}

export function readShapes(bytes: Uint8Array, expectedType: number): ShapeRecord[] {
  if (bytes.length < 100) throw new Error('Truncated ESRI Shapefile');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getInt32(0, false) !== 9994) throw new Error('Invalid ESRI Shapefile signature');
  const fileType = view.getInt32(32, true);
  if (fileType !== expectedType) throw new Error(`Expected shapefile type ${expectedType}, found ${fileType}`);
  const shapes: ShapeRecord[] = [];
  for (let cursor = 100; cursor + 8 <= bytes.length;) {
    const words = view.getInt32(cursor + 4, false);
    const body = cursor + 8;
    const end = body + words * 2;
    if (words <= 0 || end > bytes.length) throw new Error('Invalid ESRI Shapefile record length');
    const type = view.getInt32(body, true);
    if (type === expectedType) {
      const bounds: [number, number, number, number] = [
        view.getFloat64(body + 4, true), view.getFloat64(body + 12, true),
        view.getFloat64(body + 20, true), view.getFloat64(body + 28, true),
      ];
      const partCount = view.getInt32(body + 36, true);
      const pointCount = view.getInt32(body + 40, true);
      const partsStart = body + 44;
      const pointsStart = partsStart + partCount * 4;
      if (partCount < 1 || pointCount < 2 || pointsStart + pointCount * 16 > end) {
        throw new Error('Invalid ESRI Shapefile geometry');
      }
      const starts = Array.from({ length: partCount }, (_, i) => view.getInt32(partsStart + i * 4, true));
      starts.push(pointCount);
      const parts = starts.slice(0, partCount).map((start, part) => {
        const points: Point[] = [];
        for (let i = start; i < starts[part + 1]!; i++) {
          points.push({ x: view.getFloat64(pointsStart + i * 16, true), y: view.getFloat64(pointsStart + i * 16 + 8, true) });
        }
        return points;
      });
      shapes.push({ bounds, parts });
    } else if (type !== 0) {
      throw new Error(`Unexpected shape type ${type} in Natural Earth dataset`);
    }
    cursor = end;
  }
  return shapes;
}

function containsPoint(ring: readonly Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function unwrapNear(a: number, b: number, y: number): Point {
  let x = b;
  while (x - a > 180) x -= 360;
  while (x - a < -180) x += 360;
  return { x, y };
}

function mark(flags: Uint32Array, width: number, height: number, longitude: number, latitude: number, feature: number): void {
  const x = mod(Math.floor((wrapLongitude(longitude) + 180) / 360 * width), width);
  const y = clamp(Math.floor((90 - latitude) / 180 * height), 0, height - 1);
  flags[y * width + x] |= feature;
}

function wrapLongitude(longitude: number): number { return mod(longitude + 180, 360) - 180; }
function mod(value: number, divisor: number): number { return ((value % divisor) + divisor) % divisor; }
function clamp(value: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, value)); }
