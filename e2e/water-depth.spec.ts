import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('m16-owner-france-seed floods an excavated bank without flooding untouched building ground', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/?seed=728083595&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty();
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  const dir = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/playwright/captures/water-depth/m16-2026-10-26-ci-water-depth';
  mkdirSync(dir, { recursive: true });
  await page.evaluate(async () => {
    const paths = ['/src/sim/world/WorldAtlas.ts', '/src/sim/world/WorldGeography.ts',
      '/src/sim/world/WorldState.ts', '/src/render/Renderer.ts', '/src/render/Camera.ts'];
    const [{ loadWorldAtlas }, { earthWorldGeography }, { WorldState }, { Renderer }, { Camera }] =
      await Promise.all(paths.map(path => import(path)));
    const maps = await loadWorldAtlas();
    const geography = earthWorldGeography(maps.find((m: any) => m.entry.id === 'earth-12000-bce'), 10);
    const sim = new WorldState({ seed: 728083595, world: { width: 160, height: 160 } },
      { geography, start: { x: 470.5, y: 125.5 }, comarcasWide: 1, comarcasHigh: 1, peoples: false }).current;
    sim.possessFirst(); sim.autonomy = 'auto';
    const canvas = document.createElement('canvas'); canvas.id = 'n39-scene';
    canvas.width = 1600; canvas.height = 1000;
    Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '10000' });
    document.body.appendChild(canvas);
    const camera = new Camera(); camera.setViewport(1600, 1000); camera.zoom = 0.6; camera.snapTo(80, 120);
    const renderer = new Renderer(canvas, sim, camera);
    renderer.setArt((window as any).__dynasty.renderer.art); renderer.fogEnabled = false;
    const initial = sim.world.biome.slice(), floods: number[] = [];
    const original = sim.world.floodFrom.bind(sim.world);
    sim.world.floodFrom = (x: number, y: number) => {
      const filled = original(x, y); if (filled) floods.push(filled); return filled;
    };
    while (sim.time.tick < 120) sim.step();
    renderer.render(null);
    (window as any).__n39 = { sim, renderer, initial, floods };
  });
  await page.locator('#n39-scene').screenshot({ path: `${dir}/01-before-excavation.png` });
  const result = await page.evaluate(() => {
    const { sim, renderer, initial, floods } = (window as any).__n39;
    while (sim.time.tick < 840) sim.step();
    // The old fixture waited for autonomous people to happen to excavate this
    // bank. A policy change could remove that action entirely, leaving the
    // flood assertion unexercised. Perform the same physical earth edit the
    // dig action uses on the first natural bank that can reach its water level.
    const w = sim.world as any;
    const neighbors: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const bank = w.shoreTiles.find(({ x, y }: { x: number; y: number }) => {
      if (w.isWater(x, y) || w.biomeAt(x, y) === 'rock') return false;
      const i = w.index(x, y);
      if (w.offset[i] < 0) return false;
      return neighbors.some(([dx, dy]) => w.isWater(x + dx, y + dy));
    });
    if (!bank) throw new Error('The France fixture has no dry bank beside water');
    const sourceSurface = neighbors
      .filter(([dx, dy]) => w.isWater(bank.x + dx, bank.y + dy))
      .map(([dx, dy]) => {
        const sourceIndex = w.index(bank.x + dx, bank.y + dy);
        return w.waterSurface?.[sourceIndex] ?? w.config.waterLevel;
      }).sort((a, b) => b - a)[0];
    const bankIndex = w.index(bank.x, bank.y);
    const depth = Math.max(1, w.elevation[bankIndex] + w.offset[bankIndex] - sourceSurface + 0.01);
    w.dig(bank.x, bank.y, depth);
    renderer.render(null);
    let untouchedFlooded = 0;
    for (let i = 0; i < initial.length; i++) {
      if (initial[i] !== 0 && initial[i] !== 6 && (sim.world.biome[i] === 0 || sim.world.biome[i] === 6) &&
          sim.world.offset[i] >= 0) untouchedFlooded++;
    }
    return { untouchedFlooded, floods, bank };
  });
  await page.locator('#n39-scene').screenshot({ path: `${dir}/02-after-day-seven.png` });
  expect(result.floods.length, 'excavating the bank must reach its water source').toBeGreaterThan(0);
  expect(result.untouchedFlooded).toBe(0);
});

test('the coast paints traversal depth bands without advancing the paused world', async ({ page }) => {
  await page.goto('/?seed=e2e-fixture&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty();
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  const colors = await page.evaluate(async () => {
    const d = (window as any).__dynasty;
    while (d.sim.time.dayFraction < 0.5) d.sim.step();
    const checkpointPath = '/src/sim/persistence/CheckpointRecords.ts';
    const { toCheckpointRecord } = await import(checkpointPath);
    const w = d.sim.world;
    // The actual terrain bake is inspected. A helper test alone would still
    // pass if Renderer accidentally continued painting one water colour.
    const found = new Map<string, string>();
    const ctx = d.renderer.terrain.getContext('2d');
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
      if (!w.isWater(x, y)) continue;
      const depth = w.depthAt(x, y);
      const band = depth < w.wadeDepth ? 'wade' : depth < w.swimDepth ? 'swim' : 'deep';
      const p = ctx.getImageData(x * 16 + 8, y * 16 + 8, 1, 1).data;
      found.set(band, [...p].join(','));
    }
    d.renderer.fogEnabled = false;
    d.camera.zoom = Math.min(1100 / (w.width * 16), 650 / (w.height * 16));
    d.camera.snapTo(w.width / 2, w.height / 2); d.camera.following = false;
    const before = JSON.stringify(toCheckpointRecord(d.sim));
    d.renderer.render(null, 0);
    return { bands: Object.fromEntries(found), tick: d.sim.time.tick,
      unchanged: before === JSON.stringify(toCheckpointRecord(d.sim)) };
  });
  expect(Object.keys(colors.bands).sort()).toEqual(['deep', 'swim', 'wade']);
  expect(new Set(Object.values(colors.bands)).size).toBe(3);
  expect(colors.unchanged).toBe(true);
  const shots = process.env.DYNASTY_CAPTURE_DIR;
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/01-coast-depth.png` });
  }
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__dynasty.sim.time.tick)).toBe(colors.tick);
});
