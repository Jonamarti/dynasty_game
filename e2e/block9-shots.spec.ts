/**
 * Screenshots of M15 block IX's interface: the feast on the radial menu, the
 * Government section of a chief's Work tab, and a granary that is a temple.
 *
 *   npx playwright test e2e/block9-shots.spec.ts  ->  artifacts/screenshots/m15-block9-<date>/
 *
 * A capture, not a test of behaviour — those are in `smoke.spec.ts`. Kept
 * beside the tour (`screenshots.spec.ts`) rather than folded into it so the
 * tour's own captures, which earlier milestones are compared against, do not
 * change. Paused throughout, so the frames are of one moment.
 */
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const DIR = 'artifacts/screenshots/m15-block9-2026-10-03';

type Debug = {
  __dynasty: {
    sim: {
      player: { id: number; x: number; y: number; bandId: number; knownTech: Set<string> } | null;
      bands: { id: number; outcast?: boolean; chiefId: number | null; chiefSince: number | null; name: string; homeX: number; homeY: number }[];
      bandSystem: { chiefByBand: Map<number, number> };
      bandRelations: { add: (a: number, b: number, d: number) => void };
      time: { day: number };
      world: { isWalkable: (x: number, y: number) => boolean };
      knownTech: Set<string>;
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

test('block IX interface', async ({ page }) => {
  mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=e2e-fixture&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();

  // The player made a chief who rules by law, levies a tax and knows a
  // neighbour: everything the Government section can show.
  const spot = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player!;
    const band = d.sim.bands.find(b => b.id === self.bandId)!;
    const them = d.sim.bands.find(b => !b.outcast && b.id !== self.bandId);
    d.sim.bandSystem.chiefByBand.set(band.id, self.id);
    band.chiefId = self.id;
    band.chiefSince = d.sim.time.day;
    for (const tech of ['brewing', 'law_code', 'taxation', 'redistribution', 'pottery']) self.knownTech.add(tech);
    d.sim.knownTech.add('pottery');
    if (them) d.sim.bandRelations.add(band.id, them.id, -35);
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
        d.camera.snapTo(x, y);
        d.camera.following = false;
        return { x, y };
      }
    }
    return null;
  });
  expect(spot).not.toBeNull();
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

  // 1. The feast on the ground's radial menu, greyed with its reason.
  const at = await page.evaluate((p: { x: number; y: number }) => {
    const d = (window as never as Debug).__dynasty;
    return { x: d.camera.worldToScreenX(p.x), y: d.camera.worldToScreenY(p.y) };
  }, spot!);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  const feast = page.locator('.radial-item', { hasText: 'Hold a feast' }).first();
  await expect(feast).toBeVisible({ timeout: 10_000 });
  await feast.hover();
  await page.screenshot({ path: DIR + '/01-feast-option.png' });
  await page.keyboard.press('Escape');

  // 2. The Government section: the levy, the peoples known, what a
  // civilisation still wants.
  await page.locator('.hud-tab', { hasText: 'Work' }).click();
  await expect(page.locator('.hud-section', { hasText: 'Government' })).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-tax="0.1"]').click();
  await page.locator('.hud-tab', { hasText: 'Self' }).click();
  await page.locator('.hud-tab', { hasText: 'Work' }).click();
  await page.locator('[data-tax="0.1"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: DIR + '/02-government.png' });

  // 3. A granary that is the band's temple.
  const temple = await page.evaluate((p: { x: number; y: number }) => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player!;
    for (let dx = 0; dx < 8; dx++) {
      const granary = d.sim.place('granary', p.x + dx, p.y, self.bandId, null);
      if (!granary) continue;
      granary.complete = true;
      (d.sim as unknown as { refreshTemples: () => void }).refreshTemples();
      d.camera.snapTo(granary.centerX, granary.centerY);
      return { x: granary.centerX, y: granary.centerY };
    }
    return null;
  }, spot!);
  expect(temple).not.toBeNull();
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const there = await page.evaluate((p: { x: number; y: number }) => {
    const d = (window as never as Debug).__dynasty;
    return { x: d.camera.worldToScreenX(p.x), y: d.camera.worldToScreenY(p.y) };
  }, temple!);
  await page.mouse.click(there.x, there.y);
  const picker = page.locator('.picker');
  if (await picker.isVisible()) await picker.locator('.picker-item', { hasText: /Granary/ }).first().click();
  await expect(page.locator('.hud-sub', { hasText: 'The temple' })).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: DIR + '/03-temple.png' });
});
