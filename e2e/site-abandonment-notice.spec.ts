/** M15 plan 2.2b: an NPC site's reason remains visible where the site stood. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const SHOTS = 'artifacts/screenshots/m15-site-abandonment-2026-10-15';

test('shows the reason over an abandoned site in view', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-site-abandonment&skipIntro=1&defaults=1&lang=en', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, player = sim.player;
    const sponsor = sim.livingPeople().find((person: any) => person.id !== player.id && person.bandId === player.bandId);
    if (!sponsor) throw new Error('No NPC sponsor fixture');
    const Building = sim.buildings[0]?.constructor;
    const path = '/src/sim/entities/Building.ts';
    const { BUILDINGS } = await import(/* @vite-ignore */ path);
    const def = BUILDINGS.windbreak;
    if (!Building || !def) throw new Error('No windbreak definition');
    const site = new Building(def, Math.floor(player.x), Math.floor(player.y), player.bandId, sim.ids);
    site.sponsorId = sponsor.id;
    sim.buildings.push(site);
    sim.buildingsById.set(site.id, site);
    sim.abandonSite(site);
    d.camera.zoom = 7.5;
    d.camera.snapTo(site.centerX, site.centerY);
    d.camera.following = false;
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();
  });

  await page.waitForFunction(() => (window as any).__dynasty.renderer.floaters.items
    .some((item: any) => item.text.includes('was shelved')));
  await page.waitForTimeout(150);
  await page.evaluate(() => (window as any).__dynasty.renderer.render(null, 0));
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/00-site-shelved-with-reason.png` });
  const floater = await page.evaluate(() => (window as any).__dynasty.renderer.floaters.items
    .find((item: any) => item.text.includes('was shelved')));
  expect(floater).toMatchObject({ color: '#e0705c', boxed: false });
  expect(errors).toEqual([]);
});
