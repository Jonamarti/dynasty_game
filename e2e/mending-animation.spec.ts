/** M15 phase 17: real physical garment repair drives a sewing gesture. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'test-results/m15-mending-animation';

test('an active garment repair order shows the sewing gesture', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-mending-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const mender = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No player fixture');
    person.knownTech.add('tailoring');
    person.inventory.add('fur_coat', 1);
    person.inventory.add('needle', 1);
    person.inventory.add('thread', 1);
    const garment = person.inventory.garmentUnitsOf('fur_coat')[0];
    if (!garment) throw new Error('No physical garment unit');
    person.inventory.setGarmentUnitCondition(garment.unitId, 0.5, 0);
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    if (!sim.order(person, 'mend_garment', { itemId: 'fur_coat', garmentUnitId: garment.unitId, garmentMendingMethod: 'tailoring' })) {
      throw new Error('Simulation refused the garment repair order');
    }
    for (let tick = 0; tick < 30 && person.workedTicks <= 0; tick++) sim.step();
    if (person.workedTicks <= 0 || person.action !== 'mend_garment' || person.actionTotal <= 0) {
      throw new Error('The garment repair order never entered active work');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { mendingPose } = await import(modulePath);
    const pose = mendingPose(person, false, 0);
    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: person.action, workedTicks: person.workedTicks, pose,
      wear: person.inventory.garmentUnitsOf('fur_coat')[0]?.wear };
  });

  expect(mender.action).toBe('mend_garment');
  expect(mender.workedTicks).toBeGreaterThan(0);
  expect(mender.wear).toBe(0.5);
  expect(mender.pose).toBe('r0');
  await page.waitForTimeout(180);
  await page.evaluate(() => (window as any).__dynasty.renderer.render(null, 0));
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/00-active-garment-mending.png` });
  expect(errors).toEqual([]);
});
