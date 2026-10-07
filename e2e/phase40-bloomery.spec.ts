/**
 * M15 phase 40b: the Metal web names bloomery in Spanish, and an order at a
 * furnace turns mined bog iron into the first iron bloom.
 *
 * DYNASTY_PORT=5399 node node_modules/@playwright/test/cli.js test e2e/phase40-bloomery.spec.ts
 *
 * Captures go to artifacts/screenshots/m15-phase40-bloomery-2026-10-07/.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'artifacts/screenshots/m15-phase40-bloomery-2026-10-07';

async function openGame(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m15-bloomery-e2e&skipIntro=1&lang=es');
  await page.waitForFunction(() => Boolean((window as any).__dynasty?.sim?.player), null, { timeout: 30_000 });
  await expect(page.locator('.hud-tabs')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.hud-button', { hasText: /pausa/i })).toBeVisible({ timeout: 10_000 });
  await page.locator('.hud-button', { hasText: /pausa/i }).click();
}

test('the Metal TechWeb names bloomery in Spanish', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  await page.evaluate(() => {
    const d = (window as any).__dynasty, player = d.sim.player;
    // Reveal the Metal sector and keep the new node's prerequisites legible.
    for (const tech of ['stoneworking', 'native_copper', 'firemaking', 'carpentry', 'charcoal',
      'pottery', 'masonry', 'kiln', 'smelting', 'bog_iron', 'bellows']) {
      player.knownTech.add(tech);
      player.techLevel.set(tech, 1);
    }
  });

  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });
  await page.locator('.techweb-gatemark[data-web="metal"]').click();
  const node = page.locator('.techweb-node[data-tech="bloomery"]');
  await expect(node).toHaveCount(1);
  await node.hover();
  await expect(page.locator('.techweb-title')).toHaveText('Horno bajo');
  await page.screenshot({ path: SHOTS + '/05-bloomery-in-metal-techweb-es.png' });
});

test('an order smelts bog iron at a furnace and shows the bloom in the kit', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await openGame(page);
  const started = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, player = sim.player;
    if (!player) throw new Error('The game did not create a player');
    player.needs.hunger = player.needs.thirst = player.needs.cold = 0;
    for (const tech of ['bog_iron', 'bellows', 'mining', 'smelting', 'charcoal', 'firemaking', 'carpentry', 'bloomery']) {
      player.knownTech.add(tech);
      player.techLevel.set(tech, 1);
      sim.knownTech.add(tech);
    }
    for (const [item, count] of player.inventory.entries()) player.inventory.remove(item, count);
    player.inventory.add('iron_ore', 2);
    player.inventory.add('charcoal', 1);

    let furnace: any = null;
    search: for (let radius = 3; radius <= 12; radius++) {
      for (let angle = 0; angle < 32; angle++) {
        const x = Math.round(player.x + Math.cos(angle * Math.PI / 16) * radius);
        const y = Math.round(player.y + Math.sin(angle * Math.PI / 16) * radius);
        if (!sim.world.isWalkable(x, y) || sim.buildingAt(x, y)) continue;
        if (sim.nodes.some((n: any) => Math.hypot(n.x - x, n.y - y) <= 2)) continue;
        if (sim.trees.some((t: any) => t.standing && Math.hypot(t.x - x, t.y - y) <= 2)) continue;
        furnace = sim.place('furnace', x, y, player.bandId, null);
        if (furnace) break search;
      }
    }
    if (!furnace) throw new Error('Could not place the furnace fixture in open ground');
    furnace.complete = true;
    player.x = furnace.centerX + 1.5;
    player.y = furnace.centerY + 0.5;
    player.path = null; player.pathCount = player.pathAt = 0;
    if (!sim.order(player, 'craft', { recipeId: 'smelt_iron', buildingId: furnace.id })) {
      throw new Error('The iron smelting order was refused');
    }
    return { playerId: player.id };
  });

  await expect.poll(
    () => page.evaluate(() => (window as any).__dynasty.renderer.floaters.items.map((item: any) => item.text)),
    { timeout: 5_000 },
  ).toContain('haciendo una lupia de hierro');

  const made = await page.evaluate(({ playerId }) => {
    const d = (window as any).__dynasty, sim = d.sim;
    const player = sim.peopleById.get(playerId);
    for (let tick = 0; tick < 3000 && player.inventory.count('iron_bloom') === 0; tick++) {
      player.needs.hunger = player.needs.thirst = player.needs.cold = 0;
      sim.step();
    }
    return {
      bloom: player.inventory.count('iron_bloom'),
      ore: player.inventory.count('iron_ore'),
      charcoal: player.inventory.count('charcoal'),
      chronicle: player.chronicle.some((entry: any) => entry.text === 'hizo una lupia de hierro'),
    };
  }, started);
  expect(made).toEqual({ bloom: 1, ore: 0, charcoal: 0, chronicle: true });

  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-item-name', { hasText: /Lupia/ })).toContainText('×1');
  await page.screenshot({ path: SHOTS + '/06-lupia-from-iron-ore-in-kit-es.png' });
});
