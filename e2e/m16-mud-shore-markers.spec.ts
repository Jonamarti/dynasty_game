import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const captureDir = 'artifacts/screenshots/m16-2026-10-21-2.18';

test('shows the freshwater mud-bank markers in Spanish', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m16-mud-shore-markers&skipIntro=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.evaluate(() => {
    const d = (window as never as { __dynasty: { sim: any; camera: any; renderer: any } }).__dynasty;
    const { sim, camera, renderer } = d;
    renderer.fogEnabled = false;
    camera.following = false;
    camera.zoom = 1.8;
    const bank = sim.world.freshShore.find((tile: any) =>
      sim.world.isWalkable(tile.x, tile.y) && !sim.world.isWater(tile.x, tile.y) &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
        sim.world.isFreshWater(tile.x + dx, tile.y + dy)) &&
      sim.peopleHash.queryRadius(tile.x, tile.y, 1.5).length === 0 &&
      sim.animalHash.queryRadius(tile.x, tile.y, 1.5).length === 0 &&
      sim.treeHash.queryRadius(tile.x, tile.y, 1.5).every((tree: any) => !tree.standing) &&
      sim.nodeHash.queryRadius(tile.x, tile.y, 1.5).length === 0 &&
      sim.pileHash.queryRadius(tile.x, tile.y, 1.5).length === 0 &&
      sim.buildingAt(tile.x, tile.y) === null);
    if (!bank) throw new Error('fixture has no clear freshwater bank tile');
    camera.snapTo(bank.x, bank.y);
  });
  await page.waitForTimeout(250);
  await expect(page.locator('#view')).toBeVisible();
  mkdirSync(captureDir, { recursive: true });
  await page.screenshot({ path: `${captureDir}/01-mud-bank-action-es.png` });
});
