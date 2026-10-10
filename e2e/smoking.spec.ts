import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a rack beside a hearth makes smoked food', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-smoking&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  const made = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    person.knownTech.add('preserving'); person.knownTech.add('smoking'); sim.knownTech.add('smoking'); sim.knownTech.add('preserving'); sim.knownTech.add('firemaking'); person.skills.cook = 100;
    sim.time.tick = sim.config.time.ticksPerDay / 2;
    let rack: any = null;
    for (let y = Math.floor(person.y) - 5; y <= person.y + 5 && !rack; y++) {
      for (let x = Math.floor(person.x) - 5; x <= person.x + 5 && !rack; x++) {
        rack = sim.place('drying_rack', x, y, person.bandId);
      }
    }
    if (!rack) throw new Error('No rack site');
    rack.complete = true; rack.durability = rack.def.workTicks;
    person.x = rack.centerX; person.y = rack.centerY;
    person.targetX = person.x; person.targetY = person.y;
    person.inventory.add('meat', 2); person.inventory.add('fish', 2); person.inventory.add('sticks', 2);
    let hearth: any = null;
    for (let y = rack.y - 2; y <= rack.y + 2 && !hearth; y++) {
      for (let x = rack.x - 2; x <= rack.x + 3 && !hearth; x++) {
        if (Math.hypot(x - rack.centerX, y - rack.centerY) <= 3) hearth = sim.place('hearth', x, y, person.bandId);
      }
    }
    if (!hearth) throw new Error('No hearth site');
    hearth.complete = true; hearth.durability = hearth.def.workTicks;
    person.needs.cold = person.needs.fatigue = 0;
    for (const recipeId of ['smoked_meat', 'smoked_fish']) {
      if (!sim.order(person, 'craft', { recipeId, buildingId: rack.id })) throw new Error(sim.lastRefusal);
      for (let tick = 0; tick < 1000 && person.inventory.count(recipeId) < 2; tick++) {
        person.needs.hunger = person.needs.thirst = 0; sim.step();
      }
    }
    d.camera.zoom = 5; d.camera.snapTo(rack.centerX, rack.centerY); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
    return { meat: person.inventory.count('smoked_meat'), fish: person.inventory.count('smoked_fish') };
  });
  expect(made).toEqual({ meat: 2, fish: 2 });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText('Carne ahumada');
  await expect(page.locator('.hud-panel')).toContainText('Pescado ahumado');
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase15b-smoking-2026-10-10';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-ahumado-junto-a-hoguera.png` });
  expect(errors).toEqual([]);
});

