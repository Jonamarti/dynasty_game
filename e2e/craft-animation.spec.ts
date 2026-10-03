import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a real craft order manipulates its work, hides a packed spear and freezes its bank', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-fixture&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  const shots = process.env.DYNASTY_CAPTURE_DIR ??
    'artifacts/screenshots/m15-craft-' + new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(shots, { recursive: true });

  await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player, world = d.sim.world;
    let spot: { x: number; y: number } | null = null;
    for (let y = Math.max(4, Math.floor(p.y) - 30); y < Math.min(world.height - 4, p.y + 30) && !spot; y++) {
      for (let x = Math.max(4, Math.floor(p.x) - 30); x < Math.min(world.width - 4, p.x + 30); x++) {
        if (world.isWalkable(x, y) && !d.sim.trees.some((tree: any) => tree.standing &&
          Math.hypot(tree.x - x - 0.5, tree.y - y - 0.5) < 5)) { spot = { x, y }; break; }
      }
    }
    if (!spot) throw new Error('No open craft fixture');
    p.x = spot.x + 0.5; p.y = spot.y + 0.5;
    p.path = null; p.pathCount = p.pathAt = 0;
    for (const [item, count] of p.inventory.entries()) p.inventory.remove(item, count);
    p.equipment = {}; p.carryContainerCapacity = 0;
    p.needs.hunger = p.needs.thirst = p.needs.cold = 0;
    p.knownTech.add('hafting');
    p.inventory.add('spear', 1); p.inventory.add('flint', 1); p.inventory.add('sticks', 1);
    if (!d.sim.order(p, 'craft', { recipeId: 'handaxe' })) throw new Error('Craft order refused');
    for (let tick = 0; tick < 20 && p.workedTicks <= 0; tick++) d.sim.step();
    if (p.action !== 'craft' || p.workedTicks <= 0 || p.bankedFor('craft:handaxe') <= 0) throw new Error('Craft never began');
    d.camera.zoom = 10; d.camera.snapTo(p.x, p.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
    // Teleporting the fixture must not leave its old walking direction in the
    // visual history. Start stationary and facing the camera for readable hands.
    d.renderer.walkPhase.delete(p.id);
    const renderer = d.renderer, originalPersonDraw = renderer.drawArtPerson.bind(renderer);
    renderer.drawArtPerson = (...args: any[]) => {
      (window as any).__craftDrawingId = args[1].id;
      return originalPersonDraw(...args);
    };
    const art = renderer.art, originalDraw = art.drawPerson.bind(art);
    art.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if ((window as any).__craftDrawingId === d.sim.player.id) {
        (window as any).__craftAspect = { pose: aspect.pose, held: aspect.held };
        (window as any).__craftPixels = art.compose(aspect).toDataURL();
      }
      return originalDraw(ctx, aspect, ...args);
    };
  });
  await page.waitForTimeout(200);
  const frames = new Set<string>();
  for (let phase = 0; phase < 4; phase++) {
    const result = await page.evaluate(phase => {
      const d = (window as any).__dynasty, p = d.sim.player;
      p.workedTicks = 1 + phase * 2;
      const state = () => JSON.stringify({ tick: d.sim.time.tick, timer: p.actionTimer,
        work: p.workedTicks, bank: p.bankedFor('craft:handaxe'), action: p.action,
        inventory: p.inventory.entries(), needs: p.needs });
      const before = state(); d.renderer.render(null, 0);
      return { before, after: state(), aspect: (window as any).__craftAspect,
        pixels: (window as any).__craftPixels };
    }, phase);
    expect(result.after).toBe(result.before);
    expect(result.aspect).toEqual({ pose: 'm' + phase, held: null });
    frames.add(result.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-work-m${phase}.png` });
  }
  expect(frames.size).toBe(4);
  const paused = await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    return { tick: d.sim.time.tick, timer: p.actionTimer, bank: p.bankedFor('craft:handaxe') };
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    return { tick: d.sim.time.tick, timer: p.actionTimer, bank: p.bankedFor('craft:handaxe') };
  })).toEqual(paused);
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    d.sim.order(d.sim.player, 'idle'); d.renderer.render(null, 0);
  });
  expect(await page.evaluate(() => (window as any).__craftAspect)).toEqual({ pose: 'idle', held: 'spear' });
  expect(errors).toEqual([]);
});
