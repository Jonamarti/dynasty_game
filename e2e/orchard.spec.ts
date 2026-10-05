/**
 * M15 phase 24: planting a fruit tree from the radial menu. Somebody who knows
 * arboriculture is offered "Plant a tree here" on open ground, greyed with its
 * reason when there is nothing to plant, and enabled once a piece of fruit is in
 * the pack; choosing it plants a seedling. Captures go to DYNASTY_CAPTURE_DIR
 * (or a new dated directory) for the milestone record.
 */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('the radial menu offers planting, says why not, and plants', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-fixture&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  const shots = process.env.DYNASTY_CAPTURE_DIR ??
    'artifacts/screenshots/m15-orchard-' + new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(shots, { recursive: true });

  // A growing season, the idea in the player's head and open ground to plant in.
  const spot = await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    for (let i = 0; i < 600 && d.sim.time.growth <= 0; i++) d.sim.step();
    p.knownTech.add('arboriculture');
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    p.inventory.add('apple', 1);
    for (let r = 3; r < 20; r++) for (let a = 0; a < 32; a++) {
      const x = Math.round(p.x + Math.cos(a * Math.PI / 16) * r), y = Math.round(p.y + Math.sin(a * Math.PI / 16) * r);
      // Nothing else under the cursor, or the entity picker opens first.
      const clear = d.sim.livingPeople().every((q: any) => Math.hypot(q.x - x, q.y - y) > 3) &&
        d.sim.nodes.every((n: any) => Math.hypot(n.x - x, n.y - y) > 3) &&
        d.sim.trees.every((t: any) => !t.standing || Math.hypot(t.x - x, t.y - y) > 3) &&
        d.sim.animals.every((q: any) => Math.hypot(q.x - x, q.y - y) > 3);
      if (clear && d.sim.world.sameRegion(p.x, p.y, x, y) &&
          d.sim.plantOrderRefusal(p, x, y) === null) {
        // The scan needed fruit in the pack to judge the ground; now take it away.
        p.inventory.remove('apple', p.inventory.count('apple'));
        d.camera.snapTo(x, y); d.camera.following = false;
        return { x, y };
      }
    }
    throw new Error('no ground to plant on');
  });
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const at = await page.evaluate(({ x, y }) => {
    const d = (window as any).__dynasty, rect = document.getElementById('view')!.getBoundingClientRect();
    return { sx: rect.left + d.camera.worldToScreenX(x + 0.5), sy: rect.top + d.camera.worldToScreenY(y + 0.5) };
  }, spot);

  // Nothing to plant: on the menu, greyed, with the reason.
  await page.mouse.click(at.sx, at.sy, { button: 'right' });
  const greyed = page.locator('.radial-item', { hasText: 'Plant a tree here' }).first();
  await expect(greyed).toBeVisible({ timeout: 10_000 });
  await expect(greyed).toHaveClass(/is-disabled/);
  await greyed.hover();
  await page.screenshot({ path: shots + '/01-plant-greyed.png' });
  await page.keyboard.press('Escape');

  // With fruit in the pack the same entry is live.
  await page.evaluate(() => (window as any).__dynasty.sim.player.inventory.add('apple', 2));
  await page.mouse.click(at.sx, at.sy, { button: 'right' });
  const live = page.locator('.radial-item', { hasText: 'Plant a tree here' }).first();
  await expect(live).toBeVisible({ timeout: 10_000 });
  await expect(live).not.toHaveClass(/is-disabled/);
  await live.hover();
  await page.screenshot({ path: shots + '/02-plant-offered.png' });
  await live.click();

  // The order runs; a seedling stands where it was given (the click lands within
  // a tile of the spot, so look for the tree there rather than on the exact tile).
  const planted = await page.evaluate(({ x, y }) => {
    const d = (window as any).__dynasty, p = d.sim.player;
    const near = (t: any) => Math.hypot(t.x - x, t.y - y) < 1.8 && t.age < 10;
    for (let i = 0; i < 900 && !d.sim.trees.some(near); i++) {
      p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
      d.sim.step();
    }
    const tree = d.sim.trees.find(near);
    if (tree) d.camera.snapTo(tree.x, tree.y);
    return tree ? { species: tree.def.species, seedling: tree.isSeedling, apples: p.inventory.count('apple') } : null;
  }, spot);
  expect(planted).toMatchObject({ species: 'apple', seedling: true, apples: 1 });
  await page.screenshot({ path: shots + '/03-sapling-planted.png' });
  expect(errors).toEqual([]);
});
