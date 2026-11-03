/** M15 phase 17: a real human assault order drives four combat poses. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a real attack order shows four guarded strike poses without changing combat state while drawing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-fight-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, fighter = sim.player;
    if (!fighter) throw new Error('No fighter fixture');
    const target = sim.livingPeople().find((person: any) => person.id !== fighter.id);
    if (!target) throw new Error('No quarry fixture');
    for (const person of [fighter, target]) {
      person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
      person.path = null; person.pathCount = person.pathAt = 0;
    }
    const x = Math.round(fighter.x), y = Math.round(fighter.y);
    if (!sim.world.isWalkable(x, y) || !sim.world.isWalkable(x + 1, y)) throw new Error('No adjacent combat floor');
    fighter.x = x + 0.5; fighter.y = y + 0.5;
    target.x = x + 1.35; target.y = y + 0.5;
    target.health = 100; target.order = null; target.action = 'idle';
    fighter.path = null; target.path = null;
    if (!sim.order(fighter, 'attack', { personId: target.id })) throw new Error(`Simulation refused attack: ${sim.lastRefusal}`);
    sim.step();
    if (fighter.action !== 'attack' || fighter.actionTimer <= 0 || fighter.actionTicks <= 0) {
      throw new Error('The real attack order did not enter its stationary wind-up');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { fightingPose } = await import(modulePath);
    const pose = fightingPose(fighter, false, 0);
    (window as any).__fighterId = fighter.id;
    (window as any).__targetId = target.id;
    const track = d.renderer.walkPhase.get(fighter.id);
    if (track) { track.x = fighter.x; track.y = fighter.y; track.movedAt = -Infinity; }
    const atlas = d.renderer.art, drawPerson = atlas.drawPerson.bind(atlas);
    const drawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    let drawingFighter = false;
    atlas.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (drawingFighter) (window as any).__fighterAspect = aspect;
      return drawPerson(ctx, aspect, ...args);
    };
    d.renderer.drawArtPerson = (art: any, renderedPerson: any, ...args: any[]) => {
      if (renderedPerson.id !== fighter.id) return drawArtPerson(art, renderedPerson, ...args);
      drawingFighter = true;
      try { return drawArtPerson(art, renderedPerson, ...args); }
      finally { drawingFighter = false; }
    };
    d.camera.zoom = 8; d.camera.snapTo(fighter.x, fighter.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: fighter.action, timer: fighter.actionTimer, pose, drawnPose: (window as any).__fighterAspect?.pose,
      fighterId: fighter.id, targetId: target.id, health: target.health };
  });

  expect(state.action).toBe('attack');
  expect(state.timer).toBeGreaterThan(0);
  expect(state.pose).toMatch(/^k[0-3]$/);
  expect(state.drawnPose).toMatch(/^k[0-3]$/);
  const frames = new Set<string>();
  const images = new Set<string>();
  const shots = 'artifacts/playwright/captures/fight-animation/m15-fight-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const fighter = d.sim.people.find((candidate: any) => candidate.id === (window as any).__fighterId);
      const target = d.sim.people.find((candidate: any) => candidate.id === (window as any).__targetId);
      fighter.actionTicks = 1 + phase * 2;
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      const aspect = (window as any).__fighterAspect;
      return { pose: aspect.pose, after: { health: target.health, wound: target.body.head.damage,
        action: fighter.action, timer: fighter.actionTimer }, pixels: d.renderer.art.sprite(aspect).image.toDataURL() };
    }, phase);
    expect(rendered.pose).toBe(`k${phase}`);
    expect(rendered.after).toEqual({ health: state.health, wound: 0, action: 'attack', timer: state.timer });
    frames.add(rendered.pose); images.add(rendered.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-combat-k${phase}.png` });
  }
  expect(frames.size).toBe(4);
  expect(images.size).toBe(4);
  expect(errors).toEqual([]);
});
