/** M15 phase 40a: the player sees why bog iron cannot be mined yet. */
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('bog iron explains the missing mining knowledge in Spanish', async ({ page }) => {
  const dir = 'artifacts/screenshots/m15-phase40-bog-iron-2026-10-07';
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=metal-bog-iron&skipIntro=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: /pausa/i }).click();

  const at = await page.evaluate(() => {
    const d = (window as any).__dynasty;
    const self = d.sim.player;
    if (!self) return null;
    // Keep this UI fixture within sight on open ground; simulation tests cover the real spawn.
    let spot: { x: number; y: number } | null = null;
    search: for (let radius = 3; radius <= 10; radius++) {
      for (let angle = 0; angle < 32; angle++) {
        const x = Math.round(self.x + Math.cos(angle * Math.PI / 16) * radius);
        const y = Math.round(self.y + Math.sin(angle * Math.PI / 16) * radius);
        if (!d.sim.world.isWalkable(x, y)) continue;
        if (d.sim.nodes.some((n: any) => Math.hypot(n.x - x, n.y - y) <= 2)) continue;
        if (d.sim.trees.some((t: any) => t.standing && Math.hypot(t.x - x, t.y - y) <= 2)) continue;
        if (d.sim.buildingAt(x, y)) continue;
        spot = { x, y };
        break search;
      }
    }
    if (!spot) return null;
    const proto = d.sim.nodes[0];
    const node = new proto.constructor('iron_ore', spot.x, spot.y, { range: (_lo: number, hi: number) => hi }, d.sim.ids);
    d.sim.nodes.push(node);
    d.sim.nodesById.set(node.id, node);
    d.sim.nodeHash.rebuild(d.sim.nodes);
    self.knownTech.delete('mining');
    self.techLevel.delete('mining');
    d.camera.snapTo(spot.x, spot.y);
    d.camera.following = false;
    return { x: spot.x, y: spot.y };
  });
  expect(at).not.toBeNull();
  if (!at) throw new Error('No iron deposit was spawned');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const screen = await page.evaluate(p => {
    const d = (window as any).__dynasty;
    return { x: d.camera.worldToScreenX(p.x), y: d.camera.worldToScreenY(p.y) };
  }, at);
  await page.mouse.click(screen.x, screen.y, { button: 'right' });
  await expect(page.locator('.picker')).toBeVisible();
  await page.locator('.picker-item', { hasText: /mineral de hierro/i }).first().click();
  const mine = page.locator('.radial-item', { hasText: 'Extraer mineral de hierro' }).first();
  await expect(mine).toBeVisible();
  await expect(mine).toHaveClass(/is-disabled/);
  await expect(mine).toHaveAttribute('title', 'No sabes extraer mineral');
  await page.screenshot({ path: dir + '/01-iron-ore-needs-mining.png' });
});
