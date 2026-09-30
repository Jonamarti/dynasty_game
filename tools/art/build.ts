/**
 * `npm run art:build`: rasterise every generator in `art/src/` into the PNG
 * sheets and manifests under `public/art/`.
 *
 * The SVG text of each picture is drawn on a canvas by the same Chromium the
 * e2e tests use (no new dependency), its empty margin is trimmed away, and the
 * trimmed pictures are packed into as few sheets as fit in 2048 px. The
 * manifest says, for every asset key, which cell of which sheet to draw and
 * how far the trimmed picture sits from its original corner.
 *
 * Both the SVG text and the packing order are deterministic, so running the
 * build twice on one machine writes identical files. The output is
 * committed: the game loads the PNG and never runs any of this.
 *
 *   npm run art:build                 # everything
 *   npm run art:build -- people       # one domain
 */
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ArtCell, ArtManifest } from '../../src/render/ArtManifest.ts';
import { DOMAINS, type Collected, type DomainName } from '../../art/src/registry.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(ROOT, 'public', 'art');
const SHEET_W = 2048;
const PAD = 1;
const BATCH = 250;

interface Placement { sheet: number; x: number; y: number; w: number; h: number; ox: number; oy: number; }

/** Runs inside the browser page. Kept as a string so vite-node never has to transform it. */
const PAGE_SCRIPT = `
window.__art = { trimmed: [] };
window.__rasterise = async (batch) => {
  const out = [];
  for (const p of batch) {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(p.svg);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = p.w; c.height = p.h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, p.w, p.h);
    const d = ctx.getImageData(0, 0, p.w, p.h).data;
    let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      if (d[(y * p.w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) { window.__art.trimmed.push(null); out.push([0, 0, 0, 0]); continue; }
    const tw = x1 - x0 + 1, th = y1 - y0 + 1;
    window.__art.trimmed.push({ data: ctx.getImageData(x0, y0, tw, th), ox: x0, oy: y0 });
    out.push([tw, th, x0, y0]);
  }
  return out;
};
window.__pack = (placements, sheetW, sheetHeights) => {
  const urls = [];
  for (let s = 0; s < sheetHeights.length; s++) {
    const c = document.createElement('canvas');
    c.width = sheetW; c.height = sheetHeights[s];
    const ctx = c.getContext('2d');
    placements.forEach((pl, i) => {
      if (!pl || pl.sheet !== s) return;
      ctx.putImageData(window.__art.trimmed[i].data, pl.x, pl.y);
    });
    urls.push(c.toDataURL('image/png'));
  }
  return urls;
};
`;

async function buildDomain(name: DomainName, page: import('@playwright/test').Page): Promise<void> {
  const t0 = Date.now();
  const { bank, meta }: Collected = DOMAINS[name]();
  await page.evaluate(PAGE_SCRIPT);

  const sizes: number[][] = [];
  for (let i = 0; i < bank.pictures.length; i += BATCH) {
    const batch = bank.pictures.slice(i, i + BATCH).map(p => ({ svg: p.svg, w: p.w, h: p.h }));
    sizes.push(...(await page.evaluate(`window.__rasterise(${JSON.stringify(batch)})`) as number[][]));
  }

  // Shelf packing: tallest first, left to right, a new row when the sheet is full.
  const order = sizes.map((_s, i) => i).filter(i => sizes[i]![0]! > 0)
    .sort((a, b) => sizes[b]![1]! - sizes[a]![1]! || sizes[b]![0]! - sizes[a]![0]! || a - b);
  const placements: (Placement | null)[] = sizes.map(() => null);
  let sheet = 0, x = 0, y = 0, rowH = 0;
  const sheetHeights: number[] = [];
  for (const i of order) {
    const [w, h, ox, oy] = sizes[i]! as [number, number, number, number];
    if (x + w + PAD > SHEET_W) { x = 0; y += rowH + PAD; rowH = 0; }
    if (y + h + PAD > SHEET_W) { sheetHeights[sheet] = y + rowH + PAD; sheet++; x = 0; y = 0; rowH = 0; }
    placements[i] = { sheet, x, y, w, h, ox, oy };
    x += w + PAD;
    rowH = Math.max(rowH, h);
  }
  sheetHeights[sheet] = y + rowH + PAD;
  if (order.length === 0) sheetHeights.length = 0;

  const urls = await page.evaluate(
    `window.__pack(${JSON.stringify(placements)}, ${SHEET_W}, ${JSON.stringify(sheetHeights)})`
  ) as string[];
  const sheets: string[] = [];
  urls.forEach((u, s) => {
    const file = `${name}-${s}.png`;
    writeFileSync(join(OUT, file), Buffer.from(u.split(',')[1]!, 'base64'));
    sheets.push(file);
  });

  const cells: ArtCell[] = placements.map(p => p
    ? [p.sheet, p.x, p.y, p.w, p.h, p.ox, p.oy] as const
    : [0, 0, 0, 0, 0, 0, 0] as const);
  const manifest: ArtManifest = {
    version: 1, domain: name, cell: 96, sheets, cells, keys: bank.keys, meta,
  };
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(manifest));
  const pixels = placements.reduce((n, p) => n + (p ? p.w * p.h : 0), 0);
  console.log(
    `${name.padEnd(9)} ${String(Object.keys(bank.keys).length).padStart(6)} keys → ${String(bank.pictures.length).padStart(5)} pictures, `
    + `${sheets.length} sheet(s), ${(pixels / 1000).toFixed(0)}k px, ${((Date.now() - t0) / 1000).toFixed(1)}s`
  );
}

async function main(): Promise<void> {
  const wanted = process.argv.slice(2).filter(a => a in DOMAINS) as DomainName[];
  const names = wanted.length ? wanted : (Object.keys(DOMAINS) as DomainName[]);
  mkdirSync(OUT, { recursive: true });
  if (wanted.length === 0) {
    for (const f of ['people', 'props', 'buildings', 'animals']) {
      for (let s = 0; s < 40; s++) rmSync(join(OUT, `${f}-${s}.png`), { force: true });
    }
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const name of names) await buildDomain(name, page);
  } finally {
    await browser.close();
  }
}

await main();
