import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const captureDir = 'artifacts/playwright/captures/m16-infants-cannot-dress/m16-2026-10-18-2.27';

test('the Kit explains that a baby cannot dress itself until the child stage', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m16-infant-dressing&skipIntro=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.evaluate(() => {
    const d = (window as never as { __dynasty: { sim: any; camera: any; renderer: any } }).__dynasty;
    const baby = d.sim.player;
    if (!baby) throw new Error('fixture needs a player');
    baby.age = 2;
    baby.inventory.add('fur_coat', 1);
    baby.needs.hunger = baby.needs.thirst = baby.needs.fatigue = baby.needs.cold = 0;
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();
    d.camera.following = false;
    d.camera.snapTo(baby.x, baby.y);
  });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  const refusedWear = page.locator('.hud-item-verbs button[title="Esa persona es demasiado pequeña para vestirse sola"]');
  await expect(refusedWear).toBeVisible();
  await expect(refusedWear).toHaveClass(/is-disabled/);
  mkdirSync(captureDir, { recursive: true });
  await page.screenshot({ path: `${captureDir}/01-infant-wear-refusal-es.png` });

  await page.evaluate(() => {
    const d = (window as never as { __dynasty: { sim: any } }).__dynasty;
    d.sim.player.age = d.sim.player.daysPerYear;
  });
  await page.locator('.hud-tab[data-tab="self"]').click();
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-item-verbs [data-item="fur_coat"][data-verb="wear_garment"]')).toBeEnabled();
});
