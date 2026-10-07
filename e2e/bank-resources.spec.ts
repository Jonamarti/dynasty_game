import { test, expect } from '@playwright/test';

const DIR = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-bank-resources-2026-10-08';

test('random wooded river paints its generated clay banks and reeds', async ({ page }) => {
  await page.goto('/?seed=resource-audit&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty();
  const counts = await page.evaluate(async () => {
    const paths = ['/src/sim/core/Simulation.ts', '/src/sim/core/IdSpace.ts',
      '/src/sim/world/WorldGeography.ts', '/src/render/Renderer.ts', '/src/render/Camera.ts'];
    const [{ Simulation }, { IdSpace }, { randomWorldGeography }, { Renderer }, { Camera }] =
      await Promise.all(paths.map(path => import(path)));
    const geography = randomWorldGeography('resources');
    const sim = new Simulation({ seed: 'resource-audit', population: { bands: 0 },
      world: { width: 64, height: 64, clayBanks: 6, reedBeds: 9, gameHerds: 0, predators: 0 } },
      new IdSpace(), { geography, x: 645, y: 65, comarcasWide: 10, comarcasHigh: 10 });
    const canvas = document.createElement('canvas');
    canvas.id = 'bank-resources';
    canvas.width = 1280; canvas.height = 800;
    document.body.appendChild(canvas);
    Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '10000', background: '#121820' });
    const camera = new Camera();
    camera.setViewport(1280, 800);
    camera.zoom = 0.7;
    const bank = sim.nodes.find((n: { kind: string }) => n.kind === 'clay');
    camera.snapTo(32, 32);
    const renderer = new Renderer(canvas, sim, camera);
    renderer.fogEnabled = false;
    renderer.render({ nodeId: bank.id });
    return {
      clay: sim.nodes.filter((n: { kind: string }) => n.kind === 'clay').length,
      reeds: sim.nodes.filter((n: { kind: string }) => n.kind === 'reeds').length,
    };
  });
  expect(counts).toEqual({ clay: 6, reeds: 9 });
  await page.locator('#bank-resources').screenshot({ path: DIR + '/01-wooded-river.png' });
});
