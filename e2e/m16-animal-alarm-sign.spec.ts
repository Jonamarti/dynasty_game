import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('m16 animal alarm sign disappears when the alarm expires', async ({ page }) => {
  await page.goto('/?seed=m16-alarm-sign&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const target = await page.evaluate(() => {
    const d = (window as any).__dynasty, animal = d.sim.animals.find((a: any) => a.alive);
    const player = d.sim.player;
    if (!animal || !player) throw new Error('Alarm-sign fixture has no animal or player');
    animal.x = player.x + 1;
    animal.y = player.y;
    const expiry = d.sim.time.tick + 90;
    animal.alarmedUntil = expiry;
    d.sim['rebuildHashes']();
    d.camera.zoom = 6;
    d.camera.following = false;
    d.camera.snapTo(animal.x, animal.y);
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();
    return { x: d.camera.worldToScreenX(animal.x), y: d.camera.worldToScreenY(animal.y),
      label: animal.label, expiry };
  });

  await page.mouse.click(target.x, target.y);
  await page.locator('.picker-item', { hasText: target.label }).click();
  await expect(page.locator('.hud-doing')).toHaveText('bolting');
  const shots = 'artifacts/screenshots/m16-2026-10-20-2.7-verified';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-animal-alarmed.png` });

  await page.evaluate(({ expiry }) => {
    const d = (window as any).__dynasty;
    d.sim.time.tick = expiry + 1;
  }, target);
  await expect(page.locator('.hud-doing')).toHaveText('has seen you');
  await page.screenshot({ path: `${shots}/02-alarm-expired.png` });
});
