/**
 * Screenshot tour. Not an assertion suite — a way to look at the game without
 * launching it, and to keep a visual record of how a change altered the view.
 *
 *   npm run shots   ->  artifacts/screenshots/
 */
import { test, expect } from '@playwright/test';

const DIR = 'artifacts/screenshots';

test('tour', async ({ page }) => {
  await page.goto('/?seed=tour&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: DIR + '/01-start.png' });

  // The radial menu over open ground.
  await page.locator('#view').click({ button: 'right', position: { x: 700, y: 430 } });
  await page.waitForTimeout(250);
  await page.screenshot({ path: DIR + '/02-radial.png' });
  await page.keyboard.press('Escape');

  // Let a few in-game days pass so people meet, gossip and build.
  await page.locator('.hud-speed').fill('120');
  await page.waitForTimeout(9000);

  await page.locator('.hud-tab', { hasText: 'Ties' }).click();
  await page.screenshot({ path: DIR + '/03-ties.png' });

  // A stranger: what the inspector will and will not tell you.
  const stranger = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: { player: { id: number }; livingPeople: () => { id: number; x: number; y: number }[] };
        camera: { worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number };
      };
    }).__dynasty;
    const other = d.sim.livingPeople().find(p => p.id !== d.sim.player.id);
    if (!other) return null;
    return { x: d.camera.worldToScreenX(other.x), y: d.camera.worldToScreenY(other.y) };
  });
  if (stranger) {
    await page.mouse.click(stranger.x, stranger.y);
    await page.locator('.hud-tab', { hasText: 'Self' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: DIR + '/07-stranger.png' });
    await page.locator('.hud-tab', { hasText: 'Life' }).click();
  }

  await page.locator('.hud-tab', { hasText: 'Life' }).click();
  await page.screenshot({ path: DIR + '/04-life.png' });

  // Build mode, with the locked designs visible.
  await page.keyboard.press('b');
  await page.waitForTimeout(300);
  await page.screenshot({ path: DIR + '/05-build.png' });
  await page.keyboard.press('Escape');

  // The succession screen: what a life comes to.
  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { die: (cause: string) => void } | null } };
    }).__dynasty;
    d.sim.player?.die('a fall from the rocks');
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: DIR + '/08-succession.png' });
  await page.locator('.succession-go').click();
  await page.waitForTimeout(300);

// A fruit tree, and what a woodsman can and cannot tell about it.
  const tree = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: { player: { x: number; y: number }; trees: { x: number; y: number; fruit: number }[] };
        camera: { worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number };
      };
    }).__dynasty;
    const near = d.sim.trees
      .filter(t => Math.hypot(t.x - d.sim.player.x, t.y - d.sim.player.y) < 16)
      .sort((a, b) => b.fruit - a.fruit)[0];
    if (!near) return null;
    return { x: d.camera.worldToScreenX(near.x), y: d.camera.worldToScreenY(near.y) };
  });
  if (tree) {
    await page.mouse.click(tree.x, tree.y);
    await page.waitForTimeout(200);
    await page.screenshot({ path: DIR + '/09-tree.png' });
    await page.mouse.click(tree.x, tree.y, { button: 'right' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: DIR + '/10-tree-menu.png' });
    await page.keyboard.press('Escape');
  }

  // The kit tab. A tree is selected at this point in the tour, and a tree has no
  // tabs, so put the player back in the panel first.
  // Clicking bare ground selects your own character, because nothing else is
  // there to claim the click. Clicking the character directly does not, now
  // that the player is deliberately the last candidate under the cursor.
  const clear = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: {
          player: { x: number; y: number } | null;
          world: { isWalkable: (x: number, y: number) => boolean };
          livingPeople: () => { x: number; y: number }[];
          nodes: { x: number; y: number }[];
          trees: { x: number; y: number }[];
          buildingAt: (x: number, y: number) => unknown;
        };
        camera: { worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number };
      };
    }).__dynasty;
    const me = d.sim.player;
    if (!me) return null;
    for (let r = 3; r < 12; r++) {
      for (let step = 0; step < 24; step++) {
        const angle = (step / 24) * Math.PI * 2;
        const x = Math.round(me.x + Math.cos(angle) * r);
        const y = Math.round(me.y + Math.sin(angle) * r);
        if (!d.sim.world.isWalkable(x, y)) continue;
        if (d.sim.buildingAt(x, y)) continue;
        if (d.sim.livingPeople().some(p => Math.hypot(p.x - x, p.y - y) < 2)) continue;
        if (d.sim.nodes.some(n => Math.hypot(n.x - x, n.y - y) < 2)) continue;
        if (d.sim.trees.some(t => Math.hypot(t.x - x, t.y - y) < 2.5)) continue;
        return { x: d.camera.worldToScreenX(x), y: d.camera.worldToScreenY(y) };
      }
    }
    return null;
  });
  if (clear) await page.mouse.click(clear.x, clear.y);

  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { inventory: { add: (id: string, n: number) => void } } | null } };
    }).__dynasty;
    d.sim.player?.inventory.add('berries', 6);
    d.sim.player?.inventory.add('flint', 3);
  });
  await page.locator('.hud-tab', { hasText: 'Kit' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: DIR + '/11-kit.png' });

  // Zoom out over the island.
  await page.locator('#view').hover();
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 120);
  await page.waitForTimeout(500);
  await page.screenshot({ path: DIR + '/06-island.png' });
});
