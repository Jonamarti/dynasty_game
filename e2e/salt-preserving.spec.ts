import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { placeStationFixtureOnClaimedGround } from './helpers';

test('a coastal salt pan supplies salt for meat and fish', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-salt&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  const ready = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    for (const tech of ['saltmaking', 'salting', 'firemaking']) { person.knownTech.add(tech); sim.knownTech.add(tech); }
    person.skills.cook = 100;
    return { originX: person.x, originY: person.y };
  });
  // M16 2.22 refuses stations without territory; the fixture band has none.
  // The pan walks the world's shore tiles, nearest first, exactly like the
  // inline scan it replaces; the hearth sits beside whichever pan succeeds.
  const panSite = await page.evaluate(placeStationFixtureOnClaimedGround, {
    kind: 'salt_pan',
    originX: ready.originX,
    originY: ready.originY,
    shore: true,
    nodeClear: 0,
    treeClear: 0,
  });
  const hearthSite = await page.evaluate(placeStationFixtureOnClaimedGround, {
    kind: 'hearth',
    originX: panSite.centerX,
    originY: panSite.centerY,
    radiusMin: 1,
    radiusLimit: 3,
    nodeClear: 0,
    treeClear: 0,
  });
  const made = await page.evaluate(({ panSite, hearthSite }) => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    const pan = sim.buildings.find((building: any) => building.id === panSite.id);
    const fire = sim.buildings.find((building: any) => building.id === hearthSite.id);
    if (!pan || !fire) throw new Error('The pan or hearth fixture disappeared');
    pan.complete = true; pan.durability = pan.def.workTicks;
    fire.complete = true; fire.durability = fire.def.workTicks;
    person.x = pan.centerX; person.y = pan.centerY; sim.peopleHash.rebuild(sim.livingPeople());
    person.targetX = person.x; person.targetY = person.y;
    for (const [item, count] of person.inventory.entries()) person.inventory.remove(item, count);
    person.inventory.add('pottery', 1); person.inventory.add('sticks', 4);
    person.needs.cold = person.needs.fatigue = 0;
    for (let batch = 0; batch < 2; batch++) {
      if (!sim.order(person, 'craft', { recipeId: 'salt', buildingId: pan.id })) throw new Error(sim.lastRefusal);
      for (let tick = 0; tick < 1000 && person.inventory.count('salt') < (batch + 1) * 2; tick++) {
        person.needs.hunger = person.needs.thirst = 0; sim.step();
      }
    }
    for (const kind of ['meat', 'fish']) {
      person.inventory.add(kind, 2);
      if (!sim.order(person, 'craft', { recipeId: 'salted_' + kind })) throw new Error(sim.lastRefusal);
      for (let tick = 0; tick < 1000 && person.inventory.count('salted_' + kind) < 2; tick++) {
        person.needs.hunger = person.needs.thirst = 0; sim.step();
      }
    }
    sim.time.tick = sim.config.time.ticksPerDay / 2;
    d.camera.zoom = 5; d.camera.snapTo(pan.centerX, pan.centerY); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
    return { salt: person.inventory.count('salt'), meat: person.inventory.count('salted_meat'), fish: person.inventory.count('salted_fish') };
  }, { panSite, hearthSite });
  expect(made).toEqual({ salt: 2, meat: 2, fish: 2 });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-panel')).toContainText('Carne salada');
  await expect(page.locator('.hud-panel')).toContainText('Pescado salado');
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/playwright/captures/salt-preserving/m15-phase15b-salt-2026-10-10-final';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/01-salina-en-la-costa.png` });
  await page.locator('.hud-panel-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: `${shots}/03-alimentos-salados-desplazados.png` });
  expect(errors).toEqual([]);
});
