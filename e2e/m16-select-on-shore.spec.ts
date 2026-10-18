import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const captureDir = 'artifacts/screenshots/m16-2026-10-18-2.23';

async function clickPersonOnCoast(page: Page, kind: 'wading' | 'beach'): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m16-select-on-shore&skipIntro=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  const located = await page.evaluate(kind => {
    const d = (window as never as { __dynasty: {
      sim: any;
      camera: { following: boolean; snapTo: (x: number, y: number) => void };
      renderer: { fogEnabled: boolean };
    } }).__dynasty;
    const { sim, camera, renderer } = d;
    const world = sim.world;
    const person = sim.livingPeople().find((candidate: any) => candidate.id !== sim.player?.id);
    if (!person) throw new Error('fixture needs an NPC separate from the player');
    renderer.fogEnabled = false;
    camera.following = false;

    const siteClear = (x: number, y: number) =>
      sim.peopleHash.queryRadius(x, y, 1.5).every((other: any) => other.id === person.id) &&
      sim.animalHash.queryRadius(x, y, 1.5).length === 0 &&
      sim.treeHash.queryRadius(x, y, 1.5).every((tree: any) => !tree.standing) &&
      sim.nodeHash.queryRadius(x, y, 1.5).length === 0 &&
      sim.pileHash.queryRadius(x, y, 1.5).length === 0 &&
      sim.buildingAt(x, y) === null;

    let site: { x: number; y: number } | null = null;
    for (let y = 4; y < world.height - 4 && !site; y++) for (let x = 4; x < world.width - 4; x++) {
      if (kind === 'wading') {
        if (!world.isWadeTile(x, y) || !siteClear(x + 0.1, y + 0.1)) continue;
        site = { x: x + 0.1, y: y + 0.1 };
        break;
      }
      if (world.isWater(x, y) || world.biomeAt(x, y) !== 'beach' ||
          !world.isWater(x + 1, y) || !siteClear(x + 0.7, y + 0.1)) continue;
      // World.index truncates this to the beach tile, while Math.round lands
      // on the water tile to the right. This is the half-tile miss from N46.
      site = { x: x + 0.7, y: y + 0.1 };
      break;
    }
    if (!site) throw new Error(`fixture has no clear ${kind} shoreline site`);

    sim.peopleHash.remove(person);
    person.x = site.x;
    person.y = site.y;
    person.targetX = person.x;
    person.targetY = person.y;
    person.path = null;
    sim.peopleHash.insert(person);
    camera.snapTo(person.x, person.y);
    const tile = world.tileOf(person.x, person.y);
    return { tile };
  }, kind);

  await page.waitForTimeout(250);
  const screen = await page.evaluate(() => {
    const d = (window as never as { __dynasty: {
      sim: { livingPeople: () => { id: number; x: number; y: number }[]; player: { id: number } | null };
      camera: { worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number };
    } }).__dynasty;
    const npc = d.sim.livingPeople().find(person => person.id !== d.sim.player?.id)!;
    return { x: d.camera.worldToScreenX(npc.x), y: d.camera.worldToScreenY(npc.y) };
  });
  await page.mouse.click(screen.x, screen.y);

  const picker = page.locator('.picker');
  await expect(picker).toBeVisible({ timeout: 5000 });
  const personChoice = page.locator('.picker-item').filter({
    has: page.locator('.picker-icon', { hasText: '👤' }),
  }).first();
  await expect(personChoice).toBeVisible();
  const groundChoice = page.locator('.picker-item').filter({ hasText: 'el suelo de aquí' }).first();
  await expect(groundChoice).toBeVisible();
  await groundChoice.hover();
  const groundRing = await page.evaluate(() =>
    (window as never as { __dynasty: { renderer: { hoverRing: { x: number; y: number } | null } } }).__dynasty.renderer.hoverRing);
  expect(groundRing).toEqual({ ...located.tile, radius: 0.5 });
  mkdirSync(captureDir, { recursive: true });
  await page.screenshot({ path: `${captureDir}/${kind}-npc-picker-es.png` });
  await personChoice.click();
  await expect(picker).toBeHidden();
}

test('selects an NPC wading on a shallow-water tile', async ({ page }) => {
  await clickPersonOnCoast(page, 'wading');
});

test('selects a beach NPC when rounding the click would hit adjacent water', async ({ page }) => {
  await clickPersonOnCoast(page, 'beach');
});

test('an open-water click still offers drinking', async ({ page }) => {
  await page.goto('/?seed=m16-select-on-shore&skipIntro=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  const water = await page.evaluate(() => {
    const d = (window as never as { __dynasty: { sim: any; camera: any } }).__dynasty;
    const { sim, camera } = d;
    for (let y = 8; y < sim.world.height - 8; y++) for (let x = 8; x < sim.world.width - 8; x++) {
      if (!sim.world.isWater(x, y)) continue;
      if (sim.peopleHash.queryRadius(x, y, 3).length || sim.animalHash.queryRadius(x, y, 3).length ||
          sim.treeHash.queryRadius(x, y, 3).some((tree: any) => tree.standing) ||
          sim.nodeHash.queryRadius(x, y, 3).length || sim.pileHash.queryRadius(x, y, 3).length) continue;
      camera.following = false;
      camera.snapTo(x, y);
      return { worldX: x, worldY: y };
    }
    throw new Error('fixture has no open shallow water');
  });
  await page.waitForTimeout(250);
  const point = await page.evaluate(({ worldX, worldY }) => {
    const camera = (window as never as { __dynasty: { camera: any } }).__dynasty.camera;
    return { x: camera.worldToScreenX(worldX), y: camera.worldToScreenY(worldY) };
  }, water);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.locator('.radial-item', { hasText: /Beber|Drink/i }).first()).toBeVisible({ timeout: 5000 });
});
