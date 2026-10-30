/** M15 phase 17: real inscription reading drives a visible attention gesture. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a real read order animates four attention frames while reading a record', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-read-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, reader = sim.player;
    if (!reader) throw new Error('No reader fixture');
    reader.knownTech.add('firemaking');
    reader.knownTech.add('ochre');
    reader.knownTech.delete('cordage');
    reader.needs.hunger = reader.needs.thirst = reader.needs.fatigue = reader.needs.cold = 0;
    const x = Math.round(reader.x), y = Math.round(reader.y);
    if (!sim.world.isWalkable(x, y)) throw new Error('The reader tile cannot hold an inscription');
    reader.x = x; reader.y = y;
    reader.path = null; reader.pathCount = reader.pathAt = 0;
    const record = sim.placeInscription('ochre', x, y, reader);
    if (!record || !record.begin('cordage')) throw new Error('Could not create a useful real inscription');
    record.addWork(record.def.workTicks);
    if (!sim.order(reader, 'read', { inscriptionId: record.id })) throw new Error('Simulation refused the read order');
    for (let tick = 0; tick < 12 && reader.workedTicks <= 0; tick++) sim.step();
    if (reader.action !== 'read' || reader.workedTicks <= 0 || !reader.alive) {
      throw new Error('The real read order did not begin work');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { readingPose } = await import(modulePath);
    const pose = readingPose(reader, false, 0);
    (window as any).__readerId = reader.id;
    (window as any).__recordId = record.id;
    reader.targetX = reader.x; reader.targetY = reader.y;
    const track = d.renderer.walkPhase.get(reader.id);
    if (track) { track.x = reader.x; track.y = reader.y; track.movedAt = -Infinity; }
    const atlas = d.renderer.art, drawPerson = atlas.drawPerson.bind(atlas);
    const drawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    let drawingReader = false;
    atlas.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (drawingReader) (window as any).__readerAspect = aspect;
      return drawPerson(ctx, aspect, ...args);
    };
    d.renderer.drawArtPerson = (art: any, renderedPerson: any, ...args: any[]) => {
      if (renderedPerson.id !== reader.id) return drawArtPerson(art, renderedPerson, ...args);
      drawingReader = true;
      try { return drawArtPerson(art, renderedPerson, ...args); }
      finally { drawingReader = false; }
    };
    d.camera.zoom = 8; d.camera.snapTo(reader.x, reader.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: reader.action, workedTicks: reader.workedTicks, pose,
      readerId: reader.id, recordId: record.id, initialKnowledge: reader.knownTech.has('cordage'),
      drawnPose: (window as any).__readerAspect?.pose };
  });

  expect(state.action).toBe('read');
  expect(state.workedTicks).toBeGreaterThan(0);
  expect(state.initialKnowledge).toBe(false);
  expect(state.pose).toMatch(/^o[0-3]$/);
  expect(state.drawnPose).toMatch(/^o[0-3]$/);

  const frames = new Set<string>();
  const images = new Set<string>();
  const shots = 'artifacts/playwright/captures/read-animation/m15-reading-animation-2026-10-14';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const reader = d.sim.people.find((candidate: any) => candidate.id === (window as any).__readerId);
      const record = d.sim.inscriptionsById.get((window as any).__recordId);
      const before = { progress: record.progress, knowsCordage: reader.knownTech.has('cordage') };
      reader.workedTicks = 1 + phase * 2;
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      const aspect = (window as any).__readerAspect;
      return { action: reader.action, ticks: reader.workedTicks, pose: aspect.pose, before,
        after: { progress: record.progress, knowsCordage: reader.knownTech.has('cordage') },
        pixels: d.renderer.art.sprite(aspect).image.toDataURL() };
    }, phase);
    expect(rendered.action).toBe('read');
    expect(rendered.ticks).toBe(1 + phase * 2);
    expect(rendered.pose).toBe(`o${phase}`);
    expect(rendered.after).toEqual(rendered.before);
    frames.add(rendered.pose);
    images.add(rendered.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-reading-o${phase}.png` });
  }
  expect(frames.size).toBe(4);
  expect(images.size).toBe(4);
  expect(errors).toEqual([]);
});
