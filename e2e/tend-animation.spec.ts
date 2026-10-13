/** M15 phase 17: a real healer order drives the public dressing pose. */
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a real tend order animates four dressing poses without changing the patient while drawing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=m15-tend-animation&skipIntro=1&defaults=1&lang=en');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);

  const state = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, healer = sim.player;
    if (!healer) throw new Error('No healer fixture');
    const patient = sim.livingPeople().find((candidate: any) => candidate.id !== healer.id);
    if (!patient) throw new Error('No patient fixture');
    healer.knownTech.add('herbalism');
    healer.techLevel.set('herbalism', 0);
    healer.needs.hunger = healer.needs.thirst = healer.needs.fatigue = healer.needs.cold = 0;
    patient.needs.hunger = patient.needs.thirst = patient.needs.fatigue = patient.needs.cold = 0;
    const x = Math.round(healer.x), y = Math.round(healer.y);
    if (!sim.world.isWalkable(x, y) || !sim.world.isWalkable(x + 1, y)) throw new Error('The healer fixture has no nearby floor');
    healer.x = x; healer.y = y; patient.x = x + 1.2; patient.y = y;
    healer.path = null; healer.pathCount = healer.pathAt = 0;
    patient.path = null; patient.pathCount = patient.pathAt = 0;
    patient.health = 72;
    patient.body.left_arm.damage = 0.3;
    patient.body.left_arm.wound = 'fresh';
    patient.body.left_arm.peak = 0.3;
    sim.order(patient, 'idle');
    if (!sim.order(healer, 'tend', { personId: patient.id })) throw new Error('Simulation refused the tend order');
    for (let tick = 0; tick < 8 && healer.workedTicks <= 0; tick++) sim.step();
    if (healer.action !== 'tend' || healer.workedTicks <= 0 || patient.health <= 72 || patient.body.left_arm.wound === 'fresh') {
      throw new Error('The real tend order did not treat the patient');
    }
    const modulePath = '/src/render/WorkAnimation.ts';
    const { tendingPose } = await import(modulePath);
    const pose = tendingPose(healer, false, 0);
    (window as any).__healerId = healer.id;
    (window as any).__patientId = patient.id;
    const track = d.renderer.walkPhase.get(healer.id);
    if (track) { track.x = healer.x; track.y = healer.y; track.movedAt = -Infinity; }
    const drawPerson = d.renderer.art.drawPerson.bind(d.renderer.art);
    const drawArtPerson = d.renderer.drawArtPerson.bind(d.renderer);
    let drawingHealer = false;
    d.renderer.art.drawPerson = (ctx: any, aspect: any, ...args: any[]) => {
      if (drawingHealer) (window as any).__healerAspect = aspect;
      return drawPerson(ctx, aspect, ...args);
    };
    d.renderer.drawArtPerson = (art: any, renderedPerson: any, ...args: any[]) => {
      if (renderedPerson.id !== healer.id) return drawArtPerson(art, renderedPerson, ...args);
      drawingHealer = true;
      try { return drawArtPerson(art, renderedPerson, ...args); }
      finally { drawingHealer = false; }
    };
    d.camera.zoom = 8; d.camera.snapTo(healer.x, healer.y); d.camera.following = false;
    d.renderer.fogEnabled = false; d.renderer.interpolator.clear(); d.renderer.render(null, 0);
    return { action: healer.action, workedTicks: healer.workedTicks, pose,
      health: patient.health, wound: patient.body.left_arm.wound,
      healerId: healer.id, patientId: patient.id, drawnPose: (window as any).__healerAspect?.pose };
  });

  expect(state.action).toBe('tend');
  expect(state.workedTicks).toBeGreaterThan(0);
  expect(state.pose).toMatch(/^t[0-3]$/);
  expect(state.drawnPose).toMatch(/^t[0-3]$/);
  expect(state.health).toBeGreaterThan(72);
  expect(state.wound).not.toBe('fresh');

  const frames = new Set<string>();
  const images = new Set<string>();
  const shots = 'artifacts/screenshots/m15-tend-animation-2026-10-13';
  mkdirSync(shots, { recursive: true });
  for (let phase = 0; phase < 4; phase++) {
    const rendered = await page.evaluate(phase => {
      const d = (window as any).__dynasty;
      const healer = d.sim.people.find((candidate: any) => candidate.id === (window as any).__healerId);
      const patient = d.sim.people.find((candidate: any) => candidate.id === (window as any).__patientId);
      const before = { health: patient.health, wound: patient.body.left_arm.wound, ticks: healer.workedTicks };
      healer.workedTicks = 1 + phase * 2;
      d.renderer.interpolator.clear(); d.renderer.render(null, 0);
      const aspect = (window as any).__healerAspect;
      const sprite = d.renderer.art.sprite(aspect);
      return { action: healer.action, ticks: healer.workedTicks, pose: aspect.pose,
        after: { health: patient.health, wound: patient.body.left_arm.wound },
        before: { health: before.health, wound: before.wound }, pixels: sprite.image.toDataURL() };
    }, phase);
    expect(rendered.action).toBe('tend');
    expect(rendered.ticks).toBe(1 + phase * 2);
    expect(rendered.pose).toBe(`t${phase}`);
    expect(rendered.after).toEqual(rendered.before);
    frames.add(rendered.pose);
    images.add(rendered.pixels);
    await page.screenshot({ path: `${shots}/0${phase + 1}-dressing-t${phase}.png` });
  }
  expect(frames.size).toBe(4);
  expect(images.size).toBe(4);

  const inactive = await page.evaluate(async () => {
    const d = (window as any).__dynasty;
    const healer = d.sim.people.find((candidate: any) => candidate.id === (window as any).__healerId);
    d.sim.order(healer, 'idle');
    const modulePath = '/src/render/WorkAnimation.ts';
    const { tendingPose } = await import(modulePath);
    return { action: healer.action, pose: tendingPose(healer, false, 0) };
  });
  expect(inactive.action).not.toBe('tend');
  expect(inactive.pose).toBeNull();
  expect(errors).toEqual([]);
});
