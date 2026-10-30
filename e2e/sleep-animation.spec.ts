/** M15 phase 17: a real sleep order drives the lying human pose. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a real sleep order shows four lying poses only after arrival', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-sleep-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, sleeper = sim.player;
    if (!sleeper) throw new Error('No sleeper fixture');
    sleeper.needs.hunger = sleeper.needs.thirst = sleeper.needs.cold = 0;
    sleeper.needs.fatigue = 24;
    sleeper.targetBuildingId = null;
    sleeper.path = null; sleeper.pathCount = sleeper.pathAt = 0;
    const beforeFatigue = sleeper.needs.fatigue;
    if (!sim.order(sleeper, 'sleep')) throw new Error(`Simulation refused sleep order: ${sim.lastRefusal}`);
    sim.step();
    if (sleeper.action !== 'sleep' || sleeper.actionTicks <= 0 || sleeper.needs.fatigue >= beforeFatigue) {
      throw new Error('The real sleep order did not reach its active recovery phase');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { sleepingPose } = await import(modulePath);
    const pose = sleepingPose(sleeper, false, 0);
    (window as any).__sleeperId = sleeper.id;
    const track = d.renderer.walkPhase.get(sleeper.id);
    if (track) { track.x = sleeper.x; track.y = sleeper.y; track.movedAt = -Infinity; }
    const drawPerson = d.renderer.art.drawPerson.bind(d.renderer.art);
    const drawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    let drawingSleeper = false;
    d.renderer.art.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (drawingSleeper) (window as any).__sleeperAspect = aspect;
      return drawPerson(ctx, aspect, ...args);
    };
    d.renderer.drawArtPerson = (art: any, renderedPerson: any, ...args: any[]) => {
      if (renderedPerson.id !== sleeper.id) return drawArtPerson(art, renderedPerson, ...args);
      drawingSleeper = true;
      try { return drawArtPerson(art, renderedPerson, ...args); }
      finally { drawingSleeper = false; }
    };
    d.camera.zoom = 8; d.camera.snapTo(sleeper.x, sleeper.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: sleeper.action, actionTicks: sleeper.actionTicks, pose,
      fatigue: sleeper.needs.fatigue, drawnPose: (window as any).__sleeperAspect?.pose,
      sleeperId: sleeper.id };
  });

  expect(state.action).toBe('sleep');
  expect(state.actionTicks).toBeGreaterThan(0);
  expect(state.fatigue).toBeLessThan(24);
  expect(state.pose).toMatch(/^e[0-3]$/);
  expect(state.drawnPose).toMatch(/^e[0-3]$/);

  const frames = new Set<string>();
  const images = new Set<string>();
  const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/playwright/captures/sleep-animation/m15-sleep-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const sleeper = d.sim.people.find((candidate: any) => candidate.id === (window as any).__sleeperId);
      const before = { action: sleeper.action, fatigue: sleeper.needs.fatigue };
      sleeper.actionTicks = 1 + phase * 2;
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      const aspect = (window as any).__sleeperAspect;
      return { pose: aspect.pose, after: { action: sleeper.action, fatigue: sleeper.needs.fatigue },
        pixels: d.renderer.art.sprite(aspect).image.toDataURL(), before };
    }, phase);
    expect(rendered.pose).toBe(`e${phase}`);
    expect(rendered.after).toEqual(rendered.before);
    frames.add(rendered.pose); images.add(rendered.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-sleep-e${phase}.png` });
  }
  expect(frames.size).toBe(4);
  expect(images.size).toBe(4);
  expect(errors).toEqual([]);
});
