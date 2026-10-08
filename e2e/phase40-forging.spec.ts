/** M15 phase 40c: the Metal web names forging in Spanish, and an order turns a bloom into wrought iron at an anvil. */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'artifacts/screenshots/m15-phase40-forging-2026-10-08';

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
  const started = await page.evaluate(() => {
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

    let anvil: any = null;
    search: for (let radius = 3; radius <= 12; radius++) {
      for (let angle = 0; angle < 32; angle++) {
        const x = Math.round(player.x + Math.cos(angle * Math.PI / 16) * radius);
        const y = Math.round(player.y + Math.sin(angle * Math.PI / 16) * radius);
        if (!sim.world.isWalkable(x, y) || sim.buildingAt(x, y)) continue;
        if (sim.nodes.some((n: any) => Math.hypot(n.x - x, n.y - y) <= 2)) continue;
        if (sim.trees.some((t: any) => t.standing && Math.hypot(t.x - x, t.y - y) <= 2)) continue;
        anvil = sim.place('anvil', x, y, player.bandId, null);
        if (anvil) break search;
      }
    }
    if (!anvil) throw new Error('Could not place the anvil fixture in open ground');
    anvil.complete = true;
    player.x = anvil.centerX + 1.5;
    player.y = anvil.centerY + 0.5;
    player.path = null; player.pathCount = player.pathAt = 0;
    d.camera.snapTo(player.x, player.y);
    d.camera.following = false;
    if (!sim.order(player, 'craft', { recipeId: 'forge_iron', buildingId: anvil.id })) {
      throw new Error('The iron forging order was refused: ' + sim.lastRefusal);
    }
    return { playerId: player.id, anvilId: anvil.id };
  });

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
