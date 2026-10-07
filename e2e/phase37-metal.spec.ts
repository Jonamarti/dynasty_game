/**
 * M15 phase 37: what the metal tier puts on the screen, and the one claim about
 * it that belongs to the browser: the menu says why a seam cannot be worked.
 * The behaviour is in `src/sim/__tests__/metal.test.ts`.
 *
 *   DYNASTY_PORT=5399 node node_modules/@playwright/test/cli.js test e2e/phase37-metal.spec.ts
 *
 * Paused throughout, with the camera fixed on an open patch of ground before any
 * click (AGENTS.md). Captures go to `artifacts/screenshots/m15-phase37-metal-2026-10-07/`.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'artifacts/screenshots/m15-phase37-metal-2026-10-07';

type Debug = {
  __dynasty: {
    sim: {
      player: {
        id: number; x: number; y: number; bandId: number; knownTech: Set<string>; techLevel: Map<string, number>;
        inventory: { add: (item: string, n: number) => void; entries: () => [string, number][]; remove: (item: string, n: number) => number };
        needs: Record<string, number>;
      } | null;
      knownTech: Set<string>;
      world: { isWalkable: (x: number, y: number) => boolean };
      place: (defId: string, x: number, y: number, bandId: number, sponsor?: number | null) =>
        { id: number; complete: boolean; centerX: number; centerY: number } | null;
      livingPeople: () => { x: number; y: number }[];
      nodes: { x: number; y: number; kind: string; id: number; amount: number }[];
      nodesById: Map<number, unknown>;
      nodeHash: { rebuild: (nodes: unknown[]) => void };
      ids: unknown;
      trees: { x: number; y: number; standing: boolean }[];
      buildingAt: (x: number, y: number) => unknown;
    };
    camera: {
      snapTo: (x: number, y: number) => void; following: boolean;
      worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number;
    };
  };
};

/**
 * Plants a node of `kind` through the constructor the world itself uses (taken
 * off an existing node, since the page does not export the class) and registers
 * it the way `spawnResourceKind` does.
 */
function plant(page: Page, nodes: [string, number, number][]): Promise<string[]> {
  return page.evaluate(list => {
    const d = (window as never as Debug).__dynasty;
    const proto = d.sim.nodes[0]! as unknown as { constructor: new (kind: string, x: number, y: number, rng: unknown, ids: unknown) => { id: number; kind: string } };
    const made: string[] = [];
    for (const [kind, x, y] of list) {
      const node = new proto.constructor(kind, x, y, { range: (_lo: number, hi: number) => hi }, d.sim.ids);
      d.sim.nodes.push(node as never);
      d.sim.nodesById.set(node.id, node);
      made.push(node.kind);
    }
    d.sim.nodeHash.rebuild(d.sim.nodes);
    return made;
  }, nodes);
}

async function openGame(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=e2e-fixture&skipIntro=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
}

/** Finds open ground near the player, puts the camera on it and returns it. */
async function clearing(page: Page): Promise<{ x: number; y: number }> {
  const spot = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player!;
    self.needs.hunger = 0; self.needs.thirst = 0; self.needs.cold = 0;
    const clear = (x: number, y: number) =>
      d.sim.world.isWalkable(x, y) && !d.sim.buildingAt(x, y) &&
      d.sim.nodes.every(n => Math.hypot(n.x - x, n.y - y) > 2) &&
      d.sim.trees.every(t => !t.standing || Math.hypot(t.x - x, t.y - y) > 2);
    for (let radius = 4; radius <= 16; radius++) {
      for (let angle = 0; angle < 24; angle++) {
        const x = Math.round(self.x + Math.cos(angle) * radius);
        const y = Math.round(self.y + Math.sin(angle) * radius);
        if (clear(x, y)) return { x, y };
      }
    }
    return null;
  });
  expect(spot).not.toBeNull();
  return spot!;
}

