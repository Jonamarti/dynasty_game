import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m16-2026-10-20-2.3';

test('m16-fog-saved: the reveal grid survives save, reload, and a legacy save defaults inactive', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m16-fog-saved&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 20_000 });
  await page.screenshot({ path: `${SHOTS}/00-before-switch.png` });
  await page.locator('.hud-button', { hasText: /pause/i }).click();

  const before = await page.evaluate(async () => {
    const d = (window as any).__dynasty;
    const sim = d.sim;
    const old = sim.player;
    const next = sim.people.find((p: any) => p.alive && p.id !== old.id)!;
    d.renderer.fogEnabled = true;
    sim.possess(next);
    d.camera.following = false;
    d.camera.snapTo(next.x, next.y);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const first = { x: next.x, y: next.y };
    next.x = Math.max(2, Math.min(sim.world.width - 3, next.x + (next.x < sim.world.width / 2 ? 8 : -8)));
    d.camera.snapTo(next.x, next.y);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const reveal = d.renderer.fogReveal;
    return { id: next.id, tick: sim.time.tick, first, second: { x: next.x, y: next.y }, active: reveal.active,
      firstShown: reveal.shows(first.x, first.y), secondShown: reveal.shows(next.x, next.y) };
  });
  expect(before.active).toBe(true);
  expect(before.firstShown).toBe(true);
  expect(before.secondShown).toBe(true);
  await page.screenshot({ path: `${SHOTS}/01-after-switch-and-exploring.png` });

  await page.keyboard.press('Escape');
  await expect(page.locator('.pausemenu')).toBeVisible();
  await page.locator('[data-act="save"]').click();
  await expect(page.locator('.pausemenu-note')).toContainText('Saved:');

  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('dynasty', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const text = await new Promise<string>((resolve, reject) => {
      const request = db.transaction('texts').objectStore('texts').get('manual');
      request.onsuccess = () => resolve(request.result as string);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return JSON.parse(text);
  });
  expect(saved.version).toBe(2);
  expect(saved.fogReveal).toMatchObject({ active: true, observerId: before.id });
  expect(saved.fogReveal.cells.some((cell: number) => cell === 1)).toBe(true);
  await page.locator('[data-act="load"]').click();
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => String((window as any).__dynasty?.sim?.player?.id))).toBe(String(before.id));
  const after = await page.evaluate(({ first, second }: { first: { x: number; y: number }; second: { x: number; y: number } }) => {
    const d = (window as any).__dynasty, reveal = d.renderer.fogReveal;
    return { active: reveal.active, observerId: reveal.observerId, firstShown: reveal.shows(first.x, first.y),
      secondShown: reveal.shows(second.x, second.y),
      cells: reveal.snapshot?.().cells };
  }, before);
  expect(after.active).toBe(true);
  expect(after.observerId).toBe(before.id);
  expect(after.firstShown).toBe(true);
  expect(after.secondShown).toBe(true);
  expect(after.cells?.some((cell: number) => cell === 1)).toBe(true);
  expect(after.cells).toEqual(saved.fogReveal.cells);
  await page.screenshot({ path: `${SHOTS}/02-after-reload.png` });

  // Version 1 saves have no presentation state. They keep today's inactive
  // behavior when opened by the migrated format.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('dynasty', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('texts', 'readwrite');
    const store = tx.objectStore('texts');
    const text = await new Promise<string>((resolve, reject) => {
      const request = store.get('manual');
      request.onsuccess = () => resolve(request.result as string);
      request.onerror = () => reject(request.error);
    });
    const envelope = JSON.parse(text);
    envelope.version = 1;
    delete envelope.fogReveal;
    store.put(JSON.stringify(envelope), 'manual');
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  });
  const legacyUrl = new URL(page.url());
  legacyUrl.searchParams.set('load', 'manual');
  await page.goto(legacyUrl.toString());
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as any).__dynasty.renderer.fogReveal.active)).toBe(false);
});

test('m16-fog-dimmed: a remembered place outside sight stays dim rather than black', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?seed=m16-fog-dimmed&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 20_000 });
  await page.locator('.hud-button', { hasText: /pause/i }).click();
  const pixels = await page.evaluate(async () => {
    const d = (window as any).__dynasty;
    const sim = d.sim;
    const old = sim.player;
    const player = sim.people.find((p: any) => p.alive && p.id !== old.id)!;
    sim.possess(player);
    const farX = player.x < sim.world.width / 2 ? player.x + 18 : player.x - 18;
    player.placeMemory.observe(farX, player.y, 2, sim.time.day);
    d.camera.following = false;
    d.camera.snapTo(farX, player.y);
    d.renderer.fogEnabled = false;
    d.renderer.render(null, 0);
    const canvas = d.renderer.canvas as HTMLCanvasElement;
    const ratioX = canvas.width / d.camera.viewWidth, ratioY = canvas.height / d.camera.viewHeight;
    const sx = Math.floor(d.camera.worldToScreenX(farX) * ratioX);
    const sy = Math.floor(d.camera.worldToScreenY(player.y) * ratioY);
    const base = Array.from(canvas.getContext('2d')!.getImageData(sx, sy, 1, 1).data);
    d.renderer.fogEnabled = true;
    d.renderer.render(null, 0);
    const fogged = Array.from(canvas.getContext('2d')!.getImageData(sx, sy, 1, 1).data);
    return { base, fogged, outsideSight: Math.hypot(farX - player.x, player.y - player.y) > sim.sightOf(player) };
  });
  expect(pixels.outsideSight).toBe(true);
  expect(Math.max(...pixels.fogged.slice(0, 3))).toBeGreaterThan(0);
  expect(Math.max(...pixels.fogged.slice(0, 3))).toBeLessThan(Math.max(...pixels.base.slice(0, 3)));
  await page.screenshot({ path: `${SHOTS}/03-dimmed-memory.png` });
});
