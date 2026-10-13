/** M15 phase 17: a real hunt order draws four generic, in-range hunter poses. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a real hunt order animates the hunter only on active in-range work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-hunt-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, hunter = sim.player;
    if (!hunter) throw new Error('No hunter fixture');
    const quarry = sim.animals.find((animal: any) => animal.alive && animal.species === 'deer');
    if (!quarry) throw new Error('No living deer fixture');
    hunter.needs.hunger = hunter.needs.thirst = hunter.needs.fatigue = hunter.needs.cold = 0;
    hunter.skills.hunt = 100;
    const x = Math.round(hunter.x), y = Math.round(hunter.y);
    if (!sim.world.isWalkable(x, y)) throw new Error('The hunter tile is not walkable');
    hunter.x = x + 0.5; hunter.y = y + 0.5;
    hunter.path = null; hunter.pathCount = hunter.pathAt = 0;
    quarry.x = hunter.x + 1; quarry.y = hunter.y;
    quarry.health = quarry.def.health + 10; quarry.sleeping = true; quarry.alarmedUntil = 0;
    if (!sim.order(hunter, 'hunt', { animalId: quarry.id })) throw new Error(`Simulation refused hunt: ${sim.lastRefusal}`);
    for (let tick = 0; tick < 12 && hunter.workedTicks <= 0; tick++) {
      sim.step();
      if (!quarry.alive) throw new Error('The real hunt removed its quarry before work could be captured');
      // Keep the still-living quarry at the already-reached mark while the
      // committed action completes setup and records its first work tick.
      quarry.x = hunter.x + 1; quarry.y = hunter.y; quarry.sleeping = true;
      hunter.path = null; hunter.pathCount = hunter.pathAt = 0;
      sim.rebuildHashes();
    }
    if (hunter.action !== 'hunt' || hunter.workedTicks <= 0 || !quarry.alive) {
      throw new Error('The real hunt order did not add active work at a living quarry');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { huntingPose } = await import(modulePath);
    const pose = huntingPose(hunter, sim, false, 0);
    (window as any).__hunterId = hunter.id; (window as any).__quarryId = quarry.id;
    const track = d.renderer.walkPhase.get(hunter.id);
    if (track) { track.x = hunter.x; track.y = hunter.y; track.movedAt = -Infinity; }
    const atlas = d.renderer.art, drawPerson = atlas.drawPerson.bind(atlas);
    const drawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    let drawingHunter = false;
    atlas.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (drawingHunter) (window as any).__hunterAspect = aspect;
      return drawPerson(ctx, aspect, ...args);
    };
    d.renderer.drawArtPerson = (art: any, renderedPerson: any, ...args: any[]) => {
      if (renderedPerson.id !== hunter.id) return drawArtPerson(art, renderedPerson, ...args);
      drawingHunter = true;
      try { return drawArtPerson(art, renderedPerson, ...args); }
      finally { drawingHunter = false; }
    };
    d.camera.zoom = 8; d.camera.snapTo(hunter.x, hunter.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: hunter.action, workedTicks: hunter.workedTicks, pose,
      drawnPose: (window as any).__hunterAspect?.pose, hunterId: hunter.id,
      quarryId: quarry.id, health: quarry.health };
  });

  expect(state.action).toBe('hunt');
  expect(state.workedTicks).toBeGreaterThan(0);
  expect(state.pose).toMatch(/^H[0-3]$/);
  expect(state.drawnPose).toMatch(/^H[0-3]$/);
  const frames = new Set<string>();
  const images = new Set<string>();
  const shots = 'artifacts/screenshots/m15-hunt-animation-2026-10-14';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const hunter = d.sim.people.find((candidate: any) => candidate.id === (window as any).__hunterId);
      const quarry = d.sim.animals.find((candidate: any) => candidate.id === (window as any).__quarryId);
      hunter.workedTicks = 1 + phase * 2;
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      const aspect = (window as any).__hunterAspect;
      return { pose: aspect.pose, action: hunter.action, workedTicks: hunter.workedTicks,
        health: quarry.health, alive: quarry.alive, pixels: d.renderer.art.sprite(aspect).image.toDataURL() };
    }, phase);
    expect(rendered.pose).toBe(`H${phase}`);
    expect(rendered.action).toBe('hunt');
    expect(rendered.workedTicks).toBe(1 + phase * 2);
    expect(rendered.alive).toBe(true);
    expect(rendered.health).toBe(state.health);
    frames.add(rendered.pose); images.add(rendered.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-aim-H${phase}.png` });
  }
  expect(frames.size).toBe(4);
  expect(images.size).toBe(4);
  expect(errors).toEqual([]);
});
