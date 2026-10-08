/** Build committed river polylines from the public-domain Natural Earth 1:10m
 * dataset. Coordinates are cartographic; scalerank is not measured discharge. */
import { readFile, writeFile } from 'node:fs/promises';
import { zipEntry } from './archive.ts';
import { readShapes } from './shapefile.ts';

export function readDbf(bytes: Uint8Array): Record<string, string>[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true), header = view.getUint16(8, true), size = view.getUint16(10, true);
  if (header + count * size > bytes.length) throw new Error('Truncated river DBF');
  const decoder = new TextDecoder();
  const fields: { name: string; length: number }[] = [];
  for (let p = 32; p < header && bytes[p] !== 13; p += 32) {
    fields.push({ name: decoder.decode(bytes.slice(p, p + 11)).replace(/\0/g, ''), length: bytes[p + 16]! });
  }
  return Array.from({ length: count }, (_, i) => {
    let p = header + i * size + 1;
    const row: Record<string, string> = {};
    for (const field of fields) {
      row[field.name] = decoder.decode(bytes.slice(p, p + field.length)).replace(/\0/g, '').trim();
      p += field.length;
    }
    return row;
  });
}

export function simplifyRiver(points: readonly { x: number; y: number }[], tolerance = 0.003): { x: number; y: number }[] {
  if (points.length < 3) return [...points];
  const kept = new Set([0, points.length - 1]);
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const a = points[start]!, b = points[end]!;
    const vx = b.x - a.x, vy = b.y - a.y, length = vx * vx + vy * vy;
    let farthest = -1, worst = tolerance * tolerance;
    for (let i = start + 1; i < end; i++) {
      const p = points[i]!;
      const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / length)) : 0;
      const distance = (p.x - a.x - t * vx) ** 2 + (p.y - a.y - t * vy) ** 2;
      if (distance > worst) { worst = distance; farthest = i; }
    }
    if (farthest >= 0) { kept.add(farthest); stack.push([start, farthest], [farthest, end]); }
  }
  return [...kept].sort((a, b) => a - b).map(i => points[i]!);
}

export async function buildRiverData(zipPath: string | Uint8Array): Promise<void> {
  const zip = typeof zipPath === 'string' ? new Uint8Array(await readFile(zipPath)) : zipPath;
  const shapes = readShapes(zipEntry(zip, 'ne_10m_rivers_lake_centerlines.shp'), 3);
  const rows = readDbf(zipEntry(zip, 'ne_10m_rivers_lake_centerlines.dbf'));
  if (shapes.length !== rows.length) throw new Error('River geometry/attribute record count differs');
  const data = shapes.flatMap((shape, i) => {
    const row = rows[i]!;
    if (row.featurecla !== 'River') return [];
    return [{ name: row.name_en || row.name, rank: Number(row.scalerank),
      parts: shape.parts.map(part => simplifyRiver(part).flatMap(p => [Number(p.x.toFixed(5)), Number(p.y.toFixed(5))])) }];
  });
  await writeFile('src/data/earthRivers.json', JSON.stringify(data) + '\n');
  console.log(`${data.length} rivers, ${data.reduce((sum, r) => sum + r.parts.reduce((n, p) => n + p.length / 2, 0), 0)} retained points`);
}
