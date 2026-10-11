/** M15 phase 26e: irrigation and terracing become usable field knowledge. */
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase26e-irrigation-2026-10-11';

test('Field web explains irrigation and terracing in Spanish', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m15-phase26e-irrigation&skipIntro=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 30_000 });

  await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, p = sim.player;
    if (!p) throw new Error('The game did not create a player');
    for (const tech of ['farming', 'irrigation', 'terracing']) {
      p.knownTech.add(tech); p.techLevel.set(tech, 1); sim.knownTech.add(tech);
    }
  });
  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });
  await page.locator('.techweb-gatemark[data-web="field"]').click();

  const irrigation = page.locator('.techweb-node[data-tech="irrigation"]');
  const terracing = page.locator('.techweb-node[data-tech="terracing"]');
  await expect(irrigation).toHaveCount(1);
  await expect(terracing).toHaveCount(1);
  await irrigation.hover();
  await expect(page.locator('.techweb-title')).toHaveText('Riego');
  await expect(page.locator('.techweb-detail')).toContainText('Lleva agua dulce');
  await page.screenshot({ path: SHOTS + '/01-riego-en-red-campo.png' });

  await terracing.hover();
  await expect(page.locator('.techweb-title')).toHaveText('Abancalado');
  await expect(page.locator('.techweb-detail')).toContainText('Nivela un campo en ladera');
  await page.screenshot({ path: SHOTS + '/02-bancales-en-red-campo.png' });
});

test('Earthworks node describes the first ditch design in Spanish', async ({ page }) => {
  const shots = 'artifacts/screenshots/m15-phase26e-earthworks-2026-10-11';
  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m15-phase26e-earthworks&skipIntro=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 30_000 });

  await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, p = sim.player;
    if (!p) throw new Error('The game did not create a player');
    for (const tech of ['ground_stone', 'basketry', 'earthworks']) {
      p.knownTech.add(tech); p.techLevel.set(tech, 1); sim.knownTech.add(tech);
    }
  });
  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });

  const node = page.locator('.techweb-node[data-tech="earthworks"]');
  await expect(node).toHaveCount(1);
  await node.hover();
  await expect(page.locator('.techweb-title')).toHaveText('Obras de tierra');
  await expect(page.locator('.techweb-detail')).toContainText('El primer diseño es una zanja');
  await page.screenshot({ path: shots + '/01-obras-de-tierra-red-principal.png' });
});
