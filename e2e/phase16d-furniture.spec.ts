import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const captureDir = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/playwright/captures/phase16d-furniture/m15-phase16d-2026-10-10';
const fireplaceCaptureDir = 'artifacts/playwright/captures/phase16d-furniture/m15-phase16d-fireplace-2026-10-12';
const m16CaptureDir = 'artifacts/playwright/captures/phase16d-furniture/m16-2026-10-18-2.22';

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

test('places an indoor fireplace and captures its household sprite', async ({ page }) => {
  await page.goto('/?seed=phase16d-fireplace&skipIntro=1');
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
    person.knownTech.add('fireplace');
    person.inventory.add('fireplace', 1);
    sim.peopleHash.remove(person);
    person.x = house.centerX;
    person.y = house.centerY;
    person.targetX = person.x;
    person.targetY = person.y;
    sim.peopleHash.insert(person);
    d.camera.following = false;
    d.camera.snapTo(house.centerX, house.centerY);
    d.renderer.fogEnabled = false;
    const accepted = sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'fireplace' });
    if (accepted) sim.step();
    return accepted && sim.buildings.some((building: any) => building.def.id === 'fireplace' && building.hostId === house.id);
  });
  expect(placed).toBe(true);
  mkdirSync(fireplaceCaptureDir, { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${fireplaceCaptureDir}/01-fireplace-in-house.png` });
});

test('furniture and an outdoor station have no household banner', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m16-unbannered-furniture&skipIntro=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  const placed = await page.evaluate(() => {
    const d = (window as never as { __dynasty: {
      sim: any;
      camera: { following: boolean; snapTo: (x: number, y: number) => void };
      renderer: { fogEnabled: boolean };
    } }).__dynasty;
    const sim = d.sim;
    const person = sim.player;
    if (!person) throw new Error('player did not spawn');
    person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
    const centerX = sim.world.width / 2;
    const centerY = sim.world.height / 2;
    const sites: { x: number; y: number; distance: number }[] = [];
    for (let y = 3; y < sim.world.height - 5; y++) for (let x = 3; x < sim.world.width - 5; x++) {
      const distance = Math.hypot(x + 1.5 - centerX, y + 1.5 - centerY);
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
    person.knownTech.add('fireplace');
    person.knownTech.add('grinding');
    sim.knownTech.add('grinding');
    person.inventory.add('bed', 1);
    person.inventory.add('fireplace', 1);
    sim.peopleHash.remove(person);
    person.x = house.centerX;
    person.y = house.centerY;
    person.targetX = person.x;
    person.targetY = person.y;
    sim.peopleHash.insert(person);
    d.camera.following = false;
    d.renderer.fogEnabled = false;

    for (const itemId of ['bed', 'fireplace']) {
      const accepted = sim.order(person, 'place_furniture', { buildingId: house.id, itemId });
      if (!accepted) throw new Error(`could not order ${itemId}`);
      sim.step();
      if (!sim.buildings.some((building: any) => building.def.id === itemId && building.hostId === house.id)) {
        throw new Error(`${itemId} was not placed inside the home`);
      }
    }

    let station: any = null;
    for (let y = 3; y < sim.world.height - 5 && !station; y++) for (let x = 3; x < sim.world.width - 5; x++) {
      if (Math.hypot(x + 1.5 - house.centerX, y + 1.5 - house.centerY) > 8) continue;
      if (sim.trees.some((tree: any) => tree.standing && Math.hypot(tree.x - x, tree.y - y) < 3)) continue;
      if (sim.nodes.some((node: any) => Math.hypot(node.x - x, node.y - y) < 2)) continue;
      station = sim.place('quern', x, y, person.bandId, person.id, true);
      if (station) break;
    }
    if (!station) throw new Error('could not place an outdoor quern near the home');
    station.complete = true;
    station.durability = station.def.workTicks;
    return {
      home: { x: house.centerX, y: house.centerY },
      station: { x: station.centerX, y: station.centerY },
      stationRecord: {
        id: station.id, x: station.x, y: station.y, complete: station.complete,
        inBuildings: sim.buildings.includes(station),
      },
    };
  });
  mkdirSync(m16CaptureDir, { recursive: true });
  await page.evaluate(({ x, y }) => {
    const d = (window as never as { __dynasty: {
      camera: {
        snapTo: (x: number, y: number) => void;
        worldToScreenX: (x: number) => number;
        worldToScreenY: (y: number) => number;
      };
      renderer: { render: (highlight: null) => void };
    } }).__dynasty;
    d.camera.snapTo(x, y);
    d.renderer.render(null);
  }, placed.home);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${m16CaptureDir}/01-furnished-interior-es.png` });
  const stationScreen = await page.evaluate(({ x, y, stationRecord }) => {
    const d = (window as never as { __dynasty: {
      camera: {
        snapTo: (x: number, y: number) => void;
        worldToScreenX: (x: number) => number;
        worldToScreenY: (y: number) => number;
      };
      renderer: { render: (highlight: { buildingId?: number } | null) => void };
    } }).__dynasty;
    d.camera.snapTo(x, y);
    d.renderer.render({ buildingId: stationRecord.id });
    return { x: d.camera.worldToScreenX(x), y: d.camera.worldToScreenY(y) };
  }, { ...placed.station, stationRecord: placed.stationRecord });
  expect(placed.stationRecord.inBuildings).toBe(true);
  expect(placed.stationRecord.complete).toBe(true);
  expect(stationScreen.x).toBeGreaterThan(0);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${m16CaptureDir}/02-outdoor-station-es.png` });
});
