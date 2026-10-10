/** M15 phases 17 and 27c: animate a real shallow-water pull and show its harpoon bonus. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// A capture run names a new milestone directory; ordinary regression runs
// must not overwrite the chronological screenshots from an earlier milestone.
const SHOTS = process.env.DYNASTY_CAPTURE_DIR;

test('a fitted spear harvests a real shoal and the tech web explains the harpoon bonus', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=m15-phase27-fishing&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const fishing = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player, world = sim.world;
    if (!person) throw new Error('No player fixture');
    const fish = sim.nodes.filter((node: any) => node.kind === 'fish' && !node.depleted &&
      world.isShallow(node.x, node.y))
      .sort((a: any, b: any) => person.distanceTo(a) - person.distanceTo(b))[0];
    if (!fish) throw new Error('No fish node in walkable shallows');

    person.x = fish.x; person.y = fish.y;
    person.path = null; person.pathCount = person.pathAt = 0;
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    person.knownTech.add('spear'); person.knownTech.add('fishing');
    person.techLevel.set('spear', 1); person.techLevel.set('fishing', 1);
    person.inventory.add('spear', 1);
    person.equipment = { right: { item: 'spear', count: 1 } };
    const before = person.inventory.count('fish');
    if (!sim.order(person, 'forage', { nodeId: fish.id })) throw new Error('Simulation refused shallow fishing order');
    for (let tick = 0; tick < 40 && person.workedTicks <= 0; tick++) sim.step();
    if (person.workedTicks <= 0 || person.action !== 'forage') throw new Error('The shoal order never entered active work');
    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
    d.renderer.render(null, 0);
    return { before, spear: person.inventory.count('spear'), fitted: person.equipment.right?.item === 'spear',
      shallow: world.isShallow(person.x, person.y) };
  });
  expect(fishing).toMatchObject({ spear: 1, fitted: true, shallow: true });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/00-shallow-water-fishing-pose.png` });

  const caught = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player, world = sim.world;
    const before = person.inventory.count('fish');
    for (let tick = 0; tick < 120 && person.inventory.count('fish') <= before; tick++) sim.step();
    const amount = person.inventory.count('fish') - before;
    if (amount <= 0) throw new Error('The ordered shoal pull did not yield a fish');
    if (!world.isShallow(person.x, person.y)) throw new Error('The fisher left shallow water before the catch');

    // Leave the fitted spear visible in the still frame after the measured catch.
    sim.order(person, 'idle');
    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
    d.renderer.render(null, 0);
    return { amount, fish: person.inventory.count('fish'), spear: person.inventory.count('spear'),
      fitted: person.equipment.right?.item === 'spear', shallow: world.isShallow(person.x, person.y) };
  });
  expect(caught).toMatchObject({ spear: 1, fitted: true, shallow: true });
  expect(caught.amount).toBeGreaterThan(0);

  await page.locator('.hud-tab[data-tab="kit"]').click();
  await expect(page.locator('.hud-tab[data-tab="kit"]')).toHaveClass(/is-active/);
  await expect(page.locator('#hud')).toContainText('Fish');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/01-shoal-catch-with-fitted-spear.png` });

  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });
  const spear = page.locator('.techweb-node[data-tech="spear"]');
  await spear.hover();
  await expect(page.locator('.techweb-title')).toHaveText('The spear');
  await expect(page.locator('.techweb-detail'))
    .toContainText('A blade at the end of a shaft: harder blows, first strikes, and more fish when harpooned.');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/02-spear-techweb-harpoon-bonus.png` });
  expect(errors).toEqual([]);
});
