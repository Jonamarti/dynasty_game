/** M15 phase 40c: the Metal web names forging in Spanish, and an order turns a bloom into wrought iron at an anvil. */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { placeStationFixtureOnClaimedGround } from './helpers';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/playwright/captures/phase40-forging/m15-phase40-forging-2026-10-08';

async function openGame(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m15-forging-e2e&skipIntro=1&lang=es');
  await page.waitForFunction(() => Boolean((window as any).__dynasty?.sim?.player), null, { timeout: 30_000 });
  await expect(page.locator('.hud-tabs')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.hud-button', { hasText: /pausa/i })).toBeVisible({ timeout: 10_000 });
  await page.locator('.hud-button', { hasText: /pausa/i }).click();
}

test('the Metal TechWeb names forging in Spanish', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  await page.evaluate(() => {
    const { sim } = (window as any).__dynasty, player = sim.player;
    for (const tech of ['stoneworking', 'native_copper', 'firemaking', 'carpentry', 'charcoal',
      'pottery', 'masonry', 'kiln', 'smelting', 'bog_iron', 'bellows', 'bloomery']) {
      player.knownTech.add(tech);
      player.techLevel.set(tech, 1);
    }
  });

  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });
  await page.locator('.techweb-gatemark[data-web="metal"]').click();
  const node = page.locator('.techweb-node[data-tech="forging"]');
  await expect(node).toHaveCount(1);
  await node.hover();
  await expect(page.locator('.techweb-title')).toHaveText('Forja');
  await page.screenshot({ path: SHOTS + '/01-forging-in-metal-techweb-es.png' });
});

test('an order forges a bloom at an anvil and shows wrought iron in the kit', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  const ready = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, player = sim.player;
    if (!player) throw new Error('The game did not create a player');
    player.needs.hunger = player.needs.thirst = player.needs.cold = 0;
    for (const tech of ['bog_iron', 'bellows', 'mining', 'smelting', 'charcoal', 'firemaking',
      'carpentry', 'bloomery', 'forging']) {
      player.knownTech.add(tech);
      player.techLevel.set(tech, 1);
      sim.knownTech.add(tech);
    }
    for (const [item, count] of player.inventory.entries()) player.inventory.remove(item, count);
    player.inventory.add('iron_bloom', 1);
    return { originX: player.x, originY: player.y };
  });
  // M16 2.22 refuses stations without territory; the fixture band has none.
  const anvil = await page.evaluate(placeStationFixtureOnClaimedGround, {
    kind: 'anvil',
    originX: ready.originX,
    originY: ready.originY,
  });
  const started = await page.evaluate(({ anvil }) => {
    const d = (window as any).__dynasty, sim = d.sim;
    const player = sim.player;
    const site = sim.buildings.find((building: any) => building.id === anvil.id);
    if (!site) throw new Error('The anvil fixture disappeared');
    site.complete = true;
    player.x = site.centerX + 1.5;
    player.y = site.centerY + 0.5;
    player.path = null; player.pathCount = player.pathAt = 0;
    d.camera.snapTo(player.x, player.y);
    d.camera.following = false;
    if (!sim.order(player, 'craft', { recipeId: 'forge_iron', buildingId: site.id })) {
      throw new Error('The iron forging order was refused: ' + sim.lastRefusal);
    }
    return { playerId: player.id, anvilId: site.id };
  }, { anvil });

  const made = await page.evaluate(({ playerId, anvilId }) => {
    const d = (window as any).__dynasty, sim = d.sim;
    const player = sim.peopleById.get(playerId);
    for (let tick = 0; tick < 3000 && player.inventory.count('wrought_iron') === 0; tick++) {
      player.needs.hunger = player.needs.thirst = player.needs.cold = 0;
      sim.step();
    }
    const anvil = sim.buildings.find((building: any) => building.id === anvilId);
    if (!anvil) throw new Error('The anvil fixture disappeared during forging');
    return {
      wroughtIron: player.inventory.count('wrought_iron'),
      bloom: player.inventory.count('iron_bloom'),
      chronicle: player.chronicle.some((entry: any) => entry.text.toLowerCase().includes('forjad')),
      anvilComplete: Boolean(anvil.complete),
      playerAtAnvil: Math.hypot(player.x - anvil.centerX, player.y - anvil.centerY) < 5,
      anvilPosition: { x: anvil.centerX, y: anvil.centerY },
    };
  }, started);
  expect(made).toMatchObject({ wroughtIron: 1, bloom: 0, chronicle: true, anvilComplete: true, playerAtAnvil: true });

  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-item-name', { hasText: /hierro forjado/i })).toContainText('×1');
  await page.evaluate(position => {
    const d = (window as any).__dynasty;
    d.renderer.floaters.clear();
    d.camera.zoom = 4;
    d.camera.snapTo(position.x, position.y);
    d.camera.following = false;
  }, made.anvilPosition);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: SHOTS + '/02-wrought-iron-forged-at-anvil-es.png' });
});
