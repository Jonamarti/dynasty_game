/** M15 phase 17: real fruit-tree planting uses generated hand-to-soil poses. */
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'test-results/m15-planting-animation';
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version as string;

test('an active fruit-tree order shows the planting gesture', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-planting-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const planter = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No player fixture');
    for (let tick = 0; tick < 600 && sim.time.growth <= 0; tick++) sim.step();
    person.knownTech.add('arboriculture');
    person.inventory.add('apple', 1);
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    let spot: { x: number; y: number } | null = null;
    for (let r = 3; r < 20 && !spot; r++) for (let a = 0; a < 32 && !spot; a++) {
      const x = Math.round(person.x + Math.cos(a * Math.PI / 16) * r);
      const y = Math.round(person.y + Math.sin(a * Math.PI / 16) * r);
      if (sim.world.sameRegion(person.x, person.y, x, y) && sim.plantOrderRefusal(person, x, y) === null) spot = { x, y };
    }
    if (!spot) throw new Error('No valid tree-planting tile for the fixed seed');
    // Put the worker at the valid work tile so the test captures the work pose,
    // not the travel pose. Order execution still runs through ActionSystem.
    person.x = spot.x + 0.5; person.y = spot.y + 0.5;
    person.path = null; person.pathCount = person.pathAt = 0;
    if (!sim.order(person, 'plant', spot)) throw new Error('Simulation refused the tree-planting order');
    for (let tick = 0; tick < 20 && person.workedTicks <= 0; tick++) sim.step();
    if (person.workedTicks <= 0 || person.action !== 'plant') throw new Error('The tree-planting order never entered active work');
    const modulePath = '/src/render/WorkAnimation.ts';
    const { plantingPose } = await import(modulePath);
    const pose = plantingPose(person, sim, false, 0);
    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: person.action, workedTicks: person.workedTicks, timer: person.actionTimer,
      treesBefore: sim.trees.length, pose };
  });

  expect(planter.action).toBe('plant');
  expect(planter.workedTicks).toBeGreaterThan(0);
  expect(planter.timer).toBeGreaterThan(0);
  expect(planter.pose).toBe('p0');
  await expect(page.locator('.game-version')).toContainText(`v${VERSION}`);
  // The first render observes the deliberate teleport to the work tile and
  // starts the renderer's short walk-settling window. Let that observation
  // expire, then paint the same active order so the capture shows its gesture.
  await page.waitForTimeout(180);
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    d.renderer.interpolator.clear();
    d.renderer.render(null, 0);
  });
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/00-active-tree-planting.png` });
  expect(errors).toEqual([]);
});
