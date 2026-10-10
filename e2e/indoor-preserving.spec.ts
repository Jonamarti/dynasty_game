import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a hosted rack dries meat inside a visible house room', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-indoor-rack&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  const made = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    person.knownTech.add('preserving'); sim.knownTech.add('preserving'); person.skills.cook = 100;
    let house: any = null;
    for (let radius = 3; radius < 24 && !house; radius++) {
      for (const [dx, dy] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius], [radius, radius]]) {
        const x = Math.round(person.x + dx), y = Math.round(person.y + dy);
        // A rim house cannot be framed above the HUD because the camera clamps to the world.
        if (x < 10 || y < 10 || x > sim.world.width - 10 || y > sim.world.height - 10) continue;
        house = sim.place('mud_hut', x, y, person.bandId);
        if (house) break;
      }
    }
    if (!house) throw new Error('No room fixture');
    house.complete = true; house.durability = house.def.workTicks;
    person.x = house.x + 1; person.y = house.y + 2; person.targetX = person.x; person.targetY = person.y;
    sim.peopleHash.rebuild(sim.livingPeople()); sim.step();
    const rack = sim.place('drying_rack', house.x + 1, house.y + 1, person.bandId);
    if (!rack) throw new Error(sim.lastRefusal);
    rack.complete = true; rack.durability = rack.def.workTicks;
    person.inventory.add('meat', 2); person.needs.cold = person.needs.fatigue = 0;
    if (!sim.order(person, 'craft', { recipeId: 'dried_meat', buildingId: rack.id })) throw new Error(sim.lastRefusal);
    for (let tick = 0; tick < 1000 && person.inventory.count('dried_meat') < 2; tick++) {
      person.needs.hunger = person.needs.thirst = 0; sim.step();
    }
    sim.time.tick = sim.config.time.ticksPerDay / 2;
    d.camera.zoom = 5; d.camera.snapTo(house.centerX, house.centerY - 2); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
    d.renderer.render(null, 0);
    return { host: rack.hostId === house.id, food: person.inventory.count('dried_meat') };
  });
  expect(made).toEqual({ host: true, food: 2 });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText('Carne seca');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))));
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase15b-indoor-rack-2026-10-10-final';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/03-secadero-interior-lejos-del-borde.png` });
  expect(errors).toEqual([]);
});
