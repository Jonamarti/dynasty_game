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
  const spot = await page.evaluate(o => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player!;
    // `place` gates on the world's derived tech set, which is rebuilt once a day.
    for (const tech of o.tech) { self.knownTech.add(tech); d.sim.knownTech.add(tech); }
    for (const [item, count] of self.inventory.entries()) self.inventory.remove(item, count);
    for (const [item, count] of Object.entries(o.items)) self.inventory.add(item, count);
    self.needs.hunger = 0; self.needs.thirst = 0; self.needs.cold = 0;
    const clear = (x: number, y: number) =>
      d.sim.world.isWalkable(x, y) && !d.sim.buildingAt(x, y) &&
      d.sim.livingPeople().every(p => Math.hypot(p.x - x, p.y - y) > 3) &&
      d.sim.nodes.every(n => Math.hypot(n.x - x, n.y - y) > 3) &&
      d.sim.trees.every(t => !t.standing || Math.hypot(t.x - x, t.y - y) > 3);
    for (let radius = 3; radius <= 14; radius++) {
      for (let angle = 0; angle < 24; angle++) {
        const x = Math.round(self.x + Math.cos(angle) * radius);
        const y = Math.round(self.y + Math.sin(angle) * radius);
        if (!clear(x, y)) continue;
        if (o.building) {
          const site = d.sim.place(o.building, x, y, self.bandId, null);
          if (!site) continue;
          site.complete = true;
          d.camera.snapTo(site.centerX, site.centerY);
          d.camera.following = false;
          return { x: site.centerX, y: site.centerY };
        }
        d.camera.snapTo(x, y);
        d.camera.following = false;
        return { x, y };
      }
    }
    return null;
  }, opts);
  expect(spot).not.toBeNull();
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  return spot!;
}

async function screenOf(page: Page, p: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(q => {
    const d = (window as never as Debug).__dynasty;
    return { x: d.camera.worldToScreenX(q.x), y: d.camera.worldToScreenY(q.y) };
  }, p);
}

test('broth: the hearth offers it to somebody who knows stone boiling and holds two bones', async ({ page }) => {
  const dir = 'artifacts/screenshots/m15-phase13d-stone_boiling-2026-10-06';
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
  const dir = 'artifacts/screenshots/m15-phase13d-flatbread-2026-10-06';
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
