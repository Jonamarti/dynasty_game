import { test, expect } from '@playwright/test';
const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase34-travel-' + new Date().toISOString().replace(/[:.]/g, '-');

test('the globe offers persistent travel controls and issues the chosen edge', async ({ page }) => {
  await page.goto('/?skipIntro=1&seed=e2e-globe&world=random');
  await expect(page.locator('.hud-name')).not.toBeEmpty();
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    d.sim.comarcaTravel = { refusal: () => null, arrive: () => null };
  });
  await page.locator('.hud-globe').click();
  const button = page.locator('[data-travel="leave_comarca"][data-edge="e"]');
  await expect(button).toHaveText('Leave to the east');
  await page.screenshot({ path: SHOTS + '/01-travel-controls.png' });
  await button.click();
  await expect(page.locator('.worldmap')).toBeHidden();
  const state = await page.evaluate(() => {
    const sim = (window as any).__dynasty.sim;
    return { action: sim.player.action, x: sim.player.targetX, width: sim.world.width };
  });
  expect(state.action).toBe('leave_comarca');
  expect(state.x).toBe(state.width - .5);
});

test('travel controls are translated and unavailable on the classic island', async ({ page }) => {
  await page.goto('/?skipIntro=1&seed=e2e-globe&world=random&lang=es');
  await expect(page.locator('.hud-name')).not.toBeEmpty();
  await page.evaluate(() => { (window as any).__dynasty.sim.comarcaTravel = { refusal: () => null, arrive: () => null }; });
  await page.locator('.hud-globe').click();
  await expect(page.locator('[data-travel="scout"][data-edge="n"]')).toHaveText('Explorar hacia el norte');
  await page.screenshot({ path: SHOTS + '/02-viajes-es.png' });
  await page.goto('/?skipIntro=1&seed=e2e-fixture');
  await expect(page.locator('.hud-name')).not.toBeEmpty();
  await page.locator('.hud-globe').click();
  await expect(page.locator('.worldmap-travel')).toBeHidden();
});

test('a real boundary arrival changes the displayed comarca and preserves the player', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?skipIntro=1&seed=e2e-globe&world=random');
  await expect(page.locator('.hud-name')).not.toBeEmpty();
  const before = await page.evaluate(() => {
    const sim = (window as any).__dynasty.sim;
    const actor = sim.player;
    const edge = ['n', 'e', 's', 'w'].find(dir => sim.comarcaTravel && !sim.comarcaTravel.refusal(actor, dir, false));
    if (!edge) throw new Error('The seeded fixture must have a physical land neighbour');
    return { id: actor.id, name: actor.name, edge, originX: sim.worldFrame.originX, originY: sim.worldFrame.originY };
  });
  await page.locator('.hud-globe').click();
  await page.locator('[data-travel="leave_comarca"][data-edge="' + before.edge + '"]').click();
  // Complete only the physical approach by fixture: the live action and root
  // still own arrival, authority transfer, and the renderer swap on the next tick.
  await page.evaluate(() => {
    const sim = (window as any).__dynasty.sim;
    const actor = sim.player;
    actor.x = actor.targetX; actor.y = actor.targetY;
    actor.needs.hunger = 0; actor.needs.thirst = 0; actor.needs.cold = 0; actor.needs.fatigue = 0;
    sim.peopleHash.rebuild(sim.livingPeople());
  });
  await expect.poll(() => page.evaluate(() => {
    const d = (window as any).__dynasty;
    return d.sim === d.worldState.current && d.worldState.frontier.toRecord().parked.length;
  }), { timeout: 15000 }).toBe(1);
  const after = await page.evaluate(() => {
    const sim = (window as any).__dynasty.sim;
    return { id: sim.player.id, name: sim.player.name, originX: sim.worldFrame.originX, originY: sim.worldFrame.originY };
  });
  expect(after.id).toBe(before.id); expect(after.name).toBe(before.name);
  expect([after.originX, after.originY]).not.toEqual([before.originX, before.originY]);
  await page.screenshot({ path: SHOTS + '/03-arrival.png' });
  expect(errors).toEqual([]);
});
