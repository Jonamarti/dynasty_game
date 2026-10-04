import { test, expect } from '@playwright/test';

const captureDir = process.env.DYNASTY_CAPTURE_DIR;

test('geographic inspection terrain paints without mutating the world', async ({ page }) => {
  await page.goto('/?seed=geographic-inspection&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty();
  const result = await page.evaluate(async () => {
    // Use a separate renderer and canvas: this is an inspection fixture, not a
    // back door around the populated-start restriction or main's world owner.
    const worldStatePath = '/src/sim/world/WorldState.ts';
    const geographyPath = '/src/sim/world/WorldGeography.ts';
    const atlasPath = '/src/sim/world/WorldAtlas.ts';
    const rendererPath = '/src/render/Renderer.ts';
    const cameraPath = '/src/render/Camera.ts';
    const checkpointPath = '/src/sim/persistence/CheckpointRecords.ts';
    const [{ WorldState }, { earthWorldGeography }, { loadWorldAtlas }, { Renderer }, { Camera },
      { toCheckpointRecord }] = await Promise.all([
      import(worldStatePath), import(geographyPath), import(atlasPath),
      import(rendererPath), import(cameraPath), import(checkpointPath),
    ]);
    const maps = await loadWorldAtlas('/world/');
    const geography = earthWorldGeography(maps.find((m: { entry: { id: string } }) => m.entry.id === 'earth-present'), 10);
    // A window of Iberian comarcas from the committed atlas. Its coarse regional
    // relief is not a source of measured detail within a single comarca.
    const start = { x: (180 - 3) / 360 * geography.map.width, y: (90 - 40) / 180 * geography.map.height };
    const state = new WorldState({ seed: 'geographic-inspection', population: { bands: 0 },
      world: { width: 64, height: 64, gameHerds: 0, predators: 0 } },
    { geography, start, comarcasWide: 30, comarcasHigh: 20 });
    const canvas = document.createElement('canvas');
    canvas.id = 'geographic-inspection';
    canvas.width = 800;
    canvas.height = 800;
    document.body.appendChild(canvas);
    Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '10000', background: '#121820' });
    const camera = new Camera();
    camera.setViewport(800, 800);
    camera.zoom = 800 / (64 * 16);
    camera.snapTo(32, 32);
    const renderer = new Renderer(canvas, state.current, camera);
    renderer.fogEnabled = false;
    const before = JSON.stringify(toCheckpointRecord(state.current));
    renderer.render(null);
    renderer.render(null, 0.5);
    const after = JSON.stringify(toCheckpointRecord(state.current));
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, 800, 800).data;
    const colors = new Set<string>();
    let opaque = true;
    for (let i = 0; i < pixels.length; i += 4 * 101) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]},${pixels[i + 3]}`);
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) opaque = false;
    return { unchanged: before === after, colors: colors.size, people: state.current.people.length,
      elevation: state.current.world.metresAt(32, 32), opaque,
      biomeKinds: new Set(state.current.world.biome).size };
  });
  expect(result.unchanged).toBe(true);
  expect(result.people).toBe(0);
  // A no-op render leaves transparent pixels; a flat fill cannot paint the
  // distinct ground types present in this window.
  expect(result.opaque).toBe(true);
  expect(result.biomeKinds).toBeGreaterThan(1);
  expect(result.colors).toBeGreaterThan(1);
  expect(result.elevation).toBeGreaterThan(0);
  if (captureDir) await page.locator('#geographic-inspection').screenshot({ path: `${captureDir}/14-earth-iberia-inspection.png` });
});
