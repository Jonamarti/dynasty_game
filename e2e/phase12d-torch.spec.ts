import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('a lit torch is visible and its fuel freezes with the paused world', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=phase12d-torch&skipIntro=1&defaults=1&lang=es');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await page.locator('.hud-button', { hasText: 'Pausa' }).click();
  await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
  const shots = process.env.DYNASTY_CAPTURE_DIR ??
    'artifacts/screenshots/m15-phase12d-torches-2026-10-10';
  mkdirSync(shots, { recursive: true });

  const fixture = await page.evaluate(() => {
    const d = (window as any).__dynasty;
    if (!d.sim.player) d.sim.possessFirst();
    const p = d.sim.player;
    d.sim.knownTech.add('firemaking');
    p.knownTech.add('firemaking');
    p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0;
    p.inventory.add('torch', 1);
    p.inventory.add('handaxe', 1);
    p.equipment.right = { item: 'handaxe', count: 1 };
    let hearth: any = null;
    for (let radius = 4; radius < 23 && !hearth; radius++) {
      const candidates = [[radius, 0], [-radius, 0], [0, radius], [0, -radius], [radius, radius]];
      for (const [dx, dy] of candidates) {
        hearth = d.sim.place('hearth', Math.floor(p.x + dx), Math.floor(p.y + dy), p.bandId, null);
        if (hearth) break;
      }
    }
    if (!hearth) throw new Error('Could not place a hearth for torch fixture');
    hearth.complete = true;
    p.x = hearth.x + 1.25; p.y = hearth.y + 0.5;
    p.path = null; p.pathCount = p.pathAt = 0;
    d.sim.time.tick = 0;
    d.renderer.fogEnabled = false;
    d.renderer.interpolator.clear();
    d.camera.following = false;
    d.camera.zoom = 5;
    d.camera.snapTo(p.x, p.y);
    d.sim.peopleHash.rebuild(d.sim.livingPeople());
    if (!d.sim.order(p, 'light_torch', { itemId: 'torch' })) throw new Error('Could not order torch lighting');
    d.sim.step(); d.sim.step(); d.sim.step();
    d.sim.time.tick = 0;
    d.renderer.interpolator.clear();
    d.renderer.render(null, 0);
    return { person: p.id, hearth: hearth.id, lit: p.equipment.left?.lit ?? p.equipment.right?.lit ?? 0,
      tick: d.sim.time.tick, light: d.sim.lightAt(p.x, p.y), x: p.x, y: p.y,
      otherHand: p.equipment.right?.item };
  });
  expect(fixture.lit).toBeGreaterThan(0);
  expect(fixture.light).toBeGreaterThan(0.5);
  expect(fixture.otherHand).toBe('handaxe');
  await page.screenshot({ path: `${shots}/01-antorcha-encendida.png` });

  await page.waitForTimeout(500);
  expect(await page.evaluate(({ id }) => {
    const d = (window as any).__dynasty, p = d.sim.peopleById.get(id);
    return { tick: d.sim.time.tick, fuel: p.equipment.left?.lit ?? p.equipment.right?.lit ?? 0 };
  }, { id: fixture.person })).toEqual({ tick: fixture.tick, fuel: fixture.lit });

  const extinguished = await page.evaluate(({ id, hearth }) => {
    const d = (window as any).__dynasty, p = d.sim.peopleById.get(id);
    const slot = p.equipment.left?.item === 'torch' ? 'left' : 'right';
    p.equipment[slot].lit = 0;
    d.sim.buildingsById.get(hearth).durability = 0;
    d.renderer.render(null, 0);
    return { light: d.sim.lightAt(p.x, p.y), fuel: p.equipment[slot].lit };
  }, { id: fixture.person, hearth: fixture.hearth });
  expect(extinguished.light).toBe(0);
  await page.screenshot({ path: `${shots}/02-antorcha-apagada.png` });
  expect(errors).toEqual([]);
});
