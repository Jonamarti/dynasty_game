/** M15 phase 17: a real flint order drives the shared material-extraction gesture. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-extraction-animation-2026-10-10';

test('a real flint pull shows the planted extraction stroke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-extraction-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const worker = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No player fixture');
    const source = sim.nodes[0];
    if (!source) throw new Error('No resource node prototype');
    const node = new source.constructor('flint', person.x + 0.25, person.y, { range: (_lo: number, hi: number) => hi }, sim.ids);
    sim.nodes.push(node); sim.nodesById.set(node.id, node); sim.nodeHash.rebuild(sim.nodes);
    person.path = null; person.pathCount = person.pathAt = 0;
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    if (!sim.order(person, 'gather', { nodeId: node.id })) throw new Error('Simulation refused flint gathering order');
    for (let tick = 0; tick < 40 && person.workedTicks <= 0; tick++) sim.step();
    if (person.workedTicks <= 0 || person.action !== 'gather' || person.actionTotal <= 0) {
      throw new Error('The flint order never entered active work');
    }
    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: person.action, workedTicks: person.workedTicks, actionTimer: person.actionTimer };
  });

  expect(worker.action).toBe('gather');
  expect(worker.workedTicks).toBeGreaterThan(0);
  expect(worker.actionTimer).toBeGreaterThan(0);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/00-active-flint-extraction.png` });
  expect(errors).toEqual([]);
});
