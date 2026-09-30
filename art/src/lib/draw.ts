/**
 * SVG drawing helpers shared by every art generator.
 *
 * The art of Dynasty is *authored as code that emits SVG*, rasterised once by
 * `npm run art:build` and committed as PNG. Everything here is pure string
 * building: no DOM, no randomness, no clock. Two runs produce the same text,
 * which is what lets the build de-duplicate layers by hashing them.
 *
 * Style rules (see `art/README.md`): flat fills, one dark outline of
 * `OUTLINE` px around every shape, light from the upper left, no textures.
 */
export type Pt = readonly [number, number];

/** Outline half-width; a shape's stroke is twice this, painted under the fill. */
export const OUTLINE = 1.05;
export const INK = '#22170f';

export const r2 = (n: number): number => Math.round(n * 100) / 100;
export const rad = (d: number): number => (d * Math.PI) / 180;

/** Darken (k < 1) or lighten (k > 1) a #rrggbb colour. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => (k <= 1 ? v * k : v + (255 - v) * (k - 1)));
  return '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/** A closed Catmull-Rom style curve through the points. */
export function smooth(pts: readonly Pt[]): string {
  const n = pts.length;
  let d = `M${r2(pts[0]![0])},${r2(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!, p1 = pts[i]!, p2 = pts[(i + 1) % n]!, p3 = pts[(i + 2) % n]!;
    d += `C${r2(p1[0] + (p2[0] - p0[0]) / 6)},${r2(p1[1] + (p2[1] - p0[1]) / 6)} `
      + `${r2(p2[0] - (p3[0] - p1[0]) / 6)},${r2(p2[1] - (p3[1] - p1[1]) / 6)} ${r2(p2[0])},${r2(p2[1])}`;
  }
  return d + 'Z';
}

export const poly = (pts: readonly Pt[]): string => 'M' + pts.map(p => `${r2(p[0])},${r2(p[1])}`).join('L') + 'Z';

/** A filled path with the house outline. `line` null draws no outline. */
export function shape(d: string, fill: string, line?: string | null, extra = ''): string {
  const s = line ? ` stroke="${line}" stroke-width="${OUTLINE * 2}" stroke-linejoin="round" paint-order="stroke"` : '';
  return `<path d="${d}" fill="${fill}"${s} ${extra}/>`;
}

export function ell(cx: number, cy: number, rx: number, ry: number, fill: string, line?: string | null, rot = 0): string {
  const s = line ? ` stroke="${line}" stroke-width="${OUTLINE * 2}" paint-order="stroke"` : '';
  const t = rot ? ` transform="rotate(${rot} ${r2(cx)} ${r2(cy)})"` : '';
  return `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(rx)}" ry="${r2(ry)}" fill="${fill}"${s}${t}/>`;
}

/** A round-capped polyline of width `w`, with an outline underneath. */
export function limb(pts: readonly Pt[], w: number, fill: string, line?: string | null): string {
  const d = 'M' + pts.map(p => `${r2(p[0])},${r2(p[1])}`).join('L');
  const base = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const o = line ? `<path d="${d}" ${base} stroke="${line}" stroke-width="${r2(w + OUTLINE * 2)}"/>` : '';
  return o + `<path d="${d}" ${base} stroke="${fill}" stroke-width="${r2(w)}"/>`;
}

export const stroke = (d: string, color: string, w: number): string =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** The point `len` away from `p` at `deg` degrees from straight down, clockwise. */
export const at = (p: Pt, deg: number, len: number): Pt => [p[0] + Math.sin(rad(deg)) * len, p[1] + Math.cos(rad(deg)) * len];
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Wrap inner markup in a standalone SVG document. */
export function svgDoc(inner: string, w: number, h: number, viewBox = `0 0 ${w} ${h}`): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">${inner}</svg>`;
}

/**
 * Rename every `id="cN"` (and its `#cN` references) to a sequence that starts
 * at zero in reading order. Clip paths are numbered by a counter that also
 * runs over layers a given call throws away, so two identical drawings would
 * otherwise differ in their ids and never de-duplicate.
 */
export function normalizeIds(svg: string): string {
  const map = new Map<string, string>();
  for (const m of svg.matchAll(/id="(c\d+)"/g)) if (!map.has(m[1]!)) map.set(m[1]!, `k${map.size}`);
  if (map.size === 0) return svg;
  return svg.replace(/(id="|url\(#)(c\d+)/g, (_s, pre: string, id: string) => pre + (map.get(id) ?? id));
}
