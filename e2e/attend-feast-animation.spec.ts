/** M15 phase 17: feast guests visibly sit once they reach the host's public target. */
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version as string;

test('a reached feast guest sits through the active attend order', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-attend-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, guest = sim.player;
    const host = sim.livingPeople().find((p: any) => p.id !== guest?.id);
    if (!guest || !host) throw new Error('No guest/host fixture');
    const buildingPath = '/src/sim/entities/Building.ts';
    const householdPath = '/src/sim/entities/Household.ts';
    const [{ Building, BUILDINGS }, { Household }] = await Promise.all([
      import(buildingPath), import(householdPath),
    ]);
    host.knownTech.add('brewing');
    const home = new Building(BUILDINGS.mud_hut, Math.max(2, Math.floor(host.x) - 1),
      Math.max(2, Math.floor(host.y) - 1), host.bandId);
    home.complete = true; home.store.add('bread', 20);
    const household = new Household('Animation feast', host.id, host.bandId, sim.time.tick);
    household.add(host.id); household.homeBuildingId = home.id; host.householdId = household.id;
    sim.households.push(household); sim.householdsById.set(household.id, household);
    sim.buildings.push(home); sim.buildingsById.set(home.id, home);
    host.x = home.centerX; host.y = home.centerY;
    host.needs.hunger = host.needs.thirst = host.needs.fatigue = host.needs.cold = 0;
    if (!sim.order(host, 'feast', { buildingId: home.id })) throw new Error('Simulation refused the fixture feast');
    for (let tick = 0; tick < 8 && host.feastServed === null; tick++) sim.step();
    if (host.action !== 'feast' || host.feastServed === null) throw new Error('The fixture feast did not start');
    guest.needs.hunger = guest.needs.thirst = guest.needs.fatigue = guest.needs.cold = guest.needs.company = 0;
    // Share the reached seat tile so the screenshot cannot catch a walking
    // transition while the guest's attend clock is already active.
    guest.x = host.x; guest.y = host.y;
    const otherGuest = sim.livingPeople().find((p: any) => p.id !== guest.id && p.id !== host.id);
    if (otherGuest) { otherGuest.x = host.x; otherGuest.y = host.y; otherGuest.needs.hunger = otherGuest.needs.company = 100; }
    if (!sim.order(guest, 'attend', { personId: host.id })) throw new Error('Simulation refused the attend order');
    for (let tick = 0; tick < 8 && guest.actionTicks < 5; tick++) sim.step();
    const distance = Math.hypot(guest.x - guest.targetX, guest.y - guest.targetY);
    if (guest.action !== 'attend' || guest.actionTicks < 5 || distance > 4) {
      throw new Error('The guest did not reach an active feast seat');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { attendingFeastPose } = await import(modulePath);
    const pose = attendingFeastPose(guest, false, 0);
    // The public seat point is reached. Park the renderer's movement tracker as
    // the test fixture has teleported actors; this keeps a stale walk frame
    // from masking the seated art in the screenshot.
    guest.targetX = guest.x; guest.targetY = guest.y;
    guest.path = null; guest.pathCount = guest.pathAt = 0;
    // The feast fixture deliberately overlaps its host and spare guest while
    // advancing the simulation. Separate them for the render assertion: later
    // person draws otherwise cover the selected guest's stool and folded legs.
    host.x = guest.x + 2.5; host.y = guest.y + 2.5;
    if (otherGuest) { otherGuest.x = guest.x - 2.5; otherGuest.y = guest.y + 2.5; }
    const track = d.renderer.walkPhase.get(guest.id);
    if (track) { track.x = guest.x; track.y = guest.y; track.movedAt = -Infinity; }
    d.camera.zoom = 14; d.camera.snapTo(guest.x, guest.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: guest.action, actionTicks: guest.actionTicks, distance, pose };
  });

  expect(state.action).toBe('attend');
  expect(state.actionTicks).toBeGreaterThanOrEqual(5);
  expect(state.distance).toBeLessThanOrEqual(4);
  expect(state.pose).toBe('v2');
  await expect(page.locator('.game-version')).toContainText(`v${VERSION}`);
  await page.waitForTimeout(180);
  const rendered = await page.evaluate(async () => {
    const d = (window as any).__dynasty;
    d.renderer.interpolator.clear();
    // Keep the pixel assertion and evidence legible despite the fixed seed
    // landing at night; this changes only the captured lighting pass.
    d.renderer.drawNightOverlay = () => {};
    const guest = d.sim.player, track = d.renderer.walkPhase.get(guest.id);
    if (track) { track.x = guest.x; track.y = guest.y; track.movedAt = -Infinity; }
    const seen: any = { pose: null, aspect: null, key: null, image: null, ox: 0, oy: 0, drawX: 0, drawY: 0, artScale: 0 };
    const atlas = d.renderer.art, sprite = atlas.sprite;
    const personKey = (slot: string, variant: string, age: string, sex: string, dir: string, pose: string) =>
      `p/${slot}/${variant}/${age}.${sex}/${dir}/${pose}`;
    const drawPerson = atlas.drawPerson;
    const draw = d.renderer.drawArtPerson.bind(d.renderer);
    let drawingGuest = false;
    atlas.sprite = function(aspect: any) {
      const result = sprite.call(this, aspect);
      if (drawingGuest) {
        seen.pose = aspect.pose; seen.aspect = aspect;
        seen.key = personKey('legs', 'base', aspect.age, aspect.sex, aspect.dir === 'W' ? 'E' : aspect.dir, aspect.pose);
        seen.image = result.image; seen.ox = result.ox; seen.oy = result.oy;
      }
      return result;
    };
    atlas.drawPerson = function(ctx: any, aspect: any, x: number, y: number, scale: number) {
      if (drawingGuest) { seen.drawX = x; seen.drawY = y; seen.artScale = scale; }
      return drawPerson.call(this, ctx, aspect, x, y, scale);
    };
    d.renderer.drawArtPerson = (art: any, person: any, ...args: any[]) => {
      if (person.id === guest.id) {
        drawingGuest = true;
        try { return draw(art, person, ...args); }
        finally { drawingGuest = false; }
      }
      return draw(art, person, ...args);
    };
    d.renderer.render(null, 0);
    atlas.sprite = sprite;
    atlas.drawPerson = drawPerson;
    d.renderer.drawArtPerson = draw;
    const idleSprite = atlas.sprite({ ...seen.aspect, pose: 'idle' });
    const imageCtx = seen.image?.getContext('2d');
    if (!imageCtx) throw new Error('The selected guest sprite was not composed');
    const image = imageCtx.getImageData(0, 0, seen.image.width, seen.image.height).data;
    const stoolPixels: Array<[number, number]> = [];
    for (let y = 0; y < seen.image.height; y++) for (let x = 0; x < seen.image.width; x++) {
      const i = (y * seen.image.width + x) * 4;
      // The generated stool seat is W.fur (#8d6c46); the worn blue tunic,
      // skin, hair and ground ring do not use this brown.
      if (image[i]! === 141 && image[i + 1]! === 108 && image[i + 2]! === 70 && image[i + 3]! > 240) stoolPixels.push([x, y]);
    }
    const canvas = d.renderer.canvas as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const dpr = canvas.width / canvas.clientWidth;
    let visibleStoolPixels = 0;
    for (let n = 0; n < stoolPixels.length; n += 2) {
      const [x, y] = stoolPixels[n]!;
      const sx = Math.round((seen.drawX + (seen.ox + x) * seen.artScale) * dpr);
      const sy = Math.round((seen.drawY + (seen.oy + y) * seen.artScale) * dpr);
      if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) continue;
      const pixel = ctx.getImageData(sx, sy, 1, 1).data;
      if (Math.abs(pixel[0]! - 141) < 35 && Math.abs(pixel[1]! - 108) < 35 && Math.abs(pixel[2]! - 70) < 35) visibleStoolPixels++;
    }
    const idleKey = personKey('legs', 'base', seen.aspect.age, seen.aspect.sex, seen.aspect.dir === 'W' ? 'E' : seen.aspect.dir, 'idle');
    const manifest = atlas.peopleManifest;
    return {
      pose: seen.pose, aspect: { age: seen.aspect.age, sex: seen.aspect.sex, dir: seen.aspect.dir },
      key: seen.key, keyExists: manifest.keys[seen.key] !== undefined,
      idleKeyExists: manifest.keys[idleKey] !== undefined,
      seatBox: atlas.assetBox('people', seen.key), idleBox: atlas.assetBox('people', idleKey),
      spriteSize: [seen.image.width, seen.image.height], idleSize: [idleSprite.image.width, idleSprite.image.height],
      stoolPixels: stoolPixels.length, visibleStoolPixels,
    };
  });
  expect(rendered.pose).toBe('v2');
  expect(rendered.stoolPixels).toBeGreaterThan(20);
  const shots = 'artifacts/screenshots/m15-attend-feast-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/00-seated-feast-guest.png` });
  expect(rendered.key).toBe('p/legs/base/adult.m/S/v2');
  expect(rendered.keyExists).toBe(true);
  expect(rendered.spriteSize[0]).toBeGreaterThan(rendered.idleSize[0]);
  expect(rendered.visibleStoolPixels, JSON.stringify(rendered)).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});
