/** M15 phase 40e: the iron tools web, full kit, and a real six-power dig. */
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase40-iron-tools-2026-10-08';

async function openGame(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m15-iron-tools-e2e&skipIntro=1&lang=es');
  await page.waitForFunction(() => Boolean((window as any).__dynasty?.sim?.player), null, { timeout: 30_000 });
  await expect(page.locator('.hud-tabs')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.hud-button', { hasText: /pausa/i })).toBeVisible({ timeout: 10_000 });
  await page.locator('.hud-button', { hasText: /pausa/i }).click();
}

test('the Metal TechWeb names iron tools in Spanish', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  await page.evaluate(() => {
    const player = (window as any).__dynasty.sim.player;
    for (const tech of ['stoneworking', 'native_copper', 'firemaking', 'carpentry', 'charcoal',
      'pottery', 'masonry', 'kiln', 'smelting', 'bog_iron', 'bellows', 'bloomery', 'forging',
      'carburising', 'bronze_tools']) {
      player.knownTech.add(tech); player.techLevel.set(tech, 1);
    }
  });
  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });
  await page.locator('.techweb-gatemark[data-web="metal"]').click();
  const node = page.locator('.techweb-node[data-tech="iron_tools"]');
  await expect(node).toHaveCount(1);
  await node.hover();
  await expect(page.locator('.techweb-title')).toHaveText('Herramientas de hierro');
  await page.screenshot({ path: SHOTS + '/01-iron-tools-in-metal-techweb-es.png' });
});

