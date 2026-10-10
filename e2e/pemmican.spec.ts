import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { techsOfWeb } from '../src/sim/knowledge/Tech.ts';

test('pemmican is made and preservation opens a populated Spanish web', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-pemmican&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  const count = await page.evaluate(() => {
    const sim = (window as any).__dynasty.sim, person = sim.player;
    for (const tech of ['preserving', 'smoking', 'pemmican']) person.knownTech.add(tech);
    person.skills.cook = 100; person.inventory.add('dried_meat', 2); person.inventory.add('fat', 1);
    person.needs.cold = person.needs.fatigue = 0;
    if (!sim.order(person, 'craft', { recipeId: 'pemmican' })) throw new Error(sim.lastRefusal);
    for (let tick = 0; tick < 1000 && person.inventory.count('pemmican') < 2; tick++) {
      person.needs.hunger = person.needs.thirst = 0; sim.step();
    }
    return person.inventory.count('pemmican');
  });
  expect(count).toBe(2);
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText('Pemmican');
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase15b-pemmican-2026-10-10';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-pemmican-en-equipo.png` });
  await page.keyboard.press('g');
  await expect(page.locator('.techweb-gatemark[data-web="preservation"]')).toBeVisible();
  await page.locator('.techweb-gatemark[data-web="preservation"]').click();
  await expect(page.locator('.techweb-crumbs')).toContainText('Conservación');
  await expect(page.locator('.techweb-node[data-tech="smoking"]')).toBeVisible();
  await expect(page.locator('.techweb-node[data-tech="pemmican"]')).toBeVisible();
  await expect(page.locator('.techweb-node')).toHaveCount(techsOfWeb('preservation').length + 1);
  await page.screenshot({ path: `${shots}/02-red-conservacion.png` });
  expect(errors).toEqual([]);
});
