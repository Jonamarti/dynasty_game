/** M15 phase 17: dyeing a garment gets a visible four-stroke rubbing gesture. */
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version as string;

test('an active garment dye order shows rubbing work before the pigment commits', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-dyeing-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const work = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No player fixture');
    person.age = 30 * person.daysPerYear;
    person.knownTech.add('dyeing');
    person.inventory.add('fur_coat', 1); person.inventory.add('red_ochre', 1);
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0];
    if (!unit) throw new Error('No physical garment unit');
    if (!sim.order(person, 'dye_garment', { itemId: 'fur_coat', garmentUnitId: unit.unitId })) {
      throw new Error('Simulation refused the garment dye order');
    }
    for (let tick = 0; tick < 12 && person.workedTicks < 3; tick++) sim.step();
    if (person.action !== 'dye_garment' || person.workedTicks !== 3 || person.actionTotal !== 8) {
      throw new Error('The garment dye order never entered active work');
    }
    // Face east so the active rubbing stroke is visible in profile. The game
    // remains paused; this target only selects facing and does not advance work.
    person.targetX = person.x + 0.5; person.targetY = person.y;
    person.path = null; person.pathCount = person.pathAt = 0;
    const modulePath = '/src/render/WorkAnimation.ts';
    const { dyeingPose } = await import(modulePath);
    const pose = dyeingPose(person, false, 0);
    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: person.action, workedTicks: person.workedTicks, timer: person.actionTimer,
      pose, pigment: person.inventory.count('red_ochre'), dye: unit.dye };
  });

  expect(work.action).toBe('dye_garment');
  expect(work.workedTicks).toBe(3);
  expect(work.timer).toBeGreaterThan(0);
  expect(work.pose).toBe('y1');
  await expect(page.locator('.game-version')).toContainText(`v${VERSION}`);
  expect(work.pigment).toBe(1);
  expect(work.dye).toBeUndefined();
  await page.waitForTimeout(180);
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    d.renderer.interpolator.clear(); d.renderer.render(null, 0);
  });
  const shots = test.info().outputPath('captures');
  await page.screenshot({ path: `${shots}/00-active-garment-dyeing.png` });

  const result = await page.evaluate(() => {
    const d = (window as any).__dynasty, person = d.sim.player;
    while (person.order !== null) d.sim.step();
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0];
    return { dye: unit?.dye, pigment: person.inventory.count('red_ochre') };
  });
  expect(result).toEqual({ dye: 'ochre', pigment: 0 });
  expect(errors).toEqual([]);
});
