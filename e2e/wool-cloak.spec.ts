import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a wool cloak replaces a hide cape from the Spanish Kit and is visible', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-wool-cloak&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
  await expect(page.locator('.game-version')).toContainText(`v${version}`);
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    for (const [item, count] of p.inventory.entries()) p.inventory.remove(item, count);
    d.sim.time.tick = d.sim.config.time.ticksPerDay / 2;
    p.age = 30 * p.daysPerYear; p.inventory.add('hide_cape', 1); p.inventory.add('wool_cloak', 1);
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    d.camera.zoom = 7.5; d.camera.snapTo(p.x, p.y - 2); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
  });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  for (const item of ['hide_cape', 'wool_cloak']) {
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
    const d = (window as any).__dynasty;
    const techPath = '/src/sim/knowledge/Tech.ts', rendererPath = '/src/render/Renderer.ts';
    const { warmthFrom } = await import(/* @vite-ignore */ techPath);
    const { wornGarmentsOf } = await import(/* @vite-ignore */ rendererPath);
    return { item: d.sim.player.equipment.cloak?.item, drawn: wornGarmentsOf(d.sim.player).cloak,
      warmth: warmthFrom(d.sim.player), spare: d.sim.player.inventory.count('hide_cape') };
  });
  expect(worn).toEqual({ item: 'wool_cloak', drawn: 'wool_cloak', warmth: 0.35, spare: 1 });
  await expect(page.locator('.hud-panel')).toContainText('Manto de lana');
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase14c-wool-cloak-2026-10-10';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-manto-de-lana.png` });
  expect(errors).toEqual([]);
});
