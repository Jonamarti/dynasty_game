import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const captureDir = 'artifacts/screenshots/m16-2026-10-21-2.21';

test('keeps the ground tint stable at the same hour on day one and day two', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m16-night-tint-stable&skipIntro=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  const first = await page.evaluate(() => {
    const d = (window as never as { __dynasty: { sim: any; camera: any; renderer: any } }).__dynasty;
    const { sim, camera, renderer } = d;
    renderer.fogEnabled = false;
    camera.following = false;
    camera.zoom = 1.8;
    const clear = (x: number, y: number) => sim.peopleHash.queryRadius(x, y, 2).length === 0 &&
      sim.animalHash.queryRadius(x, y, 2).length === 0 &&
      sim.treeHash.queryRadius(x, y, 2).every((tree: any) => !tree.standing) &&
      sim.nodeHash.queryRadius(x, y, 2).length === 0 && sim.pileHash.queryRadius(x, y, 2).length === 0 &&
      sim.buildingAt(x, y) === null;
    let tile: any = null;
    for (let y = 5; y < sim.world.height - 5 && !tile; y++) for (let x = 5; x < sim.world.width - 5; x++) {
      if (!sim.world.isWalkable(x, y) || sim.world.isWater(x, y) || !clear(x, y)) continue;
      tile = { x, y }; break;
    }
    if (!tile) throw new Error('fixture has no clear ground tile');
    camera.snapTo(tile.x, tile.y);
    const tpd = sim.config.time.ticksPerDay;
    sim.time.tick = 5 * tpd + Math.floor(tpd * 0.96);
    renderer.render(null);
    return { tpd };
  });
  mkdirSync(captureDir, { recursive: true });
  await expect(page.locator('.hud-clock')).toContainText('23:00');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${captureDir}/01-first-night-tint-es.png` });

  await page.evaluate(({ tpd }) => {
    const d = (window as never as { __dynasty: { sim: any; renderer: any } }).__dynasty;
    d.sim.time.tick = 6 * tpd + Math.floor(tpd * 0.96);
    d.renderer.render(null);
  }, first);
  await expect(page.locator('.hud-clock')).toContainText('23:00');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${captureDir}/02-second-night-tint-es.png` });
});
