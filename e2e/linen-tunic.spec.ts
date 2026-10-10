import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a linen tunic is worn from the Spanish Kit and visible on the torso', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-linen-tunic&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    d.sim.time.tick = d.sim.config.time.ticksPerDay / 2;
    p.age = 30 * p.daysPerYear; p.inventory.add('linen_tunic', 1);
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    d.camera.zoom = 7.5; d.camera.snapTo(p.x, p.y - 2); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
  });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  const wear = page.locator('.hud-item-verbs [data-item="linen_tunic"][data-verb="wear_garment"]');
  await expect(wear).toBeVisible(); await wear.click();
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    for (let tick = 0; tick < d.sim.config.carry.equipTicks + 2; tick++) d.sim.step();
    d.renderer.render(null, 0);
  });
  await page.locator('.hud-tab[data-tab="self"]').click();
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText('Túnica de lino');
  expect(await page.evaluate(async () => {
    const d = (window as any).__dynasty, path = '/src/render/Renderer.ts';
    const { wornGarmentsOf } = await import(/* @vite-ignore */ path);
    return { item: d.sim.player.equipment.torso?.item, drawn: wornGarmentsOf(d.sim.player).torso };
  })).toEqual({ item: 'linen_tunic', drawn: 'linen_tunic' });
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase14c-linen-tunic-2026-10-10';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-tunica-de-lino.png` });
  expect(errors).toEqual([]);
});
