/** M15 phase 17: a real prototype order drives a design-neutral assembly pose. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a real prototype order animates generic assembly and preserves banked work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-prototype-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, person = sim.player;
    if (!person) throw new Error('No prototyper fixture');
    person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
    person.ideas.splice(0, person.ideas.length, {
      tech: 'firemaking', stage: 'researching', insight: 1, story: 'fixture prototype',
      conceivedTick: sim.time.tick, effort: 0, discussedWith: [],
      trials: 0, proof: 0, failedTests: 0, tries: 0,
    });
    person.inventory.add('sticks', 2);
    person.inventory.add('flint', 1);
    const beforeItems = { sticks: person.inventory.count('sticks'), flint: person.inventory.count('flint') };
    if (!sim.order(person, 'prototype')) throw new Error(`Simulation refused prototype: ${sim.lastRefusal}`);
    for (let tick = 0; tick < 8 && person.workedTicks <= 0; tick++) sim.step();
    const bank = person.bankedFor('prototype:firemaking');
    if (person.action !== 'prototype' || person.workedTicks <= 0 || bank <= 0 ||
        person.ideas[0].stage !== 'researching' || person.ideas[0].tech !== 'firemaking') {
      throw new Error('The real prototype order did not add banked work to its fixture idea');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { prototypingPose } = await import(modulePath);
    const pose = prototypingPose(person, false, 0);
    (window as any).__prototyperId = person.id;
    const track = d.renderer.walkPhase.get(person.id);
    if (track) { track.x = person.x; track.y = person.y; track.movedAt = -Infinity; }
    const atlas = d.renderer.art, drawPerson = atlas.drawPerson.bind(atlas);
    const drawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    let drawingPrototyper = false;
    atlas.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (drawingPrototyper) (window as any).__prototyperAspect = aspect;
      return drawPerson(ctx, aspect, ...args);
    };
    d.renderer.drawArtPerson = (art: any, renderedPerson: any, ...args: any[]) => {
      if (renderedPerson.id !== person.id) return drawArtPerson(art, renderedPerson, ...args);
      drawingPrototyper = true;
      try { return drawArtPerson(art, renderedPerson, ...args); }
      finally { drawingPrototyper = false; }
    };
    d.camera.zoom = 8; d.camera.snapTo(person.x, person.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: person.action, workedTicks: person.workedTicks, bank,
      pose, drawnPose: (window as any).__prototyperAspect?.pose,
      held: (window as any).__prototyperAspect?.held, items: beforeItems,
      tech: person.ideas[0].tech, stage: person.ideas[0].stage };
  });

  expect(state.action).toBe('prototype');
  expect(state.workedTicks).toBeGreaterThan(0);
  expect(state.bank).toBeGreaterThan(0);
  expect(state.pose).toMatch(/^u[0-3]$/);
  expect(state.drawnPose).toMatch(/^u[0-3]$/);
  expect(state.held).toBeNull();

  const frames = new Set<string>();
  const images = new Set<string>();
  const shots = 'artifacts/screenshots/m15-prototype-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const person = d.sim.people.find((candidate: any) => candidate.id === (window as any).__prototyperId);
      const idea = person.ideas[0];
      const before = { bank: person.bankedFor('prototype:firemaking'),
        sticks: person.inventory.count('sticks'), flint: person.inventory.count('flint'),
        tech: idea.tech, stage: idea.stage, insight: idea.insight };
      person.workedTicks = 1 + phase * 2;
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      const aspect = (window as any).__prototyperAspect;
      const sprite = d.renderer.art.sprite(aspect);
      return { action: person.action, ticks: person.workedTicks, pose: aspect.pose, held: aspect.held,
        before, after: { bank: person.bankedFor('prototype:firemaking'),
          sticks: person.inventory.count('sticks'), flint: person.inventory.count('flint'),
          tech: idea.tech, stage: idea.stage, insight: idea.insight },
        pixels: sprite.image.toDataURL() };
    }, phase);
    expect(rendered.action).toBe('prototype');
    expect(rendered.ticks).toBe(1 + phase * 2);
    expect(rendered.pose).toBe(`u${phase}`);
    expect(rendered.held).toBeNull();
    expect(rendered.after).toEqual(rendered.before);
    frames.add(rendered.pose);
    images.add(rendered.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-assembly-u${phase}.png` });
  }
  expect(frames.size).toBe(4);
  expect(images.size).toBe(4);

  const inactive = await page.evaluate(async () => {
    const d = (window as any).__dynasty;
    const person = d.sim.people.find((candidate: any) => candidate.id === (window as any).__prototyperId);
    d.sim.order(person, 'idle');
    const modulePath = '/src/render/WorkAnimation.ts';
    const { prototypingPose } = await import(modulePath);
    return { action: person.action, pose: prototypingPose(person, false, 0) };
  });
  expect(inactive.action).not.toBe('prototype');
  expect(inactive.pose).toBeNull();
  expect(errors).toEqual([]);
});
