/**
 * Captures of what phase 13d's nodes add to the screen, one test per node
 * (M15 phase 13d). A capture rather than a behaviour test: the behaviour is in
 * `src/sim/__tests__/craft-nodes.test.ts`.
 *
 *   DYNASTY_PORT=5311 node node_modules/@playwright/test/cli.js test \
 *     -c playwright.harness.config.ts e2e/phase13d-nodes.spec.ts -g "broth"
 *
 * Paused throughout, with the camera fixed on an open patch of ground before
 * any click (AGENTS.md).
 */
import { test, expect, type Page } from '@playwright/test';
import { placeStationFixtureOnClaimedGround } from './helpers';
import { mkdirSync } from 'node:fs';

type Debug = {
  __dynasty: {
    sim: {
      player: {
        id: number; x: number; y: number; bandId: number; knownTech: Set<string>;
        inventory: { add: (item: string, n: number) => void; entries: () => [string, number][]; remove: (item: string, n: number) => number };
        needs: Record<string, number>;
      } | null;
      knownTech: Set<string>;
      world: { isWalkable: (x: number, y: number) => boolean };
      place: (defId: string, x: number, y: number, bandId: number, sponsor?: number | null) =>
        { id: number; complete: boolean; centerX: number; centerY: number } | null;
      livingPeople: () => { x: number; y: number }[];
      nodes: { x: number; y: number }[];
      trees: { x: number; y: number; standing: boolean }[];
      buildingAt: (x: number, y: number) => unknown;
    };
    camera: {
      snapTo: (x: number, y: number) => void; following: boolean;
      worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number;
    };
  };
};

async function openGame(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=e2e-fixture&skipIntro=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
}

/** Gives the player what the node needs and puts a finished building on open ground. */
async function furnish(page: Page, opts: { tech: string[]; items: Record<string, number>; building: string }): Promise<{ x: number; y: number }> {
  const ready = await page.evaluate(o => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player!;
    // `place` gates on the world's derived tech set, which is rebuilt once a day.
    for (const tech of o.tech) { self.knownTech.add(tech); d.sim.knownTech.add(tech); }
    for (const [item, count] of self.inventory.entries()) self.inventory.remove(item, count);
    for (const [item, count] of Object.entries(o.items)) self.inventory.add(item, count);
    self.needs.hunger = 0; self.needs.thirst = 0; self.needs.cold = 0;
    return { originX: self.x, originY: self.y };
  }, opts);
  // The building itself goes through the shared station fixture: M16 2.22
  // refuses stations without territory, which a brand-new band has none of.
  const site = await page.evaluate(placeStationFixtureOnClaimedGround, {
    kind: opts.building,
    originX: ready.originX,
    originY: ready.originY,
    radiusLimit: 14,
    nodeClear: 3,
    treeClear: 3,
    peopleClear: 3,
  });
  expect(site).not.toBeNull();
  await page.evaluate(site => {
    const d = (window as never as Debug).__dynasty;
    const building = (d.sim as any).buildings.find((candidate: { id: number }) => candidate.id === site.id);
    if (!building) throw new Error('The hearth fixture disappeared');
    // The original fixture finished its building in the same breath; the
    // radial menu only offers Make on a complete hearth.
    building.complete = true;
    d.camera.snapTo(building.centerX, building.centerY);
    d.camera.following = false;
  }, site);
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  return { x: site.centerX, y: site.centerY };
}

async function screenOf(page: Page, p: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(q => {
    const d = (window as never as Debug).__dynasty;
    return { x: d.camera.worldToScreenX(q.x), y: d.camera.worldToScreenY(q.y) };
  }, p);
}

test('broth: the hearth offers it to somebody who knows stone boiling and holds two bones', async ({ page }) => {
  const dir = 'artifacts/playwright/captures/phase13d-nodes/m15-phase13d-stone_boiling-2026-10-06';
  mkdirSync(dir, { recursive: true });
  await openGame(page);
  const hearth = await furnish(page, {
    tech: ['firemaking', 'cooking', 'clothing', 'leatherwork', 'stone_boiling'],
    items: { bone: 2 }, building: 'hearth',
  });
  const at = await screenOf(page, hearth);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  // The right-click first asks what was meant: the hearth, or the ground beside it.
  await page.locator('.picker-item', { hasText: 'Hearth' }).first().click();
  // Recipes sit behind the radial menu's Make... group.
  await page.locator('.radial-item', { hasText: 'Make' }).first().click();
  const entry = page.locator('.radial-item', { hasText: 'Broth' }).first();
  await expect(entry).toBeVisible({ timeout: 10_000 });
  await entry.hover();
  await page.screenshot({ path: dir + '/01-broth-at-the-hearth.png' });
});

test('flatbread: the hearth offers it to somebody who knows it and holds a meal', async ({ page }) => {
  const dir = 'artifacts/playwright/captures/phase13d-nodes/m15-phase13d-flatbread-2026-10-06';
  mkdirSync(dir, { recursive: true });
  await openGame(page);
  const hearth = await furnish(page, {
    tech: ['firemaking', 'cooking', 'stoneworking', 'grinding', 'flatbread'],
    items: { meal: 1 }, building: 'hearth',
  });
  const at = await screenOf(page, hearth);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.locator('.picker-item', { hasText: 'Hearth' }).first().click();
  await page.locator('.radial-item', { hasText: 'Make' }).first().click();
  const entry = page.locator('.radial-item', { hasText: 'Flatbread' }).first();
  await expect(entry).toBeVisible({ timeout: 10_000 });
  await entry.hover();
  await page.screenshot({ path: dir + '/01-flatbread-at-the-hearth.png' });
});

test('projectile ammo: the hand-craft bar shows arrows and atlatl darts', async ({ page }) => {
  const dir = 'artifacts/playwright/captures/phase13d-nodes/m15-projectile-ammo-2026-10-12';
  mkdirSync(dir, { recursive: true });
  await openGame(page);
  await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player!;
    self.knownTech.add('bow');
    self.knownTech.add('atlatl');
    d.sim.knownTech.add('bow');
    d.sim.knownTech.add('atlatl');
    self.inventory.add('sticks', 4);
    self.inventory.add('flint', 2);
    self.inventory.add('thatch', 2);
  });
  await page.locator('.hud-button', { hasText: 'Make' }).click();
  await expect(page.locator('.hud-design', { hasText: 'Arrows' })).toBeVisible();
  await expect(page.locator('.hud-design', { hasText: 'Spear-thrower darts' })).toBeVisible();
  await page.screenshot({ path: dir + '/01-ammunition-recipes.png' });
});
