import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('visible hearth light softens night without changing the paused world or piercing fog', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=hearth-light&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  const shots = process.env.DYNASTY_CAPTURE_DIR ??
    'artifacts/screenshots/m15-phase12c-light-' + new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(shots, { recursive: true });

  const fixture = await page.evaluate(() => {
    const d = (window as any).__dynasty, p = d.sim.player;
    d.sim.time.tick = 0;
    d.sim.knownTech.add('firemaking');
    let hearth: any = null;
    for (let ring = 4; ring < 22 && !hearth; ring++) {
      for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring]]) {
        hearth = d.sim.place('hearth', Math.round(p.x + dx), Math.round(p.y + dy), p.bandId, null);
        if (hearth) break;
      }
    }
    if (!hearth) throw new Error('Could not place a hearth fixture');
    hearth.complete = true;
    d.camera.following = false;
    d.camera.zoom = 3;
    d.camera.snapTo(hearth.x, hearth.y);
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();
    const originalLightAt = d.sim.lightAt.bind(d.sim);
    (window as any).__lightQueries = [];
    d.sim.lightAt = (x: number, y: number) => {
      (window as any).__lightQueries.push({ x, y });
      return originalLightAt(x, y);
    };
    const durations: number[] = [];
    (window as any).__nightOverlayDurations = durations;
    const drawNightOverlay = d.renderer.drawNightOverlay.bind(d.renderer);
    d.renderer.drawNightOverlay = (sources: any[]) => {
      const start = performance.now();
      drawNightOverlay(sources);
      durations.push(performance.now() - start);
    };
    const rng = Object.values(d.sim).filter((value: any) => typeof value?.getState === 'function')
      .map((value: any) => value.getState());
    return { id: hearth.id, x: hearth.x, y: hearth.y, tick: d.sim.time.tick, rng,
      daylight: d.sim.time.daylight };
  });
  expect(fixture.daylight).toBe(0);

  const sample = async () => page.evaluate(({ x, y }) => {
    const d = (window as any).__dynasty;
    d.renderer.render(null, 0);
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect(), ratioX = canvas.width / rect.width, ratioY = canvas.height / rect.height;
    const sx = d.camera.worldToScreenX(x + 2.5), sy = d.camera.worldToScreenY(y);
    const pixel = d.renderer['ctx'].getImageData(Math.floor(sx * ratioX), Math.floor(sy * ratioY), 1, 1).data;
    return [...pixel];
  }, { x: fixture.x, y: fixture.y });

  const activePixel = await sample();
  await page.screenshot({ path: `${shots}/01-brasero-activo.png` });
  expect(await page.evaluate(({ x, y }) => (window as any).__lightQueries
    .some((point: any) => Math.hypot(point.x - x, point.y - y) < 0.1),
  { x: fixture.x, y: fixture.y })).toBe(true);
  const performanceSample = await page.evaluate(() => {
    const d = (window as any).__dynasty, durations = (window as any).__nightOverlayDurations as number[];
    durations.length = 0;
    for (let i = 0; i < 120; i++) d.renderer.render(null, 0);
    const sorted = [...durations].sort((a, b) => a - b);
    return { frames: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0, people: d.sim.livingPeople().length };
  });
  console.log(`12c night-layer workload: ${JSON.stringify({ ...performanceSample, visibleHearths: 1, viewport: '1280x800 CSS px' })}`);
  const activeLight = await page.evaluate(({ x, y }) => (window as any).__dynasty.sim.lightAt(x + 2.5, y),
    { x: fixture.x, y: fixture.y });
  expect(activeLight).toBeGreaterThan(0);

  await page.evaluate((id) => {
    const d = (window as any).__dynasty, hearth = d.sim.buildings.find((b: any) => b.id === id);
    hearth.complete = false;
    (window as any).__lightQueries = [];
  }, fixture.id);
  const extinguishedPixel = await sample();
  await page.screenshot({ path: `${shots}/02-brasero-apagado.png` });
  expect(extinguishedPixel[0]! + extinguishedPixel[1]! + extinguishedPixel[2]!)
    .toBeLessThan(activePixel[0]! + activePixel[1]! + activePixel[2]!);
  expect(await page.evaluate(({ x, y }) => (window as any).__lightQueries
    .some((point: any) => Math.hypot(point.x - x, point.y - y) < 0.1),
  { x: fixture.x, y: fixture.y })).toBe(false);

  await page.evaluate((id) => {
    const d = (window as any).__dynasty, hearth = d.sim.buildings.find((b: any) => b.id === id);
    hearth.complete = true; hearth.durability = 0;
  }, fixture.id);
  const ruinedPixel = await sample();
  await page.screenshot({ path: `${shots}/03-brasero-arruinado.png` });
  expect(ruinedPixel).toEqual(extinguishedPixel);

  await page.evaluate(({ id, x, y }) => {
    const d = (window as any).__dynasty, hearth = d.sim.buildings.find((b: any) => b.id === id), p = d.sim.player;
    hearth.complete = true; hearth.durability = 1;
    p.x = x + 28; p.y = y + 28;
    p.path = null; p.pathCount = p.pathAt = 0;
    d.renderer.fogEnabled = true;
    d.camera.snapTo(x, y);
    d.renderer.interpolator.clear();
    (window as any).__lightQueries = [];
  }, { id: fixture.id, x: fixture.x, y: fixture.y });
  const hiddenPixel = await sample();
  await page.screenshot({ path: `${shots}/04-brasero-fuera-de-vista.png` });
  expect(await page.evaluate(({ x, y }) => (window as any).__lightQueries
    .some((point: any) => Math.hypot(point.x - x, point.y - y) < 0.1),
  { x: fixture.x, y: fixture.y })).toBe(false);
  await page.evaluate((id) => {
    const d = (window as any).__dynasty;
    d.sim.buildings.find((b: any) => b.id === id).complete = false;
  }, fixture.id);
  const hiddenUnlitPixel = await sample();
  expect(hiddenPixel).toEqual(hiddenUnlitPixel);

  await page.evaluate(({ x, y }) => {
    const d = (window as any).__dynasty;
    d.camera.snapTo(x + 36, y + 36);
    d.renderer.interpolator.clear();
    (window as any).__lightQueries = [];
  }, { x: fixture.x, y: fixture.y });
  await sample();
  expect(await page.evaluate(({ x, y }) => (window as any).__lightQueries
    .some((point: any) => Math.hypot(point.x - x, point.y - y) < 0.1),
  { x: fixture.x, y: fixture.y })).toBe(false);
  expect(await page.evaluate(() => (window as any).__dynasty.sim.time.tick)).toBe(fixture.tick);
  expect(await page.evaluate(() => Object.values((window as any).__dynasty.sim)
    .filter((value: any) => typeof value?.getState === 'function').map((value: any) => value.getState())))
    .toEqual(fixture.rng);
  expect(errors).toEqual([]);
});
