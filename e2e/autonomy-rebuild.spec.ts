import { test, expect } from '@playwright/test';

test('a geographic rebuild keeps the autonomy shown in the HUD', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dynasty.autonomy', 'auto'));
  await page.goto('/?seed=autonomy-rebuild');
  const picker = page.locator('.worldpicker');
  await expect(picker.locator('.worldpicker-canvas')).toBeVisible({ timeout: 20000 });
  const box = (await picker.locator('.worldpicker-canvas').boundingBox())!;
  await page.mouse.click(box.x + 30.5 / 96 * box.width, box.y + 24.5 / 48 * box.height);
  await picker.locator('.worldpicker-begin').click();
  await expect(page.locator('.settings')).toBeVisible({ timeout: 30000 });
  const mode = await page.evaluate(() => (window as any).__dynasty.sim.autonomy);
  expect(mode).toBe('auto');
  await page.locator('.settings button', { hasText: 'Begin' }).click();
  await page.locator('.newgame-option').first().click();
  await page.locator('.newgame-option').first().click();
  await page.locator('.newgame .hud-button', { hasText: 'Begin' }).click();
  await expect(page.locator('.newgame')).toBeHidden();
  const active = await page.evaluate(() => {
    const sim = (window as any).__dynasty.sim;
    for (let i = 0; i < 80; i++) sim.step();
    return { mode: sim.autonomy, action: sim.player.action };
  });
  expect(active.mode).toBe('auto');
  expect(active.action).not.toBe('idle');
  await page.screenshot({ path: 'artifacts/screenshots/m15-autonomy-rebuild-2026-10-08/01-auto-earth.png' });
});
