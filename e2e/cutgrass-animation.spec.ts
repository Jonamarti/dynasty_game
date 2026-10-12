/** M15 phase 17: real cut_grass work uses a generated low sweeping pose. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'test-results/m15-cutgrass-animation';

test('an active thatch-cutting order shows the grass-sweeping gesture', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=cut-grass-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const cutter = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No player fixture');
    const spot = sim.world.findTallGrass(person.x, person.y, 40, 0.7);
    if (!spot) throw new Error('The fixed seed has no reachable tall grass');
    person.x = spot.x + 0.5; person.y = spot.y + 0.5;
    person.path = null; person.pathCount = person.pathAt = 0;
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    if (!sim.order(person, 'cut_grass', { x: spot.x, y: spot.y })) throw new Error('Simulation refused the grass-cutting order');
    for (let tick = 0; tick < 20 && person.workedTicks <= 0; tick++) sim.step();
    if (person.workedTicks <= 0 || person.action !== 'cut_grass') throw new Error('The grass-cutting order never entered active work');
    const modulePath = '/src/render/WorkAnimation.ts';
    const { cuttingGrassPose } = await import(modulePath);
    const pose = cuttingGrassPose(person, sim, false, 0);
    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: person.action, workedTicks: person.workedTicks, grass: sim.world.grassAt(spot.x, spot.y), pose };
  });

  expect(cutter.action).toBe('cut_grass');
  expect(cutter.workedTicks).toBeGreaterThan(0);
  expect(cutter.grass).toBeGreaterThan(0.5);
  expect(cutter.pose).toBe('q0');
  await expect(page.locator('.game-version')).toContainText('0.15.122-alpha');
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/00-active-thatch-cutting.png` });
  expect(errors).toEqual([]);
});
