/** M15 phase 17: a real greeting drives the speaker's four gestures. */
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version as string;

test('a real greeting order animates its speaker without resolving the conversation while drawing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-talk-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, speaker = sim.player;
    const listener = sim.livingPeople().find((person: any) => person.id !== speaker?.id);
    if (!speaker || !listener) throw new Error('No conversation fixture');
    for (const person of [speaker, listener]) {
      person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
      person.path = null; person.pathCount = person.pathAt = 0;
    }
    const x = Math.round(speaker.x), y = Math.round(speaker.y);
    if (!sim.world.isWalkable(x, y) || !sim.world.isWalkable(x + 1, y)) throw new Error('No adjacent conversation floor');
    speaker.x = x + 0.5; speaker.y = y + 0.5;
    listener.x = x + 1.3; listener.y = y + 0.5;
    speaker.talkMode = 'greet';
    if (!sim.order(speaker, 'talk', { personId: listener.id })) throw new Error(`Simulation refused greeting: ${sim.lastRefusal}`);
    sim.step();
    if (speaker.action !== 'talk' || speaker.actionTimer <= 0 || speaker.actionTicks <= 0) {
      throw new Error('The real greeting order did not enter its conversation clock');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { talkingPose } = await import(modulePath);
    const pose = talkingPose(speaker, false, 0);
    (window as any).__speakerId = speaker.id;
    (window as any).__listenerId = listener.id;
    const track = d.renderer.walkPhase.get(speaker.id);
    if (track) { track.x = speaker.x; track.y = speaker.y; track.movedAt = -Infinity; }
    const atlas = d.renderer.art, drawPerson = atlas.drawPerson.bind(atlas);
    const drawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    let drawingSpeaker = false;
    atlas.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (drawingSpeaker) (window as any).__speakerDrawnPose = aspect.pose;
      return drawPerson(ctx, aspect, ...args);
    };
    d.renderer.drawArtPerson = (art: any, rendered: any, ...args: any[]) => {
      if (rendered.id !== speaker.id) return drawArtPerson(art, rendered, ...args);
      drawingSpeaker = true;
      try { return drawArtPerson(art, rendered, ...args); }
      finally { drawingSpeaker = false; }
    };
    d.camera.zoom = 8; d.camera.snapTo(speaker.x, speaker.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: speaker.action, timer: speaker.actionTimer, pose,
      drawnPose: (window as any).__speakerDrawnPose };
  });

  expect(state.action).toBe('talk');
  expect(state.timer).toBeGreaterThan(0);
  expect(state.pose).toMatch(/^l[0-3]$/);
  expect(state.drawnPose).toMatch(/^l[0-3]$/);
  await expect(page.locator('.game-version')).toContainText(`v${VERSION}`);
  const poses = new Set<string>(), images = new Set<string>();
  const shots = 'artifacts/screenshots/m15-conversation-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const speaker = d.sim.people.find((person: any) => person.id === (window as any).__speakerId);
      const listener = d.sim.people.find((person: any) => person.id === (window as any).__listenerId);
      speaker.actionTicks = 1 + phase * 2;
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      const aspect = d.renderer.art.sprite({ age: 'adult', sex: 'm', dir: 'S', pose: `l${phase}`,
        skin: '#ffffff', hair: '#2b2018', band: '#ffffff', hairStyle: 'short', beard: false,
        expression: 'neutral', wear: {}, carryBaby: false, held: null, heldLeft: null }).image;
      return { action: speaker.action, timer: speaker.actionTimer, pose: `l${phase}`,
        health: listener.health, image: aspect.toDataURL() };
    }, phase);
    expect(rendered.action).toBe('talk');
    expect(rendered.timer).toBeGreaterThan(0);
    poses.add(rendered.pose); images.add(rendered.image);
    await page.screenshot({ path: `${shots}/0${phase + 1}-conversation-l${phase}.png` });
  }
  expect(poses.size).toBe(4);
  expect(images.size).toBe(4);
  expect(errors).toEqual([]);
});
