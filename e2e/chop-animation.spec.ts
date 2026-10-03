import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a real felling order swings four axe poses, freezes and releases the gesture', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-fixture&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  const shots = process.env.DYNASTY_CAPTURE_DIR ??
    'artifacts/screenshots/m15-chop-' + new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(shots, { recursive: true });

  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    const tree = d.sim.trees.find((candidate: any) => candidate.standing &&
      Math.hypot(candidate.x - p.x, candidate.y - p.y) < 45 &&
      !d.sim.trees.some((other: any) => other !== candidate && other.standing &&
        Math.hypot(other.x - candidate.x, other.y - candidate.y) < 4));
    if (!tree) throw new Error('No isolated standing tree fixture');
    p.x = tree.x - 0.5; p.y = tree.y;
    p.path = null; p.pathCount = p.pathAt = 0;
    for (const [item, count] of p.inventory.entries()) p.inventory.remove(item, count);
    p.equipment = {}; p.carryContainerCapacity = 0;
    p.needs.hunger = p.needs.thirst = p.needs.cold = 0;
    p.knownTech.add('hafting'); p.inventory.add('handaxe', 1);
    if (!d.sim.order(p, 'chop', { treeId: tree.id })) throw new Error('Chop order refused');
    for (let tick = 0; tick < 24 && tree.chopProgress <= 0; tick++) d.sim.step();
    if (p.action !== 'chop' || tree.chopProgress <= 0 || !tree.standing) throw new Error('Felling never began');
    d.camera.zoom = 8; d.camera.snapTo(p.x, p.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
    const renderer = d.renderer, originalPersonDraw = renderer.drawArtPerson.bind(renderer);
    renderer.drawArtPerson = (...args: any[]) => {
      (window as any).__chopDrawingId = args[1].id;
      return originalPersonDraw(...args);
    };
    const art = renderer.art, originalDraw = art.drawPerson.bind(art);
    art.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if ((window as any).__chopDrawingId === d.sim.player.id) {
        (window as any).__chopAspect = { pose: aspect.pose, held: aspect.held };
        (window as any).__chopPixels = art.compose(aspect).toDataURL();
      }
      return originalDraw(ctx, aspect, ...args);
    };
  });

  // The real approach leaves the renderer's 140ms walking grace period alive.
  // Let that presentation state settle while the simulation stays paused.
  await page.waitForTimeout(200);
  const frames: string[] = [];
  for (let phase = 0; phase < 4; phase++) {
    const result = await page.evaluate(phase => {
      const d = (window as any).__dynasty, p = d.sim.player;
      p.workedTicks = 1 + phase * 2;
      const state = () => JSON.stringify({ tick: d.sim.time.tick, timer: p.actionTimer,
        work: p.workedTicks, action: p.action, needs: p.needs, inventory: p.inventory.entries(),
        tree: d.sim.treesById.get(p.targetTreeId).chopProgress,
        rng: Object.values(d.sim).filter((value: any) => typeof value?.getState === 'function')
          .map((value: any) => value.getState()) });
      const before = state(); d.renderer.render(null, 0);
      return { before, after: state(), aspect: (window as any).__chopAspect,
        pixels: (window as any).__chopPixels };
    }, phase);
    expect(result.after).toBe(result.before);
    expect(result.aspect).toEqual({ pose: 'c' + phase, held: 'handaxe' });
    frames.push(result.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-swing-c${phase}.png` });
  }
  expect(new Set(frames).size).toBe(4);
  const paused = await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    return { tick: d.sim.time.tick, work: p.workedTicks,
      progress: d.sim.treesById.get(p.targetTreeId).chopProgress };
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    return { tick: d.sim.time.tick, work: p.workedTicks,
      progress: d.sim.treesById.get(p.targetTreeId).chopProgress };
  })).toEqual(paused);
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    d.sim.order(d.sim.player, 'idle'); d.renderer.render(null, 0);
  });
  expect(await page.evaluate(() => (window as any).__chopAspect.pose)).toBe('idle');
  expect(errors).toEqual([]);
});
