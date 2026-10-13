/** M15 phase 17: a real tame order drives a generic coaxing gesture. */
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version as string;

test('a real tame order cycles coaxing poses before the next tick feeds the animal', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-tame-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, tamer = sim.player;
    const animal = sim.animals.find((candidate: any) => candidate.species === 'deer');
    if (!tamer || !animal) throw new Error('No tamer or deer fixture');
    tamer.knownTech.add('taming'); tamer.techLevel.set('taming', 1);
    tamer.needs.hunger = tamer.needs.thirst = tamer.needs.fatigue = tamer.needs.cold = 0;
    for (const [item, count] of tamer.inventory.entries()) tamer.inventory.remove(item, count);
    tamer.inventory.add('berries', 4);
    for (const other of sim.animals) if (other !== animal) other.alive = false;
    animal.alive = true; animal.meals = 0; animal.temperament = 0;
    animal.tamedBy = null; animal.fedBy.clear(); animal.fedBy.add(tamer.id);

    let start: { x: number; y: number } | null = null;
    for (let y = 2; y < sim.world.height - 2 && !start; y++) for (let x = 2; x < sim.world.width - 6; x++) {
      if ([0, 1, 2, 3, 4].every(dx => sim.world.isWalkable(x + dx, y)) &&
          sim.world.sameRegion(x + 0.5, y + 0.5, x + 4.5, y + 0.5)) {
        start = { x, y }; break;
      }
    }
    if (!start) throw new Error('No clear tame approach fixture');
    tamer.x = start.x + 0.5; tamer.y = start.y + 0.5;
    animal.x = start.x + 4.5; animal.y = start.y + 0.5;
    tamer.path = null; tamer.pathCount = tamer.pathAt = 0;
    animal.path = null; animal.pathCount = animal.pathAt = 0;
    sim['rebuildHashes']();
    if (!sim.order(tamer, 'tame', { animalId: animal.id })) throw new Error(`Tame order refused: ${sim.lastRefusal}`);
    sim.step();
    if (tamer.action !== 'tame' || tamer.workedTicks <= 0 || tamer.actionTicks <= 0) {
      throw new Error('The real tame order did not enter its active approach');
    }

    // The order has performed a real approach tick. The selector receives
    // only the actor and cannot query this fixture or its animal.
    const modulePath = '/src/render/WorkAnimation.ts';
    const { tamingPose } = await import(modulePath);
    const pose = tamingPose(tamer, 0);
    (window as any).__tamerId = tamer.id;
    (window as any).__deerId = animal.id;
    const drawPerson = d.renderer.art.drawPerson.bind(d.renderer.art);
    const drawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    let drawingTamer = false;
    d.renderer.art.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (drawingTamer) (window as any).__tamerPose = aspect.pose;
      return drawPerson(ctx, aspect, ...args);
    };
    d.renderer.drawArtPerson = (art: any, rendered: any, ...args: any[]) => {
      if (rendered.id !== tamer.id) return drawArtPerson(art, rendered, ...args);
      drawingTamer = true;
      try { return drawArtPerson(art, rendered, ...args); }
      finally { drawingTamer = false; }
    };
    d.camera.zoom = 8; d.camera.snapTo(tamer.x, tamer.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: tamer.action, workedTicks: tamer.workedTicks, actionTicks: tamer.actionTicks,
      pose, drawnPose: (window as any).__tamerPose, meals: animal.meals };
  });

  expect(state.action).toBe('tame');
  expect(state.workedTicks).toBeGreaterThan(0);
  expect(state.actionTicks).toBeGreaterThan(0);
  expect(state.pose).toMatch(/^z[0-3]$/);
  expect(state.drawnPose).toMatch(/^z[0-3]$/);
  expect(state.meals).toBe(0);
  await expect(page.locator('.game-version')).toContainText(`v${VERSION}`);

  const frames = new Set<string>(), images = new Set<string>();
  const shots = 'artifacts/screenshots/m15-tame-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const tamer = d.sim.people.find((candidate: any) => candidate.id === (window as any).__tamerId);
      const animal = d.sim.animals.find((candidate: any) => candidate.id === (window as any).__deerId);
      const meals = animal.meals;
      tamer.actionTicks = 1 + phase * 2;
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      return { action: tamer.action, pose: (window as any).__tamerPose,
        mealsBefore: meals, mealsAfter: animal.meals,
        sprite: d.renderer.art.sprite({ age: 'adult', sex: 'm', dir: 'S', pose: `z${phase}`,
          skin: '#ffffff', hair: '#2b2018', band: '#ffffff', hairStyle: 'short', beard: false,
          expression: 'neutral', wear: {}, carryBaby: false, held: null, heldLeft: null }).image.toDataURL() };
    }, phase);
    expect(rendered.action).toBe('tame');
    expect(rendered.pose).toBe(`z${phase}`);
    expect(rendered.mealsAfter).toBe(rendered.mealsBefore);
    frames.add(rendered.pose); images.add(rendered.sprite);
    await page.screenshot({ path: `${shots}/0${phase + 1}-coaxing-z${phase}.png` });
  }
  expect(frames.size).toBe(4);
  expect(images.size).toBe(4);

  const fed = await page.evaluate(() => {
    const d = (window as any).__dynasty;
    const tamer = d.sim.people.find((candidate: any) => candidate.id === (window as any).__tamerId);
    const animal = d.sim.animals.find((candidate: any) => candidate.id === (window as any).__deerId);
    tamer.x = animal.x - 0.7; tamer.y = animal.y;
    tamer.path = null; tamer.pathCount = tamer.pathAt = 0;
    d.sim.step();
    return { action: tamer.action, meals: animal.meals, lastMealAt: animal.lastMealAt, tick: d.sim.time.tick };
  });
  expect(fed.action).toBe('idle');
  expect(fed.meals).toBe(1);
  expect(fed.lastMealAt).toBe(fed.tick);
  expect(errors).toEqual([]);
});
