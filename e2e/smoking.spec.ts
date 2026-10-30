import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { placeStationFixtureOnClaimedGround } from './helpers';

test('a rack beside a hearth makes smoked food', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-smoking&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  const ready = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    person.knownTech.add('preserving'); person.knownTech.add('smoking'); sim.knownTech.add('smoking'); sim.knownTech.add('preserving'); sim.knownTech.add('firemaking'); person.skills.cook = 100;
    sim.time.tick = sim.config.time.ticksPerDay / 2;
    return { originX: person.x, originY: person.y };
  });
  // M16 2.22 refuses stations without territory; the fixture band has none.
  const rackSite = await page.evaluate(placeStationFixtureOnClaimedGround, {
    kind: 'drying_rack',
    originX: ready.originX,
    originY: ready.originY,
    radiusMin: 0,
    radiusLimit: 5,
    nodeClear: 0,
    treeClear: 0,
  });
  const hearthSite = await page.evaluate(placeStationFixtureOnClaimedGround, {
    kind: 'hearth',
    originX: rackSite.centerX,
    originY: rackSite.centerY,
    radiusMin: 1,
    radiusLimit: 3,
    nodeClear: 0,
    treeClear: 0,
  });
  const made = await page.evaluate(({ rackSite, hearthSite }) => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    const rack = sim.buildings.find((building: any) => building.id === rackSite.id);
    const hearth = sim.buildings.find((building: any) => building.id === hearthSite.id);
    if (!rack || !hearth) throw new Error('The rack or hearth fixture disappeared');
    rack.complete = true; rack.durability = rack.def.workTicks;
    person.x = rack.centerX; person.y = rack.centerY;
    person.targetX = person.x; person.targetY = person.y;
    person.inventory.add('meat', 2); person.inventory.add('fish', 2); person.inventory.add('sticks', 2);
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
  }, { rackSite, hearthSite });
  expect(made).toEqual({ meat: 2, fish: 2 });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText('Carne ahumada');
  await expect(page.locator('.hud-panel')).toContainText('Pescado ahumado');
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/playwright/captures/smoking/m15-phase15b-smoking-2026-10-10';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-ahumado-junto-a-hoguera.png` });
  expect(errors).toEqual([]);
});