test('the metal tier on the ground: the pit, the furnace, a seam of each ore, gold and a nugget', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  // Everything goes within sight of the player, where the fog does not hide it,
  // and each thing takes the first free spot on a widening ring.
  const placed = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player!;
    self.needs.hunger = 0; self.needs.thirst = 0; self.needs.cold = 0;
    for (const tech of ['firemaking', 'carpentry', 'charcoal', 'kiln', 'smelting']) {
      self.knownTech.add(tech); d.sim.knownTech.add(tech);
    }
    const taken: [number, number][] = [];
    const free = (x: number, y: number) =>
      d.sim.world.isWalkable(x, y) && !d.sim.buildingAt(x, y) &&
      taken.every(([tx, ty]) => Math.hypot(tx - x, ty - y) > 4) &&
      d.sim.nodes.every(n => Math.hypot(n.x - x, n.y - y) > 2) &&
      d.sim.trees.every(t => !t.standing || Math.hypot(t.x - x, t.y - y) > 2);
    const spots: { id: string; x: number; y: number }[] = [];
    for (const id of ['charcoal_pit', 'furnace']) {
      search: for (let radius = 3; radius <= 12; radius++) {
        for (let angle = 0; angle < 32; angle++) {
          const x = Math.round(self.x + Math.cos(angle * Math.PI / 16) * radius);
          const y = Math.round(self.y + Math.sin(angle * Math.PI / 16) * radius);
          if (!free(x, y)) continue;
          const site = d.sim.place(id, x, y, self.bandId, null);
          if (!site) continue;
          site.complete = true;
          taken.push([site.centerX, site.centerY]);
          spots.push({ id, x: site.centerX, y: site.centerY });
          break search;
        }
      }
    }
    d.camera.snapTo(self.x, self.y);
    d.camera.following = false;
    return { spots, taken };
  });
  expect(placed.spots.map(s => s.id)).toEqual(['charcoal_pit', 'furnace']);
  const around = await page.evaluate(taken => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player!;
    const out: [number, number][] = [];
    for (let radius = 3; radius <= 10 && out.length < 4; radius++) {
      for (let angle = 0; angle < 32 && out.length < 4; angle++) {
        const x = Math.round(self.x + Math.cos(angle * Math.PI / 16) * radius);
        const y = Math.round(self.y + Math.sin(angle * Math.PI / 16) * radius);
        if (!d.sim.world.isWalkable(x, y) || d.sim.buildingAt(x, y)) continue;
        if (taken.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 4)) continue;
        if (out.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < 2.5)) continue;
        if (d.sim.trees.some(t => t.standing && Math.hypot(t.x - x, t.y - y) < 1.5)) continue;
        out.push([x, y]);
      }
    }
    return out;
  }, placed.taken);
  expect(around).toHaveLength(4);
  const kinds = ['copper_ore', 'tin_ore', 'native_copper', 'gold'];
  const made = await plant(page, around.map(([x, y], i) => [kinds[i]!, x, y] as [string, number, number]));
  expect(made).toEqual(kinds);
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.screenshot({ path: SHOTS + '/01-pit-furnace-and-seams.png' });
});

test('the menu says why a seam cannot be worked, and offers the verb to a miner', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  const centre = await clearing(page);
  await page.evaluate(({ cx, cy }) => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player!;
    for (const tech of ['mining']) { self.knownTech.delete(tech); self.techLevel.delete(tech); }
    d.camera.snapTo(cx, cy);
    d.camera.following = false;
  }, { cx: centre.x, cy: centre.y });
  await plant(page, [['copper_ore', centre.x, centre.y]]);
  const seam = { x: centre.x, y: centre.y };
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const at = await page.evaluate(q => {
    const d = (window as never as Debug).__dynasty;
    return { x: d.camera.worldToScreenX(q.x), y: d.camera.worldToScreenY(q.y) };
  }, seam);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  const picker = page.locator('.picker-item', { hasText: /copper ore/i }).first();
  if (await picker.isVisible().catch(() => false)) await picker.click();
  const entry = page.locator('.radial-item', { hasText: 'Mine copper ore' }).first();
  await expect(entry).toBeVisible({ timeout: 10_000 });
  await expect(entry).toHaveClass(/is-disabled/);
  // The reason is the tooltip: there is no verb offered that the order would refuse.
  await expect(entry).toHaveAttribute('title', 'You do not know how to mine');
  await entry.hover();
  await page.screenshot({ path: SHOTS + '/02-menu-refuses-the-seam-with-a-reason.png' });
});

test('the tech web gains a Metal sector and its sub-web', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  await page.evaluate(() => {
    const player = (window as never as Debug).__dynasty.sim.player!;
    for (const tech of ['stoneworking', 'native_copper', 'firemaking', 'carpentry', 'charcoal', 'pottery', 'masonry', 'kiln', 'smelting']) {
      player.knownTech.add(tech); player.techLevel.set(tech, 1);
    }
  });
  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.techweb-node[data-tech="native_copper"]')).toHaveCount(1);
  await page.screenshot({ path: SHOTS + '/03-tech-web-main-with-metal.png' });
  await page.locator('.techweb-gatemark[data-web="metal"]').click();
  await expect(page.locator('.techweb-node[data-tech="smelting"]')).toHaveCount(1);
  await page.screenshot({ path: SHOTS + '/04-tech-web-metal-subweb.png' });
});
