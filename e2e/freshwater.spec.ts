import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('continental river and salt coast paint without changing the checkpoint', async ({ page }) => {
  await page.goto('/?seed=freshwater-inspection&skipIntro=1&defaults=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty();
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  const result = await page.evaluate(async () => {
    const fixturePath = '/tools/frontierFixture.ts';
    const rendererPath = '/src/render/Renderer.ts';
    const cameraPath = '/src/render/Camera.ts';
    const checkpointPath = '/src/sim/persistence/CheckpointRecords.ts';
    const [{ createFrontier }, { Renderer }, { Camera }, { toCheckpointRecord }] = await Promise.all([
      import(fixturePath), import(rendererPath), import(cameraPath), import(checkpointPath),
    ]);
    const sim = createFrontier({ seed: 'freshwater-inspection', population: { bands: 0 },
      world: { width: 64, height: 48, treeDensity: 0, gameHerds: 0, predators: 0 } });
    while (sim.time.dayFraction < 0.5) sim.step();
    const canvas = document.createElement('canvas');
    canvas.id = 'freshwater-inspection'; canvas.width = 1024; canvas.height = 768;
    Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '10000' });
    document.body.appendChild(canvas);
    const camera = new Camera(); camera.setViewport(1024, 768);
    camera.zoom = 1; camera.snapTo(32, 24);
    const renderer = new Renderer(canvas, sim, camera); renderer.fogEnabled = false;
    const before = JSON.stringify(toCheckpointRecord(sim));
    renderer.render(null); renderer.render(null, 0.5);
    const unchanged = before === JSON.stringify(toCheckpointRecord(sim));
    // Sample actual river cells: a missing biome colour or a no-op render
    // cannot satisfy both opaque river and sea pixels.
    const context = canvas.getContext('2d')!;
    const river = Array.from(sim.world.biome as Uint8Array).findIndex((b: number) => b === 6);
    const sea = Array.from(sim.world.biome as Uint8Array).findIndex((b: number) => b === 0);
    const pixel = (i: number) => Array.from(context.getImageData((i % 64) * 16 + 8,
      Math.floor(i / 64) * 16 + 8, 1, 1).data);
    return { unchanged, river, sea, riverPixel: pixel(river), seaPixel: pixel(sea),
      fresh: sim.world.freshShore.length, salt: sim.world.saltShore.length };
  });
  expect(result.unchanged).toBe(true);
  expect(result.river).toBeGreaterThanOrEqual(0); expect(result.sea).toBeGreaterThanOrEqual(0);
  expect(result.fresh).toBeGreaterThan(0); expect(result.salt).toBeGreaterThan(0);
  expect(result.riverPixel[3]).toBe(255); expect(result.seaPixel[3]).toBe(255);
  const shots = process.env.DYNASTY_CAPTURE_DIR;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.locator('#freshwater-inspection').screenshot({ path: `${shots}/01-continental-water.png` });
  }
});

test('salt water has a harmful menu label and a visible stop reason after drinking', async ({ page }) => {
  await page.goto('/?seed=salt-ui&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty();
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  const target = await page.evaluate(() => {
    const d = (window as any).__dynasty, sim = d.sim, w = sim.world, p = sim.player;
    // The browser still opens classic play. This controlled salinity fixture
    // exercises the real UI binding without adding a geographic start menu.
    const kind = new Uint8Array(w.biome.length);
    const surface = new Float32Array(w.biome.length);
    for (let i = 0; i < kind.length; i++) if (w.biome[i] === 0) { kind[i] = 2; surface[i] = w.waterLevel; }
    Object.defineProperties(w, { waterKind: { value: kind, configurable: true },
      waterSurface: { value: surface, configurable: true } });
    const bank = w.shoreTiles.find((t: any) => t.x > 12 && t.x < w.width - 12 &&
      t.y > 12 && t.y < w.height - 12 && !w.isWater(t.x, t.y));
    if (!bank) throw new Error('salt UI needs an interior dry bank');
    const sea = [[bank.x - 1, bank.y], [bank.x + 1, bank.y], [bank.x, bank.y - 1], [bank.x, bank.y + 1]]
      .find(([x, y]) => w.isSaltWater(x, y));
    if (!sea) throw new Error('salt UI needs water beside its bank');
    // An empty target prevents an entity picker from intercepting the ground
    // action. It does not decide the action or inject a stop notice.
    sim.nodes.length = 0; sim.nodesById.clear(); sim.nodeHash.rebuild([]);
    while (sim.time.dayFraction < 0.5) sim.step();
    p.x = bank.x + 0.5; p.y = bank.y + 0.5;
    p.forgetPlans(); p.needs.thirst = 30;
    sim.shoreHash.rebuild(w.shoreTiles); sim.freshShoreHash.rebuild(w.freshShore);
    sim.saltShoreHash.rebuild(w.saltShore);
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear();
    d.camera.zoom = 4; d.camera.snapTo(p.x, p.y); d.camera.following = false;
    const rect = document.querySelector('#view')!.getBoundingClientRect();
    return { x: rect.left + d.camera.worldToScreenX(sea[0] + 0.1),
      y: rect.top + d.camera.worldToScreenY(sea[1] + 0.1), thirst: p.needs.thirst, health: p.health };
  });
  await page.mouse.click(target.x, target.y, { button: 'right' });
  const option = page.locator('.radial-item', { hasText: 'Drink salt water (harmful)' });
  await expect(option).toBeVisible();
  const shots = process.env.DYNASTY_CAPTURE_DIR;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/02-salt-water-menu.png` });
  }
  await option.click();
  const result = await page.evaluate(() => {
    const sim = (window as any).__dynasty.sim, p = sim.player;
    for (let i = 0; i < 80 && !sim.interruptions.some((n: any) => n.personId === p.id && n.reason === 'salt_water'); i++) sim.step();
    return { thirst: p.needs.thirst, health: p.health, order: p.order };
  });
  expect(result.thirst).toBeGreaterThan(target.thirst); expect(result.health).toBeLessThan(target.health);
  expect(result.order).toBeNull();
  await expect(page.locator('.hud-stopped')).toContainText('the water was salty and made them thirstier');
  if (shots) await page.screenshot({ path: `${shots}/03-salt-water-stop.png` });
});
