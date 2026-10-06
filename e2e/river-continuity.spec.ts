import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('the shared river bend renders deep water and fords without changing simulation state', async ({ page }) => {
  await page.goto('/?skipIntro=1&defaults=1&seed=river-continuity');
  await expect(page.locator('.hud-clock')).not.toBeEmpty();
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  const result = await page.evaluate(async () => {
    const fixturePath = '/tools/waterTerrainFixture.ts';
    const geographyPath = '/src/sim/world/WorldGeography.ts';
    const simulationPath = '/src/sim/core/Simulation.ts';
    const identityPath = '/src/sim/core/IdSpace.ts';
    const rendererPath = '/src/render/Renderer.ts';
    const cameraPath = '/src/render/Camera.ts';
    const checkpointPath = '/src/sim/persistence/CheckpointRecords.ts';
    const [{ createTurnedRiverFixture }, { earthWorldGeography }, { Simulation }, { IdSpace },
      { Renderer }, { Camera }, { toCheckpointRecord }] = await Promise.all([
      import(fixturePath), import(geographyPath), import(simulationPath), import(identityPath),
      import(rendererPath), import(cameraPath), import(checkpointPath),
    ]);
    const fixture = createTurnedRiverFixture();
    const { bounds } = fixture;
    const sim = new Simulation({ seed: 'river-continuity', population: { bands: 0 },
      world: { ...fixture.config, treeDensity: 0, gameHerds: 0, predators: 0 } }, new IdSpace(), {
      geography: earthWorldGeography(fixture.loaded, fixture.comarcasPerRegion),
      x: bounds.originX + bounds.comarcasWide / 2, y: bounds.originY + bounds.comarcasHigh / 2,
      comarcasWide: bounds.comarcasWide, comarcasHigh: bounds.comarcasHigh,
    });
    while (sim.time.dayFraction < 0.5) sim.step();
    const canvas = document.createElement('canvas');
    canvas.id = 'river-continuity'; canvas.width = 1200; canvas.height = 1000;
    Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '10000', background: '#0e1420' });
    document.body.appendChild(canvas);
    const camera = new Camera(); camera.setViewport(canvas.width, canvas.height);
    camera.zoom = 0.75; camera.snapTo(sim.world.width / 2, sim.world.height / 2);
    const renderer = new Renderer(canvas, sim, camera); renderer.fogEnabled = false;
    const before = JSON.stringify(toCheckpointRecord(sim));
    renderer.render(null); renderer.render(null, 0.5);
    let deep = 0, ford = 0;
    for (let y = 0; y < sim.world.height; y++) for (let x = 0; x < sim.world.width; x++) {
      if (sim.world.biomeAt(x, y) !== 'river') continue;
      if (sim.world.isWadeTile(x, y)) ford++; else deep++;
    }
    return { unchanged: before === JSON.stringify(toCheckpointRecord(sim)), deep, ford };
  });
  expect(result.unchanged).toBe(true);
  expect(result.deep).toBeGreaterThan(0); expect(result.ford).toBeGreaterThan(0);
  if (process.env.DYNASTY_CAPTURE_DIR) {
    mkdirSync(process.env.DYNASTY_CAPTURE_DIR, { recursive: true });
    await page.locator('#river-continuity').screenshot({ path: `${process.env.DYNASTY_CAPTURE_DIR}/04-river-bend-and-fords.png` });
  }
});
