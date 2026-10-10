import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const captureDir = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase16d-2026-10-10';

test('places a bed in the household home and captures the in-world sprite', async ({ page }) => {
  await page.goto('/?seed=phase16d-furniture&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  const placed = await page.evaluate(() => {
    const d = (window as never as { __dynasty: {
      sim: any;
      camera: { following: boolean; snapTo: (x: number, y: number) => void };
      renderer: { fogEnabled: boolean };
    } }).__dynasty;
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
    house.complete = true;
    house.durability = house.def.workTicks;
    const household = sim.householdsById.get(person.householdId);
    if (!household) throw new Error('player has no household');
    household.homeBuildingId = house.id;
    person.knownTech.add('carpentry');
    person.inventory.add('bed', 1);
    sim.peopleHash.remove(person);
    person.x = house.centerX;
    person.y = house.centerY;
    person.targetX = person.x;
    person.targetY = person.y;
    sim.peopleHash.insert(person);
    d.camera.following = false;
    d.camera.snapTo(house.centerX, house.centerY);
    d.renderer.fogEnabled = false;
    const accepted = sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'bed' });
    if (accepted) sim.step();
    return accepted && sim.buildings.some((building: any) => building.def.id === 'bed' && building.hostId === house.id);
  });
  expect(placed).toBe(true);
  mkdirSync(captureDir, { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${captureDir}/01-bed-in-house.png` });
});
