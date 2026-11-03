import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('Kit exposes hide dressing and sends the targeted action', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-hide-dressing&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  await page.evaluate(() => {
    const d = (window as any).__dynasty, person = d.sim.player;
    if (!person) throw new Error('No player fixture');
    person.inventory.add('fur_coat', 1);
    person.inventory.add('fat', 1);
    person.knownTech.add('leatherwork');
    person.knownTech.add('hide_dressing');
    d.camera.zoom = 7.5;
    d.camera.snapTo(person.x, person.y);
    d.camera.following = false;
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();
  });

  await page.locator('.hud-tab[data-tab="kit"]').click();
  const dress = page.locator('.hud-item-verbs [data-item="fur_coat"][data-verb="dress_hide"]');
  await expect(dress).toBeVisible();
  await expect(dress).toBeEnabled();
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/playwright/captures/hide-dressing/2026-10-12-hide-dressing';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-hide-dressing-option.png` });

  await dress.click();
  const action = await page.evaluate(() => (window as any).__dynasty.sim.player.order);
  expect(action).toBe('dress_hide');
  expect(errors).toEqual([]);
});
