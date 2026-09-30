/**
 * The committed art in the real game.
 *
 * Not a pixel comparison (a change of taste should not fail a test): it checks
 * that the sheets load, that nothing throws while people, animals and
 * buildings are drawn from them, and it saves screenshots for the owner's
 * visual review of M15 phase 17.
 *
 *   DYNASTY_PORT=5399 npx playwright test e2e/art.spec.ts
 */
import { test, expect } from '@playwright/test';

const DIR = 'artifacts/screenshots';

interface Handle {
  sim: {
    player: { id: number; x: number; y: number };
    buildings: { x: number; y: number; def: { id: string; width: number; height: number }; complete: boolean; centerX: number; centerY: number }[];
    livingPeople: () => { id: number; x: number; y: number }[];
  };
  camera: { zoom: number; following: boolean; snapTo: (x: number, y: number) => void };
  renderer: { hideRoofs: boolean; fogEnabled: boolean };
}

test('the committed art loads and draws', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const fetched: string[] = [];
  page.on('response', r => { if (r.url().includes('/art/')) fetched.push(r.url().split('/art/')[1]!); });

  await page.goto('/?seed=tour&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.waitForTimeout(600);

  // Every manifest and sheet was fetched, so the renderer is not on its fallback.
  expect(fetched).toEqual(expect.arrayContaining(['people.json', 'props.json', 'buildings.json', 'animals.json', 'people-0.png']));

  // Close on the player, at the zoom the milestone screenshots use.
  await page.evaluate(() => {
    const d = (window as never as { __dynasty: Handle }).__dynasty;
    d.camera.following = false;
    d.camera.snapTo(d.sim.player.x, d.sim.player.y);
    d.camera.zoom = 2.6;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: DIR + '/m15-17-people-close.png' });

  // The default zoom, with the whole camp in view.
  await page.evaluate(() => {
    const d = (window as never as { __dynasty: Handle }).__dynasty;
    d.camera.zoom = 1.4;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: DIR + '/m15-17-people-default.png' });

  // Let the world run so somebody builds, then look at a building.
  await page.locator('.hud-speed').fill('120');
  await page.waitForTimeout(12000);
  const built = await page.evaluate(() => {
    const d = (window as never as { __dynasty: Handle }).__dynasty;
    const b = d.sim.buildings.find(x => x.complete);
    if (!b) return null;
    // The building may be somewhere the player has never been; the review wants to see it.
    d.renderer.fogEnabled = false;
    d.camera.following = false;
    d.camera.snapTo(b.centerX, b.centerY);
    d.camera.zoom = 2.4;
    return b.def.id;
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: DIR + '/m15-17-buildings.png' });
  if (built) {
    // Roofs off: the same building as its floor plan.
    await page.evaluate(() => { (window as never as { __dynasty: Handle }).__dynasty.renderer.hideRoofs = true; });
    await page.waitForTimeout(300);
    await page.screenshot({ path: DIR + '/m15-17-buildings-roofless.png' });
  }
  expect(errors).toEqual([]);
});
