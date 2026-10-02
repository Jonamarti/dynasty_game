/** Repeatable browser workload, not an FPS claim or a browser heap measurement. */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const label = process.argv[2] ?? 'current';
if (!/^[a-z-]+$/.test(label)) throw new Error('Use a plain label');
const out = join(root, 'artifacts/verification/m15-art-memory-2026-10-02');
mkdirSync(out, { recursive: true });
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(new URL('tools/art/memory.html', server.resolvedUrls!.local[0]!).href);
  const report = await page.evaluate(async useReference => {
    // Import the production compositor, without starting a simulation workload.
    // Keep vite-node from rewriting this import before Playwright runs it.
    const moduleUrl = useReference ? '/artifacts/verification/m15-art-memory-2026-10-02/reference/ArtAtlas.ts' : '/src/render/ArtAtlas.ts';
    const { ArtAtlas } = await new Function('url', 'return import(url)')(moduleUrl);
    const atlas = await ArtAtlas.load('/art/');
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    const aspects = Array.from({ length: 500 }, (_, i) => ({
      age: i % 7 === 0 ? 'elder' : 'adult', sex: i % 2 ? 'f' : 'm', dir: 'E', pose: 'g0',
      // Synthetic distinct appearances: stress the cache rather than 500 copies
      // of one person that all share a single cached sprite.
      skin: '#' + (0xb08050 + i).toString(16), hair: '#2b2018', band: '#3b6ea8',
      hairStyle: i % 2 ? 'long' : 'short', beard: false, expression: 'neutral',
      wear: {}, carryBaby: false, held: null,
    }));
    let legacyHits = 0, legacyMisses = 0;
    const stats = () => {
      if (atlas.cacheStats) return atlas.cacheStats;
      const sum = (cache: Map<string, HTMLCanvasElement>) => [...cache.values()].reduce((bytes, c) => bytes + c.width * c.height * 4, 0);
      return { composed: { entries: atlas.cache.size, bytes: sum(atlas.cache), hits: legacyHits, misses: legacyMisses }, tints: { entries: atlas.tints.size, bytes: sum(atlas.tints) } };
    };
    const frame = (phase: number) => {
      const start = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      aspects.forEach((a, i) => {
        a.pose = 'g' + ((phase + i) % 4);
        if (atlas.drawPerson) atlas.drawPerson(ctx, a, i % 25 * 40, Math.floor(i / 25) * 40, 0.4);
        else {
          if (atlas.cache.has(ArtAtlas.aspectKey(a))) legacyHits++; else legacyMisses++;
          ctx.drawImage(atlas.compose(a), i % 25 * 40, Math.floor(i / 25) * 40, 38.4, 38.4);
        }
      });
      return performance.now() - start;
    };
    const cold = Array.from({ length: 4 }, (_, i) => frame(i));
    const afterCold = stats();
    const warm = Array.from({ length: 32 }, (_, i) => frame(i));
    const afterWarm = stats();
    warm.sort((a, b) => a - b);
    return { appearances: 500, poses: 4, frames: 36, afterCold, afterWarm,
      coldSubmissionMs: cold, warmMedianSubmissionMs: warm[16], warmP95SubmissionMs: warm[30],
      note: 'Raw cached RGBA pixels and JS drawing submission times; excludes canvas overhead, sheets, GPU copies and presentation. No actual NPC simulation.' };
  }, label === 'before');
  writeFileSync(join(out, `${label}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await server.close(); }
