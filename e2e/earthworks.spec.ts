/**
 * M15 phase 26c: earthwork designs from the build bar — the plan previewed
 * tile by tile, the refusal written beside the cursor, R turning a line, and a
 * placed ditch worked until the ground shows it. Captures go to
 * DYNASTY_CAPTURE_DIR (or a new dated directory) for the milestone record.
 */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('an earthwork is previewed, refused with a reason, turned, placed and dug', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-fixture&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  const shots = process.env.DYNASTY_CAPTURE_DIR ??
    'artifacts/screenshots/m15-earthworks-' + new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(shots, { recursive: true });

  // Open ground a few tiles from the player, found by the sim's own rule.
  const spot = await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    for (let r = 4; r < 40; r++) for (let a = 0; a < 32; a++) {
      const x = Math.round(p.x + Math.cos(a * Math.PI / 16) * r), y = Math.round(p.y + Math.sin(a * Math.PI / 16) * r);
      let ok = true;
      for (let j = -3; j < 8 && ok; j++) for (let i = -3; i < 9 && ok; i++) {
        if (!d.sim.world.isWalkable(x + i, y + j) || d.sim.world.isShore(x + i, y + j) || d.sim.buildingAt(x + i, y + j)) ok = false;
      }
      if (ok) {
        d.camera.snapTo(x + 3, y + 2); d.camera.following = false;
        p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
        return { x, y };
      }
    }
    throw new Error('no open ground');
  });

  await page.keyboard.press('b');
  const ditch = page.locator('.hud-design', { hasText: 'Ditch' });
  await expect(ditch).toBeVisible();
  await expect(ditch).toContainText('items of earth to move');
  await expect(page.locator('.hud-design', { hasText: 'Ditch' })).toHaveCount(1);
  await ditch.click();
  await expect(page.locator('.hud-buildbar-locked', { hasText: 'R turns the plan' })).toBeVisible();

  const screen = await page.evaluate(({ x, y }) => {
    const d = (window as any).__dynasty, rect = document.getElementById('view')!.getBoundingClientRect();
    return { sx: rect.left + d.camera.worldToScreenX(x), sy: rect.top + d.camera.worldToScreenY(y) };
  }, spot);
  await page.mouse.move(screen.sx - 40, screen.sy - 40);
  await page.mouse.move(screen.sx, screen.sy, { steps: 4 });
  let ghost = await page.evaluate(() => { const g = (window as any).__dynasty.renderer.buildGhost; return g && { w: g.width, h: g.height, ok: g.ok, plan: g.plan?.length }; });
  expect(ghost).toMatchObject({ w: 6, h: 1, ok: true, plan: 6 });
  await page.keyboard.press('r');
  ghost = await page.evaluate(() => { const g = (window as any).__dynasty.renderer.buildGhost; return g && { w: g.width, h: g.height }; });
  expect(ghost).toMatchObject({ w: 1, h: 6 });
  await page.keyboard.press('r');
  await page.screenshot({ path: shots + '/01-ditch-preview.png' });

  // A moat on dry land says why not.
  await page.locator('.hud-design', { hasText: 'Moat' }).click();
  await page.mouse.move(screen.sx + 1, screen.sy + 1);
  const refusal = await page.evaluate(() => (window as any).__dynasty.renderer.buildGhost?.reason);
  expect(refusal).toMatch(/touch the water/);
  await page.screenshot({ path: shots + '/02-moat-refused.png' });

  // Place the ditch with a click and work it.
  await page.locator('.hud-design', { hasText: 'Ditch' }).click();
  await page.mouse.move(screen.sx, screen.sy);
  const box = (await page.locator('#view').boundingBox())!;
  await page.locator('#view').click({ position: { x: screen.sx - box.x, y: screen.sy - box.y } });
  const placed = await page.evaluate(() => (window as any).__dynasty.sim.buildings.find((b: any) => b.def.id === 'ditch') ? true : false);
  expect(placed).toBe(true);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: shots + '/03-ditch-marked-out.png' });

  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    const site = d.sim.buildings.find((b: any) => b.def.id === 'ditch');
    p.inventory.add('sticks', 1);
    p.x = site.x + 0.5; p.y = site.y + 2.5; p.path = null; p.pathCount = p.pathAt = 0;
    if (!d.sim.order(p, 'dig', { buildingId: site.id })) throw new Error(d.sim.lastRefusal);
    for (let i = 0; i < 900; i++) {
      p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
      if (p.order === null && !site.complete) d.sim.order(p, 'dig', { buildingId: site.id });
      d.sim.step();
    }
  });
  await page.screenshot({ path: shots + '/04-ditch-part-dug.png' });
  const progress = await page.evaluate(() => (window as any).__dynasty.sim.buildings.find((b: any) => b.def.id === 'ditch').progress);
  expect(progress).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
