/** M15 phase 17: the real swim action gets a clocked crawl stroke. */
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version as string;

test('a real swim order cycles generated strokes only while crossing swim water', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-swim-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const setup = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, p = sim.player, w = sim.world;
    let strip: { x: number; y: number } | null = null;
    for (let y = 8; y < w.height - 8 && !strip; y++) for (let x = 9; x < w.width - 8; x++) {
      const shoreX = x - 1, shoreY = y;
      if (!w.isWalkable(shoreX, shoreY)) continue;
      const tiles = Array.from({ length: 5 }, (_, dx) => w.index(x + dx, y));
      if (tiles.some((i: number) => w.biome[i] !== 0 || w.walkable[i] !== 0)) continue;
      for (let dx = 0; dx < 5; dx++) {
        const wx = x + dx, wi = w.index(wx, y);
        w.elevation[wi] = w.waterLevel - (w.wadeDepth + w.swimDepth) / 2;
        w.setWalkable(wx, y, true); w.setWalkable(wx, y, false); w.updateShore(wx, y);
      }
      strip = { x, y }; break;
    }
    if (!strip) throw new Error('No five-tile swim strip beside shore');
    sim.shoreHash.rebuild(w.shoreTiles);
    p.action = 'idle'; p.order = null; p.clearTarget();
    p.needs.hunger = p.needs.thirst = p.needs.fatigue = p.needs.cold = 0;
    for (const [item, count] of p.inventory.entries()) p.inventory.remove(item, count);
    p.x = strip.x - 0.05; p.y = strip.y + 0.5;
    p.path = null; p.pathCount = p.pathAt = 0;
    if (!sim.order(p, 'swim', { x: strip.x + 4.5, y: strip.y + 0.5 })) {
      throw new Error(`Swim order refused: ${sim.lastRefusal}`);
    }
    let entered = false;
    for (let i = 0; i < 200; i++) {
      sim.step();
      if (p.action === 'swim' && w.isSwimTile(p.x, p.y) && p.actionTicks > 0) { entered = true; break; }
    }
    if (!entered) throw new Error(`Swimmer did not reach swim water: ${p.action} ${p.x},${p.y}`);
    const swimTile = w.isSwimTile(p.x, p.y);
    const realAction = p.action;
    const drawPerson = d.renderer.art.drawPerson.bind(d.renderer.art);
    const drawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    let drawingSwimmer = false;
    d.renderer.art.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (drawingSwimmer) (window as any).__swimmerPose = aspect.pose;
      return drawPerson(ctx, aspect, ...args);
    };
    d.renderer.drawArtPerson = (art: any, rendered: any, ...args: any[]) => {
      if (rendered.id !== p.id) return drawArtPerson(art, rendered, ...args);
      drawingSwimmer = true;
      try { return drawArtPerson(art, rendered, ...args); }
      finally { drawingSwimmer = false; }
    };
    (window as any).__swimmerId = p.id;
    d.camera.zoom = 8; d.camera.snapTo(p.x, p.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    const initialTrack = d.renderer.walkPhase.get(p.id);
    if (initialTrack) initialTrack.movedAt = performance.now();
    d.renderer.render(null, 0);
    const drawnPose = (window as any).__swimmerPose;
    return { action: realAction, swimTile, actionTicks: p.actionTicks, pose: drawnPose,
      drawnPose, tick: sim.time.tick };
  });

  expect(setup.action).toBe('swim');
  expect(setup.swimTile).toBe(true);
  expect(setup.actionTicks).toBeGreaterThan(0);
  expect(setup.pose).toMatch(/^n[0-3]$/);
  await expect(page.locator('.game-version')).toContainText(`v${VERSION}`);

  const frames = new Set<string>(), images = new Set<string>();
  const shots = 'artifacts/screenshots/m15-swim-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const swimmer = d.sim.people.find((candidate: any) => candidate.id === (window as any).__swimmerId);
      if (swimmer.action !== 'swim' || !d.sim.world.isSwimTile(swimmer.x, swimmer.y)) throw new Error('Swimmer left active swim water');
      swimmer.actionTicks = 1 + phase * 2;
      // The E2E has proven real movement and a real water crossing above. Keep
      // the renderer's short movement observation live for this frozen-clock capture.
      const track = d.renderer.walkPhase.get(swimmer.id);
      if (track) track.movedAt = performance.now();
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      const pose = (window as any).__swimmerPose;
      const sprite = d.renderer.art.sprite({ age: 'adult', sex: 'm', dir: 'S', pose: `n${phase}`,
        skin: '#ffffff', hair: '#2b2018', band: '#ffffff', hairStyle: 'short', beard: false,
        expression: 'neutral', wear: {}, carryBaby: false, held: null, heldLeft: null }).image.toDataURL();
      return { action: swimmer.action, pose, tick: d.sim.time.tick, tile: d.sim.world.isSwimTile(swimmer.x, swimmer.y), sprite };
    }, phase);
    expect(rendered.action).toBe('swim');
    expect(rendered.tile).toBe(true);
    expect(rendered.pose).toBe(`n${phase}`);
    expect(rendered.tick).toBe(setup.tick);
    frames.add(rendered.pose); images.add(rendered.sprite);
    await page.screenshot({ path: `${shots}/0${phase + 1}-swimming-n${phase}.png` });
  }
  expect(frames.size).toBe(4);
  expect(images.size).toBe(4);
  expect(errors).toEqual([]);
});
