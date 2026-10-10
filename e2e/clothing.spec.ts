import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('wearing a coat from the Kit warms the person and offers to take it off', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-clothing&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase14-ab-2026-10-10';
  mkdirSync(shots, { recursive: true });

  await page.evaluate(() => {
    const d = (window as any).__dynasty, person = d.sim.player;
    if (!person) throw new Error('No player fixture');
    person.age = 30 * person.daysPerYear;
    person.inventory.add('fur_coat', 1);
    person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
    d.camera.zoom = 7.5;
    d.camera.snapTo(person.x, person.y);
    d.camera.following = false;
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();
  });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  const wear = page.locator('.hud-item-verbs [data-item="fur_coat"][data-verb="wear_garment"]');
  await expect(wear).toBeVisible();
  await wear.click();
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    for (let tick = 0; tick < d.sim.config.carry.equipTicks + 2; tick++) d.sim.step();
    d.renderer.render(null, 0);
  });
  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, person = d.sim.player;
    const modulePath = '/src/sim/knowledge/Tech.ts';
    const { warmthFrom } = await import(/* @vite-ignore */ modulePath);
    d.renderer.render(null, 0);
    return { item: person.equipment.torso?.item, owned: person.inventory.count('fur_coat'), warmth: warmthFrom(person) };
  });
  expect(state.item).toBe('fur_coat');
  expect(state.owned).toBe(1);
  expect(state.warmth).toBeCloseTo(0.4);
  await page.locator('.hud-tab[data-tab="self"]').click();
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText(/torso: Fur coat/);
  await page.screenshot({ path: `${shots}/01-fur-coat-worn-in-kit.png` });
  expect(errors).toEqual([]);
});
