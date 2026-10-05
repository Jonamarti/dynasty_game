import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('wading explains wet chill and removes the note after drying', async ({ page }) => {
  await page.goto('/?seed=e2e-fixture&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty();
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  const wet = await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player, w = d.sim.world;
    const tile = w.shoreTiles.filter((at: any) => w.isWadeTile(at.x, at.y))
      .sort((a: any, b: any) => Math.hypot(a.x - w.width / 2, a.y - w.height / 2) -
        Math.hypot(b.x - w.width / 2, b.y - w.height / 2))[0];
    if (!tile) throw new Error('fixture has no ford');
    while (d.sim.time.dayFraction < 0.5) d.sim.step();
    p.x = tile.x + 0.5; p.y = tile.y + 0.5;
    d.sim.order(p, 'idle');
    d.sim.step();
    d.camera.zoom = 3; d.camera.snapTo(p.x, p.y); d.camera.following = false;
    d.renderer.interpolator.clear();
    d.renderer.fogEnabled = false;
    return p.wet;
  });
  expect(wet).toBeGreaterThan(0);
  await expect(page.locator('.hud-wet')).toBeVisible();
  await expect(page.locator('.hud-wet')).toHaveText('Being wet makes you colder until you dry off.');
  const shots = process.env.DYNASTY_CAPTURE_DIR;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/02-wading-condition.png` });
  }
  // UI refresh must remove the explanation without needing a new selection.
  // Actual wet/dry timing and hearth acceleration are covered by system tests.
  await page.evaluate(() => { (window as any).__dynasty.sim.player.wet = 0; });
  await expect(page.locator('.hud-wet')).toBeHidden();
});
