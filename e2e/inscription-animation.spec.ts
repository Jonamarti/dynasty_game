/** M15 phase 17: real carving work drives a visible chisel stroke. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a real inscription order animates four chisel strokes on its unfinished record', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-inscription-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No carver fixture');
    person.knownTech.add('firemaking');
    person.knownTech.add('ochre');
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    const x = Math.round(person.x), y = Math.round(person.y);
    if (!sim.world.isWalkable(x, y)) throw new Error('The player tile cannot hold a record');
    person.x = x; person.y = y;
    person.path = null; person.pathCount = person.pathAt = 0;
    const record = sim.placeInscription('ochre', x, y, person);
    if (!record || !record.begin('firemaking')) throw new Error('Could not create the real unfinished inscription');
    record.progress = 12;
    if (!sim.order(person, 'inscribe', { inscriptionId: record.id })) throw new Error('Simulation refused the inscription order');
    for (let tick = 0; tick < 12 && person.workedTicks <= 0; tick++) sim.step();
    if (person.action !== 'inscribe' || person.workedTicks <= 0 || record.progress <= 12 || !record.unfinished) {
      throw new Error('The inscription order did not add real work to its record');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { inscribingPose } = await import(modulePath);
    const pose = inscribingPose(person, sim, false, 0);
    (window as any).__carverId = person.id;
    (window as any).__recordId = record.id;
    person.targetX = person.x; person.targetY = person.y;
    const track = d.renderer.walkPhase.get(person.id);
    if (track) { track.x = person.x; track.y = person.y; track.movedAt = -Infinity; }
    const atlas = d.renderer.art, drawPerson = atlas.drawPerson.bind(atlas);
    const drawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    let drawingCarver = false;
    atlas.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (drawingCarver) (window as any).__carverAspect = aspect;
      return drawPerson(ctx, aspect, ...args);
    };
    d.renderer.drawArtPerson = (art: any, renderedPerson: any, ...args: any[]) => {
      if (renderedPerson.id !== person.id) return drawArtPerson(art, renderedPerson, ...args);
      drawingCarver = true;
      try { return drawArtPerson(art, renderedPerson, ...args); }
      finally { drawingCarver = false; }
    };
    d.camera.zoom = 8; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { id: record.id, action: person.action, workedTicks: person.workedTicks,
      progress: record.progress, pose, personId: person.id, held: (window as any).__carverAspect?.held };
  });

  expect(state.action).toBe('inscribe');
  expect(state.workedTicks).toBeGreaterThan(0);
  expect(state.progress).toBeGreaterThan(12);
  expect(state.pose).toMatch(/^i[0-3]$/);
  expect(state.held).toBe('chisel');

  await page.waitForTimeout(180);
  await page.evaluate(() => {
    const d = (window as any).__dynasty;
    d.renderer.interpolator.clear();
    d.renderer.render(null, 0);
  });
  const frames = new Set<string>();
  const images = new Set<string>();
  const shots = 'artifacts/playwright/captures/inscription-animation/m15-inscription-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const person = d.sim.people.find((candidate: any) => candidate.id === (window as any).__carverId);
      person.workedTicks = 1 + phase * 2;
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      const aspect = (window as any).__carverAspect;
      const sprite = d.renderer.art.sprite(aspect);
      return { action: person.action, ticks: person.workedTicks, pose: aspect.pose,
        held: aspect.held, pixels: sprite.image.toDataURL() };
    }, phase);
    expect(rendered.action).toBe('inscribe');
    expect(rendered.ticks).toBe(1 + phase * 2);
    expect(rendered.pose).toBe(`i${phase}`);
    expect(rendered.held).toBe('chisel');
    frames.add(rendered.pose);
    images.add(rendered.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-chisel-i${phase}.png` });
  }
  expect(frames.size).toBe(4);
  expect(images.size).toBe(4);

  const inactive = await page.evaluate(async () => {
    const d = (window as any).__dynasty, person = d.sim.people.find((candidate: any) => candidate.id === (window as any).__carverId);
    const record = d.sim.inscriptionsById.get((window as any).__recordId);
    d.sim.order(person, 'idle');
    const modulePath = '/src/render/WorkAnimation.ts';
    const { inscribingPose } = await import(modulePath);
    return { action: person.action, progress: record.progress, pose: inscribingPose(person, d.sim, false, 0) };
  });
  expect(inactive.action).not.toBe('inscribe');
  expect(inactive.progress).toBeGreaterThan(12);
  expect(inactive.pose).toBeNull();
  expect(errors).toEqual([]);
});
