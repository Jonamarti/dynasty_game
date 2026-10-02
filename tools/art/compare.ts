/** Pixel parity against an exported pre-change compositor, for this measured fix. */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(new URL('tools/art/memory.html', server.resolvedUrls!.local[0]!).href);
  const report = await page.evaluate(async () => {
    const current = await new Function('return import("/src/render/ArtAtlas.ts")')();
    const reference = await new Function('return import("/artifacts/verification/m15-art-memory-2026-10-02/reference/ArtAtlas.ts")')();
    const atlas = await current.ArtAtlas.load('/art/'), old = await reference.ArtAtlas.load('/art/');
    const { ART_AGES, ART_SEXES, ART_POSES } = await new Function('return import("/src/render/ArtManifest.ts")')();
    const golden: Record<string, string> = {};
    const failures: string[] = [];
    let cases = 0;
    const canvas = () => { const c = document.createElement('canvas'); c.width = 160; c.height = 160; return c; };
    const before = canvas(), after = canvas();
    const bctx = before.getContext('2d')!, actx = after.getContext('2d')!;
    const equal = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      const aa = new Uint32Array(a.buffer), bb = new Uint32Array(b.buffer);
      return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
    };
    for (const age of ART_AGES) for (const sex of ART_SEXES) for (const dir of ['S', 'E', 'N', 'W']) for (const pose of ART_POSES) {
      for (let variant = 0; variant < 3; variant++) {
        const a = { age, sex, dir, pose, skin: '#d4a276', hair: '#2b2018', band: '#3b6ea8',
          hairStyle: sex === 'f' ? 'long' : 'short', beard: sex === 'm', expression: 'warm',
          wear: variant === 0 ? {} : variant === 1 ? { torso: 'tunic', hands: 'gloves', feet: 'boots', head: 'hood' }
            : { torso: 'longtunic', legs: 'trousers', cloak: 'cloak' },
          carryBaby: variant === 2, held: variant === 1 ? 'spade' : variant === 2 ? 'basket' : null };
        const key = [age, sex, dir, pose, variant].join('/');
        const ref = old.compose(a), now = atlas.compose(a);
        const pixels = ref.getContext('2d')!.getImageData(0, 0, 96, 96).data;
        if (!equal(pixels, now.getContext('2d')!.getImageData(0, 0, 96, 96).data)) failures.push(key + '/cell');
        if (variant === 0) {
          const hash = await crypto.subtle.digest('SHA-256', pixels);
          golden[key.slice(0, -2)] = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
        }
        for (const scale of [0.65, 1.25]) {
          bctx.clearRect(0, 0, 160, 160); actx.clearRect(0, 0, 160, 160);
          bctx.imageSmoothingEnabled = false; actx.imageSmoothingEnabled = false;
          bctx.drawImage(ref, 13.3, 11.7, 96 * scale, 96 * scale);
          atlas.drawPerson(actx, a, 13.3, 11.7, scale);
          if (!equal(bctx.getImageData(0, 0, 160, 160).data, actx.getImageData(0, 0, 160, 160).data)) failures.push(key + '/' + scale);
          cases++;
        }
      }
    }
    return { cases, fullCellCases: cases / 2, failures, golden };
  });
  writeFileSync(root + 'artifacts/verification/m15-art-memory-2026-10-02/pixel-parity.json', JSON.stringify({ cases: report.cases, fullCellCases: report.fullCellCases, failures: report.failures }, null, 2));
  if (report.failures.length) throw new Error(JSON.stringify(report.failures.slice(0, 15)));
  writeFileSync(root + 'src/render/__tests__/person-pixels.json', JSON.stringify(report.golden, null, 2) + '\n');
  console.log(`${report.fullCellCases} full cells and ${report.cases} fractional-zoom draws match the pre-change compositor`);
} finally { await browser.close(); await server.close(); }
