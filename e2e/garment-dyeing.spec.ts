import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('red ochre dyes the exact worn garment, consumes pigment and renders its colour', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-red-ochre-dye&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    p.age = 30 * p.daysPerYear;
    p.knownTech.add('ochre'); p.knownTech.add('dyeing');
    p.inventory.add('fur_coat', 1); p.inventory.add('red_ochre', 1);
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    d.camera.zoom = 7.5; d.camera.snapTo(p.x, p.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
  });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  const wear = page.locator('.hud-item-verbs [data-item="fur_coat"][data-verb="wear_garment"]');
  await expect(wear).toBeVisible(); await wear.click();
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    for (let tick = 0; tick < d.sim.config.carry.equipTicks + 2; tick++) d.sim.step();
  });
  const dye = page.locator('.hud-item-verbs [data-item="fur_coat"][data-verb="dye_garment"]');
  await expect(dye).toBeVisible(); await expect(dye).toBeEnabled(); await dye.click();
  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    for (let tick = 0; tick < 5 && p.order !== null; tick++) d.sim.step();
    d.renderer.render(null, 0);
  });
  const appearance = await page.evaluate(async () => {
    const d = (window as any).__dynasty, path = '/src/render/Renderer.ts';
    const { wornGarmentsOf } = await import(/* @vite-ignore */ path);
    const p = d.sim.player, unitId = p.equipment.torso?.unitId;
    const unit = p.inventory.garmentUnitsOf('fur_coat').find((row: any) => row.unitId === unitId);
    return { dye: unit?.dye, status: unit?.status, pigment: p.inventory.count('red_ochre'),
      rendered: wornGarmentsOf(p).dyes?.torso };
  });
  expect(appearance).toMatchObject({ dye: 'ochre', status: 1, pigment: 0, rendered: '#a33d23' });
  await expect(page.locator('.hud-panel')).toContainText('Abrigo de piel');
  const shots = 'artifacts/playwright/captures/garment-dyeing/m15-phase14d-2026-10-12';
  mkdirSync(shots, { recursive: true });
  await page.evaluate(() => (window as any).__dynasty.renderer.floaters.clear());
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${shots}/03-red-ochre-dye-v0.15.118.png` });
  expect(errors).toEqual([]);
});
