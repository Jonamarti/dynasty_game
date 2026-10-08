/**
 * M15 (owner, 2026-10-08): one map is one comarca. The 128 by 128 tiles of a game opened from the globe are a single
 * comarca of the world map, as the classic island is. Checks the frame the simulation keeps and takes the pictures
 * (the Earth through the picker, and a generated world).
 */
import { test, expect, type Page } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-one-comarca-per-map-2026-10-08';

function guardErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  return errors;
}

const frameOf = (page: Page) => page.evaluate(() => {
  const d = (window as unknown as { __dynasty: { sim: any } }).__dynasty;
  const sim = d.sim;
  const corner = sim.comarcaAtTile(0, 0), far = sim.comarcaAtTile(sim.world.width - 1, sim.world.height - 1);
  return { frame: sim.worldFrame, corner, far, width: sim.world.width, nodes: sim.nodes.length };
});

test('a generated world opens as one comarca', async ({ page }) => {
  const errors = guardErrors(page);
  await page.goto('/?skipIntro=1&seed=e2e-one-comarca&world=random');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  const f = await frameOf(page);
  expect(f.frame.comarcasWide).toBe(1);
  expect(f.frame.comarcasHigh).toBe(1);
  expect(f.frame.originX % 1).toBe(0);
  expect(f.frame.originY % 1).toBe(0);
  expect(f.far).toEqual(f.corner);
  await page.screenshot({ path: `${SHOTS}/10-random-world-one-comarca.png` });
  expect(errors).toEqual([]);
});

test('the Earth opens as one comarca, from the picker', async ({ page }) => {
  const errors = guardErrors(page);
  await page.goto('/?seed=e2e-one-comarca-earth');
  await expect(page.locator('.worldpicker-canvas')).toBeVisible({ timeout: 15_000 });
  const box = (await page.locator('.worldpicker-canvas').boundingBox())!;
  // Region 46,10 (Britain, in the fixture atlas) has a coast and fresh water within reach.
  await page.mouse.click(box.x + 46.5 / 96 * box.width, box.y + 10.5 / 48 * box.height);
  await expect(page.locator('.worldpicker-begin')).toBeEnabled();
  await page.locator('.worldpicker-begin').click();
  await expect(page.locator('.worldpicker')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator('.settings')).toBeVisible({ timeout: 15_000 });
  await page.locator('.settings button', { hasText: 'Begin' }).click();
  await page.locator('.newgame-option').first().click();
  await page.locator('.newgame-option').first().click();
  await page.locator('.newgame .hud-button', { hasText: 'Begin' }).click();
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  const f = await frameOf(page);
  expect(f.frame.comarcasWide).toBe(1);
  expect(f.frame.comarcasHigh).toBe(1);
  expect(f.far).toEqual(f.corner);
  await page.screenshot({ path: `${SHOTS}/11-earth-one-comarca.png` });
  expect(errors).toEqual([]);
});
