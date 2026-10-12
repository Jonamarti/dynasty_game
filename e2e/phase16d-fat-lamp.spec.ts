import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const captureDir = process.env.DYNASTY_CAPTURE_DIR ??
  'artifacts/screenshots/m15-phase16d-fat-lamp-2026-10-11';

test('shows and captures the refuel option for a lit indoor fat lamp in Spanish', async ({ page }) => {
  await page.goto('/?seed=phase16d-fat-lamp&skipIntro=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  const lamp = await page.evaluate(() => {
    const d = (window as any).__dynasty;
    const sim = d.sim;
    const person = sim.player;
    if (!person) throw new Error('player did not spawn');
    const sites: { x: number; y: number; distance: number }[] = [];
    for (let y = 3; y < sim.world.height - 5; y++) for (let x = 3; x < sim.world.width - 5; x++) {
      const distance = Math.hypot(x + 1.5 - person.x, y + 1.5 - person.y);
      if (distance >= 2 && distance <= 10) sites.push({ x, y, distance });
    }
    sites.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
    let house: any = null;
    for (const site of sites) {
      house = sim.place('mud_hut', site.x, site.y, person.bandId);
      if (house) break;
    }
    if (!house) throw new Error('could not site house near player');
    house.complete = true; house.durability = house.def.workTicks;
    sim.householdsById.get(person.householdId).homeBuildingId = house.id;
    person.knownTech.add('fat_lamp'); person.inventory.add('fat_lamp', 1); person.inventory.add('fat', 2);
    sim.peopleHash.remove(person);
    person.x = house.centerX; person.y = house.centerY;
    person.targetX = person.x; person.targetY = person.y;
    sim.peopleHash.insert(person);
    const accepted = sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'fat_lamp' });
    if (!accepted) throw new Error(sim.lastRefusal ?? 'lamp placement refused');
    sim.step();
    const placed = sim.buildings.find((building: any) => building.def.id === 'fat_lamp' && building.hostId === house.id);
    if (!placed) throw new Error('fat lamp was not placed');
    placed.fuelRemaining = 600;
    sim.time.tick = 0;
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();
    d.camera.following = false; d.camera.zoom = 6; d.camera.snapTo(placed.centerX, placed.centerY);
    return { x: placed.centerX, y: placed.centerY };
  });
  const at = await page.evaluate((point: { x: number; y: number }) => {
    const camera = (window as any).__dynasty.camera;
    const rect = document.getElementById('view')!.getBoundingClientRect();
    return { x: rect.left + camera.worldToScreenX(point.x), y: rect.top + camera.worldToScreenY(point.y) };
  }, lamp);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.locator('.picker')).toBeVisible();
  await page.locator('.picker-item', { hasText: 'Lámpara de grasa' }).click();
  const refill = page.locator('.radial-item', { hasText: 'Recargar lámpara' }).first();
  await expect(refill).toBeVisible({ timeout: 10000 });
  await expect(refill).toBeEnabled();
  await mkdirSync(captureDir, { recursive: true });
  await page.screenshot({ path: `${captureDir}/01-lampara-y-opcion-de-recarga.png` });
});
