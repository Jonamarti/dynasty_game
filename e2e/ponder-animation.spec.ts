/** M15 phase 17: a real ponder order drives a generic, private-idea-safe pose. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a real ponder order animates generic thinking without disclosing its idea', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-ponder-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, thinker = sim.player;
    if (!thinker) throw new Error('No thinker fixture');
    thinker.needs.hunger = thinker.needs.thirst = thinker.needs.fatigue = thinker.needs.cold = 0;
    thinker.ideas.splice(0, thinker.ideas.length, {
      tech: 'firemaking', stage: 'researching', insight: 0, story: 'fixture idea',
      conceivedTick: sim.time.tick, effort: 0, discussedWith: [],
      trials: 0, proof: 0, failedTests: 0, tries: 0,
    });
    const beforeEffort = thinker.ideas[0].effort;
    if (!sim.order(thinker, 'ponder', { techId: 'firemaking' })) throw new Error(`Simulation refused ponder: ${sim.lastRefusal}`);
    for (let tick = 0; tick < 8 && thinker.workedTicks <= 0; tick++) sim.step();
    if (thinker.action !== 'ponder' || thinker.workedTicks <= 0 || thinker.ideas[0].effort <= beforeEffort) {
      throw new Error('The real ponder order did not add work to its idea');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { ponderingPose } = await import(modulePath);
    const pose = ponderingPose(thinker, false, 0);
    (window as any).__thinkerId = thinker.id;
    const track = d.renderer.walkPhase.get(thinker.id);
    if (track) { track.x = thinker.x; track.y = thinker.y; track.movedAt = -Infinity; }
    const atlas = d.renderer.art, drawPerson = atlas.drawPerson.bind(atlas);
    const drawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    let drawingThinker = false;
    atlas.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (drawingThinker) (window as any).__thinkerAspect = aspect;
      return drawPerson(ctx, aspect, ...args);
    };
    d.renderer.drawArtPerson = (art: any, renderedPerson: any, ...args: any[]) => {
      if (renderedPerson.id !== thinker.id) return drawArtPerson(art, renderedPerson, ...args);
      drawingThinker = true;
      try { return drawArtPerson(art, renderedPerson, ...args); }
      finally { drawingThinker = false; }
    };
    d.camera.zoom = 8; d.camera.snapTo(thinker.x, thinker.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: thinker.action, workedTicks: thinker.workedTicks, effort: thinker.ideas[0].effort,
      pose, drawnPose: (window as any).__thinkerAspect?.pose, held: (window as any).__thinkerAspect?.held,
      idea: thinker.ideas[0].tech, target: thinker.targetTech };
  });

  expect(state.action).toBe('ponder');
  expect(state.workedTicks).toBeGreaterThan(0);
  expect(state.effort).toBeGreaterThan(0);
  expect(state.pose).toMatch(/^o[0-3]$/);
  expect(state.drawnPose).toMatch(/^o[0-3]$/);
  expect(state.held).toBeNull();
  expect(state.idea).toBe('firemaking');
  expect(state.target).toBe('firemaking');

  const frames = new Set<string>();
  const images = new Set<string>();
  const shots = 'artifacts/screenshots/m15-ponder-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const thinker = d.sim.people.find((candidate: any) => candidate.id === (window as any).__thinkerId);
      const idea = thinker.ideas[0];
      const before = { effort: idea.effort, tech: idea.tech, target: thinker.targetTech };
      thinker.workedTicks = 1 + phase * 2;
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      const aspect = (window as any).__thinkerAspect;
      const sprite = d.renderer.art.sprite(aspect);
      return { action: thinker.action, ticks: thinker.workedTicks, pose: aspect.pose, held: aspect.held,
        before, after: { effort: idea.effort, tech: idea.tech, target: thinker.targetTech },
        pixels: sprite.image.toDataURL() };
    }, phase);
    expect(rendered.action).toBe('ponder');
    expect(rendered.ticks).toBe(1 + phase * 2);
    expect(rendered.pose).toBe(`o${phase}`);
    expect(rendered.held).toBeNull();
    expect(rendered.after).toEqual(rendered.before);
    frames.add(rendered.pose);
    images.add(rendered.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-thinking-o${phase}.png` });
  }
  expect(frames.size).toBe(4);
  expect(images.size).toBe(4);

  const inactive = await page.evaluate(async () => {
    const d = (window as any).__dynasty;
    const thinker = d.sim.people.find((candidate: any) => candidate.id === (window as any).__thinkerId);
    d.sim.order(thinker, 'idle');
    const modulePath = '/src/render/WorkAnimation.ts';
    const { ponderingPose } = await import(modulePath);
    return { action: thinker.action, pose: ponderingPose(thinker, false, 0) };
  });
  expect(inactive.action).not.toBe('ponder');
  expect(inactive.pose).toBeNull();
  expect(errors).toEqual([]);
});
