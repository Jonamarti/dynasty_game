import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('leggings are worn from the Spanish Kit and visible on the legs', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-leggings&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    d.sim.time.tick = d.sim.config.time.ticksPerDay / 2;
    p.age = 30 * p.daysPerYear; p.inventory.add('leggings', 1);
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    d.camera.zoom = 7.5; d.camera.snapTo(p.x, p.y - 2); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
  });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  const wear = page.locator('.hud-item-verbs [data-item="leggings"][data-verb="wear_garment"]');
  await expect(wear).toBeVisible(); await wear.click();
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    for (let tick = 0; tick < d.sim.config.carry.equipTicks + 2; tick++) d.sim.step();
    d.renderer.render(null, 0);
  });
  await page.locator('.hud-tab[data-tab="self"]').click();
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText('Polainas');
  expect(await page.evaluate(async () => {
    const d = (window as any).__dynasty, path = '/src/render/Renderer.ts';
    const { wornGarmentsOf } = await import(/* @vite-ignore */ path);
    return { item: d.sim.player.equipment.legs?.item, drawn: wornGarmentsOf(d.sim.player).legs };
  })).toEqual({ item: 'leggings', drawn: 'trousers' });
  const shots = 'artifacts/screenshots/m15-phase14c-leggings-2026-10-10';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-polainas.png` });
  expect(errors).toEqual([]);
});
