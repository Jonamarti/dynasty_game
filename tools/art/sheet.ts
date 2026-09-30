/**
 * `npm run art:sheet`: compose every built picture with the game's own
 * `ArtAtlas` and save one PNG per section under `artifacts/art/`.
 *
 * It starts a throwaway Vite dev server on a free port, opens
 * `tools/art/sheet.html` in Playwright's Chromium and screenshots each
 * section. Read the PNGs to review the art without launching the game.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(ROOT, 'artifacts', 'art');
const SECTIONS = ['tribes', 'ages', 'faces', 'wear', 'hands', 'walk', 'items', 'buildings', 'animals'];

mkdirSync(OUT, { recursive: true });
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls!.local[0]!;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(new URL('tools/art/sheet.html', url).href);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 60000 });
  for (const id of SECTIONS) {
    await page.locator('#' + id).screenshot({ path: join(OUT, `contact-${id}.png`) });
  }
  console.log(`contact sheets → ${OUT}`);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
} finally {
  await browser.close();
  await server.close();
}
