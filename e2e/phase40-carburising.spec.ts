/** M15 phase 40d: Spanish TechWeb, real steel production, and the stronger steel sword. */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase40-carburising-2026-10-08';

async function openGame(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m15-carburising-e2e&skipIntro=1&lang=es');
  await page.waitForFunction(() => Boolean((window as any).__dynasty?.sim?.player), null, { timeout: 30_000 });
  await expect(page.locator('.hud-tabs')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.hud-button', { hasText: /pausa/i })).toBeVisible({ timeout: 10_000 });
  await page.locator('.hud-button', { hasText: /pausa/i }).click();
}

test('the Metal TechWeb names carburising in Spanish', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  await page.evaluate(() => {
    const player = (window as any).__dynasty.sim.player;
    for (const tech of ['stoneworking', 'native_copper', 'firemaking', 'carpentry', 'charcoal',
      'pottery', 'masonry', 'kiln', 'smelting', 'bog_iron', 'bellows', 'bloomery', 'forging']) {
      player.knownTech.add(tech);
      player.techLevel.set(tech, 1);
    }
  });
  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });
  await page.locator('.techweb-gatemark[data-web="metal"]').click();
  const node = page.locator('.techweb-node[data-tech="carburising"]');
  await expect(node).toHaveCount(1);
  await node.hover();
  await expect(page.locator('.techweb-title')).toHaveText('Carburización');
  await page.screenshot({ path: SHOTS + '/01-carburising-in-metal-techweb-es.png' });
});

test('a smith carburises steel and forges the stronger steel sword at an anvil', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  const fixture = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, player = sim.player;
    if (!player) throw new Error('The game did not create a player');
    player.needs.hunger = player.needs.thirst = player.needs.cold = player.needs.fatigue = 0;
    player.workedTicks = 0;
    player.skills.smith = 70;
    for (const tech of ['bog_iron', 'bellows', 'mining', 'smelting', 'charcoal', 'firemaking', 'carpentry',
      'bloomery', 'forging', 'carburising', 'bronze_arms']) {
      player.knownTech.add(tech);
      player.techLevel.set(tech, 1);
      sim.knownTech.add(tech);
    }
    for (const [item, count] of player.inventory.entries()) player.inventory.remove(item, count);
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
    player.x = anvil.centerX + 1.5; player.y = anvil.centerY + 0.5;
    player.path = null; player.pathCount = player.pathAt = 0;
    d.camera.snapTo(player.x, player.y); d.camera.following = false;
    player.inventory.add('wrought_iron', 1); player.inventory.add('charcoal', 1);
    if (!sim.order(player, 'craft', { recipeId: 'carburise_steel', buildingId: anvil.id })) {
      throw new Error('The carburising order was refused: ' + sim.lastRefusal);
    }
    return { playerId: player.id, anvilId: anvil.id };
  });

  const made = await page.evaluate(async ({ playerId, anvilId }) => {
    const sim = (window as any).__dynasty.sim, player = sim.peopleById.get(playerId);
    for (let tick = 0; tick < 2500 && player.inventory.count('steel') === 0; tick++) {
      player.needs.hunger = player.needs.thirst = player.needs.cold = 0; sim.step();
    }
    if (player.inventory.count('steel') !== 1) throw new Error('The smith did not finish carburising steel');
    if (!sim.order(player, 'craft', { recipeId: 'steel_sword', buildingId: anvilId })) {
      throw new Error('The steel sword order was refused: ' + sim.lastRefusal);
    }
    for (let tick = 0; tick < 2500 && player.inventory.count('steel_sword') === 0; tick++) {
      player.needs.hunger = player.needs.thirst = player.needs.cold = 0; sim.step();
    }
    if (player.inventory.count('steel_sword') !== 1) throw new Error('The smith did not finish the steel sword');
    player.inventory.add('bronze_sword', 1);
    const modulePath = '/src/sim/knowledge/Tech.ts';
    const { weaponOf } = await import(modulePath);
    const steelSword = weaponOf(player, false)!;
    player.inventory.remove('steel_sword', 1);
    const bronzeSword = weaponOf(player, false)!;
    player.inventory.add('steel_sword', 1);
    player.inventory.remove('bronze_sword', 1);
    const anvil = sim.buildings.find((building: any) => building.id === anvilId);
    return {
      steel: player.inventory.count('steel'), sword: player.inventory.count('steel_sword'),
      wroughtIron: player.inventory.count('wrought_iron'), charcoal: player.inventory.count('charcoal'),
      chronicle: player.chronicle.some((entry: any) => entry.text.toLowerCase().includes('acero')),
      anvilPosition: { x: anvil.centerX, y: anvil.centerY }, steelSword, bronzeSword,
    };
  }, fixture);
  expect(made).toMatchObject({ steel: 0, sword: 1, wroughtIron: 0, charcoal: 0, chronicle: true });
  expect(made.steelSword.damage).toBeGreaterThan(made.bronzeSword.damage);
  expect(made.steelSword.reach).toBeGreaterThan(made.bronzeSword.reach);
  expect(made.steelSword.hunt).toBeGreaterThan(made.bronzeSword.hunt);

  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-item-name', { hasText: /Espada de acero/i })).toContainText('×1');
  await page.evaluate(position => {
    const d = (window as any).__dynasty;
    d.renderer.floaters.clear(); d.camera.zoom = 4;
    d.camera.snapTo(position.x, position.y); d.camera.following = false;
  }, made.anvilPosition);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: SHOTS + '/02-steel-sword-forged-at-anvil-es.png' });
});


