import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const captureDir = 'artifacts/playwright/captures/m16-bedding-player-use/m16-2026-10-21-2.20';

test('orders sleep on household bedding and picks it up from the radial menu', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m16-bedding-player-use&skipIntro=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  const bedding = await page.evaluate(() => {
    const d = (window as never as { __dynasty: { sim: any; camera: any; renderer: any } }).__dynasty;
    const { sim, camera, renderer } = d;
    const person = sim.player;
    if (!person) throw new Error('player did not spawn');
    let home: any = null;
    for (let y = 3; y < sim.world.height - 5 && !home; y++) for (let x = 3; x < sim.world.width - 5; x++) {
      if (Math.hypot(x + 1.5 - person.x, y + 1.5 - person.y) > 10) continue;
      home = sim.place('mud_hut', x, y, person.bandId);
      if (home) break;
    }
    if (!home) throw new Error('could not site a household home');
    home.complete = true; home.durability = home.def.workTicks;
    const household = sim.householdsById.get(person.householdId);
    if (!household) throw new Error('player has no household');
    household.homeBuildingId = home.id;
    sim.peopleHash.remove(person);
    person.x = home.centerX; person.y = home.centerY;
    person.targetX = person.x; person.targetY = person.y;
    sim.peopleHash.insert(person);
    person.inventory.add('bedding', 1);
    const placed = sim.order(person, 'place_furniture', { buildingId: home.id, itemId: 'bedding' });
    if (!placed) throw new Error(sim.lastRefusal ?? 'bedding order was refused');
    sim.step();
    const piece = sim.buildings.find((candidate: any) => candidate.def.id === 'bedding' && candidate.hostId === home.id);
    if (!piece) throw new Error('bedding was not placed');
    camera.following = false;
    camera.snapTo(piece.centerX, piece.centerY);
    renderer.fogEnabled = false;
    return { x: piece.centerX, y: piece.centerY, id: piece.id };
  });
  mkdirSync(captureDir, { recursive: true });
  const point = await page.evaluate(({ x, y }) => {
    const camera = (window as never as { __dynasty: { camera: any } }).__dynasty.camera;
    return { x: camera.worldToScreenX(x), y: camera.worldToScreenY(y) };
  }, bedding);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const picker = page.locator('.picker-item', { hasText: 'Lecho' }).first();
  if (await picker.isVisible().catch(() => false)) await picker.click();
  const sleep = page.locator('.radial-item', { hasText: 'Dormir aquí' }).first();
  await expect(sleep).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.radial-item', { hasText: 'Recoger lecho' }).first()).toBeVisible();
  await page.screenshot({ path: `${captureDir}/01-sleep-on-bedding-menu-es.png` });
  await sleep.click();
  await expect.poll(() => page.evaluate(() => {
    const d = (window as never as { __dynasty: { sim: any } }).__dynasty;
    return d.sim.player.action === 'sleep';
  })).toBe(true);

  await page.mouse.click(point.x, point.y, { button: 'right' });
  const secondPicker = page.locator('.picker-item', { hasText: 'Lecho' }).first();
  if (await secondPicker.isVisible().catch(() => false)) await secondPicker.click();
  const take = page.locator('.radial-item', { hasText: 'Recoger lecho' }).first();
  await expect(take).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: `${captureDir}/02-pick-up-bedding-menu-es.png` });
  await take.click();
  await page.evaluate(() => {
    const sim = (window as never as { __dynasty: { sim: any } }).__dynasty.sim;
    for (let i = 0; i < 20; i++) sim.step();
  });
  await expect.poll(() => page.evaluate(({ id }) => {
    const sim = (window as never as { __dynasty: { sim: any } }).__dynasty.sim;
    return !sim.buildingsById.has(id) && sim.player.inventory.count('bedding') === 1;
  }, bedding)).toBe(true);
});
