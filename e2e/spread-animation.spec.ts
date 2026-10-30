/** M15 phase 17: spreading compost uses a generated soil-spreading gesture. */
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version as string;

test('an active compost spreading order shows the soil-working gesture', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-spread-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const worker = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No player fixture');
    const Building = sim.buildings[0]?.constructor;
    if (!Building) throw new Error('No building constructor');
    const def = { id: 'field', label: 'Field', icon: '🌾', width: 4, height: 4, materials: {}, workTicks: 300,
      shelter: 0, storage: 0, field: true, placement: 'arable', description: 'field' };
    const field = new Building(def, Math.floor(person.x) - 1, Math.floor(person.y) - 1, person.bandId, sim.ids);
    field.complete = true;
    sim.buildings.push(field); sim.buildingsById.set(field.id, field);
    person.x = field.x + 0.5; person.y = field.y + 0.5;
    person.path = null; person.pathCount = person.pathAt = 0;
    // The fixture's default pack is full. Keep only the four physical units
    // the work needs so doSpread does not stop at its load-capacity gate.
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.knownTech.add('composting'); person.inventory.add('compost', 4);
    person.workedTicks = 0;
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    if (!sim.order(person, 'spread', { buildingId: field.id })) throw new Error('Simulation refused the compost spreading order');
    for (let tick = 0; tick < 20 && person.workedTicks <= 0; tick++) sim.step();
    if (person.workedTicks <= 0 || person.action !== 'spread') throw new Error(
      'The compost order never entered active work'
    );
    while (person.workedTicks < 5 && person.action === 'spread') sim.step();
    const modulePath = '/src/render/WorkAnimation.ts';
    const { spreadingCompostPose } = await import(modulePath);
    const pose = spreadingCompostPose(person, sim, false, 0);
    // Keep the worker in profile so the low sweep reads clearly in the capture.
    person.targetX = person.x + 0.5; person.targetY = person.y;
    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: person.action, workedTicks: person.workedTicks, timer: person.actionTimer, pose,
      targetBuildingId: person.targetBuildingId, fieldId: field.id, inField: field.contains(person.x, person.y) };
  });

  expect(worker.action).toBe('spread');
  expect(worker.workedTicks).toBeGreaterThan(0);
  expect(worker.timer).toBeGreaterThan(0);
  expect(worker.targetBuildingId).toBe(worker.fieldId);
  expect(worker.inField).toBe(true);
  expect(worker.pose).toBe('s2');
  await expect(page.locator('.game-version')).toContainText(`v${VERSION}`);
  await page.waitForTimeout(180);
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    d.renderer.interpolator.clear();
    d.renderer.render(null, 0);
  });
  const shots = 'artifacts/playwright/captures/spread-animation/m15-spread-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/00-active-compost-spreading.png` });
  expect(errors).toEqual([]);
});