test('an anvil order makes the four iron tools and the iron spade digs the ground six times as fast', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  const fixture = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, player = sim.player;
    if (!player) throw new Error('The game did not create a player');
    player.needs.hunger = player.needs.thirst = player.needs.cold = player.needs.fatigue = 0;
    player.workedTicks = 0; player.skills.smith = 70;
    for (const tech of ['bog_iron', 'bellows', 'mining', 'smelting', 'charcoal', 'firemaking', 'carpentry',
      'bloomery', 'forging', 'carburising', 'iron_tools']) {
      player.knownTech.add(tech); player.techLevel.set(tech, 1); sim.knownTech.add(tech);
    }
    for (const [item, count] of player.inventory.entries()) player.inventory.remove(item, count);
    let anvil: any = null;
    search: for (let radius = 4; radius <= 20; radius++) {
      for (let angle = 0; angle < 32; angle++) {
        const x = Math.round(player.x + Math.cos(angle * Math.PI / 16) * radius);
        const y = Math.round(player.y + Math.sin(angle * Math.PI / 16) * radius);
        if (!sim.world.isWalkable(x, y) || sim.buildingAt(x, y)) continue;
        if (sim.nodes.some((n: any) => Math.hypot(n.x - x, n.y - y) <= 4)) continue;
        if (sim.trees.some((t: any) => t.standing && Math.hypot(t.x - x, t.y - y) <= 5)) continue;
        anvil = sim.place('anvil', x, y, player.bandId, null);
        if (anvil) break search;
      }
    }
    if (!anvil) throw new Error('Could not place the anvil fixture in open ground');
    anvil.complete = true;
    player.x = anvil.centerX + 1.5; player.y = anvil.centerY + 0.5;
    player.path = null; player.pathCount = player.pathAt = 0;
    d.camera.snapTo(player.x, player.y); d.camera.following = false;
    const recipes = [{ id: 'iron_axe', iron: 1 }, { id: 'iron_adze', iron: 1 },
      { id: 'iron_sickle', iron: 1 }, { id: 'iron_spade', iron: 2 }];
    const madeTools: string[] = [];
    for (const { id: recipeId, iron } of recipes) {
      player.inventory.add('wrought_iron', iron);
      if (!sim.order(player, 'craft', { recipeId, buildingId: anvil.id })) {
        throw new Error(`The ${recipeId} order was refused: ${sim.lastRefusal}`);
      }
      const output = recipeId;
      for (let tick = 0; tick < 3000 && player.inventory.count(output) === 0; tick++) {
        player.needs.hunger = player.needs.thirst = player.needs.cold = player.needs.fatigue = 0; sim.step();
      }
      if (player.inventory.count(output) !== 1) throw new Error('The smith did not finish ' + recipeId + ': ' + JSON.stringify({ inventory: [...player.inventory.entries()], action: player.action, order: player.order, skill: player.skills.smith, needs: player.needs, interruptions: sim.interruptions.slice(-4) }));
      madeTools.push(recipeId);
      player.inventory.remove(recipeId, 1);
    }
    for (const tool of madeTools) player.inventory.add(tool, 1);
    return { playerId: player.id, anvilId: anvil.id };
  });

  await page.locator('.hud-tab[data-tab="kit"]').click();
  for (const label of ['Hacha de hierro', 'Azuela de hierro', 'Hoz de hierro', 'Pala de hierro']) {
    await expect(page.locator('.hud-item-name', { hasText: label })).toContainText('×1');
  }
  await page.evaluate(({ anvilId }) => {
    const d = (window as any).__dynasty, anvil = d.sim.buildings.find((b: any) => b.id === anvilId);
    d.renderer.floaters.clear(); d.camera.zoom = 4; d.camera.snapTo(anvil.centerX, anvil.centerY); d.camera.following = false;
  }, fixture);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: SHOTS + '/02-four-iron-tools-in-kit-es.png' });

  const dug = await page.evaluate(async ({ playerId, anvilId }) => {
    const d = (window as any).__dynasty, sim = d.sim, player = sim.peopleById.get(playerId);
    for (const item of ['iron_axe', 'iron_adze', 'iron_sickle']) player.inventory.remove(item, 1);
    player.techLevel.set('iron_tools', 0);
    const modulePath = '/src/sim/core/Earth.ts';
    const { digTool } = await import(modulePath);
    const ironSpade = digTool(player);
    player.inventory.remove('iron_spade', 1); player.inventory.add('sticks', 1);
    const diggingStick = digTool(player);
    player.inventory.remove('sticks', 1); player.inventory.add('iron_spade', 1);
    if (!ironSpade || !diggingStick) throw new Error('Could not compare the iron spade and digging stick');
    const world = sim.world, anvil = sim.buildings.find((building: any) => building.id === anvilId);
    const px = Math.floor(anvil.centerX), py = Math.floor(anvil.centerY);
    let spot: { x: number; y: number } | null = null;
    for (let radius = 0; radius < 30 && !spot; radius++) {
      for (let y = Math.max(4, py - radius); y <= Math.min(world.height - 5, py + radius); y++) {
        for (let x = Math.max(4, px - radius); x <= Math.min(world.width - 5, px + radius); x++) {
          if (world.walkable[y * world.width + x] !== 1) continue;
          if (['water', 'rock'].includes(world.biomeAt(x, y)) || world.isShore(x, y)) continue;
          if (sim.buildingAt(x, y)) continue;
          if (sim.trees.some((tree: any) => tree.standing && Math.hypot(tree.x - x - 0.5, tree.y - y - 0.5) < 5)) continue;
          spot = { x, y }; break;
        }
        if (spot) break;
      }
    }
    if (!spot) throw new Error('No clear diggable ground for the iron spade');
    player.x = spot.x + 0.5; player.y = spot.y + 0.5;
    player.path = null; player.pathCount = player.pathAt = 0;
    player.needs.hunger = player.needs.thirst = player.needs.cold = player.needs.fatigue = 0;
    if (!sim.order(player, 'dig', { x: spot.x, y: spot.y })) throw new Error('Iron spade dig was refused: ' + sim.lastRefusal);
    const before = world.depthDug(spot.x, spot.y);
    for (let tick = 0; tick < 120 && world.depthDug(spot.x, spot.y) === before; tick++) {
      player.needs.hunger = player.needs.thirst = player.needs.cold = player.needs.fatigue = 0; sim.step();
    }
    const after = world.depthDug(spot.x, spot.y);
    d.renderer.floaters.clear(); d.renderer.fogEnabled = false;
    d.camera.zoom = 4; d.camera.snapTo(player.x, player.y); d.camera.following = false;
    return { item: ironSpade.item, power: ironSpade.power, stickPower: diggingStick.power, before, after, spot };
  }, fixture);
  expect(dug.item).toBe('iron_spade');
  expect(dug.power).toBe(dug.stickPower * 6);
  expect(dug.after).toBeGreaterThan(dug.before);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: SHOTS + '/03-iron-spade-real-dig-es.png' });
});
