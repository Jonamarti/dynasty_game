import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a hide cape and sewn tunic can be worn together from the Kit', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-garment-layers&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    p.age = 30 * p.daysPerYear; p.inventory.add('hide_cape', 1); p.inventory.add('sewn_tunic', 1);
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    d.camera.zoom = 7.5; d.camera.snapTo(p.x, p.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
  });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  for (const item of ['sewn_tunic', 'hide_cape']) {
    const wear = page.locator(`.hud-item-verbs [data-item="${item}"][data-verb="wear_garment"]`);
    await expect(wear).toBeVisible(); await wear.click();
    await page.evaluate(() => {
      const d = (window as any).__dynasty;
      for (let tick = 0; tick < d.sim.config.carry.equipTicks + 2; tick++) d.sim.step();
      d.renderer.render(null, 0);
    });
    await page.locator('.hud-tab[data-tab="self"]').click();
    await page.locator('.hud-tab[data-tab="kit"]').click();
  }
  const worn = await page.evaluate(async () => {
    const d = (window as any).__dynasty, path = '/src/sim/knowledge/Tech.ts';
    const { warmthFrom } = await import(/* @vite-ignore */ path);
    return { torso: d.sim.player.equipment.torso?.item, cloak: d.sim.player.equipment.cloak?.item,
      warmth: warmthFrom(d.sim.player) };
  });
  expect(worn).toEqual({ torso: 'sewn_tunic', cloak: 'hide_cape', warmth: 1 - 0.7 * 0.75 });
  await expect(page.locator('.hud-panel')).toContainText('Túnica cosida');
  await expect(page.locator('.hud-panel')).toContainText('Capa de piel');
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase14c-layers-2026-10-10';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-tunica-y-capa.png` });
  expect(errors).toEqual([]);
});
