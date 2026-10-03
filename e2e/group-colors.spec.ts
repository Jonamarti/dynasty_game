import { test, expect } from '@playwright/test';

test('a globally allocated low-ID outcast still draws in neutral grey', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-fixture&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty.renderer.art);
  const bandId = await page.evaluate(() => {
    const d = (window as any).__dynasty, person = d.sim.player;
    // Another comarca already owns the historical outcast preference. Exercise
    // the real membership transition, rather than painting an invented colour.
    d.sim.ids.claimGroupId('band', d.sim.bands.length + 1000);
    d.sim.removeBandMembership(person);
    d.camera.zoom = 6; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
    const draw = d.renderer.drawArtPerson.bind(d.renderer);
    d.renderer.drawArtPerson = (...args: any[]) => {
      (window as any).__drawingPersonId = args[1].id;
      return draw(...args);
    };
    const art = d.renderer.art, original = art.drawPerson.bind(art);
    art.drawPerson = (...args: any[]) => {
      if ((window as any).__drawingPersonId === person.id) (window as any).__outcastColour = args[1].band;
      return original(...args);
    };
    return person.bandId;
  });
  expect(bandId).toBeLessThan(1000);
  await expect.poll(() => page.evaluate(() => (window as any).__outcastColour)).toBe('#7d7d7d');
  const dir = process.env.DYNASTY_CAPTURE_DIR ??
    'artifacts/screenshots/m15-group-colours-' + new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: `${dir}/13-low-id-outcast.png` });
  expect(errors).toEqual([]);
});
