/** M15 phase 17: sow/reap orders show a generated hand-worked crop gesture. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'test-results/m15-farming-animation';

test('an active harvest order shows the crop-working gesture', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-farming-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const farmer = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No player fixture');
    // Build a real field entity around the player's current position. The ripe
    // stage is fixture setup; order execution and work ticks use ActionSystem.
    const Building = sim.buildings[0]?.constructor;
    if (!Building) throw new Error('No building constructor');
    const def = { id: 'field', label: 'Field', icon: '🌾', width: 4, height: 4, materials: {}, workTicks: 300,
      shelter: 0, storage: 0, field: true, placement: 'arable', description: 'field' };
    const field = new Building(def, Math.floor(person.x) - 1, Math.floor(person.y) - 1, person.bandId, sim.ids);
    field.complete = true;
    field.crop.stage = 'ripe'; field.crop.growth = 1;
    sim.buildings.push(field); sim.buildingsById.set(field.id, field);
    // Stand at the field edge so the body and crop marker remain visually separate.
    person.x = field.x + 0.5; person.y = field.y + 0.5;
    person.path = null; person.pathCount = person.pathAt = 0;
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    if (!sim.order(person, 'reap', { buildingId: field.id })) throw new Error('Simulation refused the harvest order');
    for (let tick = 0; tick < 20 && person.workedTicks <= 0; tick++) sim.step();
    if (person.workedTicks <= 0 || person.action !== 'reap') throw new Error('The harvest order never entered active work');
    const modulePath = '/src/render/WorkAnimation.ts';
    const { farmingPose } = await import(modulePath);
    const pose = farmingPose(person, sim, false, 0);
    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: person.action, workedTicks: person.workedTicks, stage: field.crop.stage, pose,
      targetBuildingId: person.targetBuildingId, fieldId: field.id, inField: field.contains(person.x, person.y) };
  });

  expect(farmer.action).toBe('reap');
  expect(farmer.workedTicks).toBeGreaterThan(0);
  expect(farmer.stage).toBe('ripe');
  expect(farmer.pose).toBe('a0');
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/00-active-crop-harvest.png` });
  expect(errors).toEqual([]);
});
