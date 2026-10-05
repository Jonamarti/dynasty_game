import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('the coast paints traversal depth bands without advancing the paused world', async ({ page }) => {
  await page.goto('/?seed=e2e-fixture&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty();
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  const colors = await page.evaluate(async () => {
    const d = (window as any).__dynasty;
    while (d.sim.time.dayFraction < 0.5) d.sim.step();
    const checkpointPath = '/src/sim/persistence/CheckpointRecords.ts';
    const { toCheckpointRecord } = await import(checkpointPath);
    const w = d.sim.world;
    // The actual terrain bake is inspected. A helper test alone would still
    // pass if Renderer accidentally continued painting one water colour.
    const found = new Map<string, string>();
    const ctx = d.renderer.terrain.getContext('2d');
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
      if (!w.isWater(x, y)) continue;
      const depth = w.depthAt(x, y);
      const band = depth < w.wadeDepth ? 'wade' : depth < w.swimDepth ? 'swim' : 'deep';
      const p = ctx.getImageData(x * 16 + 8, y * 16 + 8, 1, 1).data;
      found.set(band, [...p].join(','));
    }
    d.renderer.fogEnabled = false;
    d.camera.zoom = Math.min(1100 / (w.width * 16), 650 / (w.height * 16));
    d.camera.snapTo(w.width / 2, w.height / 2); d.camera.following = false;
    const before = JSON.stringify(toCheckpointRecord(d.sim));
    d.renderer.render(null, 0);
    return { bands: Object.fromEntries(found), tick: d.sim.time.tick,
      unchanged: before === JSON.stringify(toCheckpointRecord(d.sim)) };
  });
  expect(Object.keys(colors.bands).sort()).toEqual(['deep', 'swim', 'wade']);
  expect(new Set(Object.values(colors.bands)).size).toBe(3);
  expect(colors.unchanged).toBe(true);
  const shots = process.env.DYNASTY_CAPTURE_DIR;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/01-coast-depth.png` });
  }
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__dynasty.sim.time.tick)).toBe(colors.tick);
});
