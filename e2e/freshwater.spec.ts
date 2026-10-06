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

