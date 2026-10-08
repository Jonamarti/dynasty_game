import { test, expect } from '@playwright/test';
const DIR = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-river-geometry-2026-10-08';
for (const [name, lon, lat] of [['Ebro', -0.88, 41.65], ['Danube', 12.1, 49], ['Rhine', 6.96, 50.9], ['Tagus', -4, 39.9]] as const) {
  test(`${name} retains its detailed course and bank resources`, async ({ page }) => {
    await page.goto('/?seed=river-geometry&skipIntro=1');
    await expect(page.locator('.hud-clock')).not.toBeEmpty();
    const counts = await page.evaluate(async ({ lon, lat }) => {
      const modules = ['/src/sim/core/Simulation.ts', '/src/sim/core/IdSpace.ts', '/src/sim/world/WorldGeography.ts',
        '/src/sim/world/WorldBinary.ts', '/src/render/Renderer.ts', '/src/render/Camera.ts', '/src/render/ArtAtlas.ts'];
      const [{ Simulation }, { IdSpace }, { earthWorldGeography }, { decodeWorldRaster }, { Renderer }, { Camera }, { ArtAtlas }] = await Promise.all(modules.map(m => import(m)));
      const raster = decodeWorldRaster(new Uint8Array(await (await fetch('/world/earth-present.bin')).arrayBuffer()));
      const geography = earthWorldGeography({ entry: { id: 'earth-present', title: 'Earth', file: 'earth-present.bin', seaLevelMeters: 0, recommended: false }, raster }, 10);
      const sim = new Simulation({ seed: 'river-geometry', population: { bands: 0 }, world: { width: 128, height: 128, clayBanks: 6, reedBeds: 9, gameHerds: 0, predators: 0 } },
        new IdSpace(), { geography, x: (lon + 180) / 360 * 960, y: (90 - lat) / 180 * 480, comarcasWide: 4, comarcasHigh: 4 });
      const canvas = document.createElement('canvas'); canvas.id = 'river-map'; canvas.width = 1280; canvas.height = 800;
      Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '10000', background: '#121820' }); document.body.appendChild(canvas);
      const camera = new Camera(); camera.setViewport(1280, 800); camera.zoom = 0.72; camera.snapTo(64, 64);
      const renderer = new Renderer(canvas, sim, camera); renderer.setArt(await ArtAtlas.load('/art/')); renderer.fogEnabled = false; renderer.render();
      return { clay: sim.nodes.filter((n: any) => n.kind === 'clay').length, reeds: sim.nodes.filter((n: any) => n.kind === 'reeds').length };
    }, { lon, lat });
    expect(counts).toEqual({ clay: 6, reeds: 9 });
    await page.locator('#river-map').screenshot({ path: `${DIR}/${name}.png` });
  });
}
