import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase36-rival-integrated-2026-10-09';

async function clickCell(page: import('@playwright/test').Page, col: number, row: number, cols: number, rows: number): Promise<void> {
  const box = (await page.locator('.worldmap-canvas').boundingBox())!;
  await page.mouse.click(box.x + (col + 0.5) / cols * box.width, box.y + (row + 0.5) / rows * box.height);
}

test('rival-house view resolves a known enemy from the source comarca archive after travel', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?skipIntro=1&seed=e2e-phase36-rival-archive&world=random');
  await expect(page.locator('.hud-name')).not.toBeEmpty({ timeout: 20_000 });
  const fixture = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, actor = sim.player, here = sim.comarcaAtTile(actor.x, actor.y);
    const own = sim.householdsById.get(actor.householdId);
    const rivalPerson = sim.livingPeople().find((person: any) => person.householdId !== own?.id);
    const rival = rivalPerson && sim.householdsById.get(rivalPerson.householdId);
    if (!actor || !own || !rival || !rivalPerson) throw new Error('Need a player house and a rival family in the origin comarca');
    own.feud.set(rival.id, 47);
    own.feudSuspects.set(rival.id, rivalPerson.id);
    sim.relationships.edge(actor.id, rivalPerson.id).familiarity = 12;

    const width = sim.worldFrame.mapWidth, height = sim.worldFrame.mapHeight;
    const candidates = [[here.cx + 1, here.cy], [here.cx - 1, here.cy], [here.cx, here.cy + 1], [here.cx, here.cy - 1]]
      .map(([cx, cy]) => ({ cx: (cx! + width) % width, cy: cy! }))
      .filter(({ cx, cy }) => cy >= 0 && cy < height && Math.floor(cx / 10) === Math.floor(here.cx / 10) && Math.floor(cy / 10) === Math.floor(here.cy / 10))
      .find(({ cx, cy }) => { const p = d.worldState.geography.profileAt(cx, cy); return p.kind === 'earth' ? p.land : p.kind === 'random' ? p.elevation > 0 : false; });
    if (!candidates) throw new Error('The fixture must have a nearby land comarca in the home region');
    actor.worldKnowledge.see(candidates.cx, candidates.cy, sim.time.day);
    actor.inventory.add('sledge', 1); actor.equipment.left = { item: 'sledge', count: 1 }; actor.knownTech.add('sledge');
    sim.config.time.ticksPerDay = 4;
    return { from: here, target: candidates, rivalId: rival.id, rivalPersonId: rivalPerson.id, rivalName: rivalPerson.name, ownId: own.id };
  });
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.locator('.hud-globe').click();
  await clickCell(page, Math.floor(fixture.from.cx / 10), Math.floor(fixture.from.cy / 10), 96, 48);
  await page.locator('.worldmap-closer').click();
  await clickCell(page, fixture.target.cx % 10, fixture.target.cy % 10, 10, 10);
  await expect(page.locator('.worldmap-journey')).toBeVisible();
  await page.locator('.worldmap-journey').click();
  await expect(page.locator('.journey-status')).toBeVisible();
  await expect(page.locator('.journey-status')).toContainText('sledge');

  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    for (let i = 0; i < 100 && d.worldState.frontier.pendingJourney; i++) {
      d.worldState.current.step();
      d.worldState.advancePeoples();
    }
  });
  await expect.poll(() => page.evaluate(() => (window as any).__dynasty.worldState.frontier.pendingJourney === null), { timeout: 5_000 }).toBe(true);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(() => page.evaluate(() => { const d = (window as any).__dynasty; return d.sim === d.worldState.current; }), { timeout: 5_000 }).toBe(true);

  // Four-tick fixture days accelerate travel; pause once the new owner is visible
  // so repeated world updates cannot starve Chromium's milestone capture.
  await page.getByRole('button', { name: 'Pause' }).click();

  const archive = await page.evaluate(({ ownId, rivalId, rivalPersonId }) => {
    const d = (window as any).__dynasty, households = d.worldState.worldHouseholds(), people = d.worldState.worldPeople();
    const own = households.get(ownId), rival = households.get(rivalId);
    return {
      feud: own?.feud.get(rivalId) ?? null,
      suspect: own?.feudSuspects.get(rivalId) ?? null,
      rivalHasMember: rival?.memberIds.includes(rivalPersonId) ?? false,
      rivalPersonResolved: people.has(rivalPersonId),
    };
  }, fixture);
  expect(archive).toEqual({ feud: 47, suspect: fixture.rivalPersonId, rivalHasMember: true, rivalPersonResolved: true });

  await page.locator('.rivalhouses-trigger').click();
  const panel = page.locator('.rivalhouses');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(fixture.rivalName);
  await expect(panel).toContainText('Your family remembers an open feud.');
  await page.screenshot({ path: `${SHOTS}/01-rival-from-origin-archive.png` });
  expect(errors).toEqual([]);
});