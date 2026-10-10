import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('house roof lifts on hover, when occupied, and with V while paused', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=roof-lift&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  const shots = process.env.DYNASTY_CAPTURE_DIR ??
    'artifacts/screenshots/m15-roof-lift-' + new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(shots, { recursive: true });

  const fixture = await page.evaluate(async () => {
    const d = (window as any).__dynasty, p = d.sim.player;
    let house: any = null;
    for (let radius = 3; radius < 24 && !house; radius++) {
      for (const [dx, dy] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius], [radius, radius]]) {
        house = d.sim.place('mud_hut', Math.round(p.x + dx), Math.round(p.y + dy), p.bandId, null);
        if (house) break;
      }
    }
    if (!house) throw new Error('Could not place a house fixture');
    house.complete = true;
    const modulePath = '/src/sim/world/HouseInterior.ts';
    const { houseDoor } = await import(/* @vite-ignore */ modulePath) as { houseDoor: (b: any, band: any) => any };
    const owner = d.sim.bands.find((band: any) => band.id === house.ownerBandId);
    const door = houseDoor(house, owner);
    p.x = house.x + 1.5; p.y = house.y + 1.5;
    p.path = null; p.pathCount = p.pathAt = 0;
    d.camera.following = false; d.camera.zoom = 4;
    d.camera.snapTo(house.x + house.def.width / 2, house.y + house.def.height / 2);
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
    d.renderer.hideRoofs = false;
    const layers: string[] = [];
    const drawLayer = d.renderer.drawInteriorLayer.bind(d.renderer);
    d.renderer.drawInteriorLayer = (building: any, layer: string) => {
      if (building.id === house.id) {
        layers.push(layer);
        (window as any).__roofTestLayers = layers;
      }
      return drawLayer(building, layer);
    };
    return { x: house.x, y: house.y, width: house.def.width, height: house.def.height,
      id: house.id, door, tick: d.sim.time.tick, layers, screen: d.camera.worldToScreenX(house.x + house.def.width / 2) };
  });
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${shots}/01-interior-occupied.png` });
  expect(await page.evaluate(() => (window as any).__roofTestLayers)).toContain('floor');
  expect(await page.evaluate(() => (window as any).__roofTestLayers)).toContain('walls');
  expect(await page.evaluate(() => (window as any).__roofTestLayers)).toContain('front');
  expect(await page.evaluate(() => {
    const layers = (window as any).__roofTestLayers;
    return layers.indexOf('walls') < layers.indexOf('front');
  })).toBe(true);
  expect(await page.evaluate(({ id, side }) => {
    const d = (window as any).__dynasty, b = d.sim.buildings.find((v: any) => v.id === id);
    return b.interiorDoorSide === side && ('b/' + b.def.id + '/walls-' + side) in d.renderer.art.manifest('buildings').keys;
  }, { id: fixture.id, side: fixture.door.side })).toBe(true);
  expect(await page.evaluate(() => (window as any).__dynasty.sim.time.tick)).toBe(fixture.tick);

  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    d.sim.player.x += 8; d.sim.player.y += 8;
    d.renderer.frameHighlight = null;
    d.renderer.cursorWorld = null;
    d.renderer.render(null, 0);
    (window as any).__roofTestLayers.length = 0;
  });
  const box = await page.evaluate((id) => {
    const d = (window as any).__dynasty, b = d.sim.buildings.find((v: any) => v.id === id);
    return { x: d.camera.worldToScreenX(b.x + b.def.width / 2), y: d.camera.worldToScreenY(b.y + b.def.height / 2) };
  }, fixture.id);
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${shots}/02-roof-lifted-on-hover.png` });
  expect(await page.evaluate(() => (window as any).__dynasty.renderer.cursorWorld)).not.toBeNull();
  expect(await page.evaluate(() => (window as any).__roofTestLayers)).toContain('floor');

  await page.mouse.move(8, 8);
  await page.keyboard.press('v');
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => (window as any).__dynasty.renderer.hideRoofs)).toBe(true);
  await page.screenshot({ path: `${shots}/03-roof-lifted-with-v.png` });
  await page.keyboard.press('v');
  expect(await page.evaluate(() => (window as any).__dynasty.renderer.hideRoofs)).toBe(false);
  expect(await page.evaluate(() => (window as any).__dynasty.sim.time.tick)).toBe(fixture.tick);

  // A legacy footprint must not be stretched over the current 4x4 generated room.
  const legacyLayers = await page.evaluate((id) => {
    const d = (window as any).__dynasty, b = d.sim.buildings.find((v: any) => v.id === id);
    d.sim.player.x += 12; d.sim.player.y += 12;
    b.def.width = 3; b.def.height = 3;
    d.renderer.hideRoofs = true;
    (window as any).__roofTestLayers.length = 0;
    d.renderer.render(null, 0);
    return [...(window as any).__roofTestLayers];
  }, fixture.id);
  expect(legacyLayers).not.toContain('floor');
  expect(legacyLayers).not.toContain('walls');
  expect(await page.evaluate(() => (window as any).__dynasty.sim.time.tick)).toBe(fixture.tick);
  expect(errors).toEqual([]);
});
