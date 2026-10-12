import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('hide rug in a household interior', async ({ page }) => {
  await page.goto('/?seed=m15-hide-rug&skipIntro=1&defaults=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    const { BUILDINGS, Building } = await import(/* @vite-ignore */ '/src/sim/entities/Building.ts');
    let house = null;
    for (let radius = 0; radius < 12 && !house; radius++) {
      for (let y = Math.floor(person.y) - radius; y <= Math.floor(person.y) + radius && !house; y++) {
        for (let x = Math.floor(person.x) - radius; x <= Math.floor(person.x) + radius; x++) {
          if (sim.canPlace(BUILDINGS.mud_hut, x, y)) {
            house = sim.place('mud_hut', x, y, person.bandId);
            if (house) break;
          }
        }
      }
    }
    if (!house) throw new Error('could not place a screenshot home');
    house.complete = true;
    house.durability = house.def.workTicks;
    const rug = new Building(BUILDINGS.rug, house.x + 1, house.y + 1, person.bandId, sim.ids);
    rug.hostId = house.id;
    rug.complete = true;
    sim.buildings.push(rug);
    sim.buildingsById.set(rug.id, rug);
    sim.buildingHash.insert(rug);
    sim.peopleHash.remove(person);
    person.x = house.centerX; person.y = house.centerY;
    person.targetX = person.x; person.targetY = person.y;
    sim.peopleHash.insert(person);
    d.camera.zoom = 7.5;
    d.camera.snapTo(house.centerX, house.centerY);
    d.camera.following = false;
    d.renderer.hideRoofs = true;
    d.renderer.interpolator.clear();
    d.renderer.render(null, 0);
  });
  const shots = 'artifacts/screenshots/m15-phase16d-hide-rug-2026-10-12';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-hide-rug-in-house.png` });
});
