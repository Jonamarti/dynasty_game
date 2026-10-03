/** M15 phase 17: a real simulation order drives the renderer's tool stroke. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('digging draws four clocked tool strokes only for a worker at the ground', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=e2e-fixture&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const shots = process.env.DYNASTY_CAPTURE_DIR ??
    'artifacts/screenshots/m15-dig-' + new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(shots, { recursive: true });
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    const person = d.sim.player;
    if (!person) throw new Error('No player fixture');
    const w = d.sim.world;
    const px = Math.floor(person.x), py = Math.floor(person.y);
    let spot: { x: number; y: number; distance: number } | null = null;
    for (let radius = 0; radius < 30 && !spot; radius++) {
      for (let y = Math.max(4, py - radius); y <= Math.min(w.height - 5, py + radius); y++) {
        for (let x = Math.max(4, px - radius); x <= Math.min(w.width - 5, px + radius); x++) {
          if (w.walkable[y * w.width + x] !== 1) continue;
          const biome = w.biomeAt(x, y);
          if (biome === 'water' || biome === 'rock') continue;
          // Tree canopies are intentionally drawn over people, so stage the
          // animation on a real open tile instead of hiding the new gesture.
          if (d.sim.trees.some((tree: any) => tree.standing && Math.hypot(tree.x - (x + 0.5), tree.y - (y + 0.5)) < 4)) continue;
          const distance = Math.hypot(x + 0.5 - person.x, y + 0.5 - person.y);
          if (!spot || distance < spot.distance) spot = { x, y, distance };
        }
      }
    }
    if (!spot) throw new Error('No diggable tile fixture');
    person.x = spot.x + 0.5; person.y = spot.y + 0.5;
    person.path = null; person.pathCount = person.pathAt = 0;
    person.inventory.add('sticks', 1);
    if (!d.sim.order(person, 'dig', { x: spot.x, y: spot.y })) throw new Error('Simulation refused dig fixture order');
    for (let tick = 0; tick < 20 && (person.action !== 'dig' || person.workedTicks === 0); tick++) d.sim.step();
    if (person.action !== 'dig' || person.workedTicks === 0) throw new Error(`Dig action did not begin: ${person.action}/${person.workedTicks}`);
    d.camera.zoom = 7.5; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.workAlpha = 0;
    (window as any).__digPersonId = person.id;
    (window as any).__digTarget = { x: spot.x, y: spot.y };
    (window as any).__digFrames = [];
    const art = d.renderer.art, draw = art.drawPerson.bind(art);
    art.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (aspect.pose.startsWith('d')) {
        (window as any).__digFrames.push({ pose: aspect.pose, held: aspect.held, pixels: art.compose(aspect).toDataURL() });
      }
      return draw(ctx, aspect, ...args);
    };
  });

  const pausedBefore = await page.evaluate(() => {
    const d = (window as any).__dynasty;
    const person = d.sim.player;
    d.renderer.render(null, 0);
    return { tick: d.sim.time.tick, workedTicks: person.workedTicks, depth: d.sim.world.depthDug(
      (window as any).__digTarget.x, (window as any).__digTarget.y) };
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => {
    const d = (window as any).__dynasty, person = d.sim.player;
    return { tick: d.sim.time.tick, workedTicks: person.workedTicks, depth: d.sim.world.depthDug(
      (window as any).__digTarget.x, (window as any).__digTarget.y) };
  })).toEqual(pausedBefore);

  const uniquePixels = new Set<string>();
  for (let phase = 0; phase < 4; phase++) {
    const state = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const person = d.sim.people.find((p: any) => p.id === (window as any).__digPersonId);
      person.workedTicks = 1 + phase * 2;
      (window as any).__digFrames = [];
      const before = { tick: d.sim.time.tick, workedTicks: person.workedTicks, action: person.action,
        x: person.x, y: person.y, depth: d.sim.world.depthDug((window as any).__digTarget.x, (window as any).__digTarget.y) };
      d.renderer.render(null, 0);
      const after = { tick: d.sim.time.tick, workedTicks: person.workedTicks, action: person.action,
        x: person.x, y: person.y, depth: d.sim.world.depthDug((window as any).__digTarget.x, (window as any).__digTarget.y) };
      return { before, after };
    }, phase);
    // The equality check below is repeated through the paused snapshot; this
    // frame-level assertion also catches render-side mutation during a draw.
    expect(state.after).toEqual(state.before);
    await expect.poll(() => page.evaluate(() => (window as any).__digFrames.at(-1)?.pose)).toBe(`d${phase}`);
    const frame = await page.evaluate(() => (window as any).__digFrames.at(-1));
    expect(frame.held).toBe('digging_stick');
    uniquePixels.add(frame.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-stroke-d${phase}.png` });
  }
  expect(uniquePixels.size).toBe(4);

  const falseWork = await page.evaluate(() => {
    const d = (window as any).__dynasty;
    const person = d.sim.player;
    d.sim.order(person, 'idle');
    (window as any).__digFrames = [];
    d.renderer.render(null, 0);
    return (window as any).__digFrames.length;
  });
  expect(falseWork).toBe(0);
  expect(errors).toEqual([]);
});
