import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a worn linen tunic adds visible carrying room for small items', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-garment-pockets&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    for (const [item, count] of p.inventory.entries()) p.inventory.remove(item, count);
    for (const slot of Object.keys(p.equipment)) delete p.equipment[slot];
    p.carryContainerCapacity = 0; p.transportCapacity = 0;
    p.age = 30 * p.daysPerYear;
    p.inventory.add('linen_tunic', 1); p.inventory.add('flint', 3);
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    d.camera.zoom = 7.5; d.camera.snapTo(p.x, p.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
  });

  await page.locator('.hud-tab[data-tab="kit"]').click();
  const wear = page.locator('.hud-item-verbs [data-item="linen_tunic"][data-verb="wear_garment"]');
  await expect(wear).toBeVisible();
  await wear.click();
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    for (let tick = 0; tick < d.sim.config.carry.equipTicks + 2; tick++) d.sim.step();
    // Fill the two extra small-item places only after the tunic is worn;
    // the order preflight correctly reconciles a bare-handed overload.
    d.sim.player.inventory.add('flint', 2);
    d.renderer.render(null, 0);
  });
  await page.locator('.hud-tab[data-tab="self"]').click();
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText('6 of 14');
  expect(await page.evaluate(() => (window as any).__dynasty.sim.player.equipment.torso?.item)).toBe('linen_tunic');

  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/playwright/captures/garment-pockets/m15-phase14c-garment-pockets-2026-10-11';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-tunica-con-bolsillo.png` });
  const takeOff = page.locator('.hud-item-verbs [data-item="linen_tunic"][data-verb="take_off_garment"]');
  await takeOff.click();
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    for (let tick = 0; tick < d.sim.config.carry.equipTicks; tick++) d.sim.step();
    d.renderer.render(null, 0);
  });
  await page.locator('.hud-tab[data-tab="self"]').click();
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText('4 of 10');
  const load = await page.evaluate(() => {
    const sim = (window as any).__dynasty.sim, p = sim.player;
    return { worn: p.equipment.torso?.item ?? null, coat: p.inventory.count('linen_tunic'),
      carried: p.inventory.count('flint'), dropped: sim.piles.reduce((n: number, pile: any) => n + pile.contents.count('flint'), 0) };
  });
  expect(load).toEqual({ worn: null, coat: 1, carried: 3, dropped: 2 });
  await page.screenshot({ path: `${shots}/02-sin-tunica-exceso-en-suelo.png` });
  expect(errors).toEqual([]);
});
