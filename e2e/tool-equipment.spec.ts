/** M15 phase 11d: show the tool in hand, not the louder object in the pack. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a real chop order renders the fitted axe and keeps the packed spear out of hand', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-fixture&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const shots = process.env.DYNASTY_CAPTURE_DIR ??
    'artifacts/screenshots/m15-tools-' + new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(shots, { recursive: true });
  await page.evaluate(() => {
    const d = (window as any).__dynasty, person = d.sim.player;
    if (!person) throw new Error('No player fixture');
    const trees = d.sim.trees.filter((tree: any) => tree.standing &&
      Math.hypot(tree.x - person.x, tree.y - person.y) < 45);
    let target: any = null;
    for (const tree of trees) {
      const clear = !d.sim.trees.some((other: any) => other !== tree && other.standing &&
        Math.hypot(other.x - tree.x, other.y - tree.y) < 4);
      if (clear && (!target || Math.hypot(tree.x - person.x, tree.y - person.y) <
          Math.hypot(target.x - person.x, target.y - person.y))) target = tree;
    }
    if (!target) throw new Error('No isolated standing tree fixture');
    person.x = target.x + 0.5; person.y = target.y;
    person.path = null; person.pathCount = person.pathAt = 0;
    person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
    person.knownTech.add('hafting');
    person.inventory.add('spear', 1);
    person.inventory.add('handaxe', 1);
    if (!d.sim.order(person, 'chop', { treeId: target.id })) throw new Error('Simulation refused chop fixture order');
    for (let tick = 0; tick < 24 && person.equipment.right?.item !== 'handaxe' && person.equipment.left?.item !== 'handaxe'; tick++) d.sim.step();
    if (person.action !== 'chop' || (person.equipment.right?.item !== 'handaxe' && person.equipment.left?.item !== 'handaxe')) {
      throw new Error(`Chop did not fit its axe: ${person.action}`);
    }
    for (let tick = 0; tick < 8 && target.chopProgress <= 0; tick++) d.sim.step();
    if (target.chopProgress <= 0) throw new Error('Chopping did not begin after the tool change');

    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.workAlpha = 0;
    (window as any).__toolPersonId = person.id;
    (window as any).__toolHeld = null;
    (window as any).__toolPose = null;
    const renderer = d.renderer, originalPersonDraw = renderer.drawArtPerson.bind(renderer);
    renderer.drawArtPerson = (...args: any[]) => {
      (window as any).__drawingToolPerson = args[1].id;
      return originalPersonDraw(...args);
    };
    const art = renderer.art, originalDraw = art.drawPerson.bind(art);
    art.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if ((window as any).__drawingToolPerson === (window as any).__toolPersonId) {
        (window as any).__toolHeld = aspect.held;
        (window as any).__toolPose = aspect.pose;
      }
      return originalDraw(ctx, aspect, ...args);
    };
  });

  // The teleport and last real step still have the renderer's walk grace.
  // Let that observation expire before recording stationary tool use.
  await page.waitForTimeout(200);
  const rendered = await page.evaluate(() => {
    const d = (window as any).__dynasty, renderer = d.renderer;
    renderer.render(null, 0);
    const p = d.sim.player;
    return { held: (window as any).__toolHeld, pose: (window as any).__toolPose, action: p.action,
      axeInHand: p.equipment.right?.item === 'handaxe' || p.equipment.left?.item === 'handaxe',
      spearPacked: p.inventory.count('spear'), tick: d.sim.time.tick,
      progress: d.sim.trees.find((tree: any) => tree.id === p.targetTreeId)?.chopProgress };
  });
  expect(rendered).toMatchObject({ held: 'handaxe', action: 'chop', axeInHand: true, spearPacked: 1 });
  expect(rendered.pose).toMatch(/^c[0-3]$/);
  await page.screenshot({ path: `${shots}/01-axe-fitted-spear-packed.png` });
  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-tab[data-tab="kit"]')).toHaveClass(/is-active/);
  await page.screenshot({ path: `${shots}/02-fitted-hand-in-kit.png` });

  const ablation = await page.evaluate(() => {
    const d = (window as any).__dynasty;
    d.sim.config.carry.autoEquipTools = false;
    d.renderer.render(null, 0);
    return (window as any).__toolHeld;
  });
  expect(ablation).toBe('spear');
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    d.sim.config.carry.autoEquipTools = true;
    d.sim.order(d.sim.player, 'idle');
    (window as any).__toolHeld = null;
    d.renderer.render(null, 0);
  });
  expect(await page.evaluate(() => (window as any).__toolHeld)).toBe('spear');
  expect(errors).toEqual([]);
});
