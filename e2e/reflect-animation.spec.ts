/** M15 phase 17: a real open-ended reflection uses the generic thought gesture. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a real reflect order animates without inventing or revealing an idea', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-reflect-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No reflection fixture');
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    person.ideas.splice(0);
    if (!sim.order(person, 'reflect')) throw new Error(`Simulation refused reflection: ${sim.lastRefusal}`);
    for (let tick = 0; tick < 12 && person.workedTicks <= 0; tick++) sim.step();
    if (person.action !== 'reflect' || person.workedTicks <= 0 || person.ideas.length !== 0) {
      throw new Error('The real reflection order did not accrue target-free work');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { reflectingPose } = await import(modulePath);
    (window as any).__reflectorId = person.id;
    const atlas = d.renderer.art, drawPerson = atlas.drawPerson.bind(atlas);
    const drawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    let drawing = false;
    atlas.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (drawing) (window as any).__reflectorAspect = aspect;
      return drawPerson(ctx, aspect, ...args);
    };
    d.renderer.drawArtPerson = (art: any, renderedPerson: any, ...args: any[]) => {
      if (renderedPerson.id !== person.id) return drawArtPerson(art, renderedPerson, ...args);
      drawing = true;
      try { return drawArtPerson(art, renderedPerson, ...args); }
      finally { drawing = false; }
    };
    d.camera.zoom = 8; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: person.action, workedTicks: person.workedTicks,
      pose: reflectingPose(person, false, 0), drawnPose: (window as any).__reflectorAspect?.pose,
      ideas: person.ideas.length, target: person.targetTech };
  });

  expect(state.action).toBe('reflect');
  expect(state.workedTicks).toBeGreaterThan(0);
  expect(state.pose).toMatch(/^o[0-3]$/);
  expect(state.drawnPose).toMatch(/^o[0-3]$/);
  expect(state.ideas).toBe(0);
  expect(state.target).toBeNull();

  const frames = new Set<string>(), images = new Set<string>();
  const shots = 'artifacts/playwright/captures/reflect-animation/m15-reflection-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const person = d.sim.people.find((candidate: any) => candidate.id === (window as any).__reflectorId);
      person.workedTicks = 1 + phase * 2;
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      const aspect = (window as any).__reflectorAspect;
      return { pose: aspect.pose, action: person.action, ideas: person.ideas.length,
        pixels: d.renderer.art.sprite(aspect).image.toDataURL() };
    }, phase);
    expect(rendered.action).toBe('reflect');
    expect(rendered.ideas).toBe(0);
    expect(rendered.pose).toBe(`o${phase}`);
    frames.add(rendered.pose); images.add(rendered.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-reflection-o${phase}.png` });
  }
  expect(frames.size).toBe(4);
  expect(images.size).toBe(4);
  await page.evaluate(() => (window as any).__dynasty.sim.order((window as any).__dynasty.sim.player, 'idle'));
  expect(errors).toEqual([]);
});
