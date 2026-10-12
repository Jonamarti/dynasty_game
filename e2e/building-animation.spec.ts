/** M15 phase 17: a real build order drives the generated hammer stroke. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'test-results/m15-building-animation';

test('an active construction order shows the hammer gesture', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-building-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const builder = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No player fixture');
    const BUILDINGS = (window as any).__dynasty.BUILDINGS;
    const Building = sim.buildings[0]?.constructor;
    if (!Building) throw new Error('No building constructor');
    // Keep the real windbreak art/design while making its material delivery a
    // fixture setup detail; build progress still comes only from ActionSystem.
    const def = { ...(BUILDINGS?.windbreak ?? { id: 'windbreak', label: 'Windbreak', icon: '🪵', width: 2, height: 2,
      materials: {}, workTicks: 140, shelter: 0.4, storage: 0 }), materials: {} };
    const site = new Building(def, Math.floor(person.x) - 1, Math.floor(person.y) - 1, person.bandId, sim.ids);
    sim.buildings.push(site); sim.buildingsById.set(site.id, site);
    person.x = site.x + 0.5; person.y = site.y + 0.5;
    person.path = null; person.pathCount = person.pathAt = 0;
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    if (!sim.order(person, 'build', { buildingId: site.id })) throw new Error('Simulation refused the construction order');
    for (let tick = 0; tick < 30 && person.workedTicks <= 0; tick++) sim.step();
    if (person.workedTicks <= 0 || person.action !== 'build' || site.progress <= 0) {
      throw new Error('The construction order never entered active work');
    }
    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: person.action, workedTicks: person.workedTicks, progress: site.progress };
  });

  expect(builder.action).toBe('build');
  expect(builder.workedTicks).toBeGreaterThan(0);
  expect(builder.progress).toBeGreaterThan(0);
  // The simulation fixture moves the worker directly; let the renderer's
  // wall-clock movement observation expire so the still frame shows work.
  await page.waitForTimeout(180);
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    d.renderer.render(null, 0);
  });
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/00-active-windbreak-construction.png` });
  expect(errors).toEqual([]);
});
