import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('clothing knowledge opens its own Spanish web with working recipe nodes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-clothing-web&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.evaluate(() => {
    const p = (window as any).__dynasty.sim.player;
    p.knownTech.delete('clothing');
  });
  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible();
  await expect(page.locator('.techweb-gatemark[data-web="clothing"]')).toHaveCount(0);
  await expect(page.locator('.techweb-node[data-tech="toggles"]')).toHaveCount(0);
  await page.evaluate(() => {
    const p = (window as any).__dynasty.sim.player;
    for (const tech of ['clothing', 'tailoring', 'toggles', 'linen_tunic', 'wool_cloak']) p.knownTech.add(tech);
  });
  const gate = page.locator('.techweb-gatemark[data-web="clothing"]');
  await expect(gate).toBeVisible();
  await expect(gate).toHaveAttribute('title', /Abrir Ropa:/);
  await gate.click();
  await expect(page.locator('.techweb-crumbs .is-here')).toHaveText('Ropa');
  await expect(page.locator('.techweb-node.is-anchor')).toHaveAttribute('data-tech', 'clothing');
  for (const tech of ['toggles', 'linen_tunic', 'wool_cloak']) {
    await expect(page.locator(`.techweb-node[data-tech="${tech}"]`)).toBeVisible();
  }
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase14c-clothing-web-2026-10-10';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-red-de-ropa.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('.techweb-crumbs')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.techweb')).toBeHidden();
  expect(errors).toEqual([]);
});
