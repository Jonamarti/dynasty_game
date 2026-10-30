/** M15 phase 17: hide treatment work gets generated grease-working poses. */
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version as string;

test('an active hide-dressing order shows the treatment gesture', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-hide-dressing-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const worker = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No player fixture');
    person.age = 30 * person.daysPerYear;
    person.knownTech.add('leatherwork'); person.knownTech.add('hide_dressing');
    person.inventory.add('fur_coat', 1); person.inventory.add('fat', 1);
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0];
    if (!unit || !sim.order(person, 'dress_hide', { itemId: 'fur_coat', garmentUnitId: unit.unitId })) {
      throw new Error('Simulation refused the hide-dressing order');
    }
    sim.step();
    if (person.action !== 'dress_hide' || person.workedTicks <= 0 || person.actionTotal <= 0) {
      throw new Error('Hide dressing did not enter active work');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { hideDressingPose } = await import(modulePath);
    const pose = hideDressingPose(person, false, 0);
    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: person.action, workedTicks: person.workedTicks, timer: person.actionTimer, pose };
  });

  expect(worker.action).toBe('dress_hide');
  expect(worker.workedTicks).toBeGreaterThan(0);
  expect(worker.timer).toBeGreaterThan(0);
  expect(worker.pose).toBe('h0');
  await expect(page.locator('.game-version')).toContainText(`v${VERSION}`);
  // Let the renderer observe the deliberate setup, then paint the committed pose.
  await page.waitForTimeout(180);
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    d.renderer.interpolator.clear();
    d.renderer.render(null, 0);
  });
  const shots = 'artifacts/playwright/captures/hide-dressing-animation/m15-hide-dressing-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/00-active-hide-dressing.png` });
  expect(errors).toEqual([]);
});
