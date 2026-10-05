import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('a player can order a safe swim, while a hand load gets a visible reason', async ({ page }) => {
  await page.goto('/?seed=swim-e2e&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty();
  await page.locator('.hud-button', { hasText: 'Pause' }).click();

  const result = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, p = sim.player, w = sim.world;
    let swim: { x: number; y: number; landX: number; landY: number } | undefined;
    // Keep the fixture away from the map edge: Camera clamps its centre, so a
    // click computed at a boundary tile would land several tiles inland.
    for (let y = 8; y < w.height - 8 && !swim; y++) for (let x = 8; x < w.width - 8 && !swim; x++) {
      const i = w.index(x, y);
      if (w.biome[i] !== 0 || w.walkable[i] !== 0) continue;
      const shore = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
        .find(([sx, sy]) => w.isWalkable(sx, sy));
      if (!shore) continue;
      const nextX = x + (x - shore[0]), nextY = y + (y - shore[1]);
      if (!w.inBounds(nextX, nextY)) continue;
      const nextIndex = w.index(nextX, nextY);
      if (w.biome[nextIndex] !== 0 || w.walkable[nextIndex] !== 0) continue;
      for (const [wx, wy] of [[x, y], [nextX, nextY]]) {
        const wi = w.index(wx, wy);
        w.elevation[wi] = w.waterLevel - (w.wadeDepth + w.swimDepth) / 2;
        w.setWalkable(wx, wy, true);
        w.setWalkable(wx, wy, false);
        w.updateShore(wx, wy);
      }
      // Some UI queries may have populated the derived swim regions before
      // this fixture reshapes the water; toggle walkability to invalidate it.
      swim = { x: nextX, y: nextY, landX: shore[0], landY: shore[1] };
    }
    if (!swim) throw new Error('fixture has no swim tile beside land');
    sim.shoreHash.rebuild(w.shoreTiles);

    p.action = 'idle'; p.order = null; p.clearTarget();
    p.x = swim.landX + 0.5; p.y = swim.landY + 0.5;
    p.inventory.add('sticks', 1);
    const refused = sim.order(p, 'swim', { x: swim.x + 0.5, y: swim.y + 0.5 });
    const refusal = sim.lastRefusal;
    sim.lastRefusal = null;
    p.inventory.remove('sticks', 1);
    p.x = swim.landX + 0.5 + Math.sign(swim.x - swim.landX) * 0.45;
    p.y = swim.landY + 0.5 + Math.sign(swim.y - swim.landY) * 0.45;
    const accepted = sim.order(p, 'swim', { x: swim.x + 0.5, y: swim.y + 0.5 });
    for (let i = 0; i < 150 && !w.isSwimTile(p.x, p.y); i++) sim.step();
    const enteredWater = w.isSwimTile(p.x, p.y), wet = p.wet, trained = p.skills.swim > 0;
    const swimState = { action: p.action, order: p.order, targetX: p.targetX, targetY: p.targetY };
    p.needs.thirst = 100;
    sim.step();
    const interruption = sim.interruptions.at(-1);
    const escapedOrder = p.order === null && p.action === 'swim';
    for (let i = 0; i < 100 && w.isSwimTile(p.x, p.y); i++) sim.step();
    p.inventory.add('sticks', 1);
    p.x = swim.landX + 0.5 + Math.sign(swim.x - swim.landX) * 0.45;
    p.y = swim.landY + 0.5 + Math.sign(swim.y - swim.landY) * 0.45;
    sim.playerIntent = { dx: swim.x - swim.landX, dy: swim.y - swim.landY };
    sim.step();
    const manualRefusal = sim.interruptions.some((notice: any) =>
      notice.personId === p.id && notice.reason === 'hands_not_empty');
    sim.playerIntent = null;
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();
    d.camera.zoom = 3; d.camera.snapTo(p.x, p.y); d.camera.following = false;
    return { refused, refusal, accepted, enteredWater, wet, trained,
      interruptedForThirst: interruption?.reason === 'thirsty', interruption, swimState, escapedOrder,
      manualRefusal,
      reachedShore: !w.isSwimTile(p.x, p.y) && w.isWalkable(p.x, p.y),
      x: p.x, y: p.y, targetX: p.targetX, targetY: p.targetY, action: p.action, tick: sim.time.tick,
      swimX: swim.x, swimY: swim.y };
  });

  expect(result.refused).toBe(false);
  expect(result.refusal).toBe('Put down what you are holding before swimming');
  expect(result.accepted).toBe(true);
  expect(result.enteredWater, JSON.stringify(result)).toBe(true);
  expect(result.wet).toBeGreaterThan(0);
  expect(result.trained).toBe(true);
  expect(result.interruptedForThirst, JSON.stringify(result)).toBe(true);
  expect(result.escapedOrder).toBe(true);
  expect(result.reachedShore, JSON.stringify(result)).toBe(true);
  expect(result.manualRefusal).toBe(true);

  // Exercise the rendered menu too: the explicit water action carries the same
  // visible hand-load refusal as sim.order and direct movement.
  const waterPoint = await page.evaluate(({ x, y }) => {
    const d = (window as any).__dynasty;
    d.camera.zoom = 5; d.camera.snapTo(x + 0.1, y + 0.1); d.camera.following = false;
    const rect = document.querySelector('#view')!.getBoundingClientRect();
    return { x: rect.left + d.camera.worldToScreenX(x + 0.1), y: rect.top + d.camera.worldToScreenY(y + 0.1) };
  }, { x: result.swimX, y: result.swimY });
  await page.mouse.click(waterPoint.x, waterPoint.y, { button: 'right' });
  const swimOption = page.locator('.radial-item', { hasText: 'Swim here' });
  await expect(swimOption).toBeVisible({ timeout: 5_000 });
  await expect(swimOption).toHaveClass(/is-disabled/);
  await expect(swimOption).toHaveAttribute('title', 'Put down what you are holding before swimming');

  await page.waitForTimeout(250);
  const captureDir = process.env.DYNASTY_CAPTURE_DIR;
  if (captureDir) {
    mkdirSync(captureDir, { recursive: true });
    await page.screenshot({ path: `${captureDir}/01-swim-hand-load-refusal.png` });
  }
});
