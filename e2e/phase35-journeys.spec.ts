import { test, expect, type Page } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase35-journeys-2026-10-09';

async function clickCell(page: Page, col: number, row: number, cols: number, rows: number): Promise<void> {
  const box = (await page.locator('.worldmap-canvas').boundingBox())!;
  await page.mouse.click(box.x + (col + 0.5) / cols * box.width, box.y + (row + 0.5) / rows * box.height);
}

test('globe departure shows the persisted land journey and captures its status', async ({ page }) => {
  await page.goto('/?skipIntro=1&seed=e2e-journey&world=random');
  await expect(page.locator('.hud-name')).not.toBeEmpty({ timeout: 20_000 });
  const route = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, actor = sim.player, here = sim.comarcaAtTile(actor.x, actor.y);
    const width = sim.worldFrame.mapWidth, height = sim.worldFrame.mapHeight;
    const candidates = [[here.cx + 1, here.cy], [here.cx - 1, here.cy], [here.cx, here.cy + 1], [here.cx, here.cy - 1]]
      .map(([cx, cy]) => ({ cx: (cx! + width) % width, cy: cy! }))
      .filter(({ cx, cy }) => cy >= 0 && cy < height && Math.floor(cx / 10) === Math.floor(here.cx / 10) && Math.floor(cy / 10) === Math.floor(here.cy / 10))
      .find(({ cx, cy }) => { const p = d.worldState.geography.profileAt(cx, cy); return p.kind === 'earth' ? p.land : p.kind === 'random' ? p.elevation > 0 : false; });
    if (!candidates) throw new Error('The fixture must have a nearby land comarca in the home region');
    const target = candidates;
    actor.worldKnowledge.see(target.cx, target.cy, sim.time.day);
    actor.inventory.add('sledge', 1); actor.equipment.left = { item: 'sledge', count: 1 }; actor.knownTech.add('sledge');
    sim.config.time.ticksPerDay = 4;
    return { from: here, target };
  });
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.locator('.hud-globe').click();
  await clickCell(page, Math.floor(route.from.cx / 10), Math.floor(route.from.cy / 10), 96, 48);
  await page.locator('.worldmap-closer').click();
  await clickCell(page, route.target.cx % 10, route.target.cy % 10, 10, 10);
  await expect(page.locator('.worldmap-journey')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-globe-journey-offer.png` });
  await page.locator('.worldmap-journey').click();
  await expect(page.locator('.worldmap')).toBeHidden();
  await expect(page.locator('.journey-status')).toBeVisible();
  await expect(page.locator('.journey-status')).toContainText('sledge');
  await expect(page.locator('.journey-status')).toContainText('shelf-stable');
  await page.screenshot({ path: `${SHOTS}/02-journey-under-way.png` });
  const beforeArrival = await page.evaluate(() => { const d = (window as any).__dynasty; return { playerId: d.worldState.frontier.pendingJourney.actorId, x: d.sim.worldFrame.originX, y: d.sim.worldFrame.originY }; });
  await page.evaluate(() => { const d = (window as any).__dynasty; for (let i = 0; i < 100 && d.worldState.frontier.pendingJourney; i++) { d.worldState.current.step(); d.worldState.advancePeoples(); } });
  await expect.poll(() => page.evaluate(() => (window as any).__dynasty.worldState.frontier.pendingJourney === null), { timeout: 5_000 }).toBe(true);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(() => page.evaluate(() => { const d = (window as any).__dynasty; return d.sim === d.worldState.current; }), { timeout: 5_000 }).toBe(true);
  const afterArrival = await page.evaluate(() => { const d = (window as any).__dynasty; return { playerId: d.sim.player?.id, x: d.sim.worldFrame.originX, y: d.sim.worldFrame.originY }; });
  expect(afterArrival.playerId).toBe(beforeArrival.playerId);
  expect([afterArrival.x, afterArrival.y]).not.toEqual([beforeArrival.x, beforeArrival.y]);
  await page.screenshot({ path: `${SHOTS}/03-journey-arrived.png` });
});
